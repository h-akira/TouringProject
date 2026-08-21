# App/ — モバイルアプリ（React Native / Expo）

ツーリングAI会話アプリのクライアント。**実機Android + Expo Development Build** で動かす。

設計の全体像は [docs/01_architecture.md](../docs/01_architecture.md)。

> ⚠️ **このアプリは"薄いクライアント"に徹する。** 位置を取る・AWSに送る・回答を出す、まで。
> 賢い処理（住所の解決・方位の算出・回答の生成）は**すべてAWS側**にある。

> ⚠️ **US-2.04（ハンズフリー起動）でネイティブコードが必要になり、
> Expo Go から Development Build に移行した**（[adr/006](../adr/006_handsfree_launch_mechanism.md)）。
> **Expo Goでは動かない**（`VOICE_COMMAND` のintent-filterはネイティブのマニフェストにあり、
> Expo Goのランタイムには反映されない）。

## 動かす

**初回のセットアップ（Android SDK・JDK・APIキーの取り出し）は
[SETUP.md](SETUP.md)。** 2回目以降はこれだけ:

```sh
cd App
npx expo start          # 開発サーバー（Metro）を起動
```

⚠️ **`expo start` は対話型なので、自分のターミナルで動かすこと。**
実機のアプリ（アイコン名「app」）を開くと自動で繋がる。

⚠️ **実機にアプリが入っていない／ネイティブを変えたときは
[SETUP.md](SETUP.md) の手順が要る。**

## 試す

1. 位置情報の許可を出す（初回にダイアログが出る）
2. 緯度・経度が表示されるのを待つ
3. **「🎤 押して話す」→ 質問を話す → 黙る**
   （**話し終えれば自動で送信される。** 押して止めることもできる。
   文字で試すなら、下の入力欄から「質問する」）

⚠️ **最初の質問は10秒ほどかかる**（AgentCoreのコールドスタート）。2回目以降は2〜3秒。
**声の場合は文字起こしのぶんが乗る**（実測15〜20秒）。

### 声で質問する（US-2.01 / US-2.02）

**アプリは録音して送るだけ**で、文字起こしも読み上げもバックエンドが行う
（[docs/01](../docs/01_architecture.md) §7）。**回答は自動で読み上げられる。**

- 初回はマイクの許可を求められる
- **話し終えて静かになると自動で送信される**（無音検知。既定は3秒）
- ⚠️ **止め忘れても30秒で自動送信される。** 走行中は押し忘れやすく、
  放っておくと上限に達して**質問ごと失われる**ため
- ⚠️ **周囲がうるさいと「聞き取れませんでした」と読み上げて捨てる。**
  騒音だけの録音を送っても意味不明な回答が返るため（閾値は設定画面で変えられる）
- ⚠️ **文字で質問しても音声は返る**（走行中は画面を見られないため）
- 📌 **回答が読み上げられないことがある。** 音声合成に失敗した場合で、
  **回答自体は画面に出る**（読めれば用は足りるので、エラーにはしない）

### インカムのボタンで使う（US-2.04・ハンズフリー）

**画面に触れずに一巡する。** インカムのボタン → 起動 → 録音 → 自動送信 → 読み上げ
→ **マップアプリへ復帰**（[adr/006](../adr/006_handsfree_launch_mechanism.md)・
[adr/007](../adr/007_return_to_map_after_answer.md)）。

- ⚠️ **端末の「デジタルアシスタント」に本アプリを選んでおくこと**（初回だけ）
- ⚠️ **設定画面で「応答後に戻るアプリ」を選んでおくこと。**
  **既定は「戻らない」**なので、選ばないとマップに戻らない
  （未設定なら画面の「設定」リンクにその旨が出る）
- 📌 **戻るのは回答が届いた時点**で、**読み上げは戻ったあとに背面で鳴る**
- ⚠️ **走行中の閾値はまだ詰めていない**（停車中は確認済み）。
  設定画面の「いまの音量を測る」でエンジンをかけたまま当たりを付けられる

> 📌 **進行方位（矢印）は走らないと出ない。** 停車中・転回直後は「まだ出せません」が正常
> （5m以上動いた直近の点が必要）。詳細は [docs/01b](../docs/01b_heading.md)。

## ネイティブコードを変更したら再ビルドが要る

JS/TS だけの変更は `npx expo start` を起動していればそのまま反映される。
**`app.json` の `plugins`/`permissions`、`App/plugins/` 配下、`App/modules/` 配下、
`android/` を直接触るような変更は再ビルドが必要**:

```sh
npx expo prebuild --platform android --clean   # android/ を作り直す
npx expo run:android                           # ビルドしてインストール
```

⚠️ **`android/` は生成物。** 直接編集しても `prebuild --clean` で消える。

## ⚠️ 変更したらバージョンを上げる

**`app.json` の `version` を必ず上げる。** 画面左上に表示され、
**更新が反映されたかの判別に使う**（キャッシュが残ることがあるため）。
上げ忘れると「直したのに変わらない」の原因が分からなくなる。

## 構成

```
App/
  app.json              Expoの設定（⚠️ version を上げる）
  .env                  APIのURL（gitignore。⚠️ キーは入れない）
  plugins/
    withVoiceInteraction.js  ネイティブの生成物への差し込み（Expo config plugin）
                             ・VOICE_COMMAND の intent-filter（ハンズフリー起動）
                             ・MainActivity.kt を丸ごと生成
                             ・<queries>（戻り先アプリの一覧に必要）
  modules/
    app-foreground/     自前のネイティブ機能（Expo Modules API・autolink）
                        応答後にマップアプリを前面へ戻す
  android/              ⚠️ 生成物（gitignore）。手で編集しない
  src/
    app/                画面（expo-router。ファイル名がURLになる）
      _layout.tsx       全画面の外枠
      index.tsx         メイン（位置・方位・質問・回答・録音）
      settings.tsx      APIキー／無音検知の閾値／応答後に戻るアプリ
    api/
      apiKey.ts         キーの保管（expo-secure-store）
      voice.ts          録音設定・音声モード・無音検知の判定・送信
      vadSettings.ts    無音検知の閾値の保管（AsyncStorage）
      returnApp.ts      応答後に戻るアプリの保管（AsyncStorage）
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
