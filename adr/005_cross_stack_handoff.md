# 005. スタック間の Runtime ARN の受け渡しを SSM パラメータにする

- **日付**: 2026-08-15
- **ステータス**: 採用（一部改訂）
- **現在の設計**: [docs/01](../docs/01_architecture.md) §10・§11

## 背景

**`Agent/`（CDK・us-east-1）と `Backend/`（SAM・東京）は別スタックで、
後者が前者の Runtime ARN を必要とする**という制約がある。
手作業のときは `list-agent-runtimes` で引いて渡していた。

デプロイを繰り返すにあたり、**この受け渡しをどこかに固定する必要がある**。

## 選択肢

### 案A: SSMパラメータ（採用）

Agentのデプロイ後に `/trg/<env>/agent-runtime-arn` へ書き、
BackendのSAMが `AWS::SSM::Parameter::Value<String>` で読む。

### 案B: CloudFormationのエクスポート / `Fn::ImportValue`

⚠️ **技術的に不可能。** AgentCoreのスタックは Runtime ARN を
**エクスポートしている**（`...-RuntimeArn`）が、それは **us-east-1** にある。
Backendは**東京**で、**`Fn::ImportValue` はリージョンを跨げない**
（東京側のエクスポート一覧が空であることを確認した）。

**本来これが最も素直**なので、⚠️ **リージョンを揃えられた場合は再検討の価値がある**
（条件はWeb検索コネクタが東京に来ること。[docs/01](../docs/01_architecture.md) §6）。

### 案C: デプロイのたびに ARN を引数で渡す

**却下。** Agentを作り直すとARNが変わり、**そのたびに渡す値を手で直す**ことになる。

## 決定

**Runtime ARN は SSM 経由で渡す**（`Agent → SSM → Backend` の順にデプロイする）。

## 影響

- ⚠️ **Agentを先にデプロイしていないとBackendが失敗する**
  （`Parameter /trg/... not found`）。これは仕様どおりの挙動。
- **`sam deploy` が引数なしで通るようになった。**
  渡すのは**SSMパラメータ名**でアカウントIDを含まないため、`samconfig.toml` に置ける。
  📌 手元では changeset の確認プロンプトが出る。
- ⚠️ **`--parameter-overrides` はsamconfigの指定を「併合せず置き換える」**（実測で確認）。
  一部だけ変えるつもりで省くと、テンプレートの既定値に戻る。
- **`App/` はAWSへのデプロイの対象外。** アプリとして配布するのでAWSにデプロイするものが無い。

## 改訂（2026-09-25）: ARN は Backend に焼き込まれる

⚠️ **「Agentを先にデプロイしていないとBackendが失敗する」は初回にしか当たらなかった。**
Backend は ARN を**デプロイ時に** Lambda の環境変数と IAM ポリシーへ焼き込むので、
**ランタイム名を変えた後は、Backend を再デプロイしない限り古いランタイムを呼び続ける**
（デプロイは成功し、質問したときに初めて失敗する）。
→ **ARN が変わったら Backend も再デプロイする。**

## 改訂（2026-09-26）: デプロイの仕組みに関する記述を除いた

**CI/CD を非公開にした**（[adr/011](011_repository_split.md) 改訂）ため、
**本 ADR からデプロイの仕組みに関する判断を除いた。** SSM での受け渡しという決定は変わっていない。
