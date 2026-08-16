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

## 9. 未確認のまま残っているもの

**方式Bで進めるうえで:**

- [ ] Expo Development Build で `VoiceInteractionService` を組み込む具体的な手順
- [ ] 再インストールで既定のアシスタントが外れるか
      （[報告あり](https://github.com/anthropics/claude-code/issues/41696)）
- [ ] `android.intent.action.VOICE_COMMAND` の正式な仕様（公式リファレンスで裏を取れていない）
- [ ] 「Hey Google」単体（ナビ外）が残るか

**📌 方式Cを再検討することになった場合（いまは不要）:**

- [ ] ウェイクワードを「インカムのマイク」で拾えるか（⚠️ **方式Cの生命線**）
- [ ] SCOを常時開いた場合の電池の持ち
- [ ] 常時録音がインカムの通話・音楽と競合しないか
- [ ] Porcupine の RN バインディングを背景で回せるか
- [ ] メーカー（Fodsports）に問い合わせれば音声入力先の選択手段があるか
