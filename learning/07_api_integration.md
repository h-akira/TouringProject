# API連携（fetch でバックエンドと通信 / 環境変数）

> 対象読者: Web の API 通信は分かるが、React Native では初めての人。
> ねらい: 「アプリからバックエンドにPOSTして応答を受け取る」流れと、URLの持たせ方を理解する。
> 前提: [05. 状態管理](./05_jsx_components_state.md)（`useState`/非同期）を読んでいること。

## 1. Webとの違い：ほぼ同じ。`fetch` がそのまま使える

朗報。**React Native では、Webと同じ `fetch` API が使える。** `axios` も使える。
つまり **Web でやっていた API 通信の知識がそのまま活きる**。RN特有の新概念はほぼない。

| Web/Vue | React Native | メモ |
|---|---|---|
| `fetch(url)` | `fetch(url)` | **同じ**。ブラウザ同様に使える |
| `axios.post(...)` | `axios.post(...)` | 入れれば同じく使える |
| `async/await` | `async/await` | 同じ |
| CORS | （基本気にしなくてよい） | RNはブラウザではないので、Web特有のCORS制約は原則かからない |

## 2. 実際のコード（今回書いたもの）

「現在地をバックエンドにPOST → 回答を受け取って画面に表示」する関数。

```tsx
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL; // 後述（環境変数）

async function askBackend() {
  const res = await fetch(`${API_BASE_URL}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      start: { latitude: coords.latitude, longitude: coords.longitude },
      end: { latitude: coords.latitude, longitude: coords.longitude },
    }),
  });
  const data = await res.json();     // 応答JSONをパース
  setAnswer(data.answer);            // useState で画面に反映（learning/05）
}
```

### ポイント

- **`method: "POST"` / `headers` / `body`**: Webの `fetch` と全く同じ書き方。
- **`body` は `JSON.stringify(...)` で文字列化**する（オブジェクトをそのまま渡さない）。
- **`await res.json()`** で応答本文をJSオブジェクトにパース。
- 結果を **`useState` の setter（`setAnswer`）で状態に入れる**と画面が再描画される（→ [05](./05_jsx_components_state.md)）。
- **エラー処理**: 実際のコードでは `try/catch` で囲み、失敗時のメッセージも状態に入れている（通信は失敗し得る前提で書く）。

## 3. URL をどう持たせるか：環境変数（ハードコードしない）

APIのURLをコードに直書きせず、**環境変数**で管理する。
（開発者の規約「秘密情報のハードコード禁止」、および環境ごとにURLが変わるため。）

### Expo の環境変数のしくみ

- プロジェクト直下の **`.env`** ファイルに書く。
- 変数名は **`EXPO_PUBLIC_` で始める**必要がある（この接頭辞が付いた変数だけがアプリのコードから読める）。
- コード側は **`process.env.EXPO_PUBLIC_XXX`** で参照する。

```
# App/.env
EXPO_PUBLIC_API_BASE_URL=https://xxxx.execute-api.ap-northeast-1.amazonaws.com/Prod
```

```tsx
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
```

### ⚠️ 重要：`EXPO_PUBLIC_` は「秘密」を入れてはいけない

- `EXPO_PUBLIC_` 変数は、**ビルド後のアプリに平文で埋め込まれる**（誰でも取り出せる）。
- よって **入れてよいのは秘密でない値だけ**。エンドポイントURLは秘密ではないのでOK。
- **APIキーやトークンは入れてはいけない。** それらは端末の安全な保管領域（`expo-secure-store` = OSのKeychain/Keystore）に入れ、
  アプリの設定画面から入力する設計にする（→ [docs/01 §6](../docs/01_architecture.md)）。

### gitの扱い

- **`.env` は `.gitignore` で除外**する（環境固有・場合により機微）。
- 代わりに **`.env.example`（プレースホルダだけ）をコミット**し、「何を設定すべきか」を共有する。

```
App/.env          ← 実際の値。gitで追跡しない
App/.env.example  ← テンプレート。コミットする
```

## 4. ハマりどころ：`.env` を変えても反映されない

`.env` を変更したのに古い値が使われることがある。**Expo Go が古いバンドルをキャッシュ**しているのが原因。
`npx expo start -c`（キャッシュクリア再起動）＋ **Expo Go でアプリを開き直す**とよい（→ [03 §5.3](./03_dev_environment_setup.md)）。

## 4.5 OpenAPI から型を自動生成する（契約と実装を型で繋ぐ）

APIの入出力の形は [OpenAPI仕様](../docs/02_api_openapi.yaml) に定義してある（フロント↔バックの契約）。
この仕様から **TypeScriptの型を自動生成**し、`fetch` の送信データ・受信データに型を付けると、
「契約と実装がズレたらコンパイルエラーで気づける」状態になる。

### ツール選定：openapi-typescript（orval経験者向けの補足）

Web（特にVue）では **orval** を使うことが多い。orvalは型に加えて **APIクライアント関数や React Query / TanStack Query のフックまで自動生成**してくれる多機能ツール。React Nativeでも動く（生成物はfetchベース）。

ただし本アプリは **「モバイルは必要最低限」** 方針で、通信は `fetch` 1回で済むシンプルさ。
React Query を導入するほどではないので、**型だけを生成する軽量な `openapi-typescript` を採用**した。

| | openapi-typescript（採用） | orval |
|---|---|---|
| 生成物 | **型だけ**（実行時依存ゼロ） | 型＋クライアント＋React Queryフック＋モック |
| 向く場面 | fetchを自分で書く・軽く保ちたい | React Query前提・多エンドポイント |
| RN互換 | ○ | ○（fetchベース） |

→ orvalの知識は活きるが、今回は「型だけで十分」なので軽い方を選んだ、という判断。将来エンドポイントが増えてReact Queryを入れるなら orval への移行もあり。

### 使い方

```sh
# App/ で実行。docs/02 の仕様 → src/api/schema.ts を生成
npm run gen:api
# 中身: openapi-typescript ../docs/02_api_openapi.yaml -o src/api/schema.ts
```

- 生成された `src/api/schema.ts` は**自動生成物なので手で編集しない**。
- 使いやすいよう `src/api/types.ts` でエイリアスを切ってある（`AskRequest`, `AskResponse` 等）。
- **契約（docs/02）を変えたら `npm run gen:api` で型を再生成**する。

### コードでの使い方

```tsx
import type { AskRequest, AskResponse } from "@/api/types";

const requestBody: AskRequest = { start, end };          // 送るデータの形が保証される
const res = await fetch(`${API_BASE_URL}/ask`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(requestBody),
});
const data = (await res.json()) as AskResponse;          // data.answer が型安全に参照できる
```

> これで、Webでやっていた「OpenAPI起点の型安全な開発」がRNでも同じようにできる。

## 5. 本アプリでの意味

- この「fetchでPOST → 応答表示」の骨格が、**アプリ↔バックエンド連携の土台**。
- 現在は `POST /ask` が**質問と現在地を送り、AIの回答を受け取る**形になっている
  （バックエンドがAgentCoreのエージェントに中継する）。
- **音声化してもこの通信コードは基本そのまま使える。**
  STT/TTSは**アプリ側で**行い、APIには**テキストを送る**方式に決まったため
  （→ [pre-research/voice/](../pre-research/voice/)）。`body` に音声を載せる形にはならない。

## 参考

- [Environment variables in Expo · Expo Documentation](https://docs.expo.dev/guides/environment-variables/)
- [fetch() · MDN](https://developer.mozilla.org/docs/Web/API/Window/fetch)
