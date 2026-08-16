# TouringProject

**バイクでのツーリング中に、現在地・進行方向の文脈に基づいてAIと音声で対話するアプリ。**

走行中は手が使えないので、イヤモニ経由の音声入出力とハンズフリー起動が前提。

> 「右手に見える山は何？」
> 「この地域の特色は？」

## このリポジトリについて

**開発の記録を兼ねた学習用リポジトリでもある。**
開発者はWeb開発（AWS/Vue/Lambda/JS）の経験はあるがモバイルは未経験のため、
**判断の過程・つまずき・設計理由をドキュメントに残しながら**進めている。

## 構成

| ディレクトリ | 中身 |
|---|---|
| [`App/`](App/) | React Native (Expo) アプリ本体 |
| [`Backend/`](Backend/) | AWSバックエンド（SAM, Python）。API Gateway + Lambda + SQS + DynamoDB |
| [`Agent/`](Agent/) | AgentCoreのエージェント本体（Strands）。会話の継続とWeb検索を担う |
| [`CICD/`](CICD/) | 自動デプロイ（CodeBuild）。手順は [`buildspec.yml`](buildspec.yml) |
| [`docs/`](docs/) | **現在の設計。** 要件定義・アーキテクチャ・API仕様 |
| [`adr/`](adr/) | **決定の記録。** なぜそう決めたか、何を却下したか |
| [`pre-research/`](pre-research/) | **技術検証。** 実測値と検証スクリプト |
| [`learning/`](learning/) | **学習教材。** 使った技術の基礎を、既存のWeb知識と対応づけて書いたメモ |

## 動かす

**アプリは実機Android + Expo Go**、バックエンドはAWSにデプロイして使う。

```sh
cd App
npm install            # API の型は postinstall で自動生成される
cp .env.example .env   # APIのURLを書く（⚠️ APIキーはここに書かない）
npx expo start         # QRコードをスマホの Expo Go で読む
```

**APIキーはアプリの設定画面から入れる**（`expo-secure-store` に保管）。
→ **手順の詳細は [App/README.md](App/README.md)**（キーの取得方法・つまずいたとき）。

| やりたいこと | 見るところ |
|---|---|
| アプリを動かす | [App/README.md](App/README.md) |
| バックエンドをデプロイ / APIキーを取り出す | [Backend/README.md](Backend/README.md) |
| 自動デプロイ（push → CodeBuild） | [CICD/README.md](CICD/README.md) |

> 📌 **通常はデプロイを手で叩かなくてよい。** `main` にpushすると
> CodeBuild が Agent → Backend の順に自動デプロイする。

### ドキュメントの使い分け

同じ話題が複数の場所に出てくることがあるが、**役割が違う**。

```mermaid
flowchart LR
    P["pre-research/<br/><b>事実</b><br/>何ができるか"] --> A["adr/<br/><b>判断</b><br/>だからこうする"]
    A --> D["docs/<br/><b>設計</b><br/>いまどうなっているか"]
```

- **`pre-research/`** は検証の記録。「Nova 2 Sonic は日本語に対応していない」のような**事実**。
- **`adr/`** は決定の記録。「だから方式1を採る」という**判断**と、却下した案。
- **`docs/`** は現在の設計。**履歴は書かない**（いまの姿が読み取れなくなるため）。

`learning/` はこの流れとは別軸で、**技術そのものを学ぶためのメモ**。
このリポジトリが学習を兼ねているために置いている。
同じ話題が `docs/` と両方に出てくることもあるが、**書く目的が違う**
（例: 逆ジオコーディングの一般論と、このアプリでの使い方）。

## 技術選定

| レイヤ | 採用 |
|---|---|
| フロント | React Native (Expo) — 既存のJS/TS知識を活かせる |
| ウェイクワード | Picovoice Porcupine（オンデバイス） |
| バックエンド | API Gateway + Lambda (Python)。IaCは SAM |
| AI | Amazon Bedrock AgentCore（会話継続・Web検索） |
| STT / TTS | Amazon Transcribe / Polly |
| 対象OS | Android |
| CI/CD | AWS CodeBuild（pushで Agent → Backend を自動デプロイ） |

詳細と選定理由は [docs/01_architecture.md](docs/01_architecture.md)、
検討の経緯は [pre-research/02_tech_selection.md](pre-research/02_tech_selection.md)。

## 開発の状況

**声で質問し、声で回答が返るところまで実機で動いている**（位置情報・会話継続・Web検索を含む）。

残るは**ハンズフリー起動**（US-2.04）。⚠️ **本プロジェクト唯一の技術的リスク**で、
ここが成立しなければ「走行中に使える」という前提そのものが崩れる。

進捗と残作業は [`.memory/`](.memory/)（開発中の覚え書き）にある。

## 決定の記録（ADR）

**なぜそう決めたか・何を却下したか**を残している。⚠️ **ADRは「その時点の判断」の記録なので、
現在の設計は [docs/](docs/) を見ること。**

| # | 決定 | 日付 |
|---|---|---|
| [005](adr/005_cross_stack_handoff.md) | スタック間の受け渡しをSSMにし、パイプラインは暫定で1本にする | 2026-08-15 |
| [004](adr/004_api_key_auth.md) | APIの保護をIP制限からAPIキーに替える | 2026-08-15 |
| [001](adr/001_async_ask.md) | 回答の受け取りを非同期にする | 2026-08-13 |
| [002](adr/002_speech_on_device.md) | 音声方式は「手前でSTT」（Nova 2 Sonic は日本語非対応）。⚠️ STTの呼び出し元は 2026-08-16 に改訂 | 2026-08-12 |
| [003](adr/003_agentcore_as_orchestrator.md) | 会話の司令塔を AgentCore にする（Lexは使わない） | 2026-07-30 |

> 番号は**採番順**で、日付順ではない。過去の決定も必要になった時点で書き起こす。
