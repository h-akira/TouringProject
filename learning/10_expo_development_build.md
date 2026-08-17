# Expo Development Build と Config Plugin

> 対象: Expo SDK 54 / Android
> 実践: US-2.04（ハンズフリー起動）の実装で、初めてネイティブコードに踏み込んだ際の学び

## Expo Go と Development Build の違い

これまで（US-2.01〜2.03）は **Expo Go**（App Storeで配布されている汎用アプリ）だけで
開発できていた。Expo Goは「JS/TSだけで作られたExpoアプリを実行できる、あらかじめ
ビルド済みのランタイム」で、Web開発でいうと**ブラウザ**に近い。ブラウザがHTML/CSS/JSを
解釈して動かすように、Expo GoがJSバンドルを読み込んで動かす。

この方式には制約がある。**Expo Goに同梱されていないネイティブコードは使えない。**
`VoiceInteractionService`のような「Kotlinで書く必要があるAndroidの機能」は、
Expo Goのランタイムに存在しないため、絶対に動かない。

**Development Build** は「自分専用のExpo Go」を自分でビルドしたもの。
`expo-dev-client`というライブラリを組み込んだ、実機にインストールする普通のAPK。
好きなネイティブコードを含められる代わりに、ネイティブコードを変更するたびに
再ビルドが必要になる（JS/TSだけの変更ならExpo Go同様、再起動不要で反映される）。

| | Expo Go | Development Build |
|---|---|---|
| 正体 | 汎用ランタイム（ストアアプリ） | 自分でビルドしたアプリ |
| ネイティブコード | 同梱済みのものしか使えない | 自由に追加できる |
| JS/TSの変更 | 即反映 | 即反映（同じ） |
| ネイティブコードの変更 | できない | 再ビルドが必要 |

## `expo prebuild` — ネイティブプロジェクトの生成

Expoのプロジェクトには、通常 `android/` や `ios/` ディレクトリが**存在しない**。
これは意図的な設計で、`app.json`（設定ファイル）から**そのつど生成する**という
仕組みになっている（Continuous Native Generation, CNG）。

```sh
npx expo prebuild --platform android
```

を実行すると、`app.json`の内容（アプリ名・パッケージ名・権限など）を元に、
`android/`ディレクトリが**丸ごと新規作成**される。既存の`android/`があれば
`--clean`をつけて作り直す。

⚠️ **これが意味すること**: `android/`配下のファイルを直接手で編集しても、
次に`prebuild`を実行すると**消えて元に戻る**。Gitでいう「生成物なのでコミットしない」
に近い感覚で、`android/`は`.gitignore`されている。

## では、ネイティブコードをどう追加するか — Config Plugin

「`android/`を直接編集できないなら、ネイティブコードはどう足すのか」という疑問に対する
Expoの答えが **Config Plugin**。`app.json`の`plugins`配列に登録した関数が、
`prebuild`の実行中に呼び出され、生成されたばかりの`android/`を**プログラムで加工する**。

```json
{
  "expo": {
    "plugins": [
      "./plugins/withVoiceInteraction.js"
    ]
  }
}
```

Config Pluginは、Web開発でいうと**ビルドツールのプラグイン**（webpackのプラグインや
Viteのプラグインに近い）。「ビルドの過程に割り込んで、生成物を書き換える」という
考え方は同じ。

### 実装の骨格

`@expo/config-plugins`パッケージが、よく使う操作をユーティリティとして提供している。

```js
const { withAndroidManifest, withDangerousMod, AndroidConfig } = require("@expo/config-plugins");

// AndroidManifest.xml をJSON形式で受け取り、書き換えて返す
const withMyManifestChange = (config) => {
  return withAndroidManifest(config, (config) => {
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(config.modResults);
    // mainActivity を書き換える
    return config;
  });
};

// マニフェスト以外の任意のファイル（Kotlinソース等）を扱う、より低レベルなAPI
const withMyFile = (config) => {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.platformProjectRoot; // = android/
      // fs.writeFileSync などで直接ファイルを書く
      return config;
    },
  ]);
};
```

`withAndroidManifest`はXMLをJSON構造として渡してくれるので、文字列操作ではなく
オブジェクトとして安全に書き換えられる。それでは対応できないケース
（新規のKotlinファイルを追加する等）は`withDangerousMod`で直接ファイルシステムを操作する。

### つまずいたところ

`config.modRequest.platformProjectRoot`は**既に`android/`を指している**。
これに気づかず`path.join(projectRoot, "android/app/...")`と書いてしまい、
`android/android/app/...`という二重パスができて、ファイルがどこにも
書き込まれない（エラーにもならない）というバグを踏んだ。

`withDangerousMod`はエラーを出さずに黙って失敗することがあるので、
`console.log`でパスを確認しながら実装するとよい。

## `npx expo run:android` — ビルドしてインストールまで

```sh
npx expo run:android
```

は、`android/`のネイティブプロジェクトをGradleでビルドし、接続された実機
（`adb devices`で見えるもの）にインストールし、起動するところまでを一括で行う。
裏側は素のAndroid開発と同じGradleビルドなので、**初回はNDK・CMake・SDK
Platformなどの自動ダウンロードが走り、数分かかる**（2回目以降はキャッシュが効いて
数十秒程度）。

## トラブルシュート: `NoClassDefFoundError`（クラスはあるのに見つからない）

実装中、`java.lang.NoClassDefFoundError: Failed resolution of: L...`という
実行時エラーに繰り返し遭遇した。厄介なのは、**該当のクラスファイル自体はAPKの中に
存在する**こと（`unzip`でAPKを展開し、dexファイルを`strings`で検索すると見つかる）。

原因は `npx expo-doctor` で判明した。

```sh
npx expo-doctor
```

が、**依存パッケージの重複**を検出した。`expo-audio`が`expo-asset`を
peer dependency として要求しているのに、`package.json`に直接インストールされておらず、
npmが解決の過程で**2つの異なるバージョンの`expo-asset`**（`expo-asset`自体の依存先と、
`expo`本体が要求するバージョン）を両方インストールしてしまっていた。

ネイティブビルドはJSの依存関係とは違い、**同じクラスが複数バージョン存在する状態を
正しく扱えない**。Androidのビルドは複数の`.dex`ファイルにクラスを分割する
（マルチdex）が、どちらのバージョンのクラスがどのdexに入るかが不定になり、
実行時のクラスローダーがそれを見つけられない、という壊れ方をする。

```sh
npx expo install expo-asset  # peer dependency を直接インストールして解消
npx expo-doctor              # 18/18 checks passed になるまで確認
```

**教訓**: Development Buildで原因不明の`NoClassDefFoundError`に遭遇したら、
まず`npx expo-doctor`を実行する。Expo Goでは起きない種類のエラー
（ネイティブの依存関係解決に起因する）なので、JS側の感覚では気づきにくい。
