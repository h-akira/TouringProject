# docs/ — 設計ドキュメント

**このアプリの現在の設計。** 書き方のルールは [ルートのREADME](../README.md) を参照。

- [00. 要件定義（ユーザーストーリー）— **最上位**](./00_user_stories.md)
- [01. 全体アーキテクチャ（責務分担とデータフロー）](./01_architecture.md)
  - [01a. 回答を非同期で受け取る（29秒制約の回避）](./01a_async_ask.md)
- [02. API仕様（OpenAPI）— フロント↔バックの契約](./02_api_openapi.yaml)
- [03. DynamoDBテーブル定義（シングルテーブル設計）](./03_dynamodb_table.md)
