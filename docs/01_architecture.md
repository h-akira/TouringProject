# 全体アーキテクチャ

> アプリ全体の**責務分担（アプリ vs AWS）**と**データの流れ**を定める。
> **上位に [00_user_stories.md](00_user_stories.md)（要件定義）がある。** 設計で迷ったらそちらに立ち返る。
> 初心者でも追えるよう、まず全体像から入り、各役割を順に説明する。

## 1. ひとことで言うと

**アプリ（React Native）は"薄いクライアント"に徹し、賢い処理は AWS 側で行う。**

- アプリの仕事: 位置を取る・音声を扱う・AWSに送る・回答を鳴らす。
- AWSの仕事: 事実（住所・方位）を確定する・回答を考える・必要ならWeb検索する。

この分担は [プロジェクト方針 §2.1](../pre-research/00_project_policy.md)（モバイルは必要最低限、ロジックはAWS）に沿っている。

## 2. 全体構成

```mermaid
flowchart LR
    App["アプリ<br/>React Native"]
    GW["API Gateway"]
    Ask["ask Lambda<br/>門番"]
    Q["SQS"]
    W["worker Lambda"]
    Res["result Lambda"]
    D[("DynamoDB")]
    AC["AgentCore Runtime<br/>司令塔"]
    B["Bedrock"]
    S["Web検索"]

    App -->|"質問+位置"| GW
    GW --> Ask
    Ask --> D
    Ask --> Q
    Q --> W
    W --> AC
    AC --> B
    AC --> S
    W --> D
    App -->|"回答を取りに行く"| GW
    GW --> Res
    Res --> D
```

| 構成要素 | 役割 |
|---|---|
| **API Gateway** | HTTPの入口。流量制限もここで行う（§6） |
| **ask Lambda** | **門番。** 入力を検証し、**事実（住所・方位）を確定**してキューに積む |
| **SQS** | 質問の待ち行列。**29秒制約を外すための要**（[01a](01a_async_ask.md)） |
| **worker Lambda** | AgentCore を呼び、結果を DynamoDB に保存する |
| **result Lambda** | アプリがポーリングして回答を取りに来る先 |
| **DynamoDB** | 質問の処理状況。シングルテーブル（[03](03_dynamodb_table.md)） |
| **AgentCore Runtime** | **司令塔。** 会話の文脈を保持し、Bedrockを呼び、必要ならWeb検索する |

### 責務分担

| 処理 | 担当 | 使うもの |
|---|---|---|
| ウェイクワード検知 | アプリ（オンデバイス） | Porcupine |
| 位置の取得（履歴を保持） | アプリ | expo-location |
| 録音 | アプリ | expo-av 等 |
| 音声 → テキスト（STT） | **AWS** | Lambda → Amazon Transcribe（§7） |
| 入力の検証・流量制限 | **AWS** | API Gateway + Lambda |
| 座標 → 住所、進行方位の算出 | **AWS** | Lambda（§4） |
| 会話の保持・回答生成・Web検索 | **AWS** | AgentCore + Bedrock |
| テキスト → 音声（TTS） | **AWS** | Lambda → Amazon Polly（§7） |
| 音声の再生 | アプリ | expo-av 等 |

> ⚠️ **アプリは録音・再生だけ**を担い、**音声ファイルをAPIに送る**（§7）。
> STT/TTS を Lambda 側に置くことで、**門番としてのLambda**が音声にも効く（§3）。

## 3. 会話の司令塔は AgentCore

**「続けて質問できる」ことが要件なので**（[00](00_user_stories.md) US-1.02）、
会話の組み立ては **Amazon Bedrock AgentCore** が担う。

Bedrock の Converse API はステートレスで、会話を継続するには毎回全履歴を送り直す必要がある。
それを自前で持つより、セッション管理がネイティブな AgentCore に任せる方が筋がよい。

### Lambda を挟む理由

AgentCore は**それ自体がエンドポイントを持つ**ため、アプリから直接呼ぶこともできる
（Cognito + JWT。実現可能性は確認済み）。それでも Lambda を挟むのは:

- **流量制限**（§6）は API Gateway の Usage Plan に依存しており、AgentCore に同等の機能が見当たらない
- **入力量の上限**を、Bedrockを呼ぶ前に手前で弾ける
- **LLMに渡す前に事実を確定させる場所**として要る（§4）
- **後から外すのは容易だが、外した後で足すのは再設計**になる

### なぜ Amazon Lex は使わないのか

「音声＝Lex」と考えがちだが、**本アプリでは Lex を使わない**。

- **Lex は"定型的なチャットボット"用**の意図理解エンジン。「ピザを注文」→注文フローに分岐、
  のような**あらかじめ決めた意図に振り分ける**用途に向く。
- 本アプリがやりたいのは「**自由な質問に LLM が自由に答える**」こと。
  意図理解は **LLM自身が行う**ため、間に Lex を挟むと二重になり、対話の自由度をむしろ制約する。

> 決定の経緯は [adr/003](../adr/003_agentcore_as_orchestrator.md)。

### 将来の拡張（メモ機能など）

**エージェントに「ツール」を足す形で拡張する。** この構成を選んだ理由のひとつ。

```python
@tool
def save_memo(text: str) -> str:
    """ライダーのメモを保存する"""   # Lambda or DynamoDB を呼ぶ
```

いまやるべきは「後からツールを足せる状態を保つ」ことだけ（[00](00_user_stories.md) 補足B）。

## 4. ⚠️ LLMに渡す前に事実を確定させる

**このアプリの中核となる考え方。** 調べれば確定するものを、LLMに推測させない。

### 4.1 座標 → 住所は Lambda で解決する

**LLMに緯度経度を渡して場所を判断させると、約40kmずれた市を答えた**（実測）。
座標の逆変換はLLMが原理的に苦手なので、**Lambda で Amazon Location Service を呼び、
住所を事実として渡す**（[pre-research/geocoding/](../pre-research/geocoding/)）。

- エージェント側の `@tool` にはしない。**現在地は毎回必要な前提情報**なので、
  LLMに「呼ぶかどうか」を判断させない。
- プロンプトには「この住所は正確です。自分で座標から推測しないこと」と明示する。

### 4.2 進行方位も Lambda で算出する

「右手に見える山は？」に答えるには進行方向が要る。
方位は**三角関数で確定する**ので、これもLLMに推測させない。

アプリは**2点の座標を送るだけ**（`start`＝現在地、`end`＝過去の位置）。

⚠️ **`end` の方が古い。** 方位は `end` → `start` の向きで計算する。
逆に読むと**ライダーの左右が入れ替わる**。

→ **詳細は [01b_heading.md](01b_heading.md)**（2点目の選び方・方位を出さない条件）。

## 5. ⚠️ 回答は非同期で受け取る

**`POST /ask` は回答を返さない。** 202 と `requestId` を返し、
アプリが `GET /ask/{requestId}` で取りに行く。

API Gateway の29秒上限に対しエージェントの生成が最大25.5秒かかるため、
**待つのをやめた**。エージェントの呼び出しは SQS 経由で worker Lambda が行う。

⚠️ **SQSは「少なくとも1回」配信**なので、**二重処理＝AgentCoreの二重課金**を
条件付き書き込みで防いでいる。**この仕組みを外さないこと。**

→ **詳細は [01a_async_ask.md](01a_async_ask.md)**（ポーリングの止め方・時間の大小関係・実測値）。
決定の経緯は [adr/001](../adr/001_async_ask.md)。

## 6. ⚠️ リージョンは用途で分かれている

**`Backend/` は東京、`Agent/` はバージニア。** 混同すると動かない。

| 対象 | リージョン | 理由 |
|---|---|---|
| `Backend/`（SAM: API Gateway + Lambda + SQS + DynamoDB） | **`ap-northeast-1`**（東京） | 利用者が日本にいる |
| `Agent/`（AgentCore: Runtime + Gateway） | **`us-east-1`**（バージニア） | **Web検索コネクタが us-east-1 限定**のため |

Web検索（US-1.04）は AgentCore Gateway の**組み込みコネクタ**で実現しており、
これが us-east-1 限定。Runtime と Gateway を別リージョンに分けるとリージョンを跨ぐので、
**`Agent/` ごと us-east-1 に置いている**（[pre-research/websearch/](../pre-research/websearch/)）。

### これに伴う制約

**モデルIDは `us.anthropic.claude-sonnet-4-6`。**
`jp.` は ap-northeast 専用の**推論プロファイル**なので、us-east-1 から呼ぶと
`ValidationException: The provided model identifier is invalid` になる（実測）。

> ⚠️ **東京のLambdaが us-east-1 のRuntimeを呼ぶ。**
> boto3 クライアントの**リージョン指定を明示すること**（既定のままだと東京を見に行って
> `ResourceNotFoundException` になる）。

> 📌 **将来リージョンを揃えられる可能性はある。** 条件は
> 「Web検索コネクタが東京で使えるようになること」。

## 7. 音声はLambdaを介して扱う

**アプリは録音して送るだけ。STT/TTS は Lambda が呼ぶ。**

- ⚠️ **Nova 2 Sonic（音声→音声の基盤モデル）は日本語に対応していない**ため採用不可。
  技術的には最も自然な会話が実現できるので、**日本語が追加されたら再検討の価値がある**
  （[pre-research/voice/](../pre-research/voice/)）。
- 決定の経緯と却下した案は [adr/002](../adr/002_speech_on_device.md)。

### 音声の経路

```mermaid
flowchart LR
    App["アプリ<br/>録音"] -->|"① 音声"| GW["API Gateway<br/>POST /ask-audio"]
    GW --> L["ask Lambda<br/>⚠️ ここで弾く"]
    L --> S3[("S3")]
    S3 --> T["Transcribe<br/>バッチ"]
    T --> W["既存の非同期経路<br/>SQS → worker → AgentCore"]
    W --> P["Polly"]
    P --> S3
    App -->|"② ポーリング"| R["result Lambda"]
    R -->|"テキスト + 音声URL"| App
    App -->|"③ 音声を取得"| S3
```

⚠️ **Transcribe は「バッチ」を使う**（[`StartTranscriptionJob`](https://docs.aws.amazon.com/transcribe/latest/dg/how-input.html)）。
ストリーミングは双方向通信なので**Lambdaを経由できない**が、
**「喋りながら認識」は本アプリに必要ない**（レイテンシは許容済み）。

| | |
|---|---|
| 受け口 | **`POST /ask-audio`**（新設）。既存の `POST /ask`（テキスト）は**変えない** |
| S3への配置 | **Lambdaが受けてPUTする。** バッチの入力は**S3必須**のため |
| 合流先 | **既存の非同期経路**（SQS → worker → DynamoDB）。ポーリングも `GET /ask/{requestId}` のまま |

📌 **アプリにAWS認証情報は要らない。** APIキーだけで完結する（§8）。

### 回答の音声は署名付きURLで渡す

**ポーリングの応答には、テキストと一緒に「音声のURL」を入れる。** 音声そのものは載せない。

- ✅ **テキストが先に届く。** 音声の生成を待たずに画面へ出せる
- ✅ **レスポンスが軽い。** ⚠️ 走行中は電波が切れて**再試行が起きる**ので、
  ポーリングの応答は小さく保つ
- ✅ 音声は**S3から直接**取得するため、API Gateway / Lambda のサイズ上限と無関係

| | |
|---|---|
| 生成 | **worker が回答生成の直後に Polly を呼び、S3に置く**（要求されてから作ると初回再生が遅れる） |
| URL | **result Lambda が署名付きURLを発行する**（有効期限は数分） |
| 保存 | ⚠️ **S3のライフサイクルで数日後に自動削除**（残す理由がない。§9） |

### 録音形式は M4A（AAC）

⚠️ **Transcribeの推奨は FLAC / WAV(PCM 16bit) だが、Androidの録音APIはどちらも直接出せない**
（`expo-audio` の `AndroidOutputFormat` に該当する値がない）。

**両者が重なるのが M4A**（`outputFormat: 'mpeg4'` + `audioEncoder: 'aac'`）。
`expo-audio` の `HIGH_QUALITY` プリセットの既定でもあるため、**変換を挟まずに済む。**

📌 音声認識には十分な品質だが、[pre-research/voice/](../pre-research/voice/) の実測（5問中4問正解）は
**WAV/PCMで得た値**なので、**M4Aでの精度は実装時に確認する**（§12）。

**波及する制約**:

- ⚠️ **API Gateway のペイロード上限は 10MB。** 質問1つは数秒〜十数秒なので十分
  （M4A/AACなら10秒で数十KB程度）。**上限が低いこと自体が防御**として働く。
- ⚠️ **バッチにはジョブキューイングがあり、所要時間が保証されない。**
  同時実行の上限に達したときの話なので、単一利用者では顕在化しない見込み（未実測）。

## 8. 認証：APIキー方式（アプリ画面から入力）

当面の対象は「自分のAndroidだけ」なので、軽量な **APIキー認証**を採る。

- APIキーは**アプリ画面から入力**し、端末に安全に保管する（`expo-secure-store`）。
  ⚠️ **`.env` に置かない。** `EXPO_PUBLIC_*` はバンドルに**平文で埋め込まれる**ので
  秘密の置き場にならない（URLは秘密ではないので `.env` のままでよい）。
- API Gateway の **Usage Plan** と組み合わせ、キー単位で流量制限をかける（§9）。
- 将来複数ユーザーに広げるなら Cognito に移行する余地を残す
  （[pre-research/agentcore/AUTH.md](../pre-research/agentcore/AUTH.md)）。

### どの経路にキーが要るか

**既定は「全エンドポイントで必須」**で、`/health` だけが例外。
⚠️ **オプトアウト方式にしているのは、付け忘れが穴にならないようにするため。**
新しいエンドポイントを足すと自動的に保護される。

| 経路 | キー | 理由 |
|---|---|---|
| `POST /ask` | **必須** | 1回ごとにBedrockの課金が発生する |
| `GET /ask/{requestId}` | **必須** | ここが開いていると回答を読み出せてしまう |
| `GET /health` | **不要** | 「APIが落ちているのか、キーが違うのか」の切り分けに使うため。課金対象を呼ばず、固定値を返すだけ |

### ⚠️ ポーリングもキーの使用回数を消費する

**1つの質問 ＝ `POST` 1回 ＋ `GET` 約10回**（回答まで10〜13秒、1秒間隔のため）。
クォータを「1日に何問できるか」で考えると**約10倍ずれる**（§9）。

## 9. 悪用・コスト暴走対策（多層防御）

**個人利用でも、URLが漏れれば誰でも叩ける。** 単一の対策に頼らず多層で守る。

| 層 | 対策 | 状態 |
|---|---|---|
| **入口** | APIキー必須（§8） | ✅ 実装済み |
| **流量** | API Gateway の Usage Plan（1日あたりのクォータ・レート制限） | ✅ 実装済み |
| **入力量** | 質問は500文字まで。`max_tokens` で出力も上限を設ける | ✅ 実装済み |
| **入力量（音声）** | **音声のペイロードサイズ＝録音秒数**を Lambda で弾く（§7） | ⚠️ 音声化と同時 |
| **予算** | AWS Budgets で月額上限を監視し、**超過したら自動遮断** | ⚠️ **未実装** |

### 流量制限の値

⚠️ **すべて仮の値で、実測に基づいていない**（§12）。デプロイ時のパラメータで変えられる。

| 項目 | 値 | 根拠 |
|---|---|---|
| 日次クォータ | **2000回/日** | ポーリングを含めた**呼び出し回数**。1問≒11回なので**約180問/日**に相当 |
| レート | **5回/秒** | ⚠️ **アプリのポーリングは1秒間隔**なので、1回/秒だと自分の質問が弾かれる |
| バースト | **10回** | 前の質問のポーリング中に次を投げても通る程度 |

⚠️ **クォータは「問い数」ではなく「呼び出し回数」で効く**（§8）。
「1日200問」のつもりで200を設定すると、**実際には約18問で打ち止め**になる。

> **予算による自動遮断だけが未実装。** キーが漏れても日次クォータで頭打ちになるが、
> **上限に張り付いた状態が続けば課金は積み上がる**ので、Budgets は別途要る。

## 10. 構成管理（IaC）：SAM ＋ CDK の併用

| 対象 | IaC | 理由 |
|---|---|---|
| `Backend/` | **SAM** | Lambda + API Gateway 中心の構成に素直 |
| `Agent/` | **CDK** | `agentcore` CLI が生成するのがCDKのため |

- **2つのIaCが並存する**ので、どちらで管理されているリソースかを意識する。
- CDKの学習は最小限でよい（`agentcore` CLI が隠蔽するため）。

### ⚠️ スタック間の受け渡しは SSM パラメータ

`Backend/` と `Agent/` は**別スタック**で、Backend は Agent の Runtime ARN を必要とする。
これを **SSMパラメータ**（`/trg/<env>/agent-runtime-arn`）で渡す。

| | |
|---|---|
| 書く | Agent のデプロイ後（`buildspec.yml`）。⚠️ **東京に書く** |
| 読む | Backend の SAM が `AWS::SSM::Parameter::Value<String>` で解決 |

⚠️ **CloudFormationのエクスポートは使えない。** AgentCoreのスタックは Runtime ARN を
エクスポートしているが、**それは us-east-1 にあり、Backend は東京**にある。
**`Fn::ImportValue` はリージョンを跨げない。**
SSMはAPIで読むので、リージョンは引数にすぎない。

📌 副次的に、**リポジトリにアカウントIDが残らない**（渡すのは*パラメータ名*だけ）。

## 11. デプロイ（CI/CD）

**`main` にpushすると CodeBuild が Agent → Backend の順にデプロイする**（[CICD/](../CICD/)）。

```mermaid
flowchart LR
    push["GitHub push"] --> test["Backend テスト"]
    test --> agent["Agent<br/>us-east-1"]
    agent --> ssm[("SSM<br/>⚠️ 東京に書く")]
    ssm --> backend["Backend<br/>東京"]
```

- ⚠️ **順序は入れ替えられない**（上記のARNの受け渡しのため）。
- **テストが落ちたらデプロイしない**（`pre_build` で `pytest`）。
- **`App/` は対象外。** Expo経由で配布するのでAWSにデプロイするものが無い。

## 12. 未決事項

- [ ] **M4Aでの認識精度**（実測はWAV/PCMで得た値。§7）
- [ ] **音声を含めた応答時間**（STT/TTSのぶんがどれだけ乗るか未実測。§7）
- [ ] **Usage Plan の閾値の妥当性**（いまの値は仮。実際の使い方を測って詰める）
- [ ] Budgets の月額上限と、予算超過時の自動遮断の実装方式
- [ ] エラー時の挙動（STT失敗・タイムアウト・利用停止中に何を音声で返すか）

> Bedrockの実装を書く際は `claude-api` スキルを参照する（モデルIDは記憶に頼らない）。

## 参考

- [amazon-bedrock-voice-conversation (AWS Samples)](https://github.com/aws-samples/amazon-bedrock-voice-conversation) — Transcribe→Bedrock→Polly の音声会話構成例
- [How to limit usage and cost on Amazon Bedrock (AWS Builder Center)](https://builder.aws.com/content/3DIYzXtsMwvVh1jsn1CSpa8k2rL/limiting-bedrock-usage-and-controlling-costs) — 流量制限・予算アラーム・前チェックの3アプローチ
