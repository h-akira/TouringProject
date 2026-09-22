# 何が分かったか

> ⚠️ **事実だけを書く。** 判断は書かない。

## 1. ❌ AWSに「音声ファイルのノイズを除去するサービス」は無い（2026-09-13 時点）

**「S3のファイルを投げると綺麗になって返る」形のマネージドサービスは存在しない。**
⚠️ **ノイズ除去の機能自体は複数あるが、いずれも通話・会議のリアルタイム処理に括り付けられている。**

### 1.1 ❌ Amazon Voice Focus AMI — ⚠️ 廃止された

⚠️ **これが唯一の「ファイルを処理できる」提供だった。**
S3またはローカルのWAVを処理するAMI（EC2イメージ）としてAWSが配っていた。

> **As of August 2025, the Amazon Voice Focus AMI feature is no longer available.**
> — [Using Amazon Voice Focus AMI to reduce noise in audio](https://aws.amazon.com/blogs/business-productivity/using-amazon-voice-focus-ami-to-reduce-noise-in-audio)

📌 **本件にちょうど当てはまる用途だっただけに、廃止の影響が大きい。**
⚠️ **代替として案内されているのは Chime SDK の機能**だが、下記のとおり通話専用。

### 1.2 ❌ Chime SDK の音声強調（voice enhancement）— 通話録音専用

**call analytics の録音に付随する機能。** 中身は Voice Focus と同じモデル。

> Voice enhancement also uses a noise reduction model called **Amazon Voice Focus**
> to help reduce background noise in the enhanced audio.
> — [Using the Amazon Chime SDK console to create call analytics configurations](https://docs.aws.amazon.com/chime-sdk/latest/dg/create-config-console.html)

⚠️ **任意のファイルを投げるAPIではない。** 掛かるのは **Voice Connector を通った通話の録音**だけで、
`S3RecordingSinkConfiguration` が書いた `*_enhanced.wav` が副産物として出る形。

**その他の制約**（同ページ）:

| 制約 | 内容 |
|---|---|
| リージョン | ⚠️ **us-east-1 / us-west-2 のみ** |
| 長さ | 30分まで |
| 入力 | ⚠️ **電話由来の 8kHz narrowband 前提**（16kHzへ持ち上げるのが主目的） |
| 前提リソース | ⚠️ **Voice Connector・call analytics configuration が要る** |

📌 **8kHz→16kHz の帯域拡張が主目的**であって、⚠️ **本件（16kHzで録れているがノイズまみれ）とは狙いが違う。**

### 1.3 ❌ Chime SDK Voice Focus（クライアントSDK）— ブラウザ/端末で動く

`amazon-chime-sdk-js` の `VoiceFocusTransformDevice` 等。
⚠️ **WebAudio上でリアルタイムに掛けるもの**で、**サーバーでファイルに掛ける用途に作られていない。**

📌 **「コマンドラインツールとして試したい」という要望はissueに上がっている**が、
⚠️ **公式の提供は無い**（[aws/amazon-chime-sdk-js#2176](https://github.com/aws/amazon-chime-sdk-js/issues/2176)）。

### 1.4 ❌ Amazon Connect の Audio Enhancement — 通話中のリアルタイム専用

> Audio Enhancement **processes audio in real-time** ... The feature automatically applies to
> **incoming and outgoing calls**
> — [Enable Audio Enhancement for agents](https://docs.aws.amazon.com/connect/latest/adminguide/audio-enhancement.html)

⚠️ **ソフトフォンのエージェント向け**（4コアCPU要件・CCPが要る）。**コンタクトセンターの外では使えない。**

### 1.5 ❌ Amazon Transcribe — ノイズ除去の機能を持たない

**精度を上げる手段として案内されているのはカスタム語彙とカスタム言語モデルのみ**
（[Improving transcription accuracy](https://docs.aws.amazon.com/transcribe/latest/dg/improving-accuracy.html)）。

⚠️ **どちらも「固有名詞・専門用語の取りこぼし」を直すもの**で、**ノイズには効かない。**

### 1.6 ⚠️ MediaConvert の `NoiseReducer` は**映像用**

**名前が紛らわしいので注意。** `NoiseReducerTemporalFilterSettings` などは
**映像のノイズ**（フィルムグレイン等）を扱う。

**音声側にあるのは `AudioNormalizationSettings`（ITU-R BS.1770 の音量正規化）だけ**
（[MediaConvert API Reference: presets](https://docs.aws.amazon.com/mediaconvert/latest/apireference/presets.html)）。
⚠️ **音量を揃えるだけなので、ノイズと声の比（SNR）は変わらない。**

## 2. ✅ 残る道は「自前で ffmpeg / RNNoise を動かす」

⚠️ **AWSのマネージドサービスに解が無い以上、計算はこちらで持つしかない。**

| 手段 | 中身 |
|---|---|
| **ffmpeg `afftdn`** | FFTベースのノイズ除去。**定常騒音向け** |
| **ffmpeg `arnndn`** | ⚠️ **RNNoise（機械学習）をffmpegから使う。** 別途モデルファイル（`.rnnn`）が要る |
| **ffmpeg `highpass`** | 低域を切る。⚠️ **エンジン音は低域寄りなので理屈は通る** |

📌 **RNNoise は「ノイズプロファイル不要」**で、**実世界の騒音数千時間で訓練されている**
（[xiph/rnnoise](https://github.com/xiph/rnnoise)）。⚠️ **本件のような定常機械音は得意な部類。**

⚠️ **実際に効くかは未検証。**
