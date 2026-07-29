# AgentCore セットアップ手順（再現用）

> ゼロから同じ状態を作り直すための手順。**なぜそうするか**は [README.md](README.md) を参照。
> ここは「何を叩いたか」を残すことに徹する。

## 0. 前提ツール

| ツール | 用途 | 確認 |
|---|---|---|
| Node.js 20+ | AgentCore CLI / CDK | `node --version` |
| Python 3.10+ | エージェント本体 | `python3 --version` |
| uv | Python依存管理（CLIが使う） | `uv --version` |
| AWS CLI | 認証・確認 | `aws --version` |

**アーキテクチャは arm64 が望ましい**（AgentCore Runtime が arm64 のため。Apple Silicon なら該当）。

```sh
npm install -g @aws/agentcore     # AgentCore CLI（v0.24.2 で検証）
agentcore --version
```

> ⚠️ CDK CLI は `cdk` グローバルではなく、生成プロジェクトの `node_modules/.bin/cdk` を使う。
> `npx cdk` は環境によって解決に失敗した（実測）。直接パス指定が確実。

## 1. AWS 側の事前条件

### 1.1 Bedrock のモデルアクセス

[../bedrock/](../bedrock/) の手順で **Anthropicユースケース申請**を済ませ、
`jp.anthropic.claude-sonnet-4-6` が呼べる状態にしておく。

```sh
./../bedrock/check_models.sh      # OK が出ることを確認
```

### 1.2 SCP がBedrockを拒否していないこと

コストガード（[../account-cost-guard/](../account-cost-guard/)）のキルスイッチが作動していると、
`AccessDeniedException ... explicit deny in a service control policy` になる。

```sh
./../account-cost-guard/check_guard.sh   # キルスイッチが作動中でないか確認
```

## 2. CDK bootstrap（qualifier 分離）

**デフォルトの `cdk bootstrap` は使わない。** qualifier が `hnb659fds` 固定になり、
CloudFormation実行ロールに **AdministratorAccess** が付くため。

### 2.1 デフォルト bootstrap が残っていたら消す

`agentcore deploy` はデフォルト名 `CDKToolkit` の存在を確認しに行くので、
中途半端に残っていると衝突する（README §9.3）。

```sh
ACCT=$(aws sts get-caller-identity --query Account --output text)

# スタックを削除
aws cloudformation delete-stack --region ap-northeast-1 --stack-name CDKToolkit
aws cloudformation wait stack-delete-complete --region ap-northeast-1 --stack-name CDKToolkit

# ⚠️ S3バケットは Retain 属性で残るので明示的に消す
aws s3api delete-bucket --region ap-northeast-1 \
  --bucket "cdk-hnb659fds-assets-${ACCT}-ap-northeast-1"
```

> バケットに中身があると削除できない。`aws s3 rm s3://<bucket> --recursive` で空にしてから。

### 2.2 qualifier 付きで bootstrap

```sh
cd touringAgent/agentcore/cdk

./node_modules/.bin/cdk bootstrap \
  --toolkit-stack-name CDKToolkit-trg-dev \
  --qualifier trg-dev \
  --cloudformation-execution-policies "arn:aws:iam::aws:policy/PowerUserAccess,arn:aws:iam::aws:policy/IAMFullAccess" \
  aws://${ACCT}/ap-northeast-1
```

確認:

```sh
# Admin が付いていないこと
aws iam list-attached-role-policies \
  --role-name "cdk-trg-dev-cfn-exec-role-${ACCT}-ap-northeast-1" \
  --query 'AttachedPolicies[].PolicyName' --output text
# → IAMFullAccess  PowerUserAccess
```

## 3. プロジェクト生成（初回のみ）

既に `touringAgent/` があるなら不要。ゼロから作り直す場合の記録:

```sh
agentcore create \
  --project-name touringAgent \
  --name agentcore_trg_dev_ask \
  --build CodeZip \
  --language Python \
  --framework Strands \
  --model-provider Bedrock \
  --memory none
```

| オプション | 値 | 理由 |
|---|---|---|
| `--build` | `CodeZip` | Docker不要。更新が速くパッチはAWS任せ（README §2） |
| `--framework` | `Strands` | AWS製でBedrockと相性がよい。CLIの既定 |
| `--memory` | `none` | セッション内の継続がまず検証対象。永続記憶は後で判断 |

> ⚠️ **リソース名にハイフンは使えない**（`agentcore_trg_dev_ask` のようにアンダースコア）。
> `agentcore-trg-dev-ask` は弾かれる。プロジェクトの命名規約とはここだけズレる。

## 4. スキャフォールドへの修正（重要）

**CLIが生成したままでは本プロジェクトでは動かない/検証にならない。** 3点を修正した。

### 4.1 モデルID — 生成値はこのアカウントで使えない

`app/agentcore_trg_dev_ask/model/load.py` の `load_model()`

```diff
-return BedrockModel(model_id="global.anthropic.claude-sonnet-4-5-20250929-v1:0")
+return BedrockModel(
+    model_id=os.environ.get("BEDROCK_MODEL_ID", "jp.anthropic.claude-sonnet-4-6"),
+    region_name=os.environ.get("BEDROCK_REGION", "ap-northeast-1"),
+    max_tokens=int(os.environ.get("BEDROCK_MAX_TOKENS", 300)),
+)
```

- `global.` プレフィックスは**このアカウントで AccessDenied**（[../bedrock/](../bedrock/) 参照）
- `jp.` は日本国内で推論される
- 環境変数で差し替え可能にした（Claude 5 系が使えるようになったら切り替えるため）

### 4.2 会話履歴 — 生成値では継続しない

`app/agentcore_trg_dev_ask/main.py`

```diff
-conversation_manager=NullConversationManager()
+conversation_manager=SlidingWindowConversationManager(window_size=20)
```

**`NullConversationManager` は履歴を一切保持しない。** これでは会話継続の検証が成立しない。
window_size は「毎回Bedrockに再送するターン数」＝入力トークンコストに直結する。

### 4.3 外部MCPサーバーの削除

スキャフォールドには **`https://mcp.exa.ai/mcp`** が既定で組み込まれ、`add_numbers` デモツールも入る。

- 外部依存は検証のノイズになるため削除（`mcp_client/` の呼び出しと `pyproject.toml` の `mcp` 依存）
- ツール利用は後段の課題

## 5. ローカル実行

```sh
cd touringAgent/app/agentcore_trg_dev_ask
uv sync                                   # 依存を同期

# 認証情報を環境変数に展開（AWS_PROFILE だけでは子プロセスに渡らないことがある）
eval "$(aws configure export-credentials --profile touring --format env)"
AWS_DEFAULT_REGION=ap-northeast-1 .venv/bin/python main.py
```

> ⚠️ `agentcore dev` は**対話型TUI**なので、スクリプトやバックグラウンド実行には向かない
> （`expo start` と同じ制約）。Python直接起動が確実。

別ターミナルから:

```sh
curl http://localhost:8080/ping
# → {"status":"Healthy","time_of_last_update":...}

../../pre-research/agentcore/try_session.sh    # 会話継続の検証
```

## 6. デプロイ

```sh
cd touringAgent
eval "$(aws configure export-credentials --profile touring --format env)"
export AWS_DEFAULT_REGION=ap-northeast-1

agentcore deploy --dry-run -y     # まず確認
agentcore deploy -y               # 実行
```

> ⚠️ **数分かかる。CLIがタイムアウトしてもCloudFormation側は進行し続ける。**
> 失敗と誤認しないこと:
> ```sh
> aws cloudformation wait stack-create-complete \
>   --region ap-northeast-1 --stack-name AgentCore-touringAgent-default
> ```

確認:

```sh
aws bedrock-agentcore-control list-agent-runtimes --region ap-northeast-1 \
  --query 'agentRuntimes[].{name:agentRuntimeName,status:status}' --output text
# → touringAgent_agentcore_trg_dev_ask  READY
```

デプロイ済みRuntimeでの検証:

```sh
./pre-research/agentcore/try_deployed.sh
```

## 7. 後片付け（課金を止める）

**AgentCore はアイドル中も課金対象**（README §6）。使わないなら消す。

```sh
# セッションだけ止める
aws bedrock-agentcore stop-runtime-session --region ap-northeast-1 \
  --agent-runtime-arn <ARN> --runtime-session-id <SESSION_ID>

# Runtime ごと消す（CloudFormationスタックを削除）
aws cloudformation delete-stack --region ap-northeast-1 \
  --stack-name AgentCore-touringAgent-default
```

## 8. トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| `AccessDeniedException ... explicit deny in a service control policy` | コストガードのSCPが作動 | [../account-cost-guard/](../account-cost-guard/) でデタッチ |
| `ResourceNotFoundException: use case details have not been submitted` | Anthropicユースケース未申請 | [../bedrock/](../bedrock/) §1 |
| `UnrecognizedClientException` | 認証情報が子プロセスに渡っていない | `eval "$(aws configure export-credentials ...)"` |
| `The resources [StagingBucket] already exist` | デフォルトbootstrapの残骸 | §2.1 でバケットまで削除 |
| `agentcore invoke` が `No deployed targets found` | deploy中断で `.cli/deployed-state.json` が未更新 | boto3で直接呼ぶ（`try_deployed.sh`） |
| セッションIDで `ValidationException` | **33文字未満** | IDを33文字以上にする |
| `npx cdk` が無反応 | 解決に失敗 | `./node_modules/.bin/cdk` を直接指定 |
