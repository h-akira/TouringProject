# adr/ — 決定の記録（プロジェクト全体）

なぜそう決めたか、何を却下したか。現在の設計は [docs/](../docs/README.md)。
ユニットに固有の決定は各ユニットの `adr/`（[App](https://github.com/h-akira/TouringProject_App/blob/main/adr/README.md)・CICD（非公開））。

| # | 決定 | 日付 | ステータス |
|---|---|---|---|
| [001](001_android_react_native.md) | Web(PWA) を却下し、Android ＋ React Native (Expo) で作る | 2026-07-23 | 採用 |
| [002](002_agentcore_as_orchestrator.md) | 会話の司令塔を AgentCore にする（Lex・自前の履歴管理は使わない） | 2026-07-30 | 採用 |
| [003](003_speech_pipeline.md) | 音声は手前で文字にし、STT/TTS は Lambda が呼ぶ | 2026-08-12 | 採用 |
| [004](004_async_ask.md) | 回答を非同期で受け取る（SQS ＋ DynamoDB ＋ ポーリング） | 2026-08-13 | 採用 |
| [005](005_api_key_auth.md) | API の保護を API キー ＋ Usage Plan にする | 2026-08-15 | 採用 |
| [006](006_cross_stack_handoff.md) | Runtime ARN の受け渡しを SSM パラメータにする | 2026-08-15 | 採用 |
| [007](007_repository_split.md) | Agent・Backend・App・CICD を別リポジトリに分け、親から submodule で束ねる | 2026-09-25 | 採用 |
| [008](008_docs_per_unit.md) | ドキュメントをユニットごとに分け、learning・research を submodule にする | 2026-09-26 | 採用 |

## 旧番号との対応（2026-09-27 に振り直した）

| 旧 | 新 |
|---|---|
| 001 回答の受け取りを非同期にする | 004 |
| 002 音声方式は「手前でSTT」 | 003 |
| 003 会話の司令塔を AgentCore にする | 002 |
| 004 API の保護を API キーに替える | 005 |
| 005 Runtime ARN の受け渡しを SSM に | 006 |
| 006 ハンズフリー起動 | App の 001 |
| 007 応答後にマップへ戻す | App の 002 |
| 008 終話の判定 | App の 003 |
| 009 Play の内部テスト | App の 004 |
| 010 インカムのマイク | App の 005 |
| 011 リポジトリの分割 | 007 |
| （CI/CD の判断。旧 `CICD/DECISIONS.md`） | CICD の adr |

## 書き方

```markdown
# NNN. <決定の題>

- **日付**: YYYY-MM-DD（最終更新 YYYY-MM-DD）
- **ステータス**: 採用 / 却下 / 保留 / 置き換え（→ NNN）

## 背景
## 選択肢        ← 却下したものと理由も書く
## 決定          ← いま有効な決定だけ
## 影響
```

規則の本体は `AGENTS.md`（ADR の書き方）。
