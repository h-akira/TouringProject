/**
 * 応答後に戻る先のアプリ（US-2.04）。
 *
 * ⚠️ **なぜ設定が要るか。** 「直前に見ていたアプリ」をアプリ側から知る手段が無い
 * （他アプリの前面判定は Android 5 以降塞がれている）。
 * また `moveTaskToBack` では**ホーム画面に落ちるだけ**で戻らないことが
 * 実機で確定した（`pre-research/handsfree/FINDINGS.md` §13.4）。
 * そのため**戻り先は利用者に選んでもらう。**
 *
 * ⚠️ **秘密ではないので AsyncStorage に置く**（`expo-secure-store` はAPIキー用）。
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

/** 保存先のキー名。⚠️ 変えると保存済みの設定が読めなくなる。 */
const RETURN_APP_KEY = "touring.returnApp";

/** 戻り先に選べるアプリ。ネイティブ側の `listLaunchableApps` が返す形。 */
export type LaunchableApp = {
  packageName: string;
  label: string;
};

/**
 * 戻り先のパッケージ名を読む。
 *
 * `null` は「戻らない」という意味（未設定の既定でもある）。
 * ⚠️ **既定を「戻らない」にしてある。** 勝手にどこかへ飛ばすより、
 * 何も起きない方が利用者に説明がつくため。
 */
export async function loadReturnApp(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(RETURN_APP_KEY);
  } catch {
    // 読めなければ「戻らない」に倒す（勝手に別のアプリを開かない）。
    return null;
  }
}

/** 戻り先を保存する。`null` を渡すと「戻らない」に戻す。 */
export async function saveReturnApp(packageName: string | null): Promise<void> {
  if (packageName === null) {
    await AsyncStorage.removeItem(RETURN_APP_KEY);
    return;
  }
  await AsyncStorage.setItem(RETURN_APP_KEY, packageName);
}
