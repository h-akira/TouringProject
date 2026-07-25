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
# app/.env
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
app/.env          ← 実際の値。gitで追跡しない
app/.env.example  ← テンプレート。コミットする
```

## 4. ハマりどころ：`.env` を変えても反映されない

`.env` を変更したのに古い値が使われることがある。**Expo Go が古いバンドルをキャッシュ**しているのが原因。
`npx expo start -c`（キャッシュクリア再起動）＋ **Expo Go でアプリを開き直す**とよい（→ [03 §5.3](./03_dev_environment_setup.md)）。

## 5. 本アプリでの意味

- この「fetchでPOST → 応答表示」の骨格が、**アプリ↔バックエンド連携の土台**。
- 今はモック（固定応答）だが、バックエンドの中身を STT→Bedrock→Polly に置き換えても、
  **アプリ側のこの通信コードは基本そのまま**使える（送るデータと受け取る形が変わるだけ）。
- 音声を送る段階になったら、`body` に音声データを載せる形に拡張する（→ [docs/01](../docs/01_architecture.md)）。

## 参考

- [Environment variables in Expo · Expo Documentation](https://docs.expo.dev/guides/environment-variables/)
- [fetch() · MDN](https://developer.mozilla.org/docs/Web/API/Window/fetch)
