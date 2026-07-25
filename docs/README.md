# docs/ — 設計ドキュメント

このディレクトリは、**ツーリングAI会話アプリ固有の設計**を記録する場所。

## 方針

- 本アプリ固有の設計（アーキテクチャ・各機能の設計・データフロー・状態遷移など）を扱う。
  一般的な基礎知識は [`learning/`](../learning/) へ。
- **初心者でもわかるように書く。** 設計判断の「結論」だけでなく「なぜそうするのか」を添え、
  前提となる知識が必要な場合は [`learning/`](../learning/) の該当メモへリンクする。
- 図はMermaidを推奨する。

## 前提ドキュメント

設計の出発点となる事前検討は [`pre-research/`](../pre-research/) にある。

- [プロジェクト方針](../pre-research/00_project_policy.md)
- [構想概要](../pre-research/01_overview.md)
- [技術選定](../pre-research/02_tech_selection.md)

## 想定ドキュメント（随時追加）

- [x] 全体アーキテクチャ（アプリ → API Gateway → Lambda → Bedrock / Transcribe / Polly）
- [x] API仕様（OpenAPI）— フロント↔バックの契約（`02_api_openapi.yaml`）
- [ ] 音声処理パイプラインの設計（ウェイクワード検知 → 録音 → STT → 応答生成 → TTS → 再生）
- [ ] 位置・進行方位の算出設計（GPS 2点間から方位を求める）
- [ ] バックグラウンド常駐の設計（Foreground Service）
- [ ] AWS側の構成（Lambda / API Gateway / IAM / Bedrock 呼び出し）

## 索引

- [01. 全体アーキテクチャ（責務分担とデータフロー）](./01_architecture.md)
- [02. API仕様（OpenAPI）— フロント↔バックの契約](./02_api_openapi.yaml)
