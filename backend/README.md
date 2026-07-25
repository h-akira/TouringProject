# backend/ — AWS バックエンド（SAM）

ツーリングAI会話アプリのサーバー側。**AWS SAM** で管理する。
設計の全体像は [docs/01_architecture.md](../docs/01_architecture.md) を参照。

## 現在のステージ：モック（配管確認）

まず **アプリ↔バックエンドの連携が通ること**だけを確認するための最小構成。
Bedrock/Transcribe/Polly はまだ呼ばず、`POST /ask` は**固定のJSON応答**を返す。

```
backend/
  template.yaml            SAM定義（API Gateway + Lambda）
  samconfig.toml           デプロイ設定（スタック名・リージョン・パラメータ）
  src/
    handlers/
      ask.py               /ask のハンドラ（固定応答を返すモック）
  events/
    ask-post.json          sam local invoke 用のテストイベント
```

> API仕様（OpenAPI）は**フロント↔バックの契約**なので `docs/02_api_openapi.yaml` に置いている。
> 現時点では契約・ドキュメント・型生成の源として持ち、API Gateway の `DefinitionBody` には
> 組み込んでいない（仕様が固まったらリクエスト検証用に昇格可能）。

## 前提ツール

- AWS SAM CLI / AWS CLI（導入済み）
- Python 3.13（Lambdaランタイムと合わせる）
- Docker（`sam local` でのローカル実行に使う）

## ローカルで動かす（デプロイ不要で試す）

```sh
cd backend

# 1. ビルド
sam build

# 2. ローカルにAPIを立てる（デフォルト http://127.0.0.1:3000）
sam local start-api

# 3. 別ターミナルから叩いてみる
curl -X POST http://127.0.0.1:3000/ask \
  -H "Content-Type: application/json" \
  -d '{"start": {"latitude": 35.0, "longitude": 139.0}, "end": {"latitude": 35.001, "longitude": 139.001}}'
```

固定のJSON（`"mock backend is alive"` を含む）が返れば配管OK。

> 実機スマホから Mac のローカルAPIに繋ぐ場合は、GPSのときと同様にネットワーク到達性
> （同一Wi-Fi・ファイアウォール）に注意。必要なら一旦AWSにデプロイして試す。

## AWS にデプロイする（実機から試すとき）

デプロイ設定は `samconfig.toml` に記述済み（スタック名・リージョン・パラメータ）。
そのため対話なしでデプロイできる:

```sh
cd backend
sam build
sam deploy          # samconfig.toml の設定で流れる（--guided 不要）
```

デプロイ後、出力される `ApiBaseUrl` に `/ask` を付けたURLがエンドポイント。

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

## 今後のステージ（このモックに足していく）

設計（[docs/01](../docs/01_architecture.md)）に沿って段階的に実装:

1. **APIキー認証 + Usage Plan**（流量制限）
2. **入力量の上限**（音声秒数・文字数・max_tokens の検証）
3. **STT**: 受け取った音声を Amazon Transcribe でテキスト化
4. **LLM**: 現在地・方位を文脈に Amazon Bedrock で回答生成（実装時は `claude-api` スキル参照）
5. **TTS**: 回答を Amazon Polly で音声化して返す
6. **コスト暴走対策**: AWS Budgets → 予算超過で自動遮断
