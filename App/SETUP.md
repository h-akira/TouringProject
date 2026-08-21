# App/ セットアップと困ったとき

**初回の環境構築・中断/再開の手順・つまずいたときの対処**を置く。
**普段の使い方は [README.md](README.md)。**

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
`prebuild --clean` で消える。**ネイティブ側の変更は2箇所のどちらかに書く**:

| 置き場 | 何を書くか |
|---|---|
| `App/plugins/` | **マニフェスト・`MainActivity.kt` など、生成物への差し込み**（Expo config plugin） |
| `App/modules/` | **JSから呼ぶ自前のネイティブ機能**（Expo Modules API）。`modules/` は既定でautolinkされるので登録は要らない |

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
