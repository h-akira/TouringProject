# 位置情報の扱い方（権限フロー / expo-location）

> 対象読者: モバイルで位置情報を初めて扱う人。
> ねらい: 「権限を求めて現在地を取得する」流れと、その裏の考え方を理解する。
> 前提: [05. 状態管理](./05_jsx_components_state.md)（`useState` / `useEffect`）を読んでいること。

## 1. Webとの一番の違い：権限（パーミッション）

Webでも位置情報は使えるが、モバイルアプリでは **「ユーザーに明示的に許可を求める」ステップが必須**で、より厳格。

- アプリが勝手に位置を取ることはできない。**ユーザーが「許可」をタップして初めて取得できる。**
- 許可には段階がある:
  - **Foreground（使用中のみ）**: アプリを開いている間だけ位置を取れる。今回使ったのはこれ。
  - **Background（常時）**: アプリを閉じていても位置を取れる。制約が厳しく、追加設定が必要。
- 本アプリは将来「走行中バックグラウンドで動く」が、**まずは Foreground で現在地取得の基礎**を固める。

## 2. 導入：expo-location

Expo公式の位置情報ライブラリ。SDKに合うバージョンを `expo install` で入れる（→ [04](./04_npm_npx_node_modules.md) の通り、`expo install` はSDKに合った版を選ぶ）。

```sh
npx expo install expo-location
```

`app.json` にプラグインと**許可を求めるときの説明文**を設定する:

```json
"plugins": [
  ["expo-location", {
    "locationAlwaysAndWhenInUsePermission": "（なぜ位置情報が要るのかの説明文）"
  }]
]
```

> ⚠️ `app.json` の `plugins` はネイティブ設定を変えるため、変更後は **`npx expo start -c`（キャッシュクリア）で再起動**する。
> また本来この種の設定は Development Build で完全反映される。Expo Go でも基本の前景取得は動くことが多いが、
> ネイティブに深く関わる機能は Development Build が必要になる（→ [02. Expo §5](./02_expo.md)）。

## 3. 基本の取得フロー（今回書いたコード）

```tsx
import * as Location from "expo-location";

useEffect(() => {
  (async () => {
    // 1. 許可を求める
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      // 拒否されたときの処理
      return;
    }
    // 2. 現在地を1回取得
    const location = await Location.getCurrentPositionAsync({});
    console.log(location.coords.latitude, location.coords.longitude);
  })();
}, []);
```

### ポイント解説

- **`useEffect(..., [])`**: 起動時に1回だけ実行（Vueの `onMounted` 相当。→ [05](./05_jsx_components_state.md)）。位置取得の"開始"はここが定石。
- **`async/await`**: 権限リクエストも位置取得も**非同期**（結果が返るまで待つ）。`await` で待って、結果を `useState` の setter で画面に反映する。
- **`useEffect` のコールバック自体は `async` にできない**ため、中で `(async () => { ... })()`（即時実行の非同期関数）を使うのが定番パターン。
- **`status !== "granted"` の分岐**: 許可されなかった場合を必ず処理する。モバイルではユーザーが拒否できる前提で書く。

### 取れる主な値（`location.coords`）

| プロパティ | 内容 |
|---|---|
| `latitude` | 緯度 |
| `longitude` | 経度 |
| `accuracy` | 精度（メートル） |
| `heading` | 端末の向き（方位。取れないこともある） |
| `speed` | 移動速度 |

## 4. この先で使うAPI（本アプリ向けの布石）

今回は「1回取得」だが、走行中は**連続取得**が必要になる。そのときは:

- **`Location.watchPositionAsync(options, callback)`**: 位置が変わるたびにコールバックが呼ばれる（購読型）。
  - 走行中の連続追跡や、[進行方位を2点間から算出](../pre-research/01_overview.md)する用途で使う。
  - `useEffect(..., [])` で購読を開始し、**返り値（購読解除関数）を useEffect の後始末で呼ぶ**（メモリリーク防止）のが定石。
- これは「ネイティブ機能を継続的に購読する」典型例で、後で扱う。

## 5. トラブルの目安

- **許可ダイアログが出ない/エラー**: `app.json` のプラグイン設定が反映されていない可能性 → `-c` で再起動、それでもダメなら Development Build を検討。
- **「取得中…」のまま止まる**: 一部のAndroid端末で `getCurrentPositionAsync` が返らない既知の問題がある。端末側のGPS（位置情報）がオンか確認する。状態を画面に出しておくと切り分けやすい（今回そうした）。

## 6. 本アプリでの意味

- MVPの機能1「現在地の取得」がこれで実現できた（→ [01. 構想概要](../pre-research/01_overview.md)）。
- 次は「連続取得（`watchPositionAsync`）」→「2点間から進行方位を算出」へ進むと、
  「右手に見える山は何？」に必要な**現在地＋進行方向**の土台が揃う。

## 参考

- [Location · Expo Documentation](https://docs.expo.dev/versions/latest/sdk/location/)
- [Expo Location Guide: Permissions, GPS, and Geofencing (Anthony Coffey)](https://coffey.codes/articles/building-location-based-features-using-expo-location)
