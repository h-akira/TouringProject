# learning/ — 基礎学習メモ

このディレクトリは、**React Native / モバイルアプリ開発を学ぶための基礎知識**を体系的に残す場所。

## 方針

- **プロジェクト横断で通用する汎用知識**を扱う（本アプリ固有の設計は [`docs/`](../docs/) へ）。
- 開発者はWeb開発（AWS・Vue・Lambda・JS/TS）に精通しているので、
  **「Webでいうと○○に相当する」という対応づけ**を積極的に使い、既知から未知へ橋渡しする。
- 「開発を進めながら学習する」方針に沿い、**必要になった時点で該当トピックを書き足していく**。
  最初から網羅しようとしない。

## 番号の付け方

扱う領域で番号帯を分ける。開発者はモバイルが未経験・AWSは得意なので、
**同じ「基礎メモ」でも前提知識のレベルが大きく違う**ため。

| 番号帯 | 領域 |
|---|---|
| **01〜49** | モバイル / フロントエンド（React Native・Expo・Android） |
| **51〜59** | **AI**（Bedrock・AgentCore・エージェント・MCP） |
| **61〜99** | **AI以外のバックエンド**（AWSの各サービス・API設計など） |

## 想定トピック（順不同・随時追加）

**モバイル / フロントエンド（01〜）**

- [x] React Native とは何か（Web/Vue経験者向けの導入）
- [x] Expo とは何か、なぜ使うのか
- [x] 開発環境のセットアップ手順（Mac + Expo + 実機Android）
- [x] npx / package.json / node_modules / npm install の関係
- [x] JSX / コンポーネント / 状態管理（React未経験部分の補完）
- [x] 位置情報の扱い方（権限フロー / expo-location）
- [x] API連携（fetch でバックエンドと通信 / 環境変数）
- [x] Android開発環境の構築（JDK・Android Studio・SDK）
- [x] Expo Development Build と Config Plugin（なぜ・どうやってネイティブコードに踏み込むか）
- [x] Android の Intent 解決の仕組み（intent-filter・preferred activity）
- [x] 音の扱い方（録音・音量(dB)・VAD・飽和）
- [ ] Android の権限・バックグラウンド動作・Foreground Service の基礎
- [ ] センサー（方位・進行方向の算出）

**バックエンド / AI（51〜）**

- [x] AIエージェントと AgentCore（Lambda経験者向け）
- [x] MCP（Model Context Protocol）とツール利用
- [ ] プロンプト設計の基礎（システムプロンプト / 音声読み上げ向けの制約）
- [ ] STT / TTS（Transcribe・Polly）の扱い方

## 索引

### モバイル / フロントエンド

- [01. React Native とは（Web/Vue経験者向けの導入）](./01_react_native_for_web_devs.md)
- [02. Expo とは何か、なぜ使うのか](./02_expo.md)
- [03. 開発環境のセットアップ手順（Mac + Expo + 実機Android）](./03_dev_environment_setup.md)
- [04. npx / package.json / node_modules / npm install の関係](./04_npm_npx_node_modules.md)
- [05. JSX / コンポーネント / 状態管理（Vue経験者向け）](./05_jsx_components_state.md)
- [06. 位置情報の扱い方（権限フロー / expo-location）](./06_location_permissions.md)
- [07. API連携（fetch でバックエンドと通信 / 環境変数）](./07_api_integration.md)
- [08. セーフエリア（画面端のバーに隠れない配置）](./08_safe_area.md)
- [09. Android開発環境の構築（JDK・Android Studio・SDK）](./09_android_dev_environment.md)
- [10. Expo Development Build と Config Plugin](./10_expo_development_build.md)
- [11. Android の Intent 解決の仕組み](./11_android_intent_resolution.md)
- [12. 音の扱い方（録音・音量(dB)・VAD）](./12_audio_recording_and_vad.md)

### AI（51〜）

- [51. AIエージェントと Amazon Bedrock AgentCore（Lambda経験者向け）](./51_ai_agent_and_agentcore.md)
- [52. MCP とツール利用（エージェントに「できること」を足す）](./52_mcp_and_tools.md)

### AI以外のバックエンド（61〜）

- [61. 逆ジオコーディング（座標 → 住所）](./61_reverse_geocoding.md)
