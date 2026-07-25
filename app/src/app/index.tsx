import { useState, useEffect } from "react";
import { Text, View, Pressable, StyleSheet, ScrollView } from "react-native";
import * as Location from "expo-location";

// Backend base URL from the environment (.env -> EXPO_PUBLIC_API_BASE_URL).
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export default function Index() {
  const [status, setStatus] = useState("位置情報を取得中…");
  const [coords, setCoords] = useState<Location.LocationObjectCoords | null>(
    null,
  );
  const [answer, setAnswer] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // 起動時に現在地を取得（learning/05, 06）
  useEffect(() => {
    (async () => {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== "granted") {
        setStatus("位置情報の許可が得られませんでした");
        return;
      }
      try {
        const location = await Location.getCurrentPositionAsync({});
        setCoords(location.coords);
        setStatus("取得できました");
      } catch (e) {
        setStatus("取得に失敗しました: " + String(e));
      }
    })();
  }, []);

  // 位置をバックエンドに送って回答を受け取る（モック連携）
  async function askBackend() {
    if (!coords) return;
    if (!API_BASE_URL) {
      setAnswer("エラー: API URL が未設定です（.env を確認）");
      return;
    }
    setSending(true);
    setAnswer(null);
    try {
      // 今はモックなので start/end に同じ座標を入れて送る（2点目取得は今後実装）
      const res = await fetch(`${API_BASE_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: { latitude: coords.latitude, longitude: coords.longitude },
          end: { latitude: coords.latitude, longitude: coords.longitude },
        }),
      });
      const data = await res.json();
      setAnswer(data.answer ?? JSON.stringify(data));
    } catch (e) {
      setAnswer("送信に失敗しました: " + String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.status}>{status}</Text>

      {coords && (
        <View style={styles.card}>
          <Text style={styles.label}>緯度</Text>
          <Text style={styles.value}>{coords.latitude}</Text>
          <Text style={styles.label}>経度</Text>
          <Text style={styles.value}>{coords.longitude}</Text>
        </View>
      )}

      {coords && (
        <Pressable
          style={[styles.button, sending && styles.buttonDisabled]}
          onPress={askBackend}
          disabled={sending}
        >
          <Text style={styles.buttonText}>
            {sending ? "送信中…" : "バックエンドに送信"}
          </Text>
        </Pressable>
      )}

      {answer && (
        <View style={styles.answerCard}>
          <Text style={styles.label}>バックエンドからの回答</Text>
          <Text style={styles.answer}>{answer}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E1E2E",
    padding: 24,
    gap: 20,
  },
  status: { fontSize: 16, color: "#FFFFFF" },
  card: {
    backgroundColor: "#2A2A3E",
    padding: 20,
    borderRadius: 8,
    alignItems: "center",
    gap: 4,
  },
  label: { fontSize: 13, color: "#AAAAAA", marginTop: 8 },
  value: { fontSize: 20, fontWeight: "bold", color: "#FF6B35" },
  button: {
    backgroundColor: "#FF6B35",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  buttonDisabled: { backgroundColor: "#8A5A44" },
  buttonText: { color: "#FFFFFF", fontSize: 18, fontWeight: "bold" },
  answerCard: {
    backgroundColor: "#2A2A3E",
    padding: 20,
    borderRadius: 8,
    alignSelf: "stretch",
  },
  answer: { fontSize: 16, color: "#FFFFFF", marginTop: 6 },
});
