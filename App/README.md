# App/ — モバイルアプリ（React Native / Expo）

ツーリングAI会話アプリのクライアント。**実機Android + Expo Development Build** で動かす。

設計の全体像は [docs/01_architecture.md](../docs/01_architecture.md)。

> ⚠️ **このアプリは"薄いクライアント"に徹する。** 位置を取る・AWSに送る・回答を出す、まで。
> 賢い処理（住所の解決・方位の算出・回答の生成）は**すべてAWS側**にある。

> ⚠️ **US-2.04（ハンズフリー起動）でネイティブコードが必要になり、
> Expo Go から Development Build に移行した**（[adr/006](../adr/006_handsfree_launch_mechanism.md)）。
> **Expo Goでは動かない**（`VOICE_COMMAND` のintent-filterはネイティブのマニフェストにあり、
> Expo Goのランタイムには反映されない）。

## 動かす（実機Android + Development Build）

### 0. Android開発環境（初回だけ）

**Android Studio / Android SDK / JDK 17** が要る。

```sh
brew install --cask zulu@17
brew install --cask android-studio   # 初回起動でStandardセットアップ
```

`~/.zshrc` 等に環境変数を追加:

```sh
export JAVA_HOME=/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools
```

`adb --version` が通れば準備完了。実機をUSB接続し、
`設定 > 開発者向けオプション > USBデバッグ` を有効化してから
`adb devices` で認識されることを確認する。

> ⚠️ **AIにビルドさせるときは `ANDROID_HOME` を明示的に渡すこと。**
> `~/.zshrc` は**対話シェルでしか読まれない**ので、AIが実行する
> 非対話シェルには環境変数が引き継がれず、Gradleが
> `SDK location not found` で失敗する。
>
> ```sh
> ANDROID_HOME="$HOME/Library/Android/sdk" npx expo run:android
> ```
>
> 📌 `android/local.properties` に `sdk.dir` を書く方法もあるが、
> `android/` ごと `.gitignore` 済みで `prebuild` のたびに消えるため、
> 環境変数を渡す方が確実。

### 1. 準備（初回だけ）

```sh
cd App
npm install          # postinstall で API の型が自動生成される
cp .env.example .env # ← APIのURLを書く（下記）
```

**実機をUSB接続し `adb devices` で認識されることを確認**したら、初回だけビルド:

```sh
npx expo prebuild --platform android   # android/ を生成
npx expo run:android                   # ビルドして実機にインストール
```

⚠️ **`android/` は生成物なので `.gitignore` 済み。** 手で編集しても
`prebuild --clean` で消える。ネイティブ側の変更は `App/plugins/withVoiceInteraction.js`
（Expo config plugin）に書く。

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

### 2. 起動（2回目以降。実機に既にインストール済みの前提）

```sh
cd App
npx expo start
```

**実機のアプリ（アイコン名「app」）を直接開くと、開発サーバーに自動で繋がる。**
QRコードやExpo Goは使わない。

⚠️ **`npx expo start` は対話型TUI。** AIエージェントにバックグラウンド実行させず、
自分のターミナルで起動すること。

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
3. **「🎤 押して話す」→ 質問を話す → 「■ 話し終えたら押す」**
   （文字で試すなら、下の入力欄から「質問する」）

⚠️ **最初の質問は10秒ほどかかる**（AgentCoreのコールドスタート）。2回目以降は2〜3秒。
**声の場合は文字起こしのぶんが乗る**（実測15〜20秒）。

#### 声で質問する（US-2.01 / US-2.02）

**アプリは録音して送るだけ**で、文字起こしも読み上げもバックエンドが行う
（[docs/01](../docs/01_architecture.md) §7）。**回答は自動で読み上げられる。**

- 初回はマイクの許可を求められる
- ⚠️ **止め忘れても30秒で自動送信される。** 走行中は押し忘れやすく、
  放っておくと上限に達して**質問ごと失われる**ため
- ⚠️ **文字で質問しても音声は返る**（走行中は画面を見られないため）
- 📌 **回答が読み上げられないことがある。** 音声合成に失敗した場合で、
  **回答自体は画面に出る**（読めれば用は足りるので、エラーにはしない）

> 📌 **進行方位（矢印）は走らないと出ない。** 停車中・転回直後は「まだ出せません」が正常
> （5m以上動いた直近の点が必要）。詳細は [docs/01b](../docs/01b_heading.md)。

## ネイティブコードを変更したら再ビルドが要る

JS/TS だけの変更は `npx expo start` を起動していればそのまま反映される。
**`app.json` の `plugins`/`permissions`、`App/plugins/` 配下、`android/` を直接触るような変更は
再ビルドが必要**:

```sh
npx expo prebuild --platform android --clean   # android/ を作り直す
npx expo run:android                           # ビルドしてインストール
```

⚠️ **`android/` は生成物。** 直接編集しても `prebuild --clean` で消える。

## ⚠️ 変更したらバージョンを上げる

**`app.json` の `version` を必ず上げる。** 画面左上に表示され、
**更新が反映されたかの判別に使う**（キャッシュが残ることがあるため）。
上げ忘れると「直したのに変わらない」の原因が分からなくなる。

## 開発を中断・再開するとき

- **中断するとき**: 特別な後片付けは不要。`npx expo start` を `Ctrl+C` で止めるだけ。
  実機のアプリはそのままでよい（次回 `npx expo start` すれば自動で繋がる）。
- **再開するとき**:
  1. 実機をUSB接続（`adb devices` で認識確認。**インカムのボタン試験は有線接続不要**、
     Wi-Fi経由の開発サーバー接続だけ繋がっていればよい）
  2. `cd App && npx expo start`
  3. 実機のアプリ（アイコン名「app」）を開く。開発サーバーに自動接続される
  4. しばらく間が空いていた場合、`npm install`（依存の変更を取り込む）と
     `npx expo run:android`（ネイティブ側の変更を取り込む）を念のため実行するとよい

## 困ったとき

| 症状 | 原因 |
|---|---|
| **403** | ⚠️ ①APIキーが未設定/誤り（設定画面）②デプロイ漏れ。**切り分けは `/health`**（キー不要・200なら生きている） |
| **429** | Usage Planの上限。⚠️ **クォータはポーリングも消費する**（1問≒11回） |
| **「録音が長すぎます」** | 30秒の上限に達した。短く話す |
| **回答は出るが読み上げない** | 音声合成の失敗。⚠️ **異常ではない**（回答は画面に出ている） |
| **聞き取りが違う** | 地名の同音異義（「柳井」→「屋内」等）。⚠️ **走行中の風切り音にも弱い** |
| **「API URL が未設定」** | `.env` が無い/`EXPO_PUBLIC_API_BASE_URL` が空。⚠️ **`.env` を変えたら `expo start` を再起動** |
| 実機のアプリを開くと「There was a problem loading the project」 | 開発サーバー（`npx expo start`）が起動していないか、繋がっていない。起動し直して実機のアプリを開き直す |
| 実機のアプリが起動直後に強制終了する | `NoClassDefFoundError` の場合は依存の重複が疑わしい。`npx expo-doctor` で確認 |
| 直したのに変わらない | `version` を上げたか確認。ネイティブ側の変更なら `npx expo run:android` で再ビルドしたか確認 |

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
