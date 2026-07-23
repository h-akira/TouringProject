import { Text, View, StyleSheet } from "react-native";

export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>つながった！🎉</Text>
      <Text style={styles.subtitle}>これが index.tsx の画面です</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    // 青いスプラッシュと明確に区別するため、あえて派手なオレンジ背景にする
    backgroundColor: "#FF6B35",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  subtitle: {
    marginTop: 12,
    fontSize: 16,
    color: "#FFFFFF",
  },
});
