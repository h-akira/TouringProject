# 分かったこと（US-2.04・実測と一次情報）

> 判断は [DECISION.md](DECISION.md)、結論は [README.md](README.md)。
> ここは**事実だけ**を置く（`CLAUDE.md`: `pre-research/` に判断を書かない）。
>
> 実施日: 2026-08-16 / 端末: Android実機 / インカム: FODSPORTS M1-S Pro

## 1. インカムのボタンの割り当て

| ボタン | 操作 | 割り当て | Androidから見た系統 |
|---|---|---|---|
| **Function** | **シングルタップ** | **音声アシスタントの起動**（Siri / Google Assistant） | **アシスタント** |
| **Function** | ダブルタップ | 音楽の再生・停止 / リダイヤル | **メディアキー** |
| **Function** | 2秒長押し | 着信の拒否 | 通話 |
| **Function** | 3秒長押し | 音声出力の切替 / ペアリング | **インカム内部で完結**（スマホに飛ばない） |
| **Volume+** | シングルタップ | 音量を上げる | 音量 |
| **Volume+** | ダブルタップ | 音楽の再生・停止 | **メディアキー** |
| **Volume+** | 2秒長押し | 前の曲 | **メディアキー** |
| **Volume−** | シングルタップ | 音量を下げる | 音量 |
| **Volume−** | 2秒長押し | 次の曲 | **メディアキー** |

出典: [Fodsports M1-S Pro User Manual](https://community.fodsports.com/support/m1-s-pro-user-manual/) /
[Operation Manual (ManualsLib)](https://www.manualslib.com/manual/2593476/Fodsports-M1-S-Pro.html?page=4)

📌 **他にインカム通話用のボタンがあるが、機体同士の通話用**でスマホには飛ばない。

📌 `Volume+ / Volume-` で音声コマンドを起動する記述もあるが、**「iOS のみ」**とされている。

## 2. メディアボタンの配送先（Android 8.0以降）

> the system tries to find the **last app with an active MediaSession that played audio locally**
> and sends the event directly to it.

出典: [Responding to media buttons](https://developer.android.com/media/legacy/media-buttons)

**配送の優先順位**: ①前面のActivity ②アクティブなセッション ③受信機経由での復帰。

**背景で保持するには** [MediaSessionService](https://developer.android.com/media/media3/session/background-playback)
が要り、**フォアグラウンドサービス（`mediaPlayback`）＋常設の通知**が伴う。
**通知は「プレイリストに `MediaItem` がある」ことが前提。**

## 3. アシスタントのロールは排他（AOSP）

**現行 `main` ブランチの [`roles.xml`](https://android.googlesource.com/platform/packages/modules/Permission/+/refs/heads/main/PermissionController/res/xml/roles.xml):**

```xml
name="android.app.role.ASSISTANT"
exclusive="true"
exclusivity="user"
fallBackToDefaultHolder="true"
showNone="true"
```

`exclusive` の定義（[Role.md](https://android.googlesource.com/platform/packages/modules/Permission/+/refs/heads/main/PermissionController/src/com/android/permissioncontroller/role/Role.md)）:

> Whether the role is exclusive. **If a role is exclusive, at most one application is allowed to be its holder.**

📌 `exclusivity="user"` は「ユーザーごとに1つ」。**同一ユーザーでは1つ。**

📌 **`PermissionController` は APEX で更新されるモジュール**なので、
**端末のAndroidバージョンとは独立に、この定義が現行のもの。**

**アシスタントの仕組み**（[AOSP](https://source.android.com/docs/automotive/voice/voice_interaction_guide)）:
**起動時にバインドされ常駐する**特権的なサービス。
実装には `VoiceInteractionService` + `VoiceInteractionSessionService`、
`res/xml` のメタデータ、`BIND_VOICE_INTERACTION` 権限が要る。

📌 **AOSPには「`OK/Hey, Google` はCPUのファームウェアに焼かれており、
サードパーティを既定にしても奪われるのはボタン長押しの経路だけ」という記述もある**が、
⚠️ **§4 の実測はこれと矛盾する**（少なくともマップの音声入力については成り立たない）。

> ⚠️ **この節で参照したガイドは車載（AAOS）専用だった。** `recognitionService` を
> 省略できるかのような記述は一般Androidには当てはまらない。詳細は §9。

## 4. ⚠️ 実測：既定を Alexa にすると、マップの音声入力が死ぬ

| 既定のアシスタント | マップの**音声入力**（指示する） | マップの**音声案内**（読み上げ） |
|---|---|---|
| **Google** | ✅ 経由地の追加などが**音声でできる** | ✅ 案内する |
| **Alexa** | ❌ **全くできない** | ✅ **案内する（残る）** |

⚠️ **画面上のマイクボタンを押しても駄目だった。聞いてはいるが、動作しない。**

> 📌 **これは「ホットワードを奪われた」話ではない。**
> **もしそうなら画面のマイクボタンで動いたはず。**
> **押しても動かない** ということは、
> **マップの音声操作そのものが、アシスタントのロールを持つアプリに委譲されている**ということ。

**マップが本来できること**（[公式](https://support.google.com/maps/answer/6041199?hl=en&co=GENIE.Platform%3DAndroid)）:

| 種別 | 例 |
|---|---|
| ナビ操作 | 「経由地を追加」「案内を停止」「有料道路を回避」 |
| 経路の照会 | 「次はどこを曲がる？」「何時に着く？」 |
| 周辺の検索 | 「目的地の近くのカフェを探して」 |

## 5. ⚠️ 実測：2台接続時、ボタンの行き先は制御できない

**2台つないでボタンを押すと一方が起動したが、⚠️ 「なぜその端末なのか」が分からなかった。**

**インカムの仕様**（複数の情報源が一致）:

> **M1-S PRO can connect with two phones, but only support one phone for audio input.**
> Connect to the first phone, then long press the Function button to put the M1-S PRO
> on passive search mode and connect to the second phone.

出典: [ManualsLib](https://www.manualslib.com/manual/2219483/Fodsports-M1-S-Pro.html?page=8) /
[Fodsports Community](https://community.fodsports.com/support/m1s-pro-pairing-guide/)

| 分かったこと | 中身 |
|---|---|
| ✅ **2台つなげる** | 仕様として明記 |
| ⚠️ **音声入力は1台だけ** | **`only support one phone for audio input`** |
| ❌ **どちらを音声入力にするか選ぶ方法** | ⚠️ **マニュアルに記載が無い** |
| ❌ **ボタンの行き先を切り替える操作** | ⚠️ **存在しない**（§1 の割り当てにも無い） |

**Voice Command の項は `Short press function button once` とあるだけで、
⚠️ 2台接続時にどちらへ飛ぶかの記述は無い。**

📌 **メーカーへの問い合わせは未実施。**

## 6. ⚠️ ホットワードは本体マイクでしか拾えない

**利用者の観察:**

| 観察したこと | 結果 |
|---|---|
| 録音アプリでインカムのマイクは動くか | ✅ **動く**（インカム自体は正常） |
| ⚠️ **スマホ本体から離れて「OK Google」** | ❌ **反応しない** |

**報告も一致する:**

> **hotword detection uses the microphone built into the device and will not use
> external microphones.** … when users press the microphone button manually,
> **it picks up commands via Bluetooth headsets** — it's specifically the
> **always-listening hotword detection that's restricted to the built-in microphone.**

出典: [XDA](https://xdaforums.com/t/ok-google-doesnt-work-via-bluetooth-headset.3120559/) /
[Android Central](https://forums.androidcentral.com/threads/ok-google-to-listen-for-command-through-my-bluetooth-headset.762210/)

**仕組み上の背景:**

| 要因 | 中身 |
|---|---|
| **ホットワードはDSPで検出する** | `AlwaysOnHotwordDetector` は**ハードウェアのDSP**上で動く（[AOSP](https://source.android.com/docs/automotive/voice/voice_interaction_guide/app_development)）。**DSPが繋がるのは本体のマイク**。⚠️ **Android 12以降はシステムAPI**でバンドルアプリ専用 |
| **Bluetoothのマイクは常時開いていない** | 取り込みには **SCO**（通話用）が要る。**普段はA2DP（再生専用・片方向）で録音できない** |
| **SCO常時接続の代償** | 音質が落ち、**電池を強く消費する**（報告では ヘッドセットが 5〜6時間 → 1.5時間） |

### 📌 設定で切り替えることはできない（削除済み）

| 昔あった設定 | 現在 |
|---|---|
| `設定 > 音声 > Bluetooth ヘッドセット > OK Google の検出` | ❌ **削除済み** |
| `Allow Bluetooth Requests when Device Locked` | ❌ **廃止** |
| `Allow Wired Headset Requests` | ❌ **廃止** |

> Google had a separate setting to enable/disable Google Assistant access to Bluetooth
> microphones, but **Google removed that setting.** Instead … the Google Assistant will now
> **automatically use Bluetooth microphones if connected.**

出典: [Android Police](https://www.androidpolice.com/google-assistant-tweaks-bluetooth-devices-voice-control/) /
[9to5Google](https://9to5google.com/2023/04/10/google-assistant-bluetooth-settings/)

📌 **「自動的に使う」と実測の食い違いは矛盾ではない**と考えられる:
**ボタンを押した後の取り込みには Bluetooth マイクが使われる**が、
**常時待受のホットワード検出は別系統（DSP・本体マイク）だから。**

### ✅ ポケットの中・画面消灯でも待受は続く

**制約がかかるのは「開始する瞬間」だけ**
（[Restrictions on starting a foreground service](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)）:

> If your foreground service needs a while-in-use permission, you must call
> `Context.startForegroundService()` … **while your app has a visible activity**

| | |
|---|---|
| **開始するとき** | **アプリが画面に見えている必要がある** |
| ✅ **開始した後** | **背景・画面消灯・ロックでも動き続ける** |

📌 **画面とマイクは独立**しており、✅ **フォアグラウンドサービスは Doze の対象外。**

⚠️ **ただし `BOOT_COMPLETED` からマイクのFGSは開始できない**ので、
**毎回アプリを開く必要がある。** ⚠️ **背景で死ぬと画面を見ずには復帰できない。**

出典: [Foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types)

## 7. ウェイクワードは変更できない（Google側）

> Google does not currently let you replace the "Hey Google" or "OK Google" wake phrase
> with a fully custom word or name. … **the wake phrase is not exposed as a user-editable setting.**

**Alexa を既定にした場合の挙動**（ロールとホットワードが別物である実例）:

| | |
|---|---|
| **「OK Google」** | **既定がAlexaなら Alexa が起動する**（ロールを持つ側が呼ばれる） |
| **「Alexa」と呼びかける** | ❌ **アシスタントとしては起動しない** |

> Unlike the "Alexa" wake word on the Alexa app, **the wake word "Alexa" doesn't do anything
> when using Google Assistant**, while you can use the wake word "OK Google" … to activate
> Google Assistant.

出典: [Make Alexa Your Default Voice Assistant on Android](https://www.amazon.com/gp/help/customer/display.html?nodeId=GYSXE9CTW5AS2BZU)

📌 **Alexaアプリ自体は「Alexa」で反応する機能を持つ**が、
**それはアプリが自前でマイクを握る仕組み**で、
**Amazon公式も「アプリを開いて前面にある必要がある」と明記している。**

## 8. Porcupine（ウェイクワード）の対応状況

| 項目 | 中身 |
|---|---|
| パッケージ | `@picovoice/porcupine-react-native`（v4.0.0） + `@picovoice/react-native-voice-processor` |
| 対応 | React Native 0.73+ / Android・iOS |
| **日本語** | ✅ **対応**（英・仏・独・伊・**日**・韓・葡・西） |
| カスタムワード | Picovoice Console で作成 |
| ⚠️ **Expo Go** | ❌ **不可**（ネイティブのリンクが要る）→ **Development Build 必須** |
| Android の常駐実績 | ✅ **公式デモにバックグラウンドサービス版がある**（[demo/android/Service](https://github.com/Picovoice/porcupine/tree/master/demo/android/Service)） |
| ⚠️ **RNバインディングの常駐** | ❌ **ドキュメントに記述が無い**（デモは**ネイティブAndroid版**） |

出典: [React Native Quick Start](https://picovoice.ai/docs/quick-start/porcupine-react-native/) /
[binding/react-native](https://github.com/Picovoice/porcupine/tree/master/binding/react-native)

⚠️ **RN バインディングは前面での利用が前提**（`start()` / `stop()` のみ）。
**背景で回すならネイティブ側にサービスを書くことになる。**

## 9. ⚠️ 実装で判明：`recognitionService` は候補一覧に出るための必須項目

**「デジタルアシスタント」の設定画面の候補一覧に、自アプリが出なかった。**
⚠️ **エラーは出ない。静かに候補から外れるだけ。**

原因は [AOSPの `AssistantRoleBehavior.java`](https://github.com/GrapheneOS/platform_packages_modules_Permission/blob/17/PermissionController/role-controller/java/com/android/role/controller/behavior/AssistantRoleBehavior.java)
の `isAssistantVoiceInteractionService()`:

```java
if (sessionService == null || recognitionService == null || !supportsAssist) {
    return false;
}
```

**`res/xml` のメタデータに `sessionService`・`recognitionService`・`supportsAssist` の
3点がすべて揃っていないと、候補として扱われない。**

📌 **これは §3 の記述を訂正する。** 当時参照した
[AOSPの車載（AAOS）向けガイド](https://source.android.com/docs/automotive/voice/voice_interaction_guide)
は対象が車載専用で、一般Androidには当てはまらなかった
（`recognitionService` が省略可能という示唆は誤り）。

**`recognitionService` には自前で音声認識をする必要はなく、既存の
`RecognitionService` 実装（コンポーネント名）を指すだけでよい。**
実機（Pixel 8a）で確認できた値:

```
com.google.android.googlequicksearchbox/com.google.android.voicesearch.serviceapi.GoogleRecognitionService
```

（`adb shell dumpsys package com.google.android.googlequicksearchbox` で確認。
`android.speech.RecognitionService` のintent-filterを持つ）

## 10. 録音の終了：`expo-audio` で音量（metering）が取れる

**US-2.04の「起動」は解決したが「終了」が残っていた**ため、無音検知（VAD）が
成立するかを調べた。⚠️ **以下はライブラリのソースを読んで確認した事実**で、
実機での閾値の妥当性は別（§12）。

### 取れる（Androidネイティブ実装で確認）

`RecordingOptions.isMeteringEnabled: true` を立てると、
`recorder.getStatus().metering` に音量が入る。

```kotlin
// node_modules/expo-audio/android/src/main/java/expo/modules/audio/AudioRecorder.kt
private fun getAudioRecorderLevels(): Double? {
  if (!meteringEnabled || recorder == null || !isRecording) return null
  val amplitude: Int = try { recorder?.maxAmplitude ?: 0 } catch (e: Exception) { 0 }
  return if (amplitude == 0) -160.0 else 20 * log10(amplitude.toDouble() / 32767.0)
}
```

| 事実 | 中身 |
|---|---|
| **単位** | **dBFS。無音が `-160.0`、最大が `0.0`** |
| **元の値** | `MediaRecorder.maxAmplitude`（0〜32767）を `20*log10(amp/32767)` で変換 |
| **未対応時** | `metering` は `undefined`（キー自体が入らない）。⚠️ **無音と区別すること** |
| **取り方** | 自前で `setInterval` → `recorder.getStatus()`。`useAudioRecorderState` も内部は同じ（既定500ms間隔） |

### ⚠️ `maxAmplitude` は読むとリセットされる

Androidの `MediaRecorder.getMaxAmplitude()` は**「前回読んでからの最大値」**を返す。
これが設計に効く:

- **ポーリング間隔がそのまま測定窓になる**（100msなら「直近100msのピーク」）。
  ピークで見るので、無音検知には都合がよい。
- ⚠️ **読む場所を1箇所に限る必要がある。** `useAudioRecorderState` と自前の
  ループを併用すると**値を奪い合い**、双方が実際より小さい音量を見て誤検知する。

## 11. ✅ 停車中は成立 / ⚠️ 走行中は未検証

**2026-08-18、実機（Pixel 8a）で確認**: **話し終えると自動的に録音が止まり、送信された。**

### 既定値と、その決め方

| 項目 | 値 | 根拠 |
|---|---|---|
| 無音の閾値 | **-40 dB** | ⚠️ **推定のまま**（走行中は要調整） |
| 送信までの無音 | **3.0秒** | 実機で試して決めた。**走行中は考えながら話すので「間」が空く** |
| 話し始めの猶予 | **5.0秒** | 実機で試して決めた。**ボタンを押してから話し出すまでの間** |
| 録音の上限 | **30秒** | **一度も話さなかったときの唯一の出口**（下記） |

⚠️ **上限の変更幅はサーバー側の制約で決まる。** `POST /ask-audio` は
**2MBを超える音声を413で弾く**（`Backend/src/handlers/ask_audio.py`）。
録音は64kbps・モノラルなので **2MB ≒ 262秒**。余裕を見て**アプリ側の上限は180秒**まで。

### ⚠️ 騒音で無音判定されない事故へのガード

**風切り音・エンジン音が閾値を超え続けると、無音検知が一度も成立せず上限に達する。**
そのまま送ると**騒音だけの録音が Transcribe → AgentCore まで流れ、
課金されたうえで意味不明な回答が返る**（走行中は画面を見ないので原因が分からない）。

**判定材料は「録音中に一度でも無音になったか」**（`everSilent`）:

| 上限に達したとき | 判断 |
|---|---|
| 一度でも静かになった | **送る**（長い質問を切られただけ） |
| **一度も静かにならない** | **捨てる**（環境音がマイクを埋めている） |

⚠️ **`hasSpoken` では区別できない**（騒音でも真になる）。

**捨てるときは端末内蔵TTS（`expo-speech`）で読み上げて知らせる**
（この選択の理由は [adr/006](../../adr/006_handsfree_launch_mechanism.md)）。

📌 **割り切り**: 上限いっぱい息継ぎなしで話し続けると捨てられる
（音量だけでは「ずっと喋っている」と「ずっとうるさい」を区別できない）。
⚠️ **測れない端末（`metering === undefined`）では捨てない**
（捨てると一切送信できなくなるため、必ず送る側に倒す）。

#### ⚠️ `-160` は「無音」ではなく番兵（実機ログで判明）

**初回の実装は動かなかった。** 騒音を鳴らし続けても30秒後に送信されてしまう。
`adb logcat` で判定材料を出したところ、原因が確定した:

```
[vad] first silence at 109ms: metering=-160 threshold=-80
[vad] max reached: everSilent=true minSeen=-160 maxSeen=-19.4
```

**録音開始109ms（発話前）に `-160` が1回出て、それだけでガードが無効化されていた。**

`AudioRecorder.kt` は **`maxAmplitude == 0` のとき `-160.0` を返す**。そして
`maxAmplitude` は「**前回読んでからの最大値**」なので、**1回目の読み取りには
材料が無く 0 になる**（読み取り失敗時も `catch` で 0 に落ちる）。
⚠️ **`-160` は実測ではなく「測れなかった」の意味。**

**対策は2つ**（`METERING_WARMUP_MS` / `SUSTAINED_SILENCE_MS`）:

| | 中身 |
|---|---|
| **ウォームアップ** | 最初の **300ms** の値は使わない |
| **継続判定** | **0.5秒続いた無音**だけを「静かになった」と数える |

📌 **本質は継続判定の方。** 録音中に読み取り失敗が1回起きるだけで
ガードが死ぬのは、実走行でも起こり得る脆さだった。

✅ **修正後、実機で成立を確認**（2026-08-18・App v1.19.0）。
騒音下で30秒待つと送信されず、読み上げで知らせた。ログも
`everSilent=false minSeen=-55.8 threshold=-80` と設計どおり。

### ⚠️ 「一度も声が乗らなければ自動送信しない」が要る

**猶予と無音時間だけでは不十分。** 猶予（5秒）を過ぎた時点で、無音が既に
3秒たまっているため、**話し始めが遅れただけで空の録音が飛ぶ**（5.0秒ちょうどで送信）。

そのため「**この録音で一度でも閾値を超えたか**」を持ち、**超えるまでは自動送信しない**。
一度も話さなければ `MAX_RECORDING_MS`（30秒）の上限に任せる。

📌 **猶予を伸ばすほど問題が悪化する**関係なので、値の調整では解決しない
（猶予10秒なら10秒で飛ぶだけ）。**判定に「発話の有無」を足す必要がある。**

⚠️ **ただし停車中の結果でしかない。** 風切り音・エンジン音のある走行中に
同じ閾値が成立するかは**走ってみないと分からない**。

- ⚠️ **暗騒音が閾値を超え続けると、録音が止まらない**
  （`MAX_RECORDING_MS` の自動送信が最後の砦になる）
- 逆に高すぎると**喋っている途中で切れる**
- ヘルメット内のインカムマイクなので有利な可能性はあるが、**未確認**

📌 **閾値は設定画面で変えられる**（端末に保存。`src/api/vadSettings.ts`）。
`.env` の `EXPO_PUBLIC_SILENCE_*` は**既定値を決めるだけ**で、保存された値が優先される。
⚠️ **走行中に気づいてもその場で直せることが要件**なので、`.env` だけでは足りなかった
（Macに戻らないと変えられない）。

設定画面には**マイクの音量をリアルタイムに出す測定機能**を付けてある。
**エンジンをかけたまま測れば、走る前に当たりを付けられる。**

## 12. 未確認のまま残っているもの

**方式Bで進めるうえで:**

- [ ] 再インストールで既定のアシスタントが外れるか
      （[報告あり](https://github.com/anthropics/claude-code/issues/41696)）
- [ ] `android.intent.action.VOICE_COMMAND` の正式な仕様（公式リファレンスで裏を取れていない）
- [ ] 「Hey Google」単体（ナビ外）が残るか
- [ ] Google純正アプリが無い端末（≠Pixel等）でも `recognitionService` の値が同じか

**📌 方式Cを再検討することになった場合（いまは不要）:**

- [ ] ウェイクワードを「インカムのマイク」で拾えるか（⚠️ **方式Cの生命線**）
- [ ] SCOを常時開いた場合の電池の持ち
- [ ] 常時録音がインカムの通話・音楽と競合しないか
- [ ] Porcupine の RN バインディングを背景で回せるか
- [ ] メーカー（Fodsports）に問い合わせれば音声入力先の選択手段があるか

## 13. 応答後にマップアプリへ戻す

**ハンズフリーで起動したとき、回答が届いたらマップアプリを前面に戻す**ための調査。
⚠️ **ここに書くのは検証で分かった事実だけ。** どの方式を採ったか（と却下した理由）は
[adr/007](../../adr/007_return_to_map_after_answer.md)。

📌 **結論だけ先に**: `moveTaskToBack` では戻らず（§13.4）、他アプリのタスクを
前面化する手段も無い（同）。**LAUNCHERインテントで開くと既存タスクが再開する**
ことが分かり（§13.5）、これで成立した（§13.3）。

### 13.1 ✅ `expo-audio` は既定で「背面に回ると再生を止める」

`AudioModule.kt`（`node_modules/expo-audio/android/.../AudioModule.kt`）が、
**アプリが背面に回った時点で全プレイヤーを `pause()` する**:

```kotlin
OnActivityEntersBackground {
  if (!staysActiveInBackground) {
    releaseAudioFocus()
    players.values.forEach { player ->
      if (player.ref.isPlaying) { player.isPaused = true; player.ref.pause() }
    }
    ...
  }
}
```

`staysActiveInBackground` は `setAudioModeAsync` でしか立たない（同 `:185`）:

```kotlin
AsyncFunction("setAudioModeAsync") { mode: AudioMode ->
  staysActiveInBackground = mode.shouldPlayInBackground
  ...
}
```

⚠️ **つまり `shouldPlayInBackground: true` を入れずに背面へ回すと、
読み上げは「戻った瞬間に止まる」形で壊れる。**

📌 **`setAudioModeAsync` はプロセス全体に効く。** 画面ごとに値を書くと
**後から呼んだ画面が全体を上書きする**ため、設定画面の音量測定が
独自の値に戻すと**次のハンズフリー応答が背面で黙る**。
そのため**録音向き・再生向きの2つに固定し、`src/api/voice.ts` だけで持つ**
（`AUDIO_MODE_RECORDING` / `AUDIO_MODE_PLAYBACK`）。

### 13.2 ローカルのExpoモジュールを作るときの実測

**`App/modules/app-foreground/`**（Expo Modules API のローカルモジュール）を作って分かったこと。

| 事実 | 中身 |
|---|---|
| **autolinkされる** | `App/modules/` が既定の `nativeModulesDir`。**`MainApplication.kt` への登録は不要**（`expo-modules-autolinking search` で解決を確認済み） |
| **`build.gradle` に `versionName` が要る** | 無いと `'android.defaultConfig.versionName' is not defined` で**構成段階から失敗する** |
| **`AsyncFunction` は別スレッドで走る** | Activityを触る処理（`moveTaskToBack` / `startActivity`）は `runOnQueue(Queues.MAIN)` が要る |
| **`<queries>` が要る** | Android 11+ は既定で他アプリが見えず、宣言が無いと `queryIntentActivities` が**黙って空を返す**（＝戻り先の一覧が作れない）。⚠️ `QUERY_ALL_PACKAGES` はGoogle Playの審査対象なので使わない |

⚠️ **`MainActivity.kt` には足せない。** あちらは `plugins/withVoiceInteraction.js` が
**全文を生成している**ので、書くとprebuildのたびに持ち回ることになる。

### 13.3 ✅ 実機で成立（2026-08-21・App v1.22.0）

**設定画面で戻り先に Google マップを選んだところ、回答後にマップへ戻った。**
`touring.returnApp = com.google.android.apps.maps` が保存されていることも確認済み。

⚠️ **つまずいた点（設計の問題）**: **既定が「戻らない」で、しかも黙って何もしない**ため、
**設定し忘れると機能が壊れているのと区別がつかなかった。**
→ 対策として**未設定なら画面の「設定」リンクにその旨を出す**ようにした（v1.22.0）。

📌 **残りの確認事項:**

#### 実機で確かめること（続き）

- [x] ❌ **`moveTaskToBack(true)` では「直前のマップアプリ」に戻らない**
      （**ホーム画面に落ちた。** 2026-08-21 実機で確認。詳細は §13.4）
- [x] ✅ **背面でも読み上げが鳴る**（`interruptionMode: "mixWithOthers"` が要る。§13.6〜13.7）
- [x] ❌ **背面のままポーリングは完走しない**（キャッシュプロセス化でJSが凍結。§13.8）
      → **回答を待ってから戻す**方式に戻した
- [ ] ⚠️ **読み上げが最後まで鳴り切るか**（途中で切れないか）
- [x] ✅ **戻った後、インカムのボタンで再度起動できる**（2026-08-21 実機で確認。連続使用は壊れていない）
- [ ] 騒音ガードで捨てたときも、通知を読み上げ切ってから戻るか
- [x] ✅ **設定画面の一覧にマップアプリが出る**（`<queries>` が効いている）
- [x] ✅ **回答後にマップへ戻る**（2026-08-21・v1.22.0）

⚠️ **`adb logcat | grep handsfree` で `launchApp(<pkg>) returned <bool>` を確認できる。**
false なら開けていない（アンインストール済み・パッケージ名の誤り等）。

### 13.4 ❌ `moveTaskToBack` ではマップに戻らない（実機で確定）

**2026-08-21、実機（Pixel 8a / Android 16・API 36）で確認**:
マップを開いた状態でインカムのボタンを押すと、**マップが最小化されて本アプリが開き**、
回答後は**本アプリが閉じてホーム画面に戻った**（マップは最小化されたまま）。

#### なぜそうなるか（`dumpsys activity recents` で確認）

```
* Recent #1: Task{... A=10533:com.touringproject.app}          ← 本アプリ
* Recent #2: Task{... A=10208:com.google.android.apps.maps}    ← マップ（別タスク）
  baseIntent=Intent { act=android.intent.action.VOICE_COMMAND flg=0x10000000 ... }
```

⚠️ **本アプリとマップは「別のタスク」。** `MainActivity` は `launchMode="singleTask"` で、
さらに `VOICE_COMMAND` は `FLAG_ACTIVITY_NEW_TASK`（`flg=0x10000000`）で飛んでくるため、
**本アプリは常に新しいタスクとして立つ**。

`moveTaskToBack` は**自分のタスクを下げるだけ**で、次に何を前面に出すかは決めない。
下げた結果 Android が選ぶのは**ホーム**であって、直前のタスクではない。
⚠️ **つまり実装の誤りではなく、この API では要件を満たせない。**

#### ⚠️ 「マップのタスクを前面に上げる」は不可能

`ActivityManager.AppTask#moveToFront()` は使えない:

| 事実 | 中身 |
|---|---|
| `getAppTasks()` | ⚠️ **自分のタスクしか返さない**（他アプリのタスクは列挙できない） |
| `moveToFront()` | `REORDER_TASKS` 権限が要るうえ、そもそも**対象の `AppTask` を取得できない** |

**Android 5以降、他アプリのタスクの列挙・操作は塞がれている**（プライバシー保護）。
📌 **`getRecentTasks()` も同様に自分のタスクしか返さない。**

#### ⚠️ `moveTaskToBack` は「たまたま戻る」ことがある（信頼できない）

**同じv1.20.0のビルドで、戻る場合と戻らない場合の両方が再現した**（2026-08-21）。
差はタスクの並びだけだった:

| 試行 | 直下のタスク | 結果 |
|---|---|---|
| 1回目 | **ホーム**（マップはその下） | ❌ ホーム画面に落ちた |
| 2回目 | **マップ** | ✅ たまたまマップに戻った |

⚠️ **`moveTaskToBack` は「自分を下げる」だけなので、次に前面へ出るのは
「たまたまその下にあったもの」。** マップとは限らず、ホームにも他アプリにもなる。
📌 **走行中にタスクの並びは制御できない**（信号待ちにSNSを見ただけで変わる）。
**動くことがあるからこそ質が悪い**ので、これに依存してはいけない。

#### 残る選択肢

⚠️ **「直前のアプリに戻る」という汎用の操作は、通常のアプリには開かれていない。**
成立しうるのは以下（[adr/007](../../adr/007_return_to_map_after_answer.md) で判断）:

| 案 | 中身 | 難点 |
|---|---|---|
| **マップを明示的に起動** | `Intent` でマップアプリを開く | ⚠️ **どのアプリでナビ中かを知り得ない**。ナビ中のルートを壊す懸念 |
| **画面を出さない** | そもそも本アプリを前面に出さず、裏で録音・再生する | ⚠️ **`VOICE_COMMAND` はActivityへ届く**ので、Activityは要る |
| **諦める** | ホームに戻るのを許容する | ⚠️ ナビが見えない。**要件を満たさない** |

### 13.5 ✅ LAUNCHERインテントは「既存のタスクを再開する」（実機で確認）

**「マップを起動し直すとナビが壊れる」という懸念は、LAUNCHERインテントには当てはまらない。**

`dumpsys` で見ると、マップのタスクは**ランチャーから普通に開かれたもの**だった:

```
* Recent #2: Task{2c654ee #19635 type=standard A=10208:com.google.android.apps.maps}
  intent={act=android.intent.action.MAIN cat=[android.intent.category.LAUNCHER]
          flg=0x10200000 cmp=com.google.android.apps.maps/com.google.android.maps.MapsActivity}
```

**同じLAUNCHERインテントを投げたときの実測**（2026-08-21）:

| | タスクID | 位置 |
|---|---|---|
| 前 | `#19635` | Recent #2 |
| 後 | **`#19635`（同じ）** | **Recent #0（前面）** |

⚠️ **タスクIDが変わっていない＝新しく起動したのではなく、既存のタスクが再開した。**
`ACTION_MAIN` + `CATEGORY_LAUNCHER` は既存タスクの再開として扱われるため、
**画面の状態（案内中のルートを含む）はそのまま残る。**

📌 **つまり `getLaunchIntentForPackage()` で戻せる。** ただし
⚠️ **「どのマップアプリを使っているか」はアプリ側から知り得ない**ため
（他アプリの前面判定は Android 5 以降塞がれている・§13.4）、
**パッケージ名を設定で持つ**必要がある。

### 13.6 ⚠️ 「読み上げが終わってから戻る」ように見えた（調査中）

**2026-08-21・v1.22.0 の実機テストで、読み上げ後にマップへ戻るように見えた。**
⚠️ **コード上は読み上げの完了を待っていない**（`playAnswer` は同期で、
直後に `returnToMapIfHandsFree()` を呼んでいる）ので、見えた挙動と実装が食い違う。

#### 疑っていること：オーディオフォーカス

**マップは案内音声のためにオーディオフォーカスを取る。**
`expo-audio` はフォーカスを奪われると**プレイヤーを一時停止する**:

```kotlin
AudioManager.AUDIOFOCUS_LOSS -> {
  focusAcquired = false
  players.values.forEach { player -> player.ref.pause() }
}
```

⚠️ **つまり「戻ったら読み上げが止まり、マップから戻ったら再開した」のを
『読み上げ後に戻った』と観測した可能性がある。**

📌 **`AUDIO_MODE_PLAYBACK` に `interruptionMode: "mixWithOthers"` を追加した**（v1.23.0）。
**フォーカスを要求しない**ので奪われることもない。
ナビ音声と重なって鳴るが、**どちらも走行中に聞きたい情報**なので、それでよい。

⚠️ **`setAudioModeAsync` は `Partial<AudioMode>` を取るため、
`interruptionMode` を書き忘れても型エラーにならない。** 気づきにくい。

#### 切り分けの材料（v1.23.0 で追加したログ）

```
[handsfree] playAnswer t=<ms>
[handsfree] launchApp start t=<ms>
[handsfree] launchApp(<pkg>) returned <bool> t=<ms>
```

`adb logcat | grep handsfree` で時刻を比べる:

| 見えるもの | 意味 |
|---|---|
| 3行が**ほぼ同時刻**（数百ms以内） | **戻す処理は即座に走っている。** 読み上げが遅れて聞こえたなら、原因は**フォーカスか再生の開始待ち**であって「戻るのが遅い」ではない |
| `launchApp start` が**読み上げの秒数ぶん遅い** | 実装のどこかで待っている（要調査） |

### 13.7 ✅ フォーカス説が当たり／⏩ 戻すタイミングを「送信できた時点」へ前倒し

**2026-08-21・v1.23.0 の実機テストで、`interruptionMode: "mixWithOthers"` を入れたところ
「マップに戻ってから読み上げられた」**（＝設計どおりの順序）。
⚠️ **§13.6 の疑い（オーディオフォーカスを奪われて一時停止していた）が裏付けられた。**

#### さらに前倒しした（v1.24.0）

**それまでは「回答が届いてから」戻していたが、`POST /ask-audio` が
202 を返した時点で戻すように変更した。**

⚠️ **回答までは初回で10秒前後かかる**（AgentCoreのコールドスタート。`CLAUDE.md`）。
待ってから戻すと**その間ずっとナビが見えない**ので、待つ理由が無い
（読み上げは背面でも鳴ることが確認済み）。

📌 **ポーリングは背面でも動き続ける**（React NativeのJSスレッドはブラウザと違い、
背面でも止まらない）。⚠️ **ただしDozeやOSの省電力で `setTimeout` が
遅延する可能性は残る**ので、実機で「戻った後に回答が届くか」を要確認。

#### ⚠️ 背面に回ったあとの失敗は「読み上げ」で知らせる

**画面に出しても見えない**ので、以下は端末内蔵TTS（`expo-speech`）で通知する:

| 場面 | 読み上げる |
|---|---|
| ポーリングが打ち切られた／中断された | 「回答を取得できませんでした。もう一度お話しください。」 |
| 送信中に例外 | 「送信に失敗しました。もう一度お話しください。」 |
| 回答は来たが**音声が無い**（合成失敗） | 回答の本文をそのまま読み上げる |

⚠️ **`launchedHandsFree` とは別に `wasHandsFree` を持つ。**
前者は「まだ戻していない」の意味で**戻した時点で倒れる**ため、
**戻した後に起きる失敗**の判定には使えない。

### 13.8 ❌ 「送信できた時点で戻す」は破綻した（実機・v1.24.0）

**§13.7 の前倒しは撤回した。** 実機で**回答が来なくなった**:

> 初回は質問しても回答が来ない。そのあともう一回ボタンを押すと、
> **前にボタンを押した時の質問の答えが返される。**

#### 原因：背面に回ると**JSが凍結する**

`dumpsys activity processes` で本アプリの状態を見ると:

```
oom: curRaw=700 setRaw=700 cur=700 set=700
state: cur=LAST set=LAST
```

⚠️ **`oom_adj=700` / `state=LAST` は「キャッシュプロセス」。**
Android はこの状態のプロセスを**凍結する**ので、
**`setTimeout` が進まず、ポーリングのループが止まる。**

⚠️ **「React NativeのJSスレッドは背面でも止まらない」は誤り**だった。
**プロセスがキャッシュへ落とされるかどうか**が効くので、
**フォアグラウンドサービスを持たない限り、背面では待てない。**

📌 **症状が「次の質問で前の答えが返る」形になる理由**: 止まったループは
**アプリが再び前面に出た瞬間に再開する**ため、次にボタンを押したときに
**前回のポーリングが完走して古い答えを表示する。**

#### 決定：**回答を待ってから戻す**（次善案に戻す）

⚠️ **背面で待つにはフォアグラウンドサービスが要るが、採らない。**
`CLAUDE.md`「モバイルは必要最低限・薄いクライアントに徹する」に反するうえ、
**通知の常駐・電池・権限**と引き換えに縮むのは**初回の10秒だけ**。

📌 **副産物として1つ直した**: **新しいハンズフリー起動で、前の質問の
ポーリングを中断する**ようにした（`pollAbort`）。
⚠️ **これが無いと、前倒しをやめても「前の答えが返る」余地が残る**
（回答が遅い質問の途中でもう一度ボタンを押した場合）。

### 13.9 ⚠️ 応答待ち中にボタンを押されたときの順序（レビューで発覚）

**レビューで見つかった不具合**（実機で表面化する前に修正・v1.26.0）。

`startRecording` は先頭で `if (recordingRef.current || sending) return` と弾く。
一方でハンズフリー起動のeffectは、**録音が始まる前に**
「前の質問のポーリングを捨てる」処理（`pollAbort`）を実行していた。

⚠️ **応答待ち（`sending`）の最中にボタンを押すと、
前の質問だけが捨てられ、新しい録音は始まらず、完全に無反応になる。**
`autoRecordHandledUrl` も確定済みなので**同じURLでは再試行されない。**

📌 **走行中は画面を見ないので、「押せていない」のか「壊れた」のか区別できない**
のが最も痛い。

**対処**（2つセット）:

| | 中身 |
|---|---|
| **順序を入れ替える** | **録音が始まってから**ポーリングを捨てる（`startRecording` に成否を返させる） |
| **黙って諦めない** | 開始できなかったら端末内蔵TTSで「いま応答中です」と知らせる |

📌 **同じ種類の取り残しが2件あった**（どちらもフラグの寿命）:
`askBackend`（テキスト送信）が `launchedHandsFree` を倒しておらず、
**あとで画面から質問して成功したときに勝手にマップへ切り替わる**余地があった。
`wasHandsFree` も一往復の終わりで倒れておらず、
**画面を見ているのに読み上げる**余地があった。

## 12. ❌ 走行中は音量VADが成立しない（`metering` が 0 dBFS に飽和）

**2026-09-05、実走行で判明。** §11 で「未検証」としていた走行中の閾値は、
**調整では成立しないと分かった。**

### 観測（実機・インカム接続・画面表示の `metering` 生値）

| 状況 | 画面に出た値 |
|---|---|
| バイクに乗っていない（インカム接続） | **-60 dB 程度** |
| **エンジンがかかっている（停車・走行とも）** | ⚠️ **0 dB 付近** |
| エンジンがかかった状態で**発話** | ⚠️ **ほとんど変わらない** |

⚠️ **画面に出しているのは `metering` の生値**（`App/src/app/index.tsx` の
`meterDb.toFixed(1)`）。加工もオフセットもしていない。

### 分かったこと

**`0 dBFS` は `maxAmplitude` が 32767（フルスケール）に張り付いた状態**
（`AudioRecorder.kt` は `20*log10(amp/32767)` で換算するため）。
⚠️ **飽和した値には、何を足しても変化が出ない。** 発話しても動かないのはこのため。

⚠️ **切り分けの要点: 原因はエンジン音であって、SCO経路の特性ではない。**
インカムを繋いだだけ（エンジン停止）なら -60 dB 程度と正常な値が出る。
**エンジンの始動が飽和の引き金**で、⚠️ **走行の有無は関係しない**（停車＋アイドリングでも飽和する）。

### ⚠️ 録音ファイルには声が入っている（食い違い）

**同じ録音を聞くと、エンジン音はあまり入っておらず、言葉ははっきり聞き取れる。**
つまり **「測っている音」と「ファイルに書かれている音」が別物。**

インカムのDSP（ノイズキャンセル）は**録音ストリームには効いている**が、
**`MediaRecorder.maxAmplitude` が見ている波形はその手前、もしくはゲインで
振り切った後**と考えられる。

### 帰結

| 打ち手 | 判定 |
|---|---|
| 閾値の調整 | ❌ **無意味。** 常時 -0.x なら、どの閾値でも一度も無音にならない |
| 適応閾値・相対判定（暗騒音からの差分・移動平均） | ❌ **無意味。** 振り切った値は変化しない |

📌 **騒音ガード（`shouldDiscardAsNoise`）は設計どおり働いていた。**
`everSilent` が一度も立たないため録音は捨てられ、TTSで知らせていたはず。
⚠️ **「走行中に全く機能しなかった」の正体はガードの発動であって、バグではない。**
