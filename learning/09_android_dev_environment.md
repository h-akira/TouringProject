# Android開発環境の構築（Expo Development Build のために）

> 対象: Expo SDK 54 / macOS
> 参照: [Expo公式 - Set up your environment](https://docs.expo.dev/get-started/set-up-your-environment/)

## なぜ必要か

これまでは **Expo Go**（App Storeで配布されている汎用アプリ）だけで動作確認できていた。
JS/TSの変更しか含まないアプリなら、Expo Goがランタイムを肩代わりしてくれるため。

`VoiceInteractionService`（US-2.04・ハンズフリー起動）は**ネイティブ（Kotlin）コード**が要る。
これはExpo Goには含まれていないので、**自分でネイティブ部分を含めてビルドしたアプリ
（= Development Build）**が必要になる。ここで初めてAndroid SDKに触れることになる。

## 手順

### 1. JDK（Java 17）のインストール

Expoの推奨は Azul Zulu ディストリビューションの Java 17。

```sh
brew install --cask zulu@17
```

`~/.zshrc` に追記:

```sh
export JAVA_HOME=/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home
```

### 2. Android Studio のインストール

[developer.android.com/studio](https://developer.android.com/studio) からダウンロードするか、Homebrewで:

```sh
brew install --cask android-studio
```

初回起動時のセットアップウィザードは **Standard** を選ぶ。

### 3. Android SDK の設定

Android Studio内: **Settings > Languages & Frameworks > Android SDK**

- **SDK Platforms** タブ: 最新の安定版（記事執筆時点でAndroid Studioが提案してくるもの）にチェック
- **SDK Tools** タブ: **Android SDK Build-Tools** と **Android Emulator** が入っていることを確認

### 4. 環境変数の設定

`~/.zshrc` に追記:

```sh
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

反映:

```sh
source ~/.zshrc
```

### 5. 動作確認

```sh
adb --version
```

バージョンが表示されればOK。実機を繋いで `adb devices` で認識されることも確認する。

## つまずいたところ

> 📌 実際に構築した際にここへ追記する。
