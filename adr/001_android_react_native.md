# 001. Web(PWA) を却下し、Android ＋ React Native (Expo) で作る

- **日付**: 2026-07-23（最終更新 2026-09-27）
- **ステータス**: 採用

## 背景

走行中のライダーが、画面を見ず手も使わずに AI と対話するアプリを作る（[docs/00_user_stories.md](../docs/00_user_stories.md)）。
ナビアプリを前面に出して走るので、本アプリは背面で待ち、インカムの操作で呼び出される必要がある。

開発者は AWS・Vue・Lambda（JS/TS）の経験があり、モバイルは未経験。
開発を進めながら学ぶ方針で、Claude Code を中心に開発する。

## 選択肢

### Web か、ネイティブ相当か

| 案 | 判断 |
|---|---|
| A. Web(PWA) | 却下。位置・STT・TTS は Web でも可能だが、背面での待機と、インカムからの起動（Android の Intent を受けること）がブラウザではできない。Wake Lock で画面を点け続け、アプリを前面に固定する妥協案も、ナビを前面に出す使い方と両立しない |
| **B. ネイティブ相当（Android アプリ）** | 採用 |

当初はウェイクワード（Porcupine 等）の常時待機をネイティブにする理由に挙げていたが、ウェイクワードは後に却下した（常時マイクを占有するため。App の [adr/001](https://github.com/h-akira/TouringProject_App/blob/main/adr/001_handsfree_launch_mechanism.md)）。
起動はインカムのボタンが発行する `VOICE_COMMAND` を受ける形になり、これも Activity の intent-filter が要るので、ネイティブ相当が要るという結論は変わらない。

### フレームワーク

| 案 | 判断 |
|---|---|
| **C. React Native (Expo)** | 採用。JS/TS・npm・React の考え方が既存の Web の知識と地続きで、学習の足がかりがよい。Expo なら開発の入口の摩擦も小さい |
| D. Flutter | 却下。Dart を新たに学ぶ必要がある。環境診断や IDE 統合は優秀 |
| E. Kotlin（純ネイティブ） | 却下。常駐やセンサーは最も素直だが、Kotlin と Android の概念を全て新たに学ぶことになり、範囲が最も広い |
| F. Kotlin Multiplatform | 却下。iOS を見据えるなら候補だが、Android だけなら過剰 |

Claude Code との相性はどれも良好で差がつかなかった。

### 対象 OS

Android だけにする（iOS はやらない。[docs/00_user_stories.md](../docs/00_user_stories.md) §5）。開発者の端末が Android で、インカムの Intent を受ける仕組みも Android のもの。

## 決定

Android 向けに React Native (Expo) で作る。
ネイティブの機能（Intent の受け取り・Bluetooth の経路）は Expo の config plugin と自前のモジュールで足すので、Expo Go ではなく Development Build を使う。

## 影響

- ネイティブの変更は再ビルドが要る（JS/TS の変更は Metro で反映される）。
- React Native の唯一のリスクは「背面での待機とハンズフリー起動が成立するか」だった。これはインカムのボタンによる起動で実機で成立した（App の adr/001）。成立しなければ Kotlin に切り替えるつもりだった。
- STT・TTS・回答の生成はサーバー側（AWS）で行う（[003](003_speech_pipeline.md)）。App は録音・再生・位置取得・起動の経路だけを持つ薄いクライアントになる。
