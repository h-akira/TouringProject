# backend/ — AWS バックエンド（SAM）

ツーリングAI会話アプリのサーバー側。**AWS SAM** で管理する。
設計の全体像は [docs/01_architecture.md](../docs/01_architecture.md) を参照。

## 現在のステージ：AgentCore への中継（US-1.01・1.03）

`POST /ask` は**質問と現在地を受け取り、AgentCore のエージェントに中継する**。
回答の生成・会話の記憶・Web検索は**エージェント側の仕事**で、このLambdaは
**入口の門番**（検証して渡す）に徹する（[pre-research/agentcore/AUTH.md](../pre-research/agentcore/AUTH.md)）。

```
backend/
  template.yaml            SAM定義（API Gateway + Lambda + IAM権限）
  samconfig.toml           デプロイ設定（スタック名・リージョン・パラメータ）
  src/
    handlers/
      ask.py               /ask のハンドラ（AgentCoreへ中継）
      geocode.py           座標→住所（Amazon Location Service）
  tests/
    test_ask.py            ハンドラのテスト（AgentCore呼び出しはスタブ）
    test_geocode.py        逆ジオコーディングのテスト
  events/
    ask-post.json          sam local invoke 用（新規会話）
    ask-post-session.json  同（sessionId 付き＝会話の継続）
```

> ⚠️ **リージョンが分かれている。** このスタックは `ap-northeast-1`（東京）だが、
> 呼び出す AgentCore Runtime は **`us-east-1`**（Web検索コネクタがそこ限定のため）。
> Lambdaは `AGENT_REGION` で明示的に us-east-1 を指す。

### 音声はまだ入っていない

音声の方式は**「手前でSTT」に決定済み**（[pre-research/voice/](../pre-research/voice/)）。
アプリでTranscribeを通し、**テキストで**このAPIに送る形になる。
Nova 2 Sonic（音声→音声）は日本語非対応のため採用しなかった。

### テスト

```sh
cd backend
python3 -m pytest tests/ -q
```

> API仕様（OpenAPI）は**フロント↔バックの契約**なので `docs/02_api_openapi.yaml` に置いている。
> 現時点では契約・ドキュメント・型生成の源として持ち、API Gateway の `DefinitionBody` には
> 組み込んでいない（仕様が固まったらリクエスト検証用に昇格可能）。

## 前提ツール

- AWS SAM CLI / AWS CLI（導入済み）
- Python 3.13（Lambdaランタイムと合わせる）
- Docker（`sam local` でのローカル実行に使う）

## ローカルで動かす（デプロイ不要で試す）

⚠️ **今のステージでは AgentCore を実際に呼ぶので、AWSの認証情報が必要**
（モックだった頃と違い、権限なしでは動かない）。

```sh
cd backend
sam build

# AgentCore Runtime の ARN を取得（実値はコミットしないこと）
export AGENT_ARN=$(AWS_PROFILE=touring aws bedrock-agentcore-control \
  list-agent-runtimes --region us-east-1 \
  --query 'agentRuntimes[0].agentRuntimeArn' --output text)

# 1件だけ実行してみる
AWS_PROFILE=touring sam local invoke AskFunction \
  --event events/ask-post.json \
  --parameter-overrides "AgentRuntimeArn=$AGENT_ARN"
```

`answer` と `sessionId` を含むJSONが返れば成功。
**同じ `sessionId` を送れば会話が続く**（`events/ask-post-session.json` を参照）。

> 📌 **初回は10秒前後かかる。** AgentCore のコンテナ起動（コールドスタート）のため。
> 2回目以降は2〜3秒（実測値は [pre-research/voice/](../pre-research/voice/) §6）。
> このため Lambda の `Timeout` は 60秒にしている（既定の10秒では初回が必ず失敗する）。

> 実機スマホから Mac のローカルAPIに繋ぐ場合は、GPSのときと同様にネットワーク到達性
> （同一Wi-Fi・ファイアウォール）に注意。必要なら一旦AWSにデプロイして試す。

## AWS にデプロイする（実機から試すとき）

デプロイ設定は `samconfig.toml` に記述済み（スタック名・リージョン・パラメータ）。
そのため対話なしでデプロイできる:

⚠️ **`AgentRuntimeArn` はコマンドラインで渡す。**
ARNには**AWSアカウントIDが含まれる**ため、`samconfig.toml` には書かない（公開リポジトリの鉄則）。

```sh
cd backend
sam build

export AGENT_ARN=$(AWS_PROFILE=touring aws bedrock-agentcore-control \
  list-agent-runtimes --region us-east-1 \
  --query 'agentRuntimes[0].agentRuntimeArn' --output text)

sam deploy --parameter-overrides "Environment=dev" "AgentRuntimeArn=$AGENT_ARN"
```

デプロイ後、出力される `ApiBaseUrl` に `/ask` を付けたURLがエンドポイント。

### 必要なIAM権限（Lambda実行ロール）

`template.yaml` の `Policies` で以下を付与済み。**無いと `AccessDenied` になる。**

| 権限 | 用途 |
|---|---|
| `bedrock-agentcore:InvokeAgentRuntime` | エージェントの呼び出し |
| `geo-places:ReverseGeocode` | 座標→住所（`handlers/geocode.py`） |

- AgentCore側の対象はRuntimeのARNと、その配下（`/runtime-endpoint/*`）の**両方**。
  実際に呼ばれるのは後者なので、片方だけでは足りない。
- `geo-places` はリソース単位のARNを持たないので `Resource: "*"`（アクション側で絞る）。

### なぜ座標→住所をLambdaでやるのか

**LLMは緯度経度から場所を正しく言い当てられない**（実機で約40km離れた市を答えた）。
そのため住所はLambdaで確定させ、事実としてエージェントに渡している。
詳細と検証結果は [pre-research/geocoding/](../pre-research/geocoding/)。

### 命名規約

リソースは `<リソースタイプ>-trg-<env>-<識別子>` で命名する。
- `trg` = touring、`env` = `dev`/`prod`（`Environment` パラメータ）
- 識別子: 単一/メインは `main`、複数あり得るものは用途名
- 例: スタック `stack-trg-dev-main` / Lambda `lambda-trg-dev-ask` / API Gateway `apigw-trg-dev-main`

### デプロイに必要な権限（初回の注意）

`sam deploy` は、コードを置くS3バケットへの書き込みや CloudFormation 実行の権限を要する。
権限不足だと `AccessDenied ... s3:PutObject` 等が出る。デプロイに使うIAMユーザー/ロールに、
CloudFormation・S3（SAM管理バケット）・Lambda・API Gateway・IAM の必要な権限を付与しておくこと。
（ローカル実行 `sam local` はこれらの権限を必要としない。）

## 今後このLambdaに足すもの

**次にやることは `.planning/todo.md` を見ること。** ここには「このLambdaの担当範囲」だけ挙げる。

- **進行方位**（US-2.03）: 2点から方位を算出して文脈に加える。算出をアプリ側でやるかは未決
- **APIキー認証 + Usage Plan**（流量制限）
- **入力量の上限**（文字数の検証。現在は `question` の500文字上限のみ）
- **コスト暴走対策**: AWS Budgets → 予算超過で自動遮断

> ⚠️ **STT/TTS はこのLambdaには入らない。** 音声は**アプリ側で**Transcribe/Pollyを呼ぶ方式に決定
> （[pre-research/voice/](../pre-research/voice/)）。このAPIはテキストを受け取る。
> **LLMの呼び出しもここではない**（AgentCoreの担当）。
