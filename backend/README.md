# backend/ — AWS バックエンド（SAM）

ツーリングAI会話アプリのサーバー側。**AWS SAM** で管理する。
設計の全体像は [docs/01_architecture.md](../docs/01_architecture.md) を参照。

## 現在のステージ：非同期での中継（US-1.01・1.03・2.03）

`POST /ask` は**質問と現在地を受け取り、キューに積んで即座に返す**。
回答の生成・会話の記憶・Web検索は**エージェント側の仕事**で、このLambdaは
**入口の門番**（検証して渡す）に徹する（[pre-research/agentcore/AUTH.md](../pre-research/agentcore/AUTH.md)）。

⚠️ **回答は `POST /ask` では返らない。** API Gateway の29秒上限に対し
エージェントが最悪25.5秒かかるため、**待たない形に変えた**（[docs/01a](../docs/01a_async_ask.md)）。
アプリは `GET /ask/{requestId}` を叩いて回答を取りに来る。

> ⚠️ **アプリで 403 が出たら、原因は2つある。**
> ① **IP制限**（開発中は自分のIPのみ許可。回線が変われば弾かれる。下記 `AllowedIp`）
> ② **デプロイ漏れ**（API Gateway は**未定義のパスに 404 ではなく 403 を返す**ため、
> エンドポイントを追加してデプロイしていないと認証エラーのように見える）

```
backend/
  template.yaml            SAM定義（API Gateway + Lambda + SQS + DynamoDB + IAM）
  samconfig.toml           デプロイ設定（スタック名・リージョン・パラメータ）
  src/
    handlers/
      ask.py               POST /ask（住所・方位を確定してキューに積む）
      worker.py            SQS経由で起動し、AgentCoreを呼んで結果を保存
      result.py            GET /ask/{requestId}（アプリがポーリングする先）
      geocode.py           座標→住所（Amazon Location Service）
    lib/
      agent.py             AgentCore の呼び出しとSSEの組み立て
      store.py             DynamoDB アクセス（⚠️ 二重処理を防ぐ条件付き書き込み）
      geo.py               2点間の方位・距離
  tests/                   ハンドラ・ライブラリのテスト（AWS呼び出しはスタブ）
  events/
    ask-post.json          sam local invoke 用（新規会話）
    ask-post-session.json  同（sessionId 付き＝会話の継続）
```

> ⚠️ **SQSは「少なくとも1回」配信。** 同じ質問が2回届くと**AgentCoreを2回呼んで二重課金**になる。
> `store.claim()` の条件付き書き込みで2つ目を弾いている（[docs/03](../docs/03_dynamodb_table.md) §4）。
> **worker の Timeout(120秒) < 可視性タイムアウト(180秒)** の関係も崩さないこと。

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

`requestId` と `sessionId` を含むJSONが**すぐに**返れば成功（`statusCode` は **202**）。
**同じ `sessionId` を送れば会話が続く**（`events/ask-post-session.json` を参照）。

⚠️ **回答はここでは返らない。** `AskFunction` はキューに積むだけなので、
ローカルで回答まで確かめるには SQS と DynamoDB が要る。**実際の確認はデプロイ後に行う**。

> 📌 **初回は10秒前後かかる。** AgentCore のコンテナ起動（コールドスタート）のため。
> 2回目以降は2〜3秒（実測値は [pre-research/voice/](../pre-research/voice/) §6）。
> この待ち時間は `WorkerFunction`（`Timeout` 120秒）が引き受ける。
> **アプリから見た待ち時間は変わらない**（タイムアウトしなくなるだけ）。

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

sam deploy --parameter-overrides "Environment=dev" "AgentRuntimeArn=$AGENT_ARN" \
  "AllowedIp=<自分のグローバルIP>/32"
```

デプロイ後、出力される `ApiBaseUrl` に `/ask` を付けたURLがエンドポイント。

### ⚠️ `AllowedIp`（開発中のIP制限）

**このAPIにはまだ認証が無い。** URLを知られれば誰でも叩けて、
**1リクエストごとにBedrockの課金が発生する**。
そこで開発中は**リソースポリシーで自分のIPだけに絞っている**。

| 渡す値 | 挙動 |
|---|---|
| `AllowedIp=203.0.113.5/32` | そのIP以外は **403** |
| `AllowedIp=`（空） | **制限なし**（誰でも叩ける） |

- ⚠️ **本番では空にする。** 走行中のスマホは回線を跨いでIPが変わるため、
  固定すると動かなくなる。本番はAPIキーで守る想定（[docs/01](../docs/01_architecture.md) §8。**未実装**）。
- ⚠️ **IPは勝手に変わる。** 一般的な回線のグローバルIPは動的で、
  ルーター再起動や回線側の都合で**何もしなくても変わる**（実際に変わった）。
  **403が出たらまずこれを疑う。**
- 自分のIPは `curl -s https://checkip.amazonaws.com` で分かる。

**403が出たときの切り分け:**

```sh
# ① いまの自分のIPを見る
curl -s https://checkip.amazonaws.com

# ② APIに直接叩いて確認する（<api-id> は自分のもの）
curl -s -o /dev/null -w "%{http_code}\n" \
  https://<api-id>.execute-api.ap-northeast-1.amazonaws.com/Prod/health
```

- **200 が返る** → IP制限は通っている。403の原因は別（デプロイ漏れ等）
- **403 が返る** → ①のIPと `deploy-sam.sh` の `ALLOWED_IP` が食い違っている。
  直して再デプロイする

⚠️ **スマホとMacでIPが違うことがある。** スマホがモバイル回線（4G/5G）だと
Wi-Fi経由のMacとは別のIPになり、**Macから通ってもアプリからは弾かれる**。
実機で試すときはスマホを**同じWi-Fiに繋ぐ**こと。

> 📌 **毎回打つのは面倒なので、リポジトリ直下に `deploy-sam.sh` を作って使っている。**
> **IPとアカウントIDを含むので `.gitignore` 済み**（この手順を元に各自で作る）。
> 中身は上記コマンドに `AllowedIp` を足しただけのもの。

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

**次にやることは `.memory/todo.md` を見ること。** ここには「このLambdaの担当範囲」だけ挙げる。

- **APIキー認証 + Usage Plan**（流量制限）
- **入力量の上限**（文字数の検証。現在は `question` の500文字上限のみ）
- **コスト暴走対策**: AWS Budgets → 予算超過で自動遮断

> ⚠️ **STT/TTS はこのLambdaには入らない。** 音声は**アプリ側で**Transcribe/Pollyを呼ぶ方式に決定
> （[pre-research/voice/](../pre-research/voice/)）。このAPIはテキストを受け取る。
> **LLMの呼び出しもここではない**（AgentCoreの担当）。
