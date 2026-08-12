# 音声の実現方式（US-2.01 / US-2.02）

> 実施日: 2026-08-12 / 前提: [../../docs/00_user_stories.md](../../docs/00_user_stories.md)（走行中は手も目も使えない）、
> [../agentcore/AUTH.md](../agentcore/AUTH.md)（Lambdaの要否）、[../websearch/](../websearch/)（既に成立しているWeb検索）
>
> **問い**: 音声をどう実現するか。3案あり、選択次第で構成（Lambdaの要否・認証）が変わる。

## 結論（先に要点）

**方式1（手前でSTT）を採用する。** 理由は技術的な優劣ではなく、**Nova 2 Sonic が日本語に対応していないため**。

| 論点 | 結果 |
|---|---|
| Strandsが Nova 2 Sonic を扱えるか | ✅ **扱える**（`strands-agents[bidi]` に専用実装あり。§2） |
| Nova 2 Sonic でツール（Web検索）を使えるか | ✅ **使える** |
| **Nova 2 Sonic は日本語を話せるか** | ❌ **話せない。これが決定的**（§1） |
| Transcribe / Polly は日本語に対応するか | ✅ **対応する**（実測。§3） |

> ⚠️ **技術的には方式3（Nova 2 Sonic）が最良だった。** 実装はライブラリが引き受けてくれるし、
> 遅延も最小で会話も最も自然になる。**採用できないのは日本語非対応という一点のみ。**
> 将来日本語が追加されれば、**方式3は再検討に値する**（§5）。

## 1. ❌ 決定的な理由：Nova 2 Sonic は日本語に対応していない

**このアプリは日本語が必須**（システムプロンプトも回答ルールも日本語、日本の地名を聞き取る）。
英語で使うことは不可能なので、ここが選定の分岐点になった。

[Language support and multilingual capabilities](https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-language-support.html)
（Nova 2 Sonic の**音声一覧の正本**）より、**対応するのは以下の10ロケールのみ**:

| 言語 | ロケール |
|---|---|
| English | en-US / en-GB / en-AU / en-IN |
| French | fr-FR |
| Italian | it-IT |
| German | de-DE |
| Spanish (US) | es-US |
| Portuguese | pt-BR |
| Hindi | hi-IN |

**`ja-JP` は存在しない。** 表は「すべての利用可能な音声」を列挙したものであり、抜粋ではない。

さらに同ページの polyglot（多言語を話せる音声）の説明も、**7言語を明示的に列挙して日本語を含まない**:

> The TIFFANY (en-US, female) and MATTHEW (en-US, male) are unique polyglot voices
> that can speak all supported languages:
> 1. English 2. French 3. Italian 4. German 5. Spanish 6. Portuguese 7. Hindi

### 「表現力のある音声だけの制約」ではないか？を検証した

**否。** 当初「対応言語の記述は expressive voice に限った話で、実際は日本語も通るのでは」と疑ったが、
**複数の一次情報が一致して日本語を除外している**ため、その線は否定された。

| 確認先 | 記述 |
|---|---|
| Nova 2 の音声一覧（上記） | 10ロケール。`ja-JP` なし |
| Nova 2 の polyglot | 7言語を列挙。日本語なし |
| [Nova 2 Sonic 概要](https://docs.aws.amazon.com/nova/latest/nova2-userguide/using-conversational-speech.html) | 対応言語として英/仏/伊/独/西/葡/ヒンディーを列挙 |
| [旧 Nova Sonic v1 の音声一覧](https://docs.aws.amazon.com/nova/latest/userguide/available-voices.html) | 英/仏/伊/独/西の5言語のみ |
| ライブラリの既定値 | `voiceId: "matthew"`（en-US） |

**音声出力（TTS側）に日本語の声が存在しない。** 仮に音声認識が日本語を拾えたとしても、
**日本語で読み上げる手段がない**ため、このアプリの要件は満たせない。

> 📌 未実測ではあるが、**実測する価値は低い**と判断した。
> 「voiceIdに日本語の選択肢が無い」ことは仕様表から確定しており、
> 試して分かるのは「英語訛りの日本語が出るか」程度で、いずれにせよ採用できない。

## 2. 参考：Strands の Nova Sonic 対応は充実していた（将来のために記録）

**日本語の問題がなければ方式3を選んでいた。** 調べた内容を将来のために残す。

`strands-agents 1.50.1` は `strands/experimental/bidi/` に**Nova Sonic 専用実装を同梱**している。

```
strands/experimental/bidi/
├── agent/agent.py          # BidiAgent（通常の Agent とは別クラス）
├── models/nova_sonic.py    # BidiNovaSonicModel
├── models/gemini_live.py   # 参考: 他プロバイダも同じ枠組み
├── models/openai_realtime.py
└── io/audio.py             # マイク/スピーカーの入出力（PyAudio）
```

```python
NOVA_SONIC_V1_MODEL_ID = "amazon.nova-sonic-v1:0"
NOVA_SONIC_V2_MODEL_ID = "amazon.nova-2-sonic-v1:0"   # 既定はこちら
```

`nova_sonic.py` の docstring より、**難所はライブラリが引き受けている**:

> - Hierarchical event sequences: connectionStart → promptStart → content streaming
> - Base64-encoded audio format with hex encoding
> - Tool execution with content containers and identifier tracking
> - 8-minute connection limits with proper cleanup sequences
> - Interruption detection through stopReason events

**ツールも使える。** `_get_prompt_start_event` が `promptStart.toolConfiguration` にツール定義を載せるため、
`BidiAgent(tools=[...])` に渡したツールはそのまま Nova に届く（Web検索を諦める必要はなかった）。

### 方式3を採る場合に効いてくる制約（記録）

| 項目 | 内容 |
|---|---|
| 呼び出しAPI | **`InvokeModelWithBidirectionalStream` のみ**。`Converse` / `Agents` は非対応 |
| Python | **3.12+ が必須**（3.12未満は `ImportError`）。依存も `python_version >= '3.12'` 条件付き |
| 依存 | `strands-agents[bidi]` → `aws-sdk-bedrock-runtime`（**boto3では双方向ストリームを扱えない**） |
| リージョン | us-east-1 / ap-northeast-1 で `ON_DEMAND`（実測） |
| 音声形式 | LPCM 16kHz / 16bit / モノラル、base64 |
| **接続上限** | **8分**。超える前に張り直し、履歴を引き継ぐ実装が要る（公式にサンプルあり） |
| **Guardrails** | ❌ **非対応**（model card）。コスト・悪用対策の層に影響 |
| 会話履歴 | ⚠️ `BidiAgent` に `conversation_manager` が**無い**。`messages` で自前管理。 |
| | Nova側の上限は 1メッセージ50KB / 合計200KB |

> ⚠️ **`SlidingWindowConversationManager` が使えない**点は見落としやすい。
> 現在の `MAX_TURNS` によるトークンコスト制御が失われる。

## 3. ✅ 方式1の前提は満たされている（実測）

| 用途 | サービス | 日本語対応 |
|---|---|---|
| STT | Amazon Transcribe | ✅ **`ja-JP` が batch と streaming の両方**（[対応言語表](https://docs.aws.amazon.com/transcribe/latest/dg/supported-languages.html)） |
| TTS | Amazon Polly | ✅ **ニューラル音声あり**: `Kazuha` / `Tomoko`（女性）、`Takumi`（男性）（`describe-voices` で実測） |

- ⚠️ Transcribe のストリーミングは**一部の言語で東京リージョン非対応**という注記があるが、
  **日本語は `streaming` 対応と表に明記**されている。
- 既存のエージェント（Claude Sonnet 4.6 + Web検索 + 会話継続）は**一切変更せずに使える**。

## 4. 3案の比較（最終）

| # | 方式 | 日本語 | 実装量 | レイテンシ | 既存資産 | Lambda |
|---|---|---|---|---|---|---|
| **1** ✅ | **手前でSTT**（アプリでTranscribe → テキストを `/invocations`） | ✅ | 小 | 往復ごとに待ち | ✅ **ほぼそのまま** | ✅ 挟める |
| **2** | **`/ws` に音声**（エージェント内でSTT/TTS） | ✅ | 大 | 中 | 一部 | ❌ 実質不可 |
| **3** | **Nova 2 Sonic**（音声→音声） | ❌ **不可** | 中 | 最短・最も自然 | プロンプト＋ツール | ❌ 実質不可 |

**方式2も日本語は可能**（Transcribe/Pollyを使うため）だが、方式1より明確に重く、
得られるものは「ストリーミングによる体感の改善」にとどまる。
**まず方式1で成立させ、遅延が問題になったら方式2を検討する**のが順序として妥当。

### 構成への波及

**方式1なので、Lambdaを挟む選択肢が維持される**（[../agentcore/AUTH.md](../agentcore/AUTH.md) の案B）。

- アプリは**テキスト**を送るので、WebSocketは不要。現在の `POST /ask` の形が使える
- 認証も**当面はAPIキー方式のままで成立する**（Cognitoは将来の選択肢として残す）
- 必要なIAM権限は **`bedrock-agentcore:InvokeAgentRuntime`**
  （`...WithWebSocketStream` は方式2/3用なので**不要**）

## 5. 📌 将来の再検討トリガー（重要）

**Nova 2 Sonic に日本語が追加されたら、方式3を再検討する。**

- 日本語対応は**遠い未来ではないと見込まれる**（v1の5言語 → v2で葡・ヒンディー・英4方言に拡大しており、
  言語追加は継続的に行われている）
- **再検討のコストは低い**: 確認するのは
  [音声一覧ページ](https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-language-support.html)に
  `ja-JP` が現れたかどうか、その1点
- そのとき**Strands側の対応は既に存在する**（§2）ので、
  障害は「日本語の声があるか」だけだった、という状態になる

### 再検討する際に読み直す箇所

1. §2 の制約表（Python 3.12+ / 8分の接続上限 / Guardrails非対応 / 履歴の自前管理）
2. [../agentcore/AUTH.md](../agentcore/AUTH.md) — 方式3ではアプリ直結になり **Cognito + JWT が実質必須**
3. ⚠️ `agentcore.json` の Runtime に認証フィールドが無い問題（§6）

## 6. 実測結果（2026-08-12・本物の人の声）

**方式1は成立した。** 台本6テイク（[SCRIPT.md](SCRIPT.md)）を録音し、
`ja-JP` の Transcribe → AgentCore → Polly を一巡させた（[try_voice.py](try_voice.py)）。

> 📌 合成音声（`say`）は明瞭すぎて精度評価に使えないため、**開発者本人の音声で測定**した。
> 読み方は「走行中と同じ音量・速さ、丁寧に発音しすぎない」。**静かな室内・風やヘルメット無し。**

### STTの認識精度

| # | 読んだ文 | 認識結果 | 判定 | STT |
|---|---|---|---|---|
| 01 | 今日の天気はどう？ | 今日の天気はどう? | ✅ | 1698 ms |
| 02 | 右手に見える山は何ですか？ | 右手に見える山は何ですか? | ✅ | 2298 ms |
| 03 | 静岡県富士市の近くでガソリンスタンドはある？ | 静岡県富士市の近くでガソリンスタンドはある? | ✅ **地名正解** | 2474〜2966 ms |
| **04** | 今治から松山まではどのくらいかかる？ | 今治から松山まではどのくらいかかる? | ✅ **難読地名2つとも正解** | 2512 ms |
| **05** | 柳井の名物は何？ | **屋内**の名物は何? | ❌ **誤認識** | 1592 ms |

**5問中4問正解。** STTは **1.6〜3.0秒**で安定。

- ✅ **「今治」「松山」「静岡県富士市」は正しく取れた。** 難読地名が全滅するわけではない。
- ❌ **「柳井」→「屋内」**（どちらも「やない」）。**同音異義の固有名詞は文脈がないと落ちる。**
  04が通って05が落ちたのは、04には「〜から〜まで」という移動の文脈があったのに対し、
  05は単独の固有名詞だったためと考えられる。

> 📌 **打ち手はある。** Transcribe の**カスタム語彙**（`ja-JP` は streaming でも対応）に
> 地名を登録すれば改善が見込める。**未実施。**

### レイテンシ（テイク03・全段通し）

| 段 | 時間 |
|---|---|
| STT（Transcribe） | 2966 ms |
| **エージェント（AgentCore + Web検索 + Bedrock）** | **19012 ms** |
| 合計 | **22.0 s** |

⚠️ **ボトルネックはSTTではなくエージェント側。** ただし**その内訳を追ったら話が変わった**（次節）。

### ⭐ 19秒の正体は「コールドスタート」だった

**同じセッションで続けて聞くと3秒前後まで落ちる。** 19秒は定常的な性能ではない。

| 条件 | 時間 |
|---|---|
| 新規セッション1回目 | **10.3 s** |
| 同一セッション2回目 | 3.4 s |
| 同一セッション3回目 | **2.6 s** |
| 同一セッション4回目 | 3.1 s |

**Web検索の有無は関係なかった**（検索あり13.2s / 検索なし13.1s。どちらも新規セッション）。
最初の測定で19秒だったのは、`try_voice.py` が毎回新しいセッションIDを発行しており、
**常にコールドスタートを測っていた**ため。

### 9秒はコンテナ起動で、アプリ側では縮められない

「こんにちは」という一言でも**コールド11.4秒 / ウォーム2.1秒**。モデルの推論量とは無関係。
CloudWatchのトレースで内訳を見ると、**エージェント内部はコールドでも速い**:

| スパン | 時間 |
|---|---|
| `mcp tools/list`（Gatewayへの接続とツール発見） | **125 ms** |
| `chat`（Bedrockの推論） | **1.46〜1.74 s** |

**合計2秒未満。** 残る約9秒は**microVMのブートとPythonのimport**で、
`@app.entrypoint` に入る前に消費されている。**つまりコードの最適化では減らない。**

> 📌 `_SESSION_AGENTS` のキャッシュも `_WEB_SEARCH` のプロセス内共有も、
> **既に効いている**（ウォームが2〜3秒であることがその証拠）。設計は妥当だった。

### 体験としてどう評価するか

| 使い方 | 体感 |
|---|---|
| 走り出して**最初の質問** | 10〜13秒待つ。⚠️ **遅い** |
| 続けて質問（会話が続く間） | **2.6〜3.4秒。実用的** |

ツーリングは「散発的に思いついて聞く」使い方なので、
**アイドルでmicroVMが落ちるたびにコールドを踏む**点が課題。
`idleRuntimeSessionTimeout` はAWS側のリソース設定で伸ばせる可能性があるが、
**アイドル中も課金される**というトレードオフがある（`CLAUDE.md` 記載の既知事項）。

> ⚠️ **方式2（ストリーミング化）ではこの9秒は解決しない。** 起動時間の問題だから。
> 効くのは「起動を先に済ませておく」方向（アプリ起動時にウォームアップの1回を投げる等）。**未検証。**

### 判断：初回の遅さは許容する（2026-08-12）

**ユーザー判断: 「初回だけであるならばある程度は許容できる。遅くても」**

→ **レイテンシ対策は当面行わない。** 理由:

- 会話が続く間は**2.6〜3.4秒**で、これは実用的
- 残り9秒は**コンテナ起動**でアプリ側から縮められない（上記）
- ウォームアップ投げ込みのような小細工は、**アイドル課金と引き換え**になり割に合わない

**再検討の条件**: 実際に走って「毎回コールドを踏む」と分かった場合
（＝アイドルタイムアウトが体感より短い場合）。そのときは
`idleRuntimeSessionTimeout` の調整とアイドル課金を天秤にかける。

### ⚠️ 回答が音声には長すぎる（要対処）

テイク03の回答で、**検索結果が乏しいと前置きが長くなる**既知の弱点（`../websearch/` §6）が再現した。

> 「検索結果から個別の店舗情報が十分に取れなかったので、もう少し具体的な情報をお伝えします。富士市は市街地が広く…」

デプロイ後に本番APIで確認した回答も**約200文字**あり、読み上げると40秒近くかかる。
システムプロンプトは「2〜3文程度で簡潔に」と指示しているが、**守られていない。**

> 「現在地は神奈川県南西部あたりですね。経度139.0・緯度35.0付近で西向きに走行中と仮定すると、
> 右手（北側）に見える山を検索で確認してみます。…ただし走行方向が分からないため、
> 正確には進行方向を教えていただけるとより確かにお答えできます。」

**原因は進行方向が分からないこと。** 「〜と仮定すると」「進行方向を教えていただければ」といった
前置きと確認が増える。**US-2.03（方位算出）が入れば改善が見込める**が、
それとは別に**音声化（US-2.01/02）の前にプロンプトの再調整が必要。**

## 7. 検証時につまずいた点（記録）

| 症状 | 原因 |
|---|---|
| `AccessDeniedException: transcribe:StartStreamTranscription` | **プロファイル未指定**で既定の認証情報が使われていた。`AWS_PROFILE=touring` で解決 |
| `ValidationException: accountID is required when agentRuntimeArn is provided as agentId` | **`AGENT_ARN` が空**。SDKは空文字列をARNではなくagentIdと解釈する |

> ⚠️ **SCPは無関係だった。** 管理アカウントから確認したところ、
> `touring` アカウントとその親OUに**アタッチされているSCPは `FullAWSAccess` のみ**。
> 別プロジェクト（`aws-monitoring`）の制限系SCPは**作成済みだが未アタッチ**（同プロジェクトのADR-006の方針どおり）。
> なお仮にアタッチされても、あのSCPは**Bedrock系APIのみが対象**で許可リージョンは
> `ap-northeast-1` / `us-east-1` の両方なので、現構成（音声=東京 / エージェント=us-east-1）は許可範囲内。

## 8. 未確認事項

- [ ] `agentcore.json` / CDK で Runtime の `authorizerConfiguration`（JWT）を設定できるか
      （CLI v0.24.2 の runtime キーは `name/build/entrypoint/codeLocation/runtimeVersion/networkMode/protocol` のみ。
      **方式1では不要**だが、方式2/3に移るなら要調査）
- [x] ~~エージェントの19秒をどう縮めるか~~ → **コールドスタートと判明。初回のみなので許容する**（上記）
- [ ] 実走時にアイドルタイムアウトで**毎回コールドを踏まないか**（踏むなら要再検討）
- [ ] **回答を短くするプロンプト調整**（上記。音声化の前提条件）
- [ ] ⚠️ **初回が API Gateway の29秒上限に近い**。本番実測 **18.9秒**（ローカルは13.7秒で、
      API Gateway＋東京→us-east-1 の往復が乗る）。**余裕は10秒しかない**ので、
      混雑時に `HTTP 504` が出るおそれがある。出るようなら Lambda を挟まない案A（アプリ直結）や
      非同期化を検討することになる
- [ ] カスタム語彙で「柳井」等の同音異義の地名が改善するか
- [ ] Polly の音声選定（`Kazuha` / `Tomoko` / `Takumi`）と読み上げ速度。今回は `Kazuha` のみ
- [ ] **走行中の実環境**（風切り音・ヘルメット内）での認識精度。**今回は静かな室内のみ**
- [ ] コスト比較（Transcribe+Polly の秒課金 vs Sonic の音声課金）

## 参考

- [Nova 2 Sonic の言語対応（音声一覧の正本）](https://docs.aws.amazon.com/nova/latest/nova2-userguide/sonic-language-support.html)
- [Nova 2 Sonic 概要（8分の接続上限）](https://docs.aws.amazon.com/nova/latest/nova2-userguide/using-conversational-speech.html)
- [model card: Nova 2 Sonic（API・Guardrails非対応）](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-amazon-nova-2-sonic.html)
- [Tool Use, RAG, and Agentic Flows](https://docs.aws.amazon.com/nova/latest/userguide/speech-tools.html)
- [エラー処理と会話の再開](https://docs.aws.amazon.com/nova/latest/userguide/speech-errors.html)
- [HTTP protocol contract（`/ws` と `/invocations` の同居）](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-http-protocol-contract.html)
- [Transcribe の対応言語](https://docs.aws.amazon.com/transcribe/latest/dg/supported-languages.html)
