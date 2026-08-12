import { useState, useEffect } from "react";
import {
  Text,
  View,
  Pressable,
  StyleSheet,
  ScrollView,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import type { AskRequest, AskResponse } from "@/api/types";

// Backend base URL from the environment (.env -> EXPO_PUBLIC_API_BASE_URL).
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

export default function Index() {
  const [status, setStatus] = useState("位置情報を取得中…");
  const [coords, setCoords] = useState<Location.LocationObjectCoords | null>(
    null,
  );
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // 会話を続けるためのセッションID。サーバーが発行した値を保持して次回送る。
  // 要件は「一問一答＋α」で、アプリを再起動してまで続ける想定はないため
  // 端末に永続化はせずメモリ上だけで持つ（docs/00 の会話継続の方針）。
  // ref ではなく state にしているのは、値の有無で画面表示を変えるため。
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Androidのナビゲーションバー（戻るボタン等）と最下部のボタンが重なって
  // 押せなくなるのを防ぐ。実機で発生した問題。
  const insets = useSafeAreaInsets();

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

  // 質問と現在地をバックエンドに送り、AIの回答を受け取る（US-1.01・1.03）
  async function askBackend() {
    if (!coords || !question.trim() || sending) return;
    if (!API_BASE_URL) {
      setAnswer("エラー: API URL が未設定です（.env を確認）");
      return;
    }
    setSending(true);
    setAnswer(null);
    try {
      // OpenAPIから生成した AskRequest 型で、送るデータの形が保証される。
      // end（進行方向用の2点目）は US-2.03 で追加するので今は送らない。
      const requestBody: AskRequest = {
        question: question.trim(),
        start: { latitude: coords.latitude, longitude: coords.longitude },
        // 前回のIDがあれば送る → 会話が続く。無ければサーバーが新規発行する。
        ...(sessionId ? { sessionId } : {}),
      };
      const res = await fetch(`${API_BASE_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = (await res.json()) as AskResponse & { error?: string };
      if (!res.ok) {
        setAnswer("エラー: " + (data.error ?? `HTTP ${res.status}`));
        return;
      }
      // 次回のために発行されたIDを覚えておく（これが会話継続の要）
      setSessionId(data.sessionId);
      setAnswer(data.answer);
      setQuestion("");
    } catch (e) {
      setAnswer("送信に失敗しました: " + String(e));
    } finally {
      setSending(false);
    }
  }

  // 会話をリセットする。IDを捨てれば次の質問から新しい会話になる。
  function resetConversation() {
    setSessionId(null);
    setAnswer(null);
    setQuestion("");
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        // 端末のナビゲーションバーの高さぶん余白を足す（最低24）。
        { paddingBottom: Math.max(insets.bottom, 24) + 24 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
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
        <View style={styles.askArea}>
          <TextInput
            style={styles.input}
            value={question}
            onChangeText={setQuestion}
            placeholder="例: 右手に見える山は何ですか？"
            placeholderTextColor="#888899"
            multiline
            maxLength={500}
            editable={!sending}
            onSubmitEditing={askBackend}
          />
          <Pressable
            style={[
              styles.button,
              (sending || !question.trim()) && styles.buttonDisabled,
            ]}
            onPress={askBackend}
            disabled={sending || !question.trim()}
          >
            <Text style={styles.buttonText}>
              {sending ? "考えています…" : "質問する"}
            </Text>
          </Pressable>
          {/* 初回はコンテナ起動で10秒前後かかる（pre-research/voice/ §6） */}
          {sending && (
            <Text style={styles.note}>
              最初の質問は10秒ほどかかります
            </Text>
          )}
        </View>
      )}

      {answer && (
        <View style={styles.answerCard}>
          <Text style={styles.label}>回答</Text>
          <Text style={styles.answer}>{answer}</Text>
        </View>
      )}

      {/* US-1.05。走行中は画面を一瞬見るだけなので、リンクではなくボタンにする。
          会話中であることも併せて示す（黙って文脈が続くと混乱するため）。 */}
      {sessionId && (
        <View style={styles.resetArea}>
          <Text style={styles.sessionNote}>会話が続いています</Text>
          <Pressable
            style={[styles.resetButton, sending && styles.resetButtonDisabled]}
            onPress={resetConversation}
            disabled={sending}
          >
            <Text style={styles.resetButtonText}>新しい会話を始める</Text>
          </Pressable>
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
  askArea: { alignSelf: "stretch", alignItems: "center", gap: 12 },
  input: {
    alignSelf: "stretch",
    backgroundColor: "#2A2A3E",
    color: "#FFFFFF",
    fontSize: 16,
    padding: 14,
    borderRadius: 8,
    minHeight: 72,
    textAlignVertical: "top",
  },
  note: { fontSize: 12, color: "#AAAAAA" },
  resetArea: { alignItems: "center", gap: 8 },
  sessionNote: { fontSize: 13, color: "#7FD1AE" },
  resetButton: {
    // Outlined rather than filled, so it does not compete with 「質問する」.
    borderWidth: 2,
    borderColor: "#FF6B35",
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 8,
  },
  resetButtonDisabled: { borderColor: "#8A5A44" },
  resetButtonText: { color: "#FF6B35", fontSize: 16, fontWeight: "bold" },
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
