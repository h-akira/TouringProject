# 010. 録音はインカムのマイクから行う（SCO経路を自前で張る）

- **日付**: 2026-09-22
- **ステータス**: 採用

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
> — AOSP javadoc（`AudioManager.setCommunicationDevice`）

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
✅ **SCO確立は 270ms**（アプリから見た往復で 992ms）。⚠️ **走行中の遅延として許容できる。**
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
