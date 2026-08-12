# セーフエリア（画面の端に隠れない配置）

> 実機で**最下部のボタンがAndroidのナビゲーションバーと重なって押せない**問題が起きたときの対処。
> Web開発でいえば「iPhoneのノッチ対応」や `env(safe-area-inset-bottom)` に相当する話。

## 何が問題か

スマホの画面には、**アプリが自由に使ってはいけない領域**がある。

| 場所 | 何があるか |
|---|---|
| 上端 | ステータスバー（時刻・電池）、iPhoneのノッチ |
| **下端** | **Androidのナビゲーションバー（戻る・ホーム）**、iPhoneのホームバー |

ここにボタンを置くと、**見えてはいるのに押せない**（OSのバーがタップを取る）。
「押せない」ので、走行中に使うアプリでは致命的になる。

## Web開発との対応

| Web | React Native |
|---|---|
| `env(safe-area-inset-bottom)` | `useSafeAreaInsets().bottom` |
| `viewport-fit=cover` | （不要。既定でフルスクリーン） |

考え方は同じで、**OSから「端から何px空けろ」という数値をもらって余白にする。**

## 使い方（`react-native-safe-area-context`）

Expoのテンプレートには**最初から入っている**（`package.json` を確認）。

### 1. アプリ全体を `SafeAreaProvider` で包む

**これを忘れると値が0になる**（＝何も起きない）ので必須。expo-routerなら `_layout.tsx`。

```tsx
// src/app/_layout.tsx
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Stack />
    </SafeAreaProvider>
  );
}
```

### 2. 余白を足す

```tsx
import { useSafeAreaInsets } from "react-native-safe-area-context";

const insets = useSafeAreaInsets();

<ScrollView
  contentContainerStyle={[
    styles.container,
    // 端末の値（機種で違う）と、最低限ほしい余白の大きい方を取る
    { paddingBottom: Math.max(insets.bottom, 24) },
  ]}
>
```

**`Math.max` を使うのが定番。** ナビゲーションバーがジェスチャー操作の機種では
`insets.bottom` が小さい（0に近い）ことがあり、そのままだと余白がなくて窮屈になる。

### `SafeAreaView` を使う手もある

```tsx
import { SafeAreaView } from "react-native-safe-area-context";

<SafeAreaView edges={["bottom"]}>{/* ... */}</SafeAreaView>
```

- **`SafeAreaView` の方が推奨**（公式）。JS側で計算しないので**ちらつきが起きない**
- ただし `ScrollView` の**中身**に余白を付けたい場合は
  `contentContainerStyle` に入れる必要があるので、フックの方が素直
- ⚠️ **`react-native` 本体の `SafeAreaView` ではなく、このライブラリのものを使う**
  （本体のはiOS専用で、Androidでは効かない）

## 罠

| 罠 | どうなる |
|---|---|
| `SafeAreaProvider` を忘れる | insetsが全部0。**何も変わらないので原因に気づきにくい** |
| `react-native` から `SafeAreaView` をimport | **Androidで効かない**（iOS専用） |
| `padding: 24` の後に `paddingBottom` を書く | 配列で後に書いた方が勝つ（正しく上書きされる）。順序が逆だと効かない |
| insetsを固定値で決め打ち | 機種で違う。ノッチ・ジェスチャーバーの有無で変わる |

## このプロジェクトでの適用

`src/app/index.tsx` の最下部に「新しい会話を始める」ボタン（US-1.05）を置いたところ、
**実機で戻るボタンと重なって押せなかった**ため、上記の方法で修正した。

```tsx
{ paddingBottom: Math.max(insets.bottom, 24) + 24 }
```

`+ 24` は、バーに接するギリギリではなく**余裕を持たせる**ため。
走行中はグローブで操作するので、**タップ領域には余裕が必要**。

## 参考

- [react-native-safe-area-context](https://appandflow.github.io/react-native-safe-area-context/)
- [Expo: Safe areas](https://docs.expo.dev/develop/user-interface/safe-areas/)
