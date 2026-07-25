import { useState } from "react";
import { Text, View, Pressable, StyleSheet } from "react-native";

export default function Index() {
  // 状態（Vueの ref(0) に相当）。count が今の値、setCount が更新用の関数。
  const [count, setCount] = useState(0);

  return (
    <View style={styles.container}>
      <Text style={styles.count}>{count}</Text>

      {/* Pressable = タップできる要素（Webの <button> に相当）。
          押されたら setCount を呼び、状態を更新する →
          React が関数を再実行して画面が新しい count で描き直される。 */}
      <Pressable style={styles.button} onPress={() => setCount(count + 1)}>
        <Text style={styles.buttonText}>+1</Text>
      </Pressable>

      <Pressable style={styles.resetButton} onPress={() => setCount(0)}>
        <Text style={styles.buttonText}>リセット</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1E1E2E",
    gap: 20,
  },
  count: {
    fontSize: 72,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  button: {
    backgroundColor: "#FF6B35",
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 8,
  },
  resetButton: {
    backgroundColor: "#555555",
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "bold",
  },
});
