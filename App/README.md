# App/ — モバイルアプリ（React Native / Expo）

ツーリングAI会話アプリのクライアント。**実機Android + Expo Go** で動かす。

設計の全体像は [docs/01_architecture.md](../docs/01_architecture.md)、
Expoの基礎は [learning/03](../learning/03_dev_environment_setup.md)。

> ⚠️ **このアプリは"薄いクライアント"に徹する。** 位置を取る・AWSに送る・回答を出す、まで。
> 賢い処理（住所の解決・方位の算出・回答の生成）は**すべてAWS側**にある。

## 動かす（実機Android + Expo Go）

### 1. 準備（初回だけ）

```sh
cd App
npm install          # postinstall で API の型が自動生成される
cp .env.example .env # ← APIのURLを書く（下記）
```

**`.env` に書くのはURLだけ:**

```sh
EXPO_PUBLIC_API_BASE_URL=https://<api-id>.execute-api.ap-northeast-1.amazonaws.com/Prod
```

⚠️ **APIキーは `.env` に書かない。** `EXPO_PUBLIC_*` は**バンドルに平文で埋め込まれる**ので
秘密の置き場にならない。キーは**アプリの設定画面から入力**する（後述）。

デプロイ済みのURLは次で取れる:

```sh
AWS_PROFILE=touring aws cloudformation describe-stacks \
  --stack-name stack-trg-dev-main --region ap-northeast-1 \
  --query "Stacks[0].Outputs[?OutputKey=='ApiBaseUrl'].OutputValue" --output text
```

### 2. 起動

```sh
cd App
npx expo start
```

**QRコードが出るので、スマホの Expo Go で読み取る。**

⚠️ **スマホとMacが同じWi-Fiにいること**（Metroバンドラに繋ぐため）。
📌 **API自体はモバイル回線でも叩ける**（APIキー認証なのでIPに依存しない）。
繋がらないときは `npx expo start --tunnel` を試す。

### 3. APIキーを入れる（初回だけ）

起動直後は「**APIキーが未設定です**」と出る。タップして設定画面へ。

キーの値は次で取る（⚠️ **コミットしないこと**）:

```sh
AWS_PROFILE=touring aws apigateway get-api-key \
  --api-key "$(AWS_PROFILE=touring aws cloudformation describe-stacks \
      --stack-name stack-trg-dev-main --region ap-northeast-1 \
      --query "Stacks[0].Outputs[?OutputKey=='ApiKeyId'].OutputValue" --output text)" \
  --include-value --region ap-northeast-1 --query value --output text
```

貼り付けて保存すると `expo-secure-store`（AndroidではKeystoreで暗号化）に保管される。
**一度入れれば再入力は不要。**

### 4. 試す

1. 位置情報の許可を出す（初回にダイアログが出る）
2. 緯度・経度が表示されるのを待つ
3. 質問を入力して「質問する」

⚠️ **最初の質問は10秒ほどかかる**（AgentCoreのコールドスタート）。2回目以降は2〜3秒。

> 📌 **進行方位（矢印）は走らないと出ない。** 停車中・転回直後は「まだ出せません」が正常
> （5m以上動いた直近の点が必要）。詳細は [docs/01b](../docs/01b_heading.md)。

## ⚠️ 変更したらバージョンを上げる

**`app.json` の `version` を必ず上げる。** 画面左上に表示され、
**更新が反映されたかの判別に使う**（Expo Go はキャッシュが残るため）。
上げ忘れると「直したのに変わらない」の原因が分からなくなる。

## 困ったとき

| 症状 | 原因 |
|---|---|
| **403** | ⚠️ ①APIキーが未設定/誤り（設定画面）②デプロイ漏れ。**切り分けは `/health`**（キー不要・200なら生きている） |
| **429** | Usage Planの上限。⚠️ **クォータはポーリングも消費する**（1問≒11回） |
| **「API URL が未設定」** | `.env` が無い/`EXPO_PUBLIC_API_BASE_URL` が空。⚠️ **`.env` を変えたら `expo start` を再起動** |
| QRを読んでも繋がらない | 同じWi-Fiにいない。`--tunnel` を試す |
| 直したのに変わらない | Expo Go のキャッシュ。`version` を上げたか確認し、`npx expo start -c` |

## 構成

```
App/
  app.json              Expoの設定（⚠️ version を上げる）
  .env                  APIのURL（gitignore。⚠️ キーは入れない）
  src/
    app/                画面（expo-router。ファイル名がURLになる）
      _layout.tsx       全画面の外枠
      index.tsx         メイン（位置・方位・質問・回答）
      settings.tsx      APIキーの入力
    api/
      apiKey.ts         キーの保管（expo-secure-store）
      types.ts          APIの型のエイリアス
      schema.ts         ⚠️ 自動生成。手で編集しない（gitignore）
```

⚠️ **`src/app/` は expo-router の画面ディレクトリ**で、リポジトリ直下の `App/` とは別物。

## APIの型は自動生成

**正本は [docs/02_api_openapi.yaml](../docs/02_api_openapi.yaml)**（フロント↔バックの契約）。

```sh
npm run gen:api   # docs/02 → src/api/schema.ts
```

📌 **`postinstall` と `prestart` で自動的に走る**ので、普段は意識しなくてよい。
⚠️ **契約を変えたら `docs/02` 側を直す。** `schema.ts` を手で編集しても次の生成で消える。

## やらないこと

**UIは動作確認に足る最小限**にとどめる（[CLAUDE.md](../CLAUDE.md)）。
凝った作り込みはせず、価値の中核であるAWS側に手をかける。
