# 006. Runtime ARN の受け渡しを SSM パラメータにする

- **日付**: 2026-08-15（最終更新 2026-09-27）
- **ステータス**: 採用

## 背景

Agent（CDK・us-east-1）と Backend（SAM・東京）は別スタックで、Backend は Agent の Runtime ARN を必要とする。
デプロイを繰り返すので、この受け渡しをどこかに固定する必要がある。

## 選択肢

| 案 | 判断 |
|---|---|
| **A. SSM パラメータ** | 採用。Agent のデプロイ後に `/trg/<env>/agent-runtime-arn` を東京に書き、Backend の SAM が `AWS::SSM::Parameter::Value<String>` で読む |
| B. CloudFormation のエクスポート（`Fn::ImportValue`） | 却下。AgentCore のスタックは Runtime ARN をエクスポートしているが us-east-1 にあり、`Fn::ImportValue` はリージョンを跨げない（東京のエクスポート一覧が空であることを確認）。リージョンを揃えられれば最も素直なので、Web 検索のコネクタが東京に来たら再検討する |
| C. デプロイのたびに ARN を引数で渡す | 却下。Agent を作り直すと ARN が変わり、毎回手で直すことになる |

## 決定

Runtime ARN は SSM パラメータで渡す。デプロイは Agent → Backend の順。

## 影響

- ⚠️ Backend は ARN をデプロイ時に Lambda の環境変数と IAM ポリシーへ焼き込む。ARN が変わったら（初回・ランタイム名の変更）、Backend も再デプロイする。しないと古いランタイムを呼び続け、デプロイは成功して質問したときに初めて失敗する。
- Agent を一度もデプロイしていないと、Backend のデプロイは `Parameter /trg/... not found` で失敗する（仕様どおり）。
- 渡すのはパラメータ名だけなので、`samconfig.toml` にアカウント ID を置かずに `sam deploy` が引数なしで通る。
- ⚠️ `--parameter-overrides` は samconfig の指定と併合されず置き換わる。一部だけ変えるつもりで省くと、テンプレートの既定値に戻る。
- 受け渡しの契約は [docs/03_units_contracts.md](../docs/03_units_contracts.md) の UC-3。
