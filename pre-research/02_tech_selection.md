# 技術選定：Web か Android ネイティブか

## 0. このドキュメントの目的

[構想概要](./01_overview.md)を実現するにあたり、
**Webアプリ（PWA）で作れるのか、ネイティブ相当が必要なのか**を判断し、
ネイティブの場合は **どのフレームワーク・どのウェイクワードエンジンを使うか**、
さらに **開発環境（Claude Code 活用・Android Studio 習熟の要否）**まで検討する。

開発者のスキルは AWS・Vue・Lambda に厚く、Androidネイティブの知見はない。
また **Android Studio に不慣れで、Claude Code を使った開発を重視**している（§6で扱う）。
そのため「Webで済むならWebが最短」という前提で検証を始めたが、
**利用シーンの制約（バックグラウンド常駐＋完全ハンズフリー起動が必須）によりWebは却下**となった（§1〜§3参照）。

## 1. 結論（先出し）

**Web(PWA)は却下。ネイティブ相当（Flutter / React Native / Kotlin のいずれか）で実装する。**

理由は、実利用時の以下の制約により **バックグラウンド常駐＋完全ハンズフリーのウェイクワード常時待機が絶対条件**になったため。

- **ナビアプリを前面に出して走行する** → 本アプリは常にバックグラウンドで動く必要がある（前面前提の妥協策は不可）。
- **イヤホンのキーも画面タップも押せない**（ヘルメット装着・グローブ・運転集中） → 物理トリガーによる起動の妥協も不可。

この2条件は、**OSレベルでバックグラウンドのマイク常時待機（Android の Foreground Service ＋マイク常時アクセス）を要求する**。
これはモバイルブラウザでは原理的に不可能なため、Web(PWA)は選択肢から外れる。

一方で **位置・進行方向・STT・TTS はWeb/ネイティブどちらでも実現可能**であり、
ネイティブを選ぶ理由は「ウェイクワードのバックグラウンド常駐」ただ一点に尽きる。

なお **「ネイティブ = Kotlin」とは限らない**。ウェイクワードのバックグラウンド常駐は
Flutter / React Native でもプラグイン経由で満たせるため、**開発者の既存スキル（Vue/JS/AWS）を最大限活かせる選択肢を採るべき**。
→ 詳細は [§5 ネイティブ実装フレームワークの比較](#5-ネイティブ実装フレームワークの比較flutter--react-native--kotlin) を参照。

## 2. 要件ごとの実現可否

| 要件 | Web (PWA / Android Chrome) | Android ネイティブ | 論点 |
|---|---|---|---|
| 位置情報（緯度経度） | ✅ Geolocation API | ✅ | 差はない |
| **進行方向（2点間から算出）** | ✅ 可能 | ✅ | 走行中なら位置の時系列差分で方位を計算できる。Webで問題なし |
| 磁気コンパス方位（停車時） | △ DeviceOrientation | ✅ センサーAPIが素直 | 走行中はGPS方位で足りるので必須ではない |
| 音声入力 STT | △ 不安定（後述） | ✅ 安定 | **走行中は録音→サーバーSTTが堅牢**。ブラウザ内蔵STTは信頼性が低い |
| 音声出力 TTS | ✅ 可能 | ✅ | Web Speech API か Amazon Polly 再生 |
| **ウェイクワード常時待機** | ❌ 実用困難（最大の弱点） | ✅ フォアグラウンドサービスで可 | **これが最大の分岐点** |
| 画面ロック／スリープ中の継続動作 | ❌ 弱点 | ✅ | Webは Wake Lock で「画面を消さない」ことしかできない |
| バックグラウンド動作 | ❌ 制約大 | ✅ Foreground Service | 他アプリ（地図等）に切り替えると停止しがち |

## 3. 最大の論点：ウェイクワード（完全ハンズフリー起動）

### Webの制約（2026年時点の調査結果）

- **モバイルブラウザで「常時マイクON」は根本的に困難。** ブラウザはバッテリー・プライバシー保護のため、
  バックグラウンドや画面ロック中のマイク常時利用を強く制限する。
- Android Chrome の Web Speech API は、**マイクをONにしても数秒（2秒程度）で勝手に停止する**という既知の不安定さがある。
- **PWA化すると Speech Recognition がさらに制約を受ける**報告もある（特にiOS。Androidでも実装依存）。
- ブラウザ内ウェイクワード検出自体は、Picovoice(Porcupine) などの **WASM + Web Audio API + Web Worker** で技術的には可能。
  ただしこれも「タブが前面／画面点灯」が前提で、**ロック中・バックグラウンドでの安定動作は保証されない**。

→ 結論：**「ヘルメットを被って画面も触らず、呼びかけだけで起動」という体験は、Webでは安定して作れない。**

### ネイティブの優位

- Android の **Foreground Service**（前面サービス）＋常駐通知により、画面ロック中もマイク処理を継続できる。
- Picovoice Porcupine 等のオンデバイス・ウェイクワードエンジンをネイティブSDKで安定動作させられる。
- これは Alexa / Google アシスタントと同じ土俵の実装であり、**完全ハンズフリーを本気でやるならネイティブが正攻法**。

### 検討したがWebでは不成立だった妥協案（記録）

当初は完全ハンズフリーを一段緩めてWebで成立させる案も検討したが、**いずれも本ユースケースの制約で不成立**だった。判断の経緯として記録に残す。

1. **画面点灯を維持（Wake Lock API）＋ アプリを常に前面**
   - → ✕ **ナビアプリを前面に出すため、本アプリを前面に固定できない。**
2. **起動トリガーを「1回だけの物理操作」に寄せる（イヤホン／インカムのボタン）**
   - → ✕ **グローブ・ヘルメット・運転集中により物理ボタンは押せない。**
3. **アプリ前面を条件にブラウザ内ウェイクワード検出（Porcupine WASM）**
   - → ✕ 前提の「アプリ前面・画面点灯」自体が満たせない。

→ よってWeb路線は完全に却下し、以降はネイティブ相当の実装を前提に検討する。

## 4. STT/TTS の実装方針

走行中の風切り音・エンジン音の環境では、端末内蔵STTだけに頼るのは精度面で不安がある。
そのため **音声はアプリ側でキャプチャし、認識・応答生成・合成はサーバー側（AWS）で処理**する構成を基本とする。

- STT: キャプチャ音声を Amazon Transcribe もしくは Bedrock 対応の音声認識へ送る
- 応答生成: 現在地・進行方位を文脈に含めて Amazon Bedrock（LLM）で生成
- TTS: Amazon Polly で音声合成し、アプリで再生（イヤホンへ）

**ウェイクワード検出だけはオンデバイス**（後述の Porcupine 等）で行い、
「常時サーバーへ音声を送り続ける」ことは避ける（プライバシー・通信量・バッテリーの観点）。
ウェイクワード検知後の一発話ぶんだけをサーバーへ送る流れとする。

## 5. ネイティブ実装フレームワークの比較（Flutter / React Native / Kotlin）

「ネイティブ相当」の中でどれを選ぶか。3択とも **Foreground Service によるバックグラウンド常駐と
Porcupine ウェイクワード検出はプラグイン/SDKで実現可能**。技術的な実現性では差がつかないため、
**判断軸は「既存のWeb開発知識（JS/TS）を活かせるか」と「本アプリのネイティブ要件との相性」**に置く。

### 技術・実装観点の比較

| 観点 | Flutter | React Native | Kotlin（純ネイティブ） |
|---|---|---|---|
| 言語 | Dart（新規学習） | **JS / TypeScript（既存スキル直結）** | Kotlin（新規学習） |
| 既存スキル活用（Vue/JS/AWS） | △ UIは宣言的でVue感覚に近い | ◎ JS/npm/型がそのまま活きる | ✕ |
| Foreground Service 常駐 | ◎ プラグイン（flutter_foreground_task 等） | ◎ プラグイン（notifee / headless JS 等） | ◎ OS標準・最も素直 |
| Porcupine ウェイクワード | ◎ 公式Flutter SDK | ◎ 公式React Native SDK | ◎ 公式Android SDK |
| バックグラウンド音声の安定性 | ◎ | ○（ネイティブモジュール寄りの調整が要る場合あり） | ◎ 最も確実 |
| 位置・方位・センサー | ◎ プラグイン | ◎ プラグイン | ◎ 標準API |
| 将来のPlay配布・OS深連携 | ○ | ○ | ◎ |

### 決定：React Native を採用（確定）

**判断軸として「既存のWeb開発知識（JS/TS・Vue・npmエコシステム）を活かせること」を最重視し、React Native を採用する。**

本プロジェクトは **開発を進めながら学習する** 方針（後述）であり、
**既存スキルの地続きで学習曲線を緩やかにできる**ことが実利用上の最大の価値と判断した。

#### 判断の根拠

| | React Native（採用） | Flutter | Kotlin（純ネイティブ） |
|---|---|---|---|
| 既存スキルの活用 | **JS/TS・Reactの考え方が直結** | Dartの新規学習が必要 | Kotlin＋Androidネイティブ概念の新規学習 |
| 技術 | 既存スキルで最短着手 | バックグラウンド音声の安定性評価が高い | 常駐・センサー・Porcupineが最も素直で確実 |
| 開発環境 | Expo経由なら入口の摩擦が最小（§6） | `flutter doctor`／IDE統合が優秀（§6） | Android Studioが公式一級（§6） |
| リスク | バックグラウンド音声にネイティブ調整が要る場合あり | Dartの新規学習 | Kotlin＋Androidネイティブ概念の学習（範囲最大） |

- **決め手（React Native採用理由）**:
  - **既存のWeb開発知識が最も直接的に活きる。** JS/TS・npm・型・Reactの考え方（宣言的UI・コンポーネント）が地続きで、学習教材としての足がかりが良い。
  - React(Web)圏という広く使われている技術基盤に接続でき、学んだ知識の応用範囲が広い。
  - Expo経由なら開発の入口の摩擦も最小。
- **採用しなかった選択肢の位置づけ（切り捨てではなく保留）**:
  - **Flutter / Kotlin も合理的な選択肢**だった。特に **Kotlin は本アプリのネイティブ要件（Foreground Service常駐＋オンデバイスのウェイクワード）に対して最も素直・確実**という技術的な筋の良さがある。
  - よって **RNで唯一の技術的リスク（バックグラウンド音声の安定性）がPoCで破綻した場合は、Kotlinネイティブへの切り替えを再検討する**（§8）。この一点だけは判断を留保する。

> 開発者個人のキャリア観点（求人数・年収・転職市場）での検討は別途分離して管理している（非公開）。本ドキュメントでは技術・スキル観点の判断根拠のみを扱う。

#### 残る技術的リスクと対処

- **唯一のリスクは「RNでのバックグラウンド常駐＋ウェイクワードの安定性」。** RN/Expoはブリッジ越しにネイティブ機能を使うため、
  常時マイク＋Foreground Serviceの安定動作にネイティブ側の調整が要る場合がある。
- → **PoCで最優先に実機検証**する。破綻するようなら Kotlinネイティブ（最も確実）へ再検討する。ただし判断は保留せず、**まずRNで進める**。

> 補足：**Kotlin Multiplatform (KMP)** は2026年に台頭中の第4の選択肢（ロジック共有＋UIは各OSネイティブ）。
> 将来iOS展開を見据えるなら候補になるが、当面Android単一なら過剰。現時点では参考にとどめる。

## 6. 開発環境・ツールチェーンの比較（Claude Code / Android Studio）

開発者は **Claude Code を使った開発を重視**しており、**Android Studio には不慣れだが、その使用を否定はしていない**（最小限の習得は許容）。
この観点はフレームワーク選定の実質的な要素になり得るため、独立した節として RN / Flutter / Kotlin の3者で検討する。

### 6.1 Claude Code との相性 → 3者とも良好（差はつかない）

- Claude Code はターミナルで動くエージェント型ツールで、コードベース全体を読み、
  ファイル作成・テスト実行・エラー修正・コミットまで多段で自動実行できる。
- **2026年時点で RN・Flutter は Claude Code 活用の事例・専用エージェント/ベストプラクティスが特に充実。**
  - Flutter: Claude Codeで開発時間を40〜60%短縮という報告あり。
  - React Native/Expo: Claude Code v2向けの production エージェント群（アクセシビリティ・設計・セキュリティ・テスト自動化）が公開されている。
- **Kotlin/Android も Claude Code で開発可能。** Kotlin/Java は学習データが豊富でLLMの生成品質は高く、
  Gradle・Android SDK のコマンドも Claude Code に実行させられる。RN/Flutterほど"専用エージェント"の作例は目立たないが、実開発上の不利は小さい。
- **成否を分けるのはプロンプトより「事前のプロジェクト定義（CLAUDE.md 等の設定）」**という点は3者共通。
- → **この軸では優劣がつかない。** いずれを選んでも Claude Code 中心の開発は可能。

### 6.2 Android Studio / ネイティブ環境の必要度

「Android Studio に**習熟**せずに開発・ビルド・実機確認まで回せるか」を、入口の摩擦として比較する。
※ Android Studio は否定対象ではなく、「使いこなし」不要で **エミュレータ起動とビルドの入れ物**として最小限使えれば足りる、という前提で読むこと。

| 項目 | React Native + Expo | Flutter | Kotlin（純ネイティブ） |
|---|---|---|---|
| 環境診断ツール | Expo CLI | `flutter doctor`（環境を数秒で自己診断・優秀） | Android Studio が導入を自動化 |
| 実機プレビュー | Expo Go で最初は Android Studio 不要 | エミュレータ or 実機（Android SDK 必要） | エミュレータ or 実機（Android SDK 必要） |
| Android Studio との距離 | 最初は遠い（が本アプリでは近づく／6.3） | `flutter doctor`が導く。IDE統合は一級 | **公式一級**。最も素直で情報も最多 |
| ネイティブ層のデバッグ | ブリッジ越しで切り分けが要る場面あり | 同左 | **単層で最も追いやすい** |
| 学習の広さ | JS既存＋Expo/RN流儀 | Dart＋Flutter流儀 | Kotlin言語＋Androidネイティブ概念（最も広い） |

- **Expo（現在のReact Native公式推奨）**は、標準構成なら最初は Android Studio なしで実機プレビューでき、**入口の摩擦が最小**。
- **Flutter** は `flutter doctor` で環境構築の"迷子"を減らせる（優秀）。IDE統合の完成度が高い。
- **Kotlin** は Android Studio が公式一級で、導入ウィザード・情報量・デバッグのしやすさは最も充実。**入口の摩擦は Android Studio に慣れるコストとほぼ同義**であり、そこを許容できるなら不利は小さい。

### 6.3 本アプリ固有の論点：結局どの道もネイティブ環境に踏み込む

本アプリの中核要件は **カスタムネイティブ機能**を含む。

- **Porcupine ウェイクワード**（ネイティブSDK）
- **Foreground Service によるバックグラウンド常時マイク**（ネイティブのバックグラウンド処理）

- **Expo** の場合: これらは「Development Build（config plugin でネイティブを組み込む）」が必要になり、
  **その時点で Android のネイティブビルド環境（Android SDK 等）に踏み込む**。「Expoだから Android Studio を一切触らない」は本アプリでは成立しにくい。
- **Flutter** の場合: 同様にプラグイン＋ネイティブ設定に踏み込む。
- **Kotlin** の場合: **最初からネイティブなので"踏み込む"という段差がなく、むしろ一直線**。ブリッジ経由の不確実性がない分、これらの要件は最も素直・確実に実装できる。

→ **「ネイティブに触れる必要がある」のは3者共通の宿命**だが、
**その要件に対して最も摩擦なく確実なのはKotlin**である、という点は本アプリでは無視できない利点。
一方で Kotlin は **学習範囲が最も広い**（言語＋ネイティブ概念）というコストを伴う。

### 6.4 開発環境観点のまとめ

- **Claude Code 活用**: 3者とも良好で**差なし**。いずれでもClaude Code中心開発は可能。
- **入口の摩擦（最初の一歩）**: Expo(RN) が最小。Flutter は `flutter doctor` で親切。Kotlin は Android Studio 習得が入口だが、それを許容するなら以降は素直。
- **本アプリのネイティブ要件との相性**: **Kotlin が最も確実**（段差なし）。RN/Flutter はブリッジ越しで調整が要る場合がある。
- → **開発環境の軸でも単独の決定打はない。** 重視点で向きが変わる:
  - 「最初の摩擦を最小化」重視 → **Expo(RN)**
  - 「環境診断・IDE統合の完成度」重視 → **Flutter**
  - 「ネイティブ要件を最も確実に・Android Studioも許容」重視 → **Kotlin**

> Android Studio は「使いこなす」必要はなく、エミュレータ起動とビルドの入れ物として最小限使えれば足りる場面が多い。
> 環境構築コマンドも Claude Code に実行させながら進められるため、**GUIとしてのAndroid Studioへの深い習熟が必須というわけではない**点は、3者すべてに当てはまる安心材料。

## 7. ウェイクワード検出エンジンの比較

| 方式 | 内容 | 長所 | 短所 |
|---|---|---|---|
| **Picovoice Porcupine** | オンデバイスのキーワード検出エンジン | 高精度・低リソース・オフライン動作。**個人利用は無料枠（月間アクティブ3ユーザーまで、商用含む）**。カスタムウェイクワードを作成でき、Flutter/RN/Android全対応 | 商用スケール時は有償。モデル鍵の管理が要る |
| **OSの音声アシスタント連携（"OK Google"経由）** | Googleアシスタント → App Actions等で自アプリを呼ぶ | 自前でウェイクワード実装が不要。常時待機はOSが担う | 対話の自由度・体験の一貫性に制約。**「呼びかけ→そのまま自然に質問」という一体験にしづらい**。設定・機種依存が大きい |
| （参考）Cobra VAD 等の併用 | 発話区間検出でウェイクワード後の録音を制御 | 無音で自動的に区切れる | あくまで補助 |

### 評価コメント

- **Porcupine が第一候補。** 「独自の呼びかけワード → そのまま質問 → 音声で回答」という
  一体化した体験を作りやすく、自分用（3ユーザー以内）なら**無料で完結**する。
- OSアシスタント連携は「自前実装ゼロ」が魅力だが、**対話体験の一貫性を犠牲にする**ため、
  本アプリの「走りながら自然に会話」という価値とは相性が悪い。将来の補助的導線として保留。

## 8. 未決事項・次に検討すること

- [x] 実装フレームワークの決定 → **React Native に確定**（既存Web開発知識の活用を最重視。§5参照）
- [ ] RNでの「バックグラウンド常駐＋ウェイクワード検知→録音→AWS送信」の走行環境での安定性検証（**唯一の技術的リスク**。破綻時はKotlinネイティブへ再検討）
- [ ] 走行中GPSの2点間方位の精度・更新頻度（低速時／停車時の扱い）
- [ ] 走行騒音下でのウェイクワード誤検知率・STT精度（実機テスト）
- [ ] Foreground Service 常駐時のバッテリー消費の実測
- [ ] 開発環境の実地確認：Expoの Development Build（config plugin）でPorcupine＋Foreground Serviceが組めるか／Android SDK導入の手間の実測（§6.3）
- [ ] Claude Code 前提のプロジェクト設定（CLAUDE.md）の整備方針
- [ ] アーキテクチャ設計ドキュメントの作成（RN/Flutter → API Gateway → Lambda → Bedrock/Transcribe/Polly）

## 参考（2026年時点の調査）

### ウェイクワード・音声
- [Picovoice Launches Completely Free Usage Tier — for Up to Three Users (Hackster.io)](https://www.hackster.io/news/picovoice-launches-completely-free-usage-tier-for-offline-voice-recognition-for-up-to-three-users-e1eafbc97bb0)
- [Porcupine Wake Word SDK Introduction - Picovoice Docs](https://picovoice.ai/docs/porcupine/)
- [React Native Wake Word Detection in 2026 - Picovoice](https://picovoice.ai/blog/react-native-wake-word/)
- [Some Thoughts After Trying Wake-Word Detection in the Browser (Medium, 2026)](https://medium.com/@chloezhuqy/some-thoughts-after-trying-wake-word-detection-in-the-browser-48d76ed71a63)
- [Web speech API not working in Chrome browser on Android device (mdn/browser-compat-data #25794)](https://github.com/mdn/browser-compat-data/issues/25794)
- [Web Speech API - MDN](https://developer.mozilla.org/docs/Web/API/Web_Speech_API)

### 開発環境・ツールチェーン
- [How to Use Claude Code to Build Flutter Apps Faster (freeCodeCamp, 2026)](https://www.freecodecamp.org/news/how-to-use-claude-code-to-build-flutter-apps-faster-best-practices/)
- [Claude Code for React Native: Complete Setup Guide (2026)](https://aimobilelauncher.com/blog/claude-code-react-native-guide)
- [claude-code-reactnative-expo-agent-system (GitHub)](https://github.com/senaiverse/claude-code-reactnative-expo-agent-system)
- [React Native vs Flutter vs Expo vs Lynx (2026 Comparison, groovyweb)](https://www.groovyweb.co/blog/react-native-vs-flutter-vs-expo-vs-lynx-2026)
- [Flutter vs Expo: Which Cross-Platform Framework (mobiloud)](https://www.mobiloud.com/blog/flutter-vs-expo)

### フレームワークの技術動向
- [Cross-Platform App Development in 2026 (Medium) — KMPの位置づけ](https://medium.com/@mohamadakshan007/cross-platform-app-development-in-2026-187dac0d7c9a)

> 開発者個人のキャリア観点（求人数・年収・転職市場）の参考リンクは、非公開の別ファイルに分離して管理している。

- [Offline Voice Recognition in a Web Browser - Picovoice](https://picovoice.ai/blog/offline-voice-ai-in-a-web-browser/)
- [The Screen Wake Lock API (dev.to)](https://dev.to/mikeesto/the-screen-wake-lock-api-51hp)
- [Web Speech API - MDN](https://developer.mozilla.org/docs/Web/API/Web_Speech_API)
