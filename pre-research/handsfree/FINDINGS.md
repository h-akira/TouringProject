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

`RecordingOptions.isMeteringEnabled: true` で `recorder.getStatus().metering` に音量（dBFS。無音 `-160`・最大 `0`）が入る。
元は `MediaRecorder.maxAmplitude`（0〜32767）で、読むたびにリセットされる（ポーリング間隔が測定窓になる。読む場所は1か所に限る）。
`-160` は `maxAmplitude == 0` のときの番兵で、1回目の読み取りや失敗でも出る（「無音」ではない）。

## 11. 無音検知は停車中なら成立した

2026-08-18、停車中の実機で「話し終えると自動で送信」が成立した（閾値 -40dB・無音3秒・猶予5秒）。
走行中は §14 のとおり成立しなかったので、無音検知は廃止した（App の adr/003）。

## 12. 未確認のまま残っているもの

- [ ] `android.intent.action.VOICE_COMMAND` の正式な仕様（公式リファレンスで裏を取れていない）
- [ ] Pixel 以外の端末で、インカムのボタンが同じ Intent を出すか

## 13. 応答後にマップアプリへ戻す（要約）

判断は App の adr/002。実測で分かったこと:

- `expo-audio` は既定で背面に回ると再生を止める。`setAudioModeAsync` の `shouldPlayInBackground: true` が要る（プロセス全体に効く）。
- マップが案内音声のためにオーディオフォーカスを取ると `expo-audio` は再生を一時停止する。`interruptionMode: "mixWithOthers"` で要求しないようにすると背面で鳴り続けた。
- `moveTaskToBack` は自分のタスクを下げるだけで、ホーム画面に落ちることがある（直下のタスク次第で結果が変わり、信頼できない）。他アプリのタスクを前面に上げる手段は無い（`getAppTasks()` は自分のタスクしか返さない）。
- LAUNCHER インテント（`getLaunchIntentForPackage()`）は既存のタスクを再開する（タスク ID が変わらない）ので、案内中のルートが残る。
- 背面に回るとプロセスがキャッシュ化され（`oom_adj=700`）、JS が凍結してポーリングが止まる。「送信できた時点で戻す」と、次の押下で前の質問の答えが返った。
- ローカルの Expo モジュールは `App/modules/` に置けば autolink される。`build.gradle` に `versionName` が要り、Activity を触る処理は `runOnQueue(Queues.MAIN)` が要る。Android 11 以降は `<queries>` が無いと他アプリの一覧が黙って空になる。

## 14. 走行中は音量の無音検知が成立しない（`metering` が 0 dBFS に飽和）

2026-09-05、実機（インカム接続）で測った。

| 状況 | `metering` |
|---|---|
| バイクに乗っていない | -60 dB 程度 |
| エンジンがかかっている（停車・走行とも） | 0 dB 付近 |
| エンジンがかかった状態で発話 | ほとんど変わらない |

- `maxAmplitude` が 32767 に張り付いた状態で、飽和した値は発話しても変化しない。閾値の調整・相対判定では直らない。
- 原因はエンジン音で、停車してアイドリングするだけで再現する。
- 同じ録音を聞くと声ははっきり聞き取れた（測っている波形とファイルの音が別物）。

## 15. `audioSource` を変えても解決しない（4種を実測）

2026-09-09、App v1.29.0 で4種を測り比べた。

| `audioSource` | 結果 |
|---|---|
| `mic`（既定） | 飽和 |
| `voice_recognition` | 飽和 |
| `voice_communication` | 4種で最もノイズ除去が効いた。アイドリング中は -50 dB 程度で、発話すると値が上がった。アクセルを開けると 0 dB 付近に達した |
| `unprocessed` | 飽和 |

音量ベースの判定は、`audioSource` の選択を含めて使えない（速度で壊れる）。`voice_communication` は録音の品質として優れているので既定に残す。

## 16. 録音中でも `VOICE_COMMAND` は届く（本体マイクで録音しているとき）

2026-09-10、App v1.31.0 の実機で確認した。録音中にインカムのボタンを押すと Intent が届き、その場で送信された。
マイクを使っている最中に Bluetooth スタックが Intent を送るかはコードからは判断できず、ボタン再押しで終える方式の唯一の未知だった。

インカムの経路を「音声認識」として張って録音しているときは、2回目の押下は Intent ではなく経路の切断として届く（[mic-routing/FINDINGS.md](../mic-routing/FINDINGS.md) §10）。
