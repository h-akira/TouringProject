import { useState, useEffect } from "react";
import { Text, View, StyleSheet } from "react-native";
import * as Location from "expo-location";

export default function Index() {
  // 状態（learning/05 の useState）。位置と、いま何が起きているかのメッセージを持つ。
  const [status, setStatus] = useState("位置情報を取得中…");
  const [coords, setCoords] = useState<Location.LocationObjectCoords | null>(
    null,
  );

  // 起動時に1回だけ実行（learning/05 の useEffect(..., []) = Vueの onMounted 相当）。
  useEffect(() => {
    (async () => {
      // 1. 位置情報の使用許可をユーザーに求める
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== "granted") {
        setStatus("位置情報の許可が得られませんでした");
        return;
      }

      // 2. 現在地を取得する
      try {
        const location = await Location.getCurrentPositionAsync({});
        setCoords(location.coords);
        setStatus("取得できました");
      } catch (e) {
        setStatus("取得に失敗しました: " + String(e));
      }
    })();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.status}>{status}</Text>

      {coords && (
        <View style={styles.card}>
          <Text style={styles.label}>緯度 (latitude)</Text>
          <Text style={styles.value}>{coords.latitude}</Text>
          <Text style={styles.label}>経度 (longitude)</Text>
          <Text style={styles.value}>{coords.longitude}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E1E2E",
    padding: 24,
    gap: 20,
  },
  status: {
    fontSize: 16,
    color: "#FFFFFF",
  },
  card: {
    backgroundColor: "#2A2A3E",
    padding: 20,
    borderRadius: 8,
    alignItems: "center",
    gap: 4,
  },
  label: {
    fontSize: 13,
    color: "#AAAAAA",
    marginTop: 8,
  },
  value: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#FF6B35",
  },
});
