# 010. 録音はインカムのマイクから行う（SCO経路を自前で張る）

- **日付**: 2026-09-22
- **ステータス**: 採用（一部改訂 2026-09-26。**経路の張り方を「仮想通話」から「音声認識」に変更**）

## 背景

**走行中の録音が、人が聞いても聞き取れないほどノイズまみれだった。**

当初は**ノイズ除去の問題**として追っていた。**後処理は63パターン試して全滅**し
（`pre-research/denoise/`）、**AWSにマネージドサービスも無かった。**
一方で**同じ端末・同じインカムで、Googleレコーダーは綺麗に録れていた。**

**そこで「録り方」を疑って測り直したところ、前提が崩れた**（`pre-research/mic-routing/`）:

⚠️ **本アプリはインカムのマイクを使えておらず、Pixel 本体マイクで録っていた。**

**ヘルメットの外にあるスマホの本体マイクが、風とエンジン音を正面から拾っていた**ことになる。
⚠️ **インカムのノイズ除去（CVC）は、一度も経路に入っていなかった。**

> 📌 **後処理が全滅した理由もこれで説明がつく。** ⚠️ **無い信号は復元できない。**

### なぜ気づけなかったか

⚠️ **`expo-audio` の `setInput()` で Bluetooth を指名しても、例外もエラーも出なかった。**
**画面の「選ばれた入力」も `Bluetooth` と表示していた。**
📌 **にもかかわらず、録れた音は全サンプル0の完全な無音だった。**

**真因は `expo-audio` 1.1.1 の実装が仕様違反だったこと:**

```kotlin
val audioDevices = audioManager.getDevices(AudioManager.GET_DEVICES_INPUTS)  // ← 入力
audioManager.setCommunicationDevice(deviceInfo)   // ← そこに入力デバイスを渡す
```

> **Only devices in a sink role (AKA output devices) can be specified.
> The matching source device is selected automatically by the platform.**
> — [AudioManager.setCommunicationDevice](https://developer.android.com/reference/android/media/AudioManager#setCommunicationDevice(android.media.AudioDeviceInfo))

⚠️ **出力(sink)しか受け付けないので `false` が返る**が、**`expo-audio` はその戻り値を捨てている。**
**だからアプリ側にエラーが一切見えなかった。**

## 選択肢

| 案 | 判断 |
|---|---|
| **A. `setInput()` を呼ばず、`MODE_IN_COMMUNICATION` だけで乗せる** | ❌ **却下。** ⚠️ **実機で不成立**（3通り試して全て本体マイク）。**乗る端末もあるが、この端末は乗らない** |
| **B. `expo-audio` に patch-package を当てる** | ❌ **却下。** ⚠️ **`setInput()` を直すだけでは足りず**（モード管理とリスナーも要る）、**`node_modules` へのパッチを維持し続けることになる** |
| **C. `expo-audio` にPRを出す / fork する** | ❌ **却下**（本件の解決手段としては）。⚠️ **マージされても SDK 54 には来ない。** 📌 **別途出す価値はある** |
| **D. 録音まるごと自前のネイティブで書く** | ❌ **却下。** **ファイル管理・権限・ライフサイクルまで抱えることになる。** ⚠️ **`setCommunicationDevice()` 単体で SCO は張れる**と分かったので、そこまで要らない |
| ✅ **E. 経路だけ自前モジュール、録音は `expo-audio` のまま** | ✅ **採用** |

## 決定

⚠️ **SCO経路の確立・解放だけを担う自前モジュールを持ち、録音は `expo-audio` に任せる。**

**公式手順どおりに実装する**（AOSP javadoc / Audio Manager self-managed call guide）:

```
1. addOnCommunicationDeviceChangedListener() を登録
2. setMode(MODE_IN_COMMUNICATION)      ※ ⚠️ setSpeakerphoneOn() は呼ばない
3. ⚠️ getAvailableCommunicationDevices() から TYPE_BLUETOOTH_SCO の【出力(sink)】を取る
4. setCommunicationDevice(sink) → ⚠️ 戻り値 true を確認
5. リスナーで切替完了を待つ（⚠️ 固定sleepではない）
6. 録音を開始（📌 setPreferredDevice() は不要 — 入力はプラットフォームが自動で対にする）
7. 終了後 clearCommunicationDevice() + setMode(MODE_NORMAL)
```

⚠️ **`setAudioModeAsync({ shouldRouteThroughEarpiece })` は使わない。**
**`expo-audio` はこれで `setSpeakerphoneOn()` も呼ぶ**（`AudioModule.kt:607`）が、
📌 **公式手順が明示的に禁じている操作**であり、⚠️ **通信デバイスの指名を上書きしうる。**
**モードの管理はネイティブ側に寄せる。**

### 裏づけ（実機・一次情報）

✅ **`bluetooth-sco-headset-microphones` → `primary-capture` の経路で録れた**（最大 **-13.5 dB**）。
✅ ⚠️ **ドアを閉めた別室・小声でも録れた** — **本体マイクでは説明がつかない。**
✅ **SCO確立は 270〜500ms**（アプリから見た往復で 992ms）。⚠️ **走行中の遅延として許容できる。**
✅ **本アプリ（v1.36.0）でも別室テストで成立**（⚠️ **本アプリ自身が SCO を張ることをログで確認**）。
✅ **Googleレコーダーも同じ公開APIを呼んでいた**（`isPrivileged: false`）。⚠️ **特権APIではない。**

**詳細は `pre-research/mic-routing/FINDINGS.md`。**

## 影響

- ⚠️ **ネイティブコードが増える**ので、**`android/` の再ビルドが要る**（JS/TSだけの変更では入らない）。
- ⚠️ **`voice_communication`（端末側のノイズ除去）を捨てるかは未決。**
  **インカムの CVC で足りるかを走行で測ってから決める**（`App/src/api/recordingSettings.ts`）。
  📌 **エコーキャンセルも `voice_communication` の担当**なので、
  ⚠️ **「自分の声が返る」が出ないかも一緒に見る。**
- ✅ **SCOが張れなかったときは、本体マイクで録って続行する**（⚠️ **走行中に黙るのが最も困る**）。
  ⚠️ **ただし「張れない」には2種類あり、混ぜない:**

  | 状況 | 扱い |
  |---|---|
  | **インカムを繋いでいない**（室内で使う） | ✅ **正常。本体マイクで録り、何も出さない** |
  | ⚠️ **繋いでいるのに張れない** | ⚠️ **異常。本体マイクで録るが、画面とログに残す** |

  📌 **いずれの場合も「どちらのマイクで録ったか」を必ず残す** —
  ⚠️ **それが無かったために、走行1回分を誤認した。**
- **SCO確立の待ちは最大2秒で打ち切る。**
  ⚠️ **公式は「最大30秒」と言うが、走行中はボタンを押してから録音が始まるまでの遅延**になる。
  📌 **実測 270ms** なので2秒で十分な余裕がある（⚠️ **A2DP再生中は伸びうるので要実測**）。
- ⚠️ **`BLUETOOTH_CONNECT` の宣言と実行時要求が要る**（Android 12+）。
  ⚠️ **`App/` には宣言が無く、追加した** — **これが無いと経路を張れない。**
- 📌 **ノイズ除去の比較は、ここからが本番。**
  ⚠️ **これまでの比較は本体マイク同士のものだったので、やり直しになる。**

> ⚠️ **教訓**: **ライブラリが例外を投げず、画面の表示も正常に見えても、
> 実際には何も起きていないことがある。** 📌 **「選ばれた」と「音が流れてきた」を分けて測る。**

## 改訂（2026-09-26）：経路は「仮想通話」ではなく「音声認識」として張る

**「経路だけ自前モジュール、録音は `expo-audio`」（E）は変えない。** 変えたのは**経路の張り方**
（上の「決定」の手順 1〜7）。

### 何が覆ったか

⚠️ **インカムのボタンで起動したときに成立しなかった。** 上の裏づけ（別室テスト）は、
**インカムのボタンの要求が無い状態**で取ったものだった。走行テストで次の症状が出た
（`pre-research/mic-routing/FINDINGS.md` §9・§10）:

| 症状 | 原因（ログと AOSP のソースで確認） |
|---|---|
| **起動直後に SCO が張れない**（電源を入れ直した直後だけ） | ボタンを押すとインカムは **AT+BVRA=1（音声認識を始めて）** を送り、**返事を約5秒待つ。** その間は **codec の交渉に応じない** |
| ⚠️ **2回目の押下で録音が止まらない** | `setCommunicationDevice()` の SCO は **仮想通話**として張られる。**通話中のボタンは「電話を切る」（AT+CHUP）** になり、Android は**仮想通話を終わらせるだけでアプリに何も知らせない** |
| **止まらないまま張り直される** | アプリの要求が残っているので **AudioService が仮想通話で張り直す** |

📌 **仮想通話で録音する限り、「インカムのボタン再押しで終える」（[adr/008](008_end_of_speech_detection.md) の C）と両立しない。**

### 改訂後の決定

**`BluetoothHeadset.startVoiceRecognition()` でボタンの要求に正式に返事をし、
Bluetooth スタック自身に SCO を張らせる。**

| 選択肢 | 判断 |
|---|---|
| 仮想通話のまま、確立待ちを5秒以上に延ばす | ❌ **却下。** 録音開始が5秒遅れるうえ、**2回目の押下は「電話を切る」のまま** |
| 仮想通話のまま、「電話を切る」で経路が切れたことを検知する | ❌ **却下。** 2回目は拾えるが、**起動直後に張れない問題が残る** |
| ✅ **音声認識として張り、2回目の押下は「経路が切れた」で検知する** | ✅ **採用。** 返事をするので**待ちが解け**、仮想通話を使わないので**ボタンが「電話を切る」にならない** |

- ⚠️ **`setCommunicationDevice()` は併用しない。** 併用すると、インカムが経路を切ったあと
  **AudioService が仮想通話で張り直す**（`BtHelper.requestScoState` の `SCO_STATE_ACTIVE_EXTERNAL`）。
  外部で張られた SCO には、**通話系の経路が何もしなくても向く**（`AudioDeviceBroker.preferredCommunicationDevice`）。
- ⚠️ **2回目の押下は AT+BVRA=0 として届き、アプリへの Intent は無い。**
  **SCO が切れたこと**を通知と 0.2秒ごとの確認の両方で見る。
- 権限は `BLUETOOTH_CONNECT` だけ（特権APIではない）。
- ⚠️ **前提**: 検証は **Pixel 8a（Android 16 相当・SDK 36）と 1 台のインカム**だけ。
  AOSP には **SCO を AudioService が管理する構成**（`Utils.isScoManagedByAudioEnabled()`）の分岐があり、
  そこでは `startVoiceRecognition` 自体が Bluetooth 側から `setCommunicationDevice` を呼ぶので、
  **「併用しないから張り直されない」前提が崩れうる。** 端末を変えたら記録で確かめ直すこと。
- ⚠️ **押下から約5秒以内に返事をする必要がある**（`HeadsetService.sStartVrTimeoutMs`）。
  アプリが起動していない状態からの押下で間に合うかは**未確認**（App v1.40.0 で押下からの経過を記録に残す）。

### 裏づけ（実機・検証用ビルド v1.38.0 と App v1.39.0）

📌 v1.38.0 は未コミットの検証用ビルドで、変更はすべて **v1.39.0 に含まれる**。

✅ **起動直後（インカムの電源を入れ直した直後）でも 217〜237ms で確立**
✅ **録音デバイスは `bluetooth_sco`**（`AudioManager.getActiveRecordingConfigurations()` で確認）
✅ **2回目の押下で経路が切れ、送信された**（2往復とも）
⚠️ **HFP の状態通知は `RECEIVER_NOT_EXPORTED` では届かなかった**（送り主が Bluetooth アプリで別の uid のため）。
v1.38.0 は 0.2秒ごとの確認で検知していた。**v1.39.0 で `RECEIVER_EXPORTED` に直した。**

> ⚠️ **教訓**: **経路の検証は「起動の仕方」まで本番と同じにする。**
> 画面のボタンで成立しても、インカムのボタンでは前提（返事待ち・ボタンの意味）が変わる。
