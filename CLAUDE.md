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
| バックエンド | **API Gateway + Lambda(Python)** | IaCは **SAM**。ただし `touringAgent/`（AgentCore）は **CDK**（CLIの仕様。docs/01 §8） |
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
| `pre-research/` | 事前検討（構想・技術選定・方針）。判断の経緯・却下案も残す。`bedrock/`=モデル調査、`agentcore/`=会話継続の基盤調査（実行可能な検証スクリプト付き） | — |
| `learning/` | 基礎的な学習メモ（汎用知識）。**01〜49=モバイル/フロント、51〜99=バックエンド/AI** | 基礎を丁寧に・既存Web知識との対応づけ |
| `docs/` | 本アプリ固有の設計ドキュメント（**00=要件定義（最上位）**、01=全体アーキテクチャ、02=API仕様OpenAPI） | **初心者でもわかるように書く** |
| `app/` | React Native (Expo) アプリ本体（**SDK 54**, TypeScript, expo-router）。`src/api/`=OpenAPIから生成した型 | `app/CLAUDE.md` はExpo自動生成 |
| `backend/` | AWSバックエンド（SAM, Python 3.13）。現在はモック（`POST /ask` 固定応答、`GET /health`） | `backend/README.md` に手順・命名規約 |
| `touringAgent/` | **AgentCoreエージェント本体**（Strands, CodeZip）。会話継続の中核。`app/<名前>/main.py` が実装、`agentcore/` がCLI設定とCDK | `agentcore` CLIで生成・デプロイ |

- `learning/` と `docs/` の使い分け: 「他のRNプロジェクトでも通用する話」→ `learning/`、「このアプリ特有の話」→ `docs/`。
- **ユーザーストーリーの書き方**（`docs/00`）:
  - 「**〜として、〜したい。〜だから**」の形で**誰の・何を・なぜ**を書く。
  - **IDは `US-<優先度>.<2桁連番>`**（例 `US-1.02`）。優先度は P0=1 / P1=2、**P2は未定なので `X`**（`US-X.01`）。
    **連番を詰め直さない**。振り直すと他ドキュメントからの参照が壊れる。
  - 「複数ユーザー対応」「認証方式の変更」のような**実装側の都合はストーリーではない**（「やらないこと」に書く）。
  - 要件定義書は**現在の姿**を示す。「なぜ追加したか」のような**変更履歴的な記述は残さない**（経緯はコミットメッセージへ）。
  - 本文は要件そのものに絞り、**理由・実装方針・実測データは末尾の「補足A/B…」へ**。
- **非公開ファイル**: `pre-research/XX_*.md`（キャリア観点など個人的メモ）は `.gitignore` で除外。公開対象ではない。

## 開発環境（Mac + 実機Android + Expo Go）

- 必要ツール: Node.js/npm、Homebrew、watchman。動作確認は **実機Android + Expo Go**（`cd app && npx expo start` → QRを読む）。この段階ではAndroid Studio不要。
- **ウェイクワード/バックグラウンド常駐の段階で Expo Development Build に移行**し、そこで初めて Android SDK 等に踏み込む（フレームワーク横断の宿命）。
- `expo start` は対話型TUIなので、AIがバックグラウンド実行するのは不向き。ユーザー自身のターミナルで起動してもらう。
- セットアップ手順の詳細は [learning/03](learning/03_dev_environment_setup.md)。

## AWS / バックエンド開発

- ツール導入済み: AWS SAM CLI / AWS CLI。ローカル: Python 3.13、Docker（`sam local` に必要）。
- リージョンは**用途で分かれている**（混同注意）:
  - `backend/`（SAM） = `ap-northeast-1`（東京）
  - `touringAgent/`（AgentCore） = **`us-east-1`**。Web検索コネクタが us-east-1 でしか提供されないため（`pre-research/websearch/`）
- そのため **AgentCore側のモデルIDは `us.anthropic.claude-sonnet-4-6`**。
  `jp.` は ap-northeast 専用の推論プロファイルで、us-east-1 からは "model identifier is invalid" になる。
- **リソース命名規約**: `<リソースタイプ>-trg-<env>-<識別子>`
  - `trg`=touring、`env`=`dev`/`prod`（SAMの `Environment` パラメータ）
  - 識別子: 単一/メインは `main`、複数あり得るものは用途名
  - 例: スタック `stack-trg-dev-main` / Lambda `lambda-trg-dev-ask` / API Gateway `apigw-trg-dev-main`
- ローカル実行: `cd backend && sam build && sam local invoke AskFunction --event events/ask-post.json`（権限不要）。
- デプロイ: `sam deploy`（`samconfig.toml` に設定済み）。ただし**デプロイ用IAM権限の整備が必要**（S3/CloudFormation等）。デプロイはユーザーが実行。
- **AWS認証情報・アカウントID等は絶対にリポジトリに含めない**（samconfig.tomlにも秘密は書かない）。詳細は下記「公開リポジトリの鉄則」。

## ⚠️ 公開リポジトリの鉄則（最重要）

**このリポジトリは public。** 一度コミット・pushしたものはgit履歴に永久に残り、削除しても復元可能。
**コミット前に必ず確認すること。**

### 書いてはいけないもの

| 種別 | 例 | 代わりに書く |
|---|---|---|
| **AWSアカウントID（12桁）** | `123456789012` | `<ACCOUNT_ID>` |
| **組織ID / Root ID / OU-ID / SCP-ID** | `o-xxxx` `r-xxxx` `ou-xxxx` `p-xxxx` | `<ORG_ID>` 等 |
| **ARN**（アカウントID部分を含む） | `arn:aws:iam::123456789012:role/x` | `arn:aws:iam::<ACCOUNT_ID>:role/x` |
| **アクセスキー/シークレット** | `AKIA...` `ASIA...` | 論外。環境変数へ |
| **APIキー・トークン** | Bedrock/GitHub等のキー | 論外。`.env`（gitignore済）へ |
| **APIの実URL** | `https://abc123xyz0.execute-api...` | `https://<api-id>.execute-api...` |
| **IAMユーザー名・実在ユーザー名** | — | 役割名で表現 |
| **個人のメールアドレス** | — | 書かない |

> AWSアカウントIDはパスワードではないが、**クロスアカウントロールの推測や標的の特定に使われ得る**ため公開しない。
> 他プロジェクトのアカウント情報を巻き込まないことにも注意（構成図に列挙しない）。

### 一方で、書いてよいもの

- **AWSプロファイル名**（`touring` 等）— ローカルの設定名にすぎず秘密ではない
- リージョン名、サービス名、モデルID、リソース**命名規約**（実IDでなければ可）
- 検証で得たレイテンシ・トークン数などの実測値

### コミット前チェック

```sh
# アカウントID(12桁)・組織/Root/SCP-ID・アクセスキーの混入検査
grep -rnE '\b[0-9]{12}\b|\b(o-[a-z0-9]{10,}|r-[a-z0-9]{4,}|p-[a-z0-9]{8,})\b|AKIA[0-9A-Z]{16}' \
  --include='*.md' --include='*.sh' --include='*.yaml' --include='*.py' --include='*.toml' . \
  | grep -v node_modules
# → 何も出なければOK
```

- **AIが検証コマンドの出力をドキュメントに貼るときは特に注意**（ARNやアカウントIDがそのまま混入しやすい）。
- 万一push済みで混入が判明したら、**まず該当リソースの無効化・ローテーション**を行う（履歴書き換えだけでは不十分）。

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
- [x] **Bedrock事前調査**（`pre-research/bedrock/`）。ap-northeast-1で `jp.anthropic.claude-sonnet-4-6` が利用可能と実証。**Claude 5系は当アカウント未提供**
- [x] **AgentCore調査**（`pre-research/agentcore/`）。会話継続の基盤として **AgentCore採用を決定**。エージェントソースは **S3ソース(.zip)** 方針（Docker不要）
- [x] **AgentCoreで最小エージェントをデプロイし、`runtimeSessionId` による会話継続を実証**（`touringAgent/`。対照実験込みで確認）
- [ ] **Lambdaを挟むか否か** → ⚠️ **再検討中**。当初は「当面は挟む」としたが（`pre-research/agentcore/AUTH.md`）、
      **音声方式とセットで決め直す**（下記）。流量制限という当初の根拠は「利用者は本人のみ」の現状では効いていない
- [x] **要件定義を作成**（`docs/00_user_stories.md`）。MVPスコープを確定
- [x] **US-1.04（Web検索）が成立**。AgentCore Gateway の純正コネクタを採用（`pre-research/websearch/`）。
      **「アプリで確認してください」を返さなくなった**ことを実機で確認。必要なときだけ検索することもログで実証
- [x] **これに伴い `touringAgent/` を us-east-1 へ移設**（コネクタが us-east-1 限定。モデルIDも `us.` 系に変更）
- [ ] **音声の実現方式を決める** ← **いま最優先**。走行中は音声しか使えず**音声が本体**なので、
      これを検証してから構成を確定する（先にMVPの配線をすると音声化で作り直しになる）。
      選択肢は「手前でSTT」「`/ws`で音声を直接」「Nova 2 Sonic（音声→音声）」の3つ。
      **この選択でLambdaの要否も決まる**（`/ws`を使うならLambdaは中継役になれない）
- [ ] **MVP: アプリ → AgentCore を繋ぐ**（US-1.01・03。`backend/` の `POST /ask` は未だモック）
- [ ] MVP機能2: 連続取得（watchPositionAsync）→ 2点間から進行方位を算出（US-2.03）
- [ ] 音声化の実装（US-2.01 / US-2.02）
- [ ] PoC: バックグラウンド常駐＋ウェイクワードの実機検証（US-2.04・**最大の技術リスク**）

### いま作っているもの（MVPのスコープ）

**「現在地とともに質問 → AIが調べて答える」をスマホアプリで実現する**（`docs/00_user_stories.md` US-1.01〜04）。

- ✅ やる: 位置情報＋テキスト質問 → AI回答、会話の継続、**Web検索**
- ❌ **今はやらない**: 音声（STT/TTS）、ウェイクワード、方位算出、メモ機能
- 音声もウェイクワードも P1。**まず画面で入力・表示する形でコア体験を成立させる**。

> **Web検索がMVPに入る理由**: 検索なしだと「今日の天気は？」「給油できる？」に対し
> AIが「**アプリで確認してください**」と返す（実測）。走行中には実行不可能な回答であり、
> 手も目も使えないという前提を壊すため。詳細は `docs/00_user_stories.md` 補足A。

> ⚠️ **メモ機能（US-X.01）は将来必要だが今は作らない。** 学習しながらの開発では初手から重い。
> ただし**後から `@tool` を足すだけで対応できる構造**は保つ（それがAgentCoreを選んだ理由のひとつ）。

### 会話継続の方針（重要）

- **1問1答で終わらせず、続けて質問できる**ことを要件とする。
- ただし要件は**「一問一答＋α」まで**。連続して聞くときに文脈が繋がればよく、
  **15分以上あけて前の会話の続きを求める使い方は想定しない**。
  → **AgentCore Memory（セッションを越えた永続記憶）は採用しない**（`pre-research/agentcore/` で判断済み）。
  → 将来「走行ログを残す」等が出たら、それは**会話の記憶ではなくDB連携**として別に設計する。
- Converse APIは**ステートレス**で `sessionId` 相当のパラメータを持たない（実測確認済み）。
- **Bedrock Agents Classic は 2026-07-30 で新規受付終了**のため採用不可。後継の **AgentCore** を使う。
- AgentCoreの `idleRuntimeSessionTimeout` は**AWS側のリソース設定**でアプリからは変更できない。
  アプリ側でタイムアウトを可変にしたい場合は、**アプリが `runtimeSessionId` を再発行する**方式で実現する。
- ⚠️ **AgentCoreはアイドル中も課金対象**（microVMが文脈保持のまま生存）。ツーリングは散発的な質問になるためコスト影響を要実測。

## 補足

- Bedrock/Lambda等のClaude API実装を書く際は `claude-api` スキルを参照する（モデルIDやSDK仕様は記憶に頼らず確認する）。
