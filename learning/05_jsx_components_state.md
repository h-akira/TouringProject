# JSX / コンポーネント / 状態管理（Vue経験者向け）

> 対象読者: Vue（Composition API）は分かるが React は初めての人。
> ねらい: Vueの `ref` / `computed` / `watch` に**対応づけて** React の書き方を掴む。
> 前提: [01. React Native とは](./01_react_native_for_web_devs.md) を読んでいること。

## 0. 一番大事な考え方の違い（ここだけは先に）

**Vueのコンポーネントは「1回だけ setup が走り、後はリアクティブに部分更新」する。**
**Reactのコンポーネントは「状態が変わるたびに、関数がまるごと最初から再実行される」。**

```
Vue:   setup() は1回 → ref の .value が変わると、その部分だけ更新
React: 状態が変わるたび、コンポーネント関数を頭から全部再実行して画面を作り直す
```

この「**Reactは毎回まるごと再実行**」を理解しておくと、後述の「依存配列」や「なぜsetterで更新するのか」が腑に落ちる。

## 1. コンポーネント = ただの関数

Reactのコンポーネントは **JSXを返す関数**。Vueの `.vue` ファイル1つが、Reactでは関数1つに相当する。

```tsx
// これが1つのコンポーネント
export default function Index() {
  return (
    <View>
      <Text>Hello</Text>
    </View>
  );
}
```

- `return` している `<View>...</View>` が **JSX**（HTMLに似た記法をJSの中に直接書く。Vueの `<template>` に相当）。
- Vueと違い、テンプレートとロジックが**同じ関数の中**にある。

## 2. 状態（state）: Vueの `ref` に相当 → `useState`

「変わると画面が更新される値」を作るのが `useState`。

```tsx
import { useState } from "react";

export default function Counter() {
  const [count, setCount] = useState(0);
  //     ↑今の値   ↑更新用の関数   ↑初期値
  ...
}
```

### Vue との対応

| Vue | React | メモ |
|---|---|---|
| `const count = ref(0)` | `const [count, setCount] = useState(0)` | 値と「更新関数」がセットで返る |
| `count.value`（読む） | `count`（そのまま読む） | Reactは `.value` 不要 |
| `count.value++`（書く） | `setCount(count + 1)` | **直接代入せず、必ず setter を呼ぶ** |

### ここが最重要：なぜ setter を使うのか

`count = count + 1` のように**直接書き換えてはいけない**。理由は §0 の通り「Reactは再実行で画面を作り直す」から。
`setCount(...)` を呼ぶことで、Reactに「状態が変わったよ → 関数を再実行して画面を更新して」と**知らせている**。
直接代入しても、Reactはそれに気づけず画面が更新されない。

```tsx
// ❌ ダメ（Reactが気づけない）
count = count + 1;

// ✅ 正しい（Reactに更新を知らせる）
setCount(count + 1);
```

## 3. 副作用: Vueの `watch` / `watchEffect` に相当 → `useEffect`

「レンダリングとは別に、外部と関わる処理」（データ取得、タイマー、位置情報の購読など）を書くのが `useEffect`。

```tsx
import { useEffect } from "react";

useEffect(() => {
  console.log("countが変わった:", count);
}, [count]);
//  ↑実行したい処理           ↑依存配列（これが変わったら実行）
```

### Vue との対応

| Vue | React | メモ |
|---|---|---|
| `watch(count, () => {...})` | `useEffect(() => {...}, [count])` | 特定の値を監視して実行 |
| `watchEffect(() => {...})` | （近いが完全一致はしない） | Vueは依存を**自動追跡**、Reactは**手動で配列に書く** |
| `onMounted(() => {...})` | `useEffect(() => {...}, [])` | **空配列 `[]`** = 初回マウント時だけ実行 |

### ここが最重要：依存配列（Vueにはない概念）

Reactは依存を自動追跡しないので、**「何が変わったら再実行するか」を第2引数の配列で自分で書く**。

| 第2引数 | いつ実行されるか |
|---|---|
| `[count]` | `count` が変わるたび |
| `[]`（空） | 初回の1回だけ（Vueの `onMounted` 相当） |
| （省略） | 毎回のレンダリング後（基本使わない） |

**位置情報やウェイクワードの購読を "起動時に1回だけ" 始めたいとき**は `[]` を使う、と覚えておくと本アプリで効く。

## 4. 派生値: Vueの `computed` に相当 → `useMemo`（ただし多くは不要）

Vueの `computed` は React では `useMemo`。ただし **Reactは毎回再計算しても速いことが多い**ので、
重い計算でなければ普通に変数で書けばよい（`useMemo` は最適化が要るときだけ）。

```tsx
// 単純な派生値は、そのまま変数でOK（毎回再実行されるが軽いので問題ない）
const doubled = count * 2;

// 重い計算だけ useMemo で結果をキャッシュ
const heavy = useMemo(() => expensiveCalc(count), [count]);
```

## 5. Hooks のルール（Vueにはない制約）

`useState` / `useEffect` などの `use〜` を **Hooks** と呼ぶ。2つのルールがある:

1. **コンポーネント関数の一番上（トップレベル）で呼ぶ。** if文やループの中で呼ばない。
2. 呼ぶ順番を毎回同じにする（1のルールを守れば自然に守られる）。

理由は §0 の「毎回再実行」に関係し、Reactが呼ばれた順番でstateを管理しているため。まずは**「use〜は関数の先頭に並べる」**とだけ覚えればよい。

## 6. まとめ表（Vue → React 早見）

| やりたいこと | Vue | React |
|---|---|---|
| リアクティブな値 | `ref(0)` | `useState(0)` |
| 値を読む | `x.value` | `x` |
| 値を更新 | `x.value = ...` | `setX(...)` |
| 派生値 | `computed(() => ...)` | 普通の変数 or `useMemo` |
| 値を監視して処理 | `watch(x, ...)` | `useEffect(..., [x])` |
| マウント時に1回 | `onMounted(...)` | `useEffect(..., [])` |
| テンプレート | `<template>` | 関数が返す JSX |

## 7. 本アプリでの意味

- 位置情報・進行方位・録音状態などは `useState` で持ち、変わると画面（デバッグ表示等）に反映させる。
- GPSやウェイクワードの**購読の開始は `useEffect(..., [])`（起動時1回）**で行うのが定石。
- ただし方針は「モバイルは必要最低限」なので、凝った状態管理ライブラリ（Redux等）は当面不要。
  **`useState` + `useEffect` だけで十分**な範囲で作る。

## 参考

- [State: A Component's Memory · React 公式](https://react.dev/learn/state-a-components-memory)
- [Synchronizing with Effects · React 公式](https://react.dev/learn/synchronizing-with-effects)
- [Vue Composition API vs React Hooks (Syncfusion)](https://www.syncfusion.com/blogs/post/vue-composition-api-vs-react-hooks)
