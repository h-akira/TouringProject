# TouringProject

バイクでのツーリング中に、現在地と進行方向を踏まえて AI と音声で対話する Android アプリ。

> 「右手に見える山は何？」
> 「この先で給油できる？」

走行中は画面を見られず手も使えないので、インカムのボタンで起動し、声で質問して、回答を読み上げで聞く。
開発の記録を兼ねた学習用のリポジトリでもあり、判断の過程を ADR に残しながら進めている。

## 構成

このリポジトリは、ユニット（App・Backend・Agent・CICD）を submodule として束ね、プロジェクト全体の要件・方針・契約・決定を持つ。

| パス | 中身 | リポジトリ |
|---|---|---|
| `App/` | Android アプリ（React Native / Expo） | [TouringProject_App](https://github.com/h-akira/TouringProject_App) |
| `Backend/` | API（API Gateway ＋ Lambda・SAM・東京） | [TouringProject_Backend](https://github.com/h-akira/TouringProject_Backend) |
| `Agent/` | エージェント（Bedrock AgentCore・Strands・us-east-1） | [TouringProject_Agent](https://github.com/h-akira/TouringProject_Agent) |
| `CICD/` | Agent・Backend の自動デプロイ（非公開） | [TouringProject_CICD](https://github.com/h-akira/TouringProject_CICD) |
| `learning/` | 学習教材（使った技術の基礎を、Web の知識と対応づけて書いたもの） | TouringProject_Learning |
| `research/` | 調査の記録（非公開） | TouringProject_Research |
| [`docs/`](docs/README.md) | 要件・技術方針・ユニットの定義・ユニット間の契約・API 仕様 | — |
| [`adr/`](adr/README.md) | プロジェクト全体の決定の記録 | — |

ユニットの中の設計と決定は、各ユニットの `docs/`・`adr/` にある。

## 取得する

```sh
git clone https://github.com/h-akira/TouringProject.git
cd TouringProject
git submodule update --init App Backend Agent learning   # CICD と research は非公開なので除く
```

submodule を取得しないと、`App/` などは空のディレクトリになる。

## 動かす

アプリは実機の Android と Expo Development Build で、バックエンドは AWS にデプロイして使う。

| やりたいこと | 見るところ |
|---|---|
| アプリを使う | [App/USAGE.md](https://github.com/h-akira/TouringProject_App/blob/main/USAGE.md) |
| アプリを動かす・ビルドする | [App/README.md](https://github.com/h-akira/TouringProject_App/blob/main/README.md)・[App/SETUP.md](https://github.com/h-akira/TouringProject_App/blob/main/SETUP.md) |
| バックエンドをデプロイする・API キーを取り出す | [Backend/README.md](https://github.com/h-akira/TouringProject_Backend/blob/main/README.md) |
| エージェントをデプロイする | [Agent/README.md](https://github.com/h-akira/TouringProject_Agent/blob/main/README.md) |

デプロイは Agent → Backend の順。

## ドキュメントの読み方

| 知りたいこと | 場所 |
|---|---|
| 何を作るか（要件） | [docs/00_user_stories.md](docs/00_user_stories.md) |
| 全体の方針と技術選定 | [docs/01_technical_policies.md](docs/01_technical_policies.md) |
| ユニットの責務と、ユニット間の約束 | [docs/02_units_definition.md](docs/02_units_definition.md)・[docs/03_units_contracts.md](docs/03_units_contracts.md) |
| なぜそう決めたか | [adr/](adr/README.md) と各ユニットの `adr/` |

`docs/` は現在の設計だけを書き、経緯は `adr/` に書く。
