/**
 * APIキーの設定画面（docs/01_architecture.md §8）。
 *
 * 走行中には使わない画面なので、作り込みは最小限にとどめる
 * （CLAUDE.md「モバイルは必要最低限」）。停車中に一度だけ入力する想定。
 */
import { useEffect, useState } from "react";
import { Text, View, Pressable, StyleSheet, TextInput, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { loadApiKey, saveApiKey, clearApiKey } from "@/api/apiKey";

export default function Settings() {
  const [apiKey, setApiKey] = useState("");
  // 保存済みかどうか。入力欄には既存のキーを出さないので、
  // 「もう入れてあるのか」はこの表示でしか分からない。
  const [stored, setStored] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const insets = useSafeAreaInsets();

  // ⚠️ 保存済みのキーを入力欄に流し込まない。
  // 画面に出す必要が無いうえ、肩越しに見られる・スクショに写る経路を増やすため。
  // 「設定済みか」だけを見せ、変更したいときは入力し直してもらう。
  useEffect(() => {
    (async () => {
      setStored((await loadApiKey()) !== null);
      setLoading(false);
    })();
  }, []);

  async function onSave() {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      setMessage("キーを入力してください");
      return;
    }
    try {
      await saveApiKey(trimmed);
      setStored(true);
      // 保存できたら入力欄からは消す（画面に残し続けない）。
      setApiKey("");
      setMessage("保存しました");
    } catch (e) {
      setMessage("保存に失敗しました: " + String(e));
    }
  }

  async function onClear() {
    try {
      await clearApiKey();
      setStored(false);
      setApiKey("");
      setMessage("削除しました");
    } catch (e) {
      setMessage("削除に失敗しました: " + String(e));
    }
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        { paddingBottom: Math.max(insets.bottom, 24) + 24 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>APIキー</Text>
      <Text style={styles.note}>
        バックエンドを呼ぶのに必要です。デプロイ時に発行された値を入れてください。
      </Text>

      {!loading && (
        <Text style={stored ? styles.statusOk : styles.statusMissing}>
          {stored ? "設定済み" : "未設定"}
        </Text>
      )}

      <TextInput
        style={styles.input}
        value={apiKey}
        onChangeText={setApiKey}
        placeholder={stored ? "変更する場合のみ入力" : "APIキーを貼り付け"}
        placeholderTextColor="#888899"
        // ⚠️ 肩越しに見られないよう伏せ字にする。
        secureTextEntry
        // キーは大小を区別する。勝手に直されると通らない値になる。
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Pressable
        style={[styles.button, !apiKey.trim() && styles.buttonDisabled]}
        onPress={onSave}
        disabled={!apiKey.trim()}
      >
        <Text style={styles.buttonText}>保存</Text>
      </Pressable>

      {stored && (
        <Pressable style={styles.clearButton} onPress={onClear}>
          <Text style={styles.clearButtonText}>削除</Text>
        </Pressable>
      )}

      {message && <Text style={styles.message}>{message}</Text>}

      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backButtonText}>戻る</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "center",
    backgroundColor: "#1E1E2E",
    padding: 24,
    gap: 16,
  },
  title: { fontSize: 22, fontWeight: "bold", color: "#FFFFFF" },
  note: { fontSize: 13, color: "#AAAAAA" },
  statusOk: { fontSize: 15, color: "#7FD1AE", fontWeight: "bold" },
  statusMissing: { fontSize: 15, color: "#FF6B35", fontWeight: "bold" },
  input: {
    backgroundColor: "#2A2A3E",
    color: "#FFFFFF",
    fontSize: 16,
    padding: 14,
    borderRadius: 8,
  },
  button: {
    backgroundColor: "#FF6B35",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonDisabled: { backgroundColor: "#8A5A44" },
  buttonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "bold" },
  clearButton: {
    borderWidth: 2,
    borderColor: "#8A5A44",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  clearButtonText: { color: "#FF9E7A", fontSize: 15, fontWeight: "bold" },
  message: { fontSize: 14, color: "#7FD1AE", textAlign: "center" },
  backButton: { paddingVertical: 12, alignItems: "center" },
  backButtonText: { color: "#AAAAAA", fontSize: 16 },
});
