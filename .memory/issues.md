# Issues — 論点（決めないといけないこと）

判断が要る論点だけを置く（やることが明確な作業は [todo.md](todo.md)）。決めたら「決着した論点」へ移す。
1行1文。経緯は書かず、何を決めるか／何を決めたかと参照先だけ。

| 優先度 | 意味 |
|---|---|
| 高 | 放置すると先の作業が手戻りになる |
| 中 | いずれ決める。今は動いているので急がない |
| 低 | 後回しでよい |

## 未決の論点

| 優先度 | 論点 | 何を決めるか | 参照 |
|---|---|---|---|
| 高 | インカムで録るときの録音条件 | `voice_communication` を捨ててよいか（インカムの CVC で足りるか・エコーが出ないか）と、その後の録音条件・送信サイズを走行で測って決める | App `adr/005`・research `mic-routing/` |
| 中 | 文字起こしが遅いときの対策 | バッチの Transcribe が1件だけ約2分半かかり（通常は約7秒）、App が80秒で打ち切った。待つ上限を延ばすか、ストリーミングの文字起こしに替えるか | `Backend/docs/01_architecture.md` |
| 低 | 現在地を個人情報としてどう扱うか | CloudWatch に残る座標と住所（Backend 側のログは未確認）の保存方針。メモ機能を作るなら必須 | research `geocoding/` §7 |
| 低 | `App/SETUP.md` を分けるか | 421行で目安の300行を超える。「Play に出すビルド」の節を別ファイルにするか | `App/SETUP.md` |

## 決着した論点

| 決定日 | 論点 | 結論 | 参照 |
|---|---|---|---|
| 2026-10-09 | Agent に Amazon Location の権限をどう足すか | `cdk/lib/cdk-stack.ts` に実行ロールの権限を数行足す（`cdk/` を触らない規約の唯一の例外） | `Agent/AGENTS.md`・`Agent/docs/01_architecture.md` §7 |
| 2026-10-09 | 周辺検索をどう作るか | Agent の `@tool` 2つ（種類で探す・名前で探す）。座標はペイロードの `location` から読み、距離・方角・左右はコードで計算する | `Agent/docs/01_architecture.md` §4・契約 UC-5 |
| 2026-10-09 | Amazon Location をどこまで使うか | `ReverseGeocode`（Backend・毎回）と `SearchNearby`・`SearchText`（Agent・ツール）だけ。経路・地図は使わない。道路名は1点では決まらないので保留 | research `geocoding/FINDINGS.md` |
| 2026-09-26 | ドキュメントの構成 | ユニットごとに docs・adr・AGENTS.md を持ち、親の docs は `docs-parent/` として写し、learning・research は submodule にする | `adr/008` |
| 2026-09-26 | App の `version` を上げる条件 | ビルドが変わる変更のときだけ上げる（ドキュメントだけの変更では上げない） | `App/AGENTS.md` |
| 2026-09-26 | Play への配信の自動化 | `v*` タグの push で GitHub Actions がビルド・署名し、r0adkll（SHA 固定）で内部テストへ上げる | App `adr/004` |
| 2026-09-26 | App の型生成の元 | 親の docs の写し（`docs-parent/04_api_openapi.yaml`）から生成し、App を単体でクローンしても動くようにする | `adr/008` |
| 2026-09-26 | インカムの経路の張り方 | `startVoiceRecognition()` で「音声認識」として張り、仮想通話は使わない | App `adr/005` |
| 2026-09-26 | エージェントに渡す現在日時 | 日付と時刻（分まで・日本時間）を毎回渡す | `docs/03_units_contracts.md` UC-5 |
| 2026-09-25 | リポジトリを分けるか | 分けて submodule で束ね、CICD だけ private にする | `adr/007` |
| 2026-09-22 | インカムのマイクの使い方 | 経路だけ自前のモジュールで張り、録音は `expo-audio` のまま | App `adr/005` |
| 2026-09-10 | Play で配るためのビルド構成 | `versionCode` は `version` から導出、配信用だけ全 ABI、upload key は手元とCIの secrets | App `adr/004` |
| 2026-09-10 | 限られた人に配る手段 | Google Play の内部テスト（本番公開はしない） | App `adr/004` |
| 2026-09-09 | 走行中の終話の判定 | インカムのボタン再押しと録音の上限の併用（音量の無音検知は廃止） | App `adr/003` |
| 2026-08-22 | 単体ビルドを release／debug のどちらにするか | release（`console.log` は出る） | `App/docs/02_build_and_release.md` |
| 2026-08-21 | 応答後にナビへ戻す方法 | 設定で選んだアプリを LAUNCHER インテントで開く | App `adr/002` |
| 2026-08-18 | 応答後にナビへ自動で戻すか | 戻す（回答が届いた時点で戻り、読み上げは背面で続ける） | App `adr/002` |
| 2026-08-18 | 録音の終了をどうハンズフリーにするか | 音量の無音検知を採った（2026-09-09 に覆り、ボタン再押しと上限の併用になった） | App `adr/003` |
| 2026-08-17 | ハンズフリー起動の方式 | `VOICE_COMMAND` を `MainActivity` の intent-filter で受ける（`VoiceInteractionService` は不成立） | App `adr/001` |
| 2026-08-16 | ハンズフリー起動の方式（当初案） | 既定のアシスタントになる方式を採った（2026-08-17 に実機で不成立となり覆った） | App `adr/001` |
| 2026-08-16 | STT がアプリ側になった分の悪用対策 | 前提が消えた（STT は Lambda が呼ぶので、録音の長さを手前で弾ける） | `adr/003` |
| 2026-08-16 | 音声の送り方・返し方・形式 | `POST /ask-audio` で受けて S3 に置き、回答は署名付き URL、形式は M4A | `adr/003` |
| 2026-08-15 | API の認証方式 | API キー＋Usage Plan（IP 制限は使わない） | `adr/005` |
| 2026-08-13 | 29秒の上限をどう外すか | SQS＋DynamoDB＋ポーリングで非同期にする | `adr/004` |
| 2026-08-13 | 進行方位をどこで算出するか | Backend が算出し、2点目は App が履歴から選ぶ | `Backend/docs/03_heading.md` |
| 2026-08-13 | 会話中にどの時点の位置を参照するか | AI に判断させ、手がかりに経過時間を渡す | `Backend/docs/03_heading.md` |
| 2026-08-12 | 座標から住所をどこで解決するか | Backend で毎回付ける（ツールにしない） | `Backend/docs/01_architecture.md` |
| 2026-08-12 | Lambda を挟むか | 挟む（門番であり、LLM に渡す前に事実を確定させる場所） | `adr/002` |
| 2026-08-12 | 音声の実現方式 | 手前で STT（Nova 2 Sonic は日本語非対応） | `adr/003` |
| 2026-08-12 | 初回10秒前後の遅さを許容するか | 許容する（コールドスタートでアプリ側では縮められない） | `docs/01_technical_policies.md` |
| 2026-07-30 | AgentCore Memory を使うか | 使わない（要件は一問一答＋α） | `adr/002` |
