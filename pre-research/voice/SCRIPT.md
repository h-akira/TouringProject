# 音声入力の台本（Transcribe検証用）

> 目的: **本物の人の声**で、Transcribe の日本語認識が実用に足るかを確かめる。
> 合成音声（`say`）は明瞭すぎて、地名の認識精度を評価できないため使わない。

## 読み方の注意（重要）

- **走行中と同じように読む。** 普段の音量・速さで、**丁寧に発音しすぎない**。
  きれいに読むと精度が良く出てしまい、実際の使用時に破綻する。
- ヘルメットや風の音は今回は再現しない（まず静かな環境での上限を測る）。
- 1テイク＝1発話。**言い直したらそのテイクを録り直す**。
- 各テイクの狙いは伏せずに書いてあるが、**読むのは「読む文」の列だけ**。

## テイク一覧

| # | 読む文 | 何を見るか |
|---|---|---|
| **01** | 今日の天気はどう？ | **最短の基本形。** まず一巡が通るかの確認。Web検索も走る |
| **02** | 右手に見える山は何ですか？ | ユーザーストーリーの代表例（US-1.01）。地名を含まない一般質問 |
| **03** | 静岡県富士市の近くでガソリンスタンドはある？ | **地名＋実用的な質問。** 「富士市」が取れるか |
| **04** | 今治から松山まではどのくらいかかる？ | ⚠️ **難読地名。**「今治（いまばり）」「松山」。ここが本番 |
| **05** | 柳井の名物は何？ | ⚠️ **難読地名。**「柳井（やない）」。単独の固有名詞は難しい |
| **06** | それは何時まで開いてる？ | **会話継続の確認（US-1.02）。** 03の直後に、指示語が通るか |

### テイク06の実行方法だけ特別

06は**前の会話を引き継ぐ**必要があるので、03の直後に `--keep-session` を付けて実行する。

```sh
python3 try_voice.py recordings/03.wav                 # 新しい会話を開始
python3 try_voice.py recordings/06.wav --keep-session   # 03の続きとして聞く
```

## 手順

### 1. 準備（初回のみ）

```sh
cd pre-research/voice
python3 -m venv env && . env/bin/activate
pip install boto3 amazon-transcribe
```

### 2. 認証とエージェントの指定

⚠️ **プロファイルは必ず `touring` を指定する。** 既定のプロファイルには権限がなく、
`AccessDeniedException: transcribe:StartStreamTranscription` になる。

```sh
export AWS_PROFILE=touring
# ARNは取得して環境変数に入れる（実値はコミットしない）
export AGENT_ARN=$(aws bedrock-agentcore-control list-agent-runtimes \
  --region us-east-1 --query 'agentRuntimes[0].agentRuntimeArn' --output text)

# 空でないことを必ず確認する
[ -n "$AGENT_ARN" ] && echo "AGENT_ARN OK" || echo "取得失敗（プロファイルを確認）"
```

⚠️ **`AGENT_ARN` が空だと** `ValidationException: accountID is required when
agentRuntimeArn is provided as agentId` になる。SDKが空文字列をARNではなく
agentIdと解釈するためで、原因が分かりにくい。**上の確認を飛ばさないこと。**

### 3. 録音する

```sh
./record.sh 01     # 台本の01を読む → Returnで停止
```

QuickTime が起動して録音が始まる。**初回はマイク権限の確認が出る**ので許可する。
うまく動かない場合は、自分でボイスメモ等で録音して次のコマンドで変換すればよい。

```sh
afconvert -f WAVE -d LEI16@16000 -c 1 <録音ファイル> recordings/01.wav
```

### 4. 通してみる

```sh
python3 try_voice.py recordings/01.wav
```

出力例（各段の所要時間が出る）:

```
session: voice-xxxxxxxx...

[STT     1200 ms] 今日の天気はどう？
[AGENT   4300 ms] 今日の富士市は晴れで、気温は28度くらいです。
[TTS      600 ms] played with Kazuha

total: 6.1 s
```

## 見るべきポイント

| 観点 | 判断基準 |
|---|---|
| **地名の認識** | 04・05が正しく取れるか。**ここが方式1の弱点になりうる** |
| **合計時間** | 走行中に許容できるか。**体感で判断する**（数字だけでは決められない） |
| **STTの取りこぼし** | 語尾（「〜ですか？」）が落ちないか |
| **Pollyの自然さ** | 読み上げが聞き取れるか。地名の読み間違いはないか |
| **会話継続** | 06で「それ」が03の文脈として通じるか |

> 📌 **地名が取れない場合の打ち手は既にある。**
> Transcribe の**カスタム語彙**（`ja-JP` は batch/streaming 両対応）に地名を登録すれば改善できる。
> つまり「04・05が失敗＝方式1が破綻」ではない。**まず素の精度を測るのが今回の目的。**

## 結果の記録

測定できたら [README.md](README.md) §8 の未確認事項を埋める。
とくに**合計レイテンシ**と**地名の認識精度**は、方式2（ストリーミング化）に進むべきかの判断材料になる。
