# 005. CI/CDを入れ、トップレベルのディレクトリ名を揃える

- **日付**: 2026-08-15
- **ステータス**: 採用
- **現在の設計**: [CICD/README.md](../CICD/README.md) / [docs/01](../docs/01_architecture.md) §10・§11

## 背景

**動くようになってきた一方で、デプロイが手作業のままだった。**
`agentcore deploy` と `sam deploy` を手で順に叩き、
その間に Runtime ARN を `list-agent-runtimes` で引いて渡していた。

- **手順を覚えていないと再現できない**（READMEを見ながら3コマンド）
- **テストを流し忘れてもデプロイできてしまう**
- ARNの受け渡しがあるため、**順序を間違えると失敗する**

あわせて、トップレベルの構成が `app/` `backend/` `touringAgent/` と
**粒度も語彙も揃っていなかった**。

## 選択肢

### CI/CDの土台

#### 案A: CodeBuild（採用）

CloudFormationでCodeBuildプロジェクトを作り、pushで起動する。
**既に他プロジェクトで確立している型**があり、AWS内で完結する。

#### 案B: GitHub Actions

**却下。** AWSへのデプロイ権限をGitHubに渡す設計（OIDC）が要る。
CodeBuildならIAMロールで完結し、**このリポジトリが公開である以上、
権限をAWSの外に出さない方が単純**。

### AgentとBackendを分けるか

#### 案A: 1つのCodeBuildで両方（採用）

⚠️ **ARNの受け渡しがあるため順序に依存する。** 1つにまとめれば順序が自明。

#### 案B: 最初から2つに分ける

**却下（ただし将来やる）。** いまやると、Agentの完了を待ってBackendを起こす
仕組みが追加で要る。**受け渡しをSSM経由にしてあるので、
分けたくなった時点で分けられる**（順序さえ担保すればよい）。

### Runtime ARN の渡し方

#### 案A: SSMパラメータ（採用）

Agentが書き、BackendのSAMが `AWS::SSM::Parameter::Value<String>` で読む。

#### 案B: CloudFormationのエクスポート / ImportValue

⚠️ **技術的に不可能だった。** AgentCoreのスタックは Runtime ARN を
**エクスポートしている**が、それは **us-east-1**。Backendは**東京**にあり、
**`Fn::ImportValue` はリージョンを跨げない**（実際にエクスポート一覧を確認した）。

#### 案C: CodeBuildの環境変数として渡す

**却下。** Agentを作り直すとARNが変わり、**CI/CDスタックの再デプロイが必要**になる。

## 決定

**CodeBuild 1本で `Agent → SSM → Backend` の順にデプロイする。**

トップレベルは **`App/` `Backend/` `Agent/`**（大文字始まり）に統一し、
CI/CD関連を **`CICD/`** に置く。

- **`buildspec.yml` はリポジトリ直下**（`CICD/` の中ではない）。
  CodeBuildが既定で見る場所であり、**将来リポジトリを分けたときも
  各リポジトリの直下**になる。`CICD/` に置くのは
  「CodeBuild自体を作るCloudFormation」だけ。
- **`App/` はCI/CDの対象外。** Expo経由で配布するのでAWSにデプロイするものが無い。
- **テストは `pre_build` で走らせる**（落ちたらデプロイしない）。
- ⚠️ **パスフィルタは使わない**（`main` へのpushは常にビルドする）。
  ⚠️ `FILE_PATH` は**headコミットしか見ない**ため、最後のコミットがドキュメントだけだと
  **同じpushに含まれるBackendの変更ごとスキップされる**。空振りのビルドは安いが、
  **静かに実行されないデプロイは高くつく**。

### 命名を大文字始まりに揃えた理由

**将来リポジトリを分ける単位**がこの3つだから。
`docs/` `adr/` `learning/` `pre-research/` は**このリポジトリに属する文書**なので
小文字のままにし、**「切り出しうるもの」と「そうでないもの」が名前で見分けられる**ようにした。

## 影響

- ⚠️ **`sam deploy` が引数なしで通るようになった。**
  渡すのは**SSMパラメータ名**で、アカウントIDを含まないため `samconfig.toml` に置ける。
- ⚠️ **Agentを先にデプロイしていないとBackendが失敗する**
  （`Parameter /trg/... not found`）。これは仕様どおりの挙動。
- ⚠️ **`--parameter-overrides` はsamconfigの指定を「併合せず置き換える」。**
  一部だけ変えるつもりで省くと、**テンプレートの既定値に戻る**（実測で確認）。
- **CodeBuildのIAMロールは広め。** SAMとCDKが2スタックぶんのリソースを作るため。
  ⚠️ **CodeBuildからしか使えず、実行するのはこのリポジトリのbuildspecだけ**という前提で許容している。
- **ドキュメント内のパス参照を一斉に書き換えた**（`app/`→`App/` 等）。
  ⚠️ ただし **`src/app/`（expo-routerの画面）と `app/<agent-name>/`（AgentCore内部）は
  別物なので変えていない。**
- **`CICD/deploy.sh` は gitignore。** CodeStar接続ARNがアカウントIDを含むため、
  雛形（`deploy-sample.sh`）だけを追跡する。
