# Amazon Bedrock AgentCore 調査

> 実施日: 2026-07-25〜29 / 対象アカウント: AWSプロファイル `touring` / リージョン: ap-northeast-1
> **目的**: 「1問1答で終わらず、続けて質問できる」会話継続を実現する。
> あわせて将来の拡張（WebSearch等のツール利用）に備える。
> **前提**: Bedrockモデル自体の調査は [../bedrock/](../bedrock/) を参照。

## 結論

**AgentCore Runtime を採用。** ✅ **同じ `runtimeSessionId` を渡せば会話は継続する**
（ローカル・デプロイ済みの両方で実証。[FINDINGS.md](FINDINGS.md)）。

| 項目 | 決定 |
|---|---|
| セッション管理 | **AgentCore Runtime** |
| エージェントソース | **S3ソース（.zip）**（Docker不要） |
| モデル | **`us.anthropic.claude-sonnet-4-6`**（⚠️ `jp.` は us-east-1 から使えない） |
| IaC | **CDK**（qualifier `trg-dev`）。⚠️ `Backend/` はSAMのまま |
| 会話の記憶 | **セッション内のみ**（⚠️ **AgentCore Memory は使わない**） |

⚠️ **履歴はプロセス内メモリのみ**で、タイムアウト・再起動で消える。
📌 **要件は「一問一答＋α」なので問題にならない**（[adr/003](../../adr/003_agentcore_as_orchestrator.md)）。

⚠️ **AgentCoreはアイドル中も課金される**（文脈保持のためmicroVMが生存）。

## このディレクトリの構成

| ファイル | 役割 | こんなとき |
|---|---|---|
| **README.md**（本書） | **結論と現状** | いま何が決まっているか知りたい |
| [DESIGN.md](DESIGN.md) | **仕組みと設計判断**（AgentCoreとは何か・なぜそうしたか） | 判断の根拠を知りたい |
| [SETUP.md](SETUP.md) | **どう作るか**（コマンド手順・ハマりどころ） | ゼロから再現したい |
| [FINDINGS.md](FINDINGS.md) | **何が分かったか**（実測ログ・検証設計） | 根拠となる生データを見たい |
| [AUTH.md](AUTH.md) | 認証とLambdaの要否 | 呼び出し経路を知りたい |
| [check_agentcore.sh](check_agentcore.sh) | 環境確認（読み取り専用） | AgentCoreが使えるか調べる |
| [try_session.sh](try_session.sh) | 会話継続の検証（ローカル） | 手元で再現する |
| [try_deployed.sh](try_deployed.sh) | 会話継続の検証（デプロイ済み） | AWS上で再現する |

> 基礎知識（そもそもエージェントとは何か）は
> [learning/51](../../learning/51_ai_agent_and_agentcore.md) にある。
> ここは**本プロジェクト固有の調査記録**に徹する。

## デプロイの現状

Runtime `touringAgent_agentcore_trg_dev_ask` が `READY`。

| 項目 | 値 |
|---|---|
| CDK qualifier | **`trg-dev`**（他CDKと共存させるため分離） |
| toolkitスタック | `CDKToolkit-trg-dev` |
| 実行ポリシー | PowerUser + IAMFullAccess（⚠️ **Adminを避ける**。後で絞る） |

⚠️ **`agentcore deploy` の bootstrapチェックはデフォルト名を見に行く**（ハマりどころ）。
**→ 手順は [SETUP.md](SETUP.md)。**

## 未検証・残っているもの

- [ ] **アイドル課金の実額**（質問間隔を空けた場合のコスト挙動を実測）
- [ ] `idleRuntimeSessionTimeout` を短くした場合の挙動（最小60秒）
- [ ] `StopRuntimeSession` による明示的停止でコストを抑えられるか
- [ ] 最小権限ポリシーへの絞り込み（CloudTrailで実使用権限を確認して絞る）

> 📌 **決着済み**: Lambdaを挟むか（→ **挟む**。[AUTH.md](AUTH.md)）/
> ツール実行（→ **AgentCore Gateway の組み込みコネクタ**。[../websearch/](../websearch/)）
