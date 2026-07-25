# CLAUDE.md

このファイルは、新しいセッションでプロジェクトの文脈を素早く復元するためのもの。
（全プロジェクト共通の規約は `~/.claude/CLAUDE.md` に定義済み。ここでは重複させず、本プロジェクト固有の事項のみ記載する。）

## プロジェクト概要

バイクでのツーリング中に、**現在地・進行方向の文脈に基づいてAIと音声で対話できるアプリ**。
走行中は手が使えないため、イヤモニ経由の音声入出力＋ハンズフリー起動が前提。
例:「右手に見える山は何？」「この地域の特色は？」

**このリポジトリは学習教材も兼ねる。** 開発者はWeb開発（AWS/Vue/Lambda/JS）に精通するがモバイルは未経験。
「開発を進めながら学習する」方針で、判断の過程・つまずき・設計理由をドキュメントに残していく。

## 確定した技術選定

| レイヤ | 採用 | 理由（詳細は pre-research/02、docs/01） |
|---|---|---|
| フロント | **React Native (Expo)** | 既存のWeb開発知識(JS/TS)を最も活かせる。Web(PWA)は却下 |
| ウェイクワード | Picovoice Porcupine | オンデバイス・個人利用は無料枠(月間3ユーザー)内 |
| バックエンド | **API Gateway + Lambda(Python)** | Lambdaが司令塔。IaCは **SAM単体**（CDK併用しない） |
| STT / LLM / TTS | Transcribe / Bedrock / Polly | **Lexは使わない**（LLM自身が意図理解するので不要） |
| 認証 | **APIキー方式** | アプリ画面から入力→端末に安全保管（ハードコード禁止）。将来Cognito移行余地 |
| 対象OS | Android（当面は自分の端末のみ） | iOS対応は当面スコープ外 |

- **Web却下の理由**: ナビアプリを前面に出すためバックグラウンド常駐が必須、かつ物理ボタンも押せないため完全ハンズフリーのウェイクワード常時待機が必須。これはモバイルブラウザでは不可能。
- **唯一残る技術的リスク**: RNでのバックグラウンド常駐＋ウェイクワードの安定性。PoCで検証し、破綻したらKotlinネイティブへ再検討。
- **悪用/コスト暴走対策は多層**: 流量制限＋入力量上限（音声秒数/文字数/max_tokens）＋予算超過で自動遮断。詳細は docs/01 §7。

## 実装の重心（重要な方針）

- **AWS側（Lambda/Bedrock等）は作り込んでよい** — 得意領域かつアプリの価値の中核。
- **モバイル（RN側）は必要最低限** — "薄いクライアント"に徹する。UIは動作確認に足る最小限、凝った作り込みはしない。
- 迷ったら「その作り込みはコア体験（走りながら音声で会話）に必要か？」を基準にする。

## ディレクトリ構成

| ディレクトリ | 役割 | 書き方 |
|---|---|---|
| `pre-research/` | 事前検討（構想・技術選定・方針）。判断の経緯・却下案も残す | — |
| `learning/` | 基礎的な学習メモ（RN/JS/Android等の汎用知識） | 基礎を丁寧に・既存Web知識との対応づけ |
| `docs/` | 本アプリ固有の設計ドキュメント（01=全体アーキテクチャ、02=API仕様OpenAPI） | **初心者でもわかるように書く** |
| `app/` | React Native (Expo) アプリ本体（**SDK 54**, TypeScript, expo-router）。`src/api/`=OpenAPIから生成した型 | `app/CLAUDE.md` はExpo自動生成 |
| `backend/` | AWSバックエンド（SAM, Python 3.13）。現在はモック（`POST /ask` 固定応答、`GET /health`） | `backend/README.md` に手順・命名規約 |

- `learning/` と `docs/` の使い分け: 「他のRNプロジェクトでも通用する話」→ `learning/`、「このアプリ特有の話」→ `docs/`。
- **非公開ファイル**: `pre-research/XX_*.md`（キャリア観点など個人的メモ）は `.gitignore` で除外。公開対象ではない。

## 開発環境（Mac + 実機Android + Expo Go）

- 必要ツール: Node.js/npm、Homebrew、watchman。動作確認は **実機Android + Expo Go**（`cd app && npx expo start` → QRを読む）。この段階ではAndroid Studio不要。
- **ウェイクワード/バックグラウンド常駐の段階で Expo Development Build に移行**し、そこで初めて Android SDK 等に踏み込む（フレームワーク横断の宿命）。
- `expo start` は対話型TUIなので、AIがバックグラウンド実行するのは不向き。ユーザー自身のターミナルで起動してもらう。
- セットアップ手順の詳細は [learning/03](learning/03_dev_environment_setup.md)。

## AWS / バックエンド開発

- ツール導入済み: AWS SAM CLI / AWS CLI。ローカル: Python 3.13、Docker（`sam local` に必要）。
- デフォルトリージョン: `ap-northeast-1`（東京）。※Bedrockはリージョンでモデル可用性が異なるため、Bedrock実装時に要確認。
- **リソース命名規約**: `<リソースタイプ>-trg-<env>-<識別子>`
  - `trg`=touring、`env`=`dev`/`prod`（SAMの `Environment` パラメータ）
  - 識別子: 単一/メインは `main`、複数あり得るものは用途名
  - 例: スタック `stack-trg-dev-main` / Lambda `lambda-trg-dev-ask` / API Gateway `apigw-trg-dev-main`
- ローカル実行: `cd backend && sam build && sam local invoke AskFunction --event events/ask-post.json`（権限不要）。
- デプロイ: `sam deploy`（`samconfig.toml` に設定済み）。ただし**デプロイ用IAM権限の整備が必要**（S3/CloudFormation等）。デプロイはユーザーが実行。
- **AWS認証情報・アカウントID等は絶対にリポジトリに含めない**（samconfig.tomlにも秘密は書かない）。

## API契約（OpenAPI）と型生成

- **API仕様は `docs/02_api_openapi.yaml`（OpenAPI 3.0）が正本** — フロント↔バックの契約。現状 `POST /ask`（モック）と `GET /health`。
- API Gatewayの `DefinitionBody` には未組込（契約・型生成・ドキュメント用途。仕様が固まったら検証用に昇格可能）。
- **型生成**: `cd app && npm run gen:api` で `docs/02` → `app/src/api/schema.ts` を再生成。`src/api/types.ts` にエイリアス（`AskRequest`等）。
- **契約を変えたら型を再生成** し、アプリの `fetch` が型で追従する（生成物 `schema.ts` もコミット対象）。

## 現在の進捗

- [x] 構想整理・技術選定・プロジェクト方針の策定（pre-research/）
- [x] learning/ 整備（RN入門・Expo・環境構築・Node.jsツールチェーン・状態管理・位置情報）
- [x] Expoプロジェクト作成（app/）。**SDK 57は最新すぎてExpo Go非対応のためSDK 54にダウングレード済み**
- [x] 実機（Android + Expo Go）で動作確認済み。編集→即反映のループ確立
- [x] **MVP機能1: 現在地取得（GPS）が実機で動作**（expo-location、`app/src/app/index.tsx`）
- [x] docs/01 全体アーキテクチャ設計を作成（責務分担・音声フロー・認証・多層コスト対策・SAM）
- [x] **backend/ にSAMモック作成**（`POST /ask` が固定応答）。AWSへデプロイ済み（ap-northeast-1）
- [x] **アプリ↔バックエンド連携が実機で成立**（RN→公開API→応答表示。URLは `app/.env` の `EXPO_PUBLIC_API_BASE_URL`）
- [x] API契約をOpenAPIで定義（`docs/02`）＋ `GET /health` 追加 ＋ openapi-typescriptで型生成（`app/src/api/`）
- [ ] MVP機能2: 連続取得（watchPositionAsync）→ 2点間から進行方位を算出
- [ ] backendに実処理を実装（APIキー認証→STT→Bedrock→Polly、段階的）← 次の本命
- [ ] PoC: バックグラウンド常駐＋ウェイクワードの実機検証（最優先リスク）

## 補足

- Bedrock/Lambda等のClaude API実装を書く際は `claude-api` スキルを参照する（モデルIDやSDK仕様は記憶に頼らず確認する）。
