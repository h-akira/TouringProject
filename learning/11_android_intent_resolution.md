# Android の Intent 解決の仕組み — なぜボタンひとつでアプリが選ばれるのか

> 対象: Android全般
> 実践: US-2.04（ハンズフリー起動）で「ボタンを押しても狙ったアプリが起動しない」を
> 調査する過程で学んだこと

## Intent とは何か

Androidアプリ同士が「これをやってほしい」と依頼し合う仕組みが **Intent**。
Web開発でいうと、URLスキーム（`mailto:`や`tel:`のような）が一番近い。
「メールを送りたい」という**意図（intent）**だけを表明し、それを実際に処理する
アプリはOSが選ぶ、という考え方。

```kotlin
val intent = Intent(Intent.ACTION_VIEW, Uri.parse("mailto:someone@example.com"))
startActivity(intent)
```

`ACTION_VIEW`のような**アクション名**と、対象データ（URIなど）を指定して
`startActivity()`を呼ぶと、OSが「このアクションを処理できるアプリ」を探し、
起動する。

## 「処理できるアプリ」はどう決まるか — `intent-filter`

アプリ側は`AndroidManifest.xml`の`<intent-filter>`で「自分はこのアクションを
処理できる」と宣言する。

```xml
<activity android:name=".MainActivity">
  <intent-filter>
    <action android:name="android.intent.action.VOICE_COMMAND" />
    <category android:name="android.intent.category.DEFAULT" />
  </intent-filter>
</activity>
```

**この宣言が無いアプリは、そのIntentの候補にすら上がらない。** Web開発の
感覚だと、ルーティングテーブルに登録されていないパスにはアクセスできない、
というのに近い。

US-2.04の実装で最初につまずいたのは、まさにこれだった。
「既定のアシスタント（`VoiceInteractionService`）に設定したから、
ボタンを押せばそのアプリが起動するはず」と考えていたが、
実際にインカムのボタンが送っていたIntent（`ACTION_VOICE_COMMAND`）を
処理するintent-filterを、本アプリの`Activity`に**書いていなかった**。
そのため、そもそも選択肢に出てこなかった。

## 候補が複数あるとき — `preferred activity`

同じアクションを複数のアプリが処理できる場合、Androidは通常
**選択ダイアログ**（「どのアプリで開きますか？」）を出す。ここで
「常にこの操作で使う」を選ぶと、その組み合わせ（アクション×選んだアプリ）が
`PackageManager`に**恒久的に記録**される。次回からはダイアログを出さず、
自動でそのアプリに配送する。

この記録のことを **preferred activity** という。

```sh
adb shell dumpsys package preferred-xml   # 現在の設定を確認
adb shell pm clear-package-preferred-activities <パッケージ名>  # 特定パッケージの分だけ解除
```

⚠️ **ここが実機調査でハマったポイント**: Google製のアプリ（アシスタント関連）は
端末の初期状態から`preferred activity`として登録されていることが多い。
自作アプリが正しくintent-filterを宣言していても、**Google側が「常に使う」として
既に固定されていると、選択ダイアログすら出ずに毎回Googleへ配送される。**

これはWeb開発の感覚には無い落とし穴で、「デフォルトアプリの設定」という
GUIの設定画面（設定 > アプリ > デフォルトで開く）を通さないと解除できない。
`clear-package-preferred-activities`はアプリ単位でこの記録を消す（＝
次回また選択ダイアログが出る状態に戻す）ためのコマンド。

## `VoiceInteractionService` と `Intent` は別の階層

Androidには「既定のアシスタント」という特別な仕組み（`Role` API、
`android.app.role.ASSISTANT`）があり、`VoiceInteractionService`という
専用のAPIで実装する。これは電源ボタン長押しなど、OSレベルで特別扱いされる
起動経路を持つ。

しかし今回の実測で分かったのは、**「Bluetoothヘッドセットのボタン」はこの
特別な経路を通らない**ということ。AOSP（Android Open Source Project）の
標準実装（`HeadsetSystemInterface.activateVoiceRecognition()`）を見ると、
単に汎用的な`Intent(Intent.ACTION_VOICE_COMMAND)`を`startActivity()`で
投げているだけだった。つまり**普通のIntent解決の土俵**で戦うことになり、
「既定のアシスタントである」こと自体は直接関係しない
（ただし間接的に、Google Appが自身を既定として扱っている限りは`preferred activity`
として優先され続ける、という形で影響する）。

**教訓**: 「OSの特別な仕組み（Role・Service）に登録した」という設計上の
正しさと、「実際にどのIntentが飛んでくるか」という実機の事実は別物。
一次情報（AOSPのソースコード）と実機ログ（`adb logcat`）の両方で
裏を取らないと、正しく見える実装が実際には動かない、ということが起こりうる。

## 調査に使ったコマンド

```sh
# 起動されたActivityのIntent内容（アクション名・送信元パッケージ）を見る
adb logcat -d | grep "ActivityTaskManager: START"

# あるアクションを処理できるコンポーネント一覧
adb shell dumpsys package d | grep -A3 "android.intent.action.VOICE_COMMAND"

# preferred activity（自動選択の固定設定）の一覧
adb shell dumpsys package preferred-xml
```

`adb logcat`はAndroidアプリ開発における最重要のデバッグ手段で、
Web開発でいうとブラウザの開発者ツールのConsole/Networkタブに相当する。
「何が起きたか」をアプリ自身のログだけでなく、**OS全体のログ**として
横断的に見られるのが強み（今回のように、自分のアプリのコードが一切
関与していない場所で起きている問題を特定するのに不可欠だった）。
