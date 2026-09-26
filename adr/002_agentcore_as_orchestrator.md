# 002. 会話の司令塔を AgentCore にする（Lex・自前の履歴管理は使わない）

- **日付**: 2026-07-30（最終更新 2026-09-27）
- **ステータス**: 採用

## 背景

「続けて質問できる」ことが要件（US-1.02）なので、会話の履歴を誰が持つかを決める必要がある。
Bedrock の Converse API はステートレスで、`sessionId` に当たるパラメータを持たない（実測で確認）。

## 選択肢

| 案 | 判断 |
|---|---|
| A. Lambda が履歴を管理し、毎回すべてを Converse API に送る | 却下。保存先（DynamoDB 等）と切り詰めのロジックを自前で書くことになる |
| B. Bedrock Agents (Classic) | 却下。2026-07-30 で新規受付が終了した |
| **C. Bedrock AgentCore** | 採用。セッション管理がネイティブで、`runtimeSessionId` を渡せば文脈が繋がる |
| D. Amazon Lex を挟む | 却下。Lex はあらかじめ決めた意図に振り分ける定型のチャットボット用。本アプリは自由な質問に LLM が自由に答えるもので、意図の理解は LLM が行う。挟むと二重になり、対話の自由度を狭める |
| E. アプリから AgentCore を直接呼ぶ（Cognito ＋ JWT） | 却下。実現はできるが、流量制限（API Gateway の Usage Plan に相当する機能が AgentCore に見当たらない）・入力量の上限・事実の確定を置く場所が無くなる |

## 決定

AgentCore を会話の司令塔にし、Lambda は門番に徹する。

- Lambda（Backend）: 入力の検証・流量制限・LLM に渡す前に事実（住所・方位・日時）を確定させる。
- AgentCore（Agent）: 会話の保持・回答の生成・Web 検索。拡張はツール（`@tool`）を足す形で行う。
- Lambda は後から外すのは容易だが、外した後で足すのは再設計になるので、最初から挟む。

AgentCore Memory（セッションを越える永続記憶）は使わない。
要件は「一問一答＋α」までで、15分以上あけて続きを求める使い方は想定しない。
走行ログのような記録が必要になったら、会話の記憶ではなく DB 連携として別に設計する。

## 影響

- Web 検索のコネクタが us-east-1 限定なので、Agent は us-east-1、Backend は東京になる（[docs/01_technical_policies.md](../docs/01_technical_policies.md)）。
- IaC が2つ並ぶ（`agentcore` CLI が生成するのは CDK、Backend は SAM）。
- ⚠️ AgentCore はアイドル中も課金される（文脈を保つため microVM が生きている）。ツーリングは散発的な質問になるので、影響は要実測。
- 初回の応答は10秒前後かかる（コールドスタート）。アプリ側では縮められない。
- メモ機能（US-X.01）は `@tool` を足す形で後から入れられる。

検証の記録: [agentcore/](https://github.com/h-akira/TouringProject_Research/blob/main/agentcore/)（非公開）
