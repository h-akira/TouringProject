# 実測: インカムのマイクで録るには

> 実測: 2026-09-22 / 端末: **Pixel 8a** / インカム: FODSPORTS M1-S Pro
> ⚠️ **実測した事実だけを書く。** 判断は [adr/010](../../adr/010_intercom_mic_routing.md)。

## 1. ⚠️ 結論: `setCommunicationDevice()` に【出力(sink)】を渡す

**4通り試した結果、録れるのは1つだけだった。**

| やり方 | 録れた音 | 経路（`AudioPatch` の `source`） |
|---|---|---|
| **何も指名しない** | 本体マイク | `microphones` |
| **`expo-audio` の `setInput()` で指名** | ❌ **全サンプル0** | （SCOが張られない） |
| **`MODE_IN_COMMUNICATION` だけ立てる** | 本体マイク | `microphones` |
| ✅ **出力(sink)を `setCommunicationDevice()` に渡す** | ✅ **-13.5 dB** | ✅ **`bluetooth-sco-headset-microphones`** |

📌 **3つ目は `mic` / `voice_recognition` / `voice_communication` の3通りで試して、
いずれも本体マイクだった**（この端末は `MODE_IN_COMMUNICATION` だけでは SCO に乗らない）。

## 2. ⚠️ なぜ `setInput()` では録れないのか

**`expo-audio` 1.1.1 の `AudioRecorder.kt`:**

```kotlin
val audioDevices = audioManager.getDevices(AudioManager.GET_DEVICES_INPUTS)  // ← 入力
...
audioManager.setCommunicationDevice(deviceInfo)   // ← そこに入力デバイスを渡す
```

⚠️ **公式仕様は出力(sink)しか受け付けない:**

> **Only devices in a sink role (AKA output devices, see `AudioDeviceInfo#isSink()`)
> can be specified. The matching source device is selected automatically by the platform.**
> — [AudioManager.setCommunicationDevice](https://developer.android.com/reference/android/media/AudioManager#setCommunicationDevice(android.media.AudioDeviceInfo))

📌 **AOSP は出力リストから portId を探し、見つからなければ例外を投げず `false` を返す。**
⚠️ **`expo-audio` はその戻り値を捨てている**ので、**アプリ側にエラーが一切見えない。**

**実機の `adb shell dumpsys audio`:**

```
Computed Preferred communication device: null      ← ⚠️ SCOが一度も張られていない
Active communication device: role:output type:bt_a2dp   ← 有効なのは音楽用プロファイル
```

## 3. ✅ 動いた手順

```
1. addOnCommunicationDeviceChangedListener() を登録   ← ⚠️ 先に張る（イベントを取り逃さない）
2. setMode(MODE_IN_COMMUNICATION)                     ← ⚠️ setSpeakerphoneOn() は呼ばない
3. getAvailableCommunicationDevices() から TYPE_BLUETOOTH_SCO の【出力】を取る
4. setCommunicationDevice(sink) → ⚠️ 戻り値 true を確認
5. リスナーで切替完了を待つ                            ← ⚠️ 固定 sleep ではない
6. 録音を開始（📌 setPreferredDevice() は不要 — 入力は自動で対になる）
7. clearCommunicationDevice() + setMode(MODE_NORMAL)
```

**成功時のログ:**

```
setCommunicationDevice()  device: role:output type:bt_sco
AS.BtHelper: onScoAudioStateChanged  state: 12                   ← 確立
AudioPatch{ source: [bluetooth-sco-headset-microphones],
            sink:   [primary-capture] }
AHal::BT: Enable: bluetooth-sco-headset-microphones done
```

### 📌 確立にかかる時間

| 測り方 | 値 |
|---|---|
| **ログ**（`setCommunicationDevice` → `state: 12`） | ⚠️ **270〜500ms** |
| **アプリから見た往復** | **992ms** |

⚠️ **A2DP で音楽が鳴っていない状態の値。** 📌 **再生中は伸びうるので、必要なら測り直す。**
📌 **本アプリ（`App/` v1.36.0）では 496ms**（⚠️ **検証アプリより遅いが、2秒の上限には余裕がある**）。

### ⚠️ `setAudioModeAsync` は使えない

**`expo-audio` の `AudioModule.kt:607`:**

```kotlin
audioManager.mode = if (playThroughEarpiece) MODE_IN_COMMUNICATION else MODE_NORMAL
audioManager.setSpeakerphoneOn(!playThroughEarpiece)   // ← ⚠️ これ
```

⚠️ **`shouldRouteThroughEarpiece` を渡すと `setSpeakerphoneOn()` も呼ばれる。**
📌 **公式手順が明示的に禁じている操作**で、⚠️ **通信デバイスの指名を上書きしうる。**
**だからモードの管理はネイティブ側に持つ。**

### ⚠️ `BLUETOOTH_CONNECT` が要る（Android 12+）

**宣言だけでは足りず、実行時に要求しないと経路を張れない。**

## 4. ⚠️ 本体マイクとの切り分け方

**「音が録れた」は成功の証拠にならない** — ⚠️ **本体マイクでも録れてしまう。**

| 確かめること | どう確かめるか |
|---|---|
| **経路がSCOか** | ⚠️ **`adb logcat` の `AudioPatch` の `source`**。`microphones` なら本体マイク |
| **SCOが張れたか** | `dumpsys audio` の `Preferred communication device` が `null` でない |
| ⚠️ **本体マイクでないか** | 📌 **スマホを別室に置き、ドアを閉めて喋る**（⚠️ **これが最終確認**） |

⚠️ **`getCurrentInput()` の表示は判定に使えない。** 公式仕様では
**「録音中でなければ null か、前回アクティブだったときのデバイス」**であり、
📌 **実際これを見て「録れている」と誤認した**（録音は全サンプル0だった）。

## 5. 📌 Googleレコーダーも同じ公開APIだった

**`dumpsys audio` に、同じ端末・同じインカムで成功した記録が残っていた:**

```
setCommunicationRouteForClient for uid: ... (com.google.android.apps.recorder)
  device: role:output type:bt_sco   isPrivileged: false      ← ⚠️ 特権ではない
  from API: setCommunicationDevice()
```

⚠️ **特権APIではないので、同じ呼び方をすれば同じように録れる。**

## 6. ✅ 本アプリでも成立した（2026-09-22）

**`App/` v1.36.0 で別室テストに成功。** ⚠️ **本アプリ自身が SCO を張っている:**

```
23:50:11.890  setCommunicationDevice()  device: role:output type:bt_sco
              from u/pid:<uid>          ← ⚠️ com.touringproject.app
23:50:12.386  BtHelper.onScoAudioStateChanged, state: 12    ← ✅ 確立（496ms）
```

📌 **検証アプリでの成立が、本アプリでも再現した。**

## 7. ⚠️ 本体マイクで録っていたときの音（参考）

**走行中の録音を帯域ごとに測った値**（⚠️ **インカムが経路に入る前のもの**）:

| 条件 | 低域 0〜300Hz（風・エンジン） | 声の帯域 300〜3400Hz | 差 |
|---|---|---|---|
| `baseline` | -37.9 dB | -37.5 dB | ほぼ同じ |
| `voice_recognition` | **-15.3 dB** | -23.8 dB | ⚠️ **低域が 8.5dB 上** |
| `unprocessed` | **-26.8 dB** | -37.1 dB | ⚠️ **低域が 10.3dB 上** |

⚠️ **支配的なのは低域の風切り音・エンジン音で、声の帯域が主役になっていない。**
📌 **ヘルメット内のマイクなら口元が至近なので声の帯域が立つはず**で、
**これは「外に置かれたマイクが風とエンジン音を正面から拾っている」形。**

> 📌 **後処理でのノイズ除去が63パターン全滅した**（[pre-research/denoise/](../denoise/)）のも、
> ⚠️ **声が届いていなかったからと考えると辻褄が合う** — **無い信号は復元できない。**

## 8. まだ分かっていないこと

| # | 未確認 | どう確かめるか |
|---|---|---|
| 1 | ⚠️ **インカム経由なら走行中に聞き取れるか** | ⚠️ **本命。** **経路が直って初めて測れる** |
| 2 | ⚠️ **`voice_communication` を捨ててよいか** | **端末側のノイズ除去が無くなる。** ⚠️ **インカムの CVC だけで足りるか**を走行で測る |
| 3 | ⚠️ **エコーが出ないか** | `voice_communication` は**エコーキャンセル**も担う |
| 4 | **A2DP 再生中でも同じ速さで張れるか** | ⚠️ **270〜500msは音楽が鳴っていない状態の値** |
