import { useState, useEffect, useRef } from "react";
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
import Constants from "expo-constants";
import type { AskRequest, AskResponse } from "@/api/types";

// 画面に出すバージョン（app.json の version）。
// ⚠️ **実機で「更新が反映されたか」を確かめるためのもの。**
// Expo Go はキャッシュが残ることがあり、見た目では判別できないため。
// アプリの変更時は app.json の version を上げること（CLAUDE.md に明記）。
const APP_VERSION = Constants.expoConfig?.version ?? "?";

// Backend base URL from the environment (.env -> EXPO_PUBLIC_API_BASE_URL).
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

// これ未満しか動いていなければ、方位はGPSの誤差でしかない。
// ⚠️ サーバー側の MIN_DISTANCE_METERS（backend/src/lib/geo.py）と同じ値。
const MIN_DISTANCE_METERS = 5;

// これより古い位置は「いまの進行方向」の根拠にしない。
// 休憩を挟んでも直前の走行の方位が残り続けるのを防ぐ（信号待ちは残したいので2分）。
const MAX_HISTORY_AGE_MS = 2 * 60 * 1000;

// 起点として遡ってよい時間の上限。
// ⚠️ **方向転換への追従に効く。** 古い点を起点にすると「曲がる前の向き」が
// 出てしまうため、いまの向きの根拠は直近に限る。
//
// ⚠️ **距離で上限を切ってはいけない。** 速度で2点間の距離は大きく変わり
// （60km/hなら3秒で50m、100km/hなら83m）、距離を上限にすると
// 高速走行時に方位が出なくなる。時間なら速度に依存しない。
const MAX_ORIGIN_AGE_MS = 30 * 1000;

/** タイムスタンプ付きの位置。履歴を遡って方位を出すために時刻が要る。 */
type TrackedPoint = {
  coords: Location.LocationObjectCoords;
  timestamp: number;
};

// 16方位のラベル（北から時計回り）。
// ⚠️ backend/src/lib/geo.py の _COMPASS_POINTS と同じ並び。
const COMPASS_POINTS = [
  "北", "北北東", "北東", "東北東",
  "東", "東南東", "南東", "南南東",
  "南", "南南西", "南西", "西南西",
  "西", "西北西", "北西", "北北西",
] as const;

/**
 * 2点間の方位（真北から時計回りの度数、0〜360）。
 *
 * ⚠️ **サーバー側（backend/src/lib/geo.py）と同じ式を持つことになる。**
 * 本来は二重実装だが、ここでは**表示が目的**であり、
 * 画面の値とAIの回答がズレていないかの検算にもなる。
 * 質問に添えて送るのは変わらず座標2点で、**方位そのものは送らない**。
 */
function calculateBearing(
  from: Location.LocationObjectCoords,
  to: Location.LocationObjectCoords,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const deltaLon = toRad(to.longitude - from.longitude);

  const x = Math.sin(deltaLon) * Math.cos(lat2);
  const y =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

/** 度数を16方位のラベルにする。 */
function bearingToCompass(bearing: number): string {
  return COMPASS_POINTS[Math.round(bearing / 22.5) % 16];
}

/** 2点間の距離（メートル）。判定用途なので簡易な近似で足りる。 */
function distanceMeters(
  a: Location.LocationObjectCoords,
  b: Location.LocationObjectCoords,
): number {
  const metersPerDegree = 111_000;
  const dLat = (a.latitude - b.latitude) * metersPerDegree;
  const dLon =
    (a.longitude - b.longitude) *
    metersPerDegree *
    Math.cos((a.latitude * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

/**
 * 進行方向の起点にする過去の位置を、履歴から選ぶ。
 *
 * 新しい方から遡り、現在地から MIN_DISTANCE_METERS 以上離れた最初の点を返す。
 * 直前の点が近すぎても（低速・信号待ち）、さらに前を辿れば方位が出せる。
 * **新しい順に見るのが肝**で、方向転換した直後は直近の点ほど
 * いまの向きに忠実（曲がる前の点を使うと転回前の方位が出る）。
 *
 * 見つからずに終わる条件は2つあり、どちらも方位なし（null）とする:
 *   - 直近に5m以上離れた点が無い → 止まっている
 *   - 見つかった点が古すぎる（30秒超）→ ゆっくり動いているか転回中で、
 *     いまの向きの根拠にできない
 *
 * ⚠️ **方向転換の直後は一時的に方位なしになる。これは意図した挙動。**
 * 曲がっている最中の「右手」は数秒で変わるので、出さない方が安全。
 * 直進が数秒続けば起点が見つかり、方位は自然に復活する。
 *
 * 見つかった点の添字も返す。**それより古い点は二度と使わないので捨てられる**。
 */
function findHeadingOrigin(
  history: TrackedPoint[],
  current: Location.LocationObjectCoords,
  now: number,
): { point: TrackedPoint; index: number } | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const point = history[i];
    // 古い方へ向かって走査しているので、一度超えたらそれ以上は見なくてよい。
    if (now - point.timestamp > MAX_HISTORY_AGE_MS) return null;
    if (distanceMeters(current, point.coords) >= MIN_DISTANCE_METERS) {
      // 最初に条件を満たした＝いちばん新しい点。これが古いなら、
      // それより前はもっと古いので、探索を続ける意味は無い。
      return now - point.timestamp <= MAX_ORIGIN_AGE_MS
        ? { point, index: i }
        : null;
    }
  }
  return null;
}

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

  // 会話を始めた時刻。経過時間をサーバーに伝えるために持つ。
  // 走行中は質問ごとに場所が変わるので、AIが「さっきの山」を解釈するには
  // 「前の質問からどれだけ経ったか」が要る（docs/01 §5.5）。
  const conversationStartedAt = useRef<number | null>(null);

  // 進行方向を出すための位置履歴（US-2.03）。直近2分ぶんだけ持つ。
  // 1点だけだと低速時に「近すぎて方位が出せない」が続くため、履歴を遡る。
  // 送信時に最新値を確実に読む必要があるので ref で持つ（state はクロージャに
  // 古い値が残る）。画面表示用の判定結果は別途 state に出す。
  const historyRef = useRef<TrackedPoint[]>([]);

  // いまの進行方位（度）。出せないときは null。画面に出すためだけの値で、
  // サーバーに送るのはあくまで座標2点（方位はLambdaが計算し直す）。
  const [heading, setHeading] = useState<number | null>(null);

  // Androidのナビゲーションバー（戻るボタン等）と最下部のボタンが重なって
  // 押せなくなるのを防ぐ。実機で発生した問題。
  const insets = useSafeAreaInsets();

  // 起動中は位置を監視し続ける（learning/05, 06）。
  // 1点だけでは「どちらを向いているか」が分からないため、US-2.03 では
  // getCurrentPositionAsync（1回だけ）ではなく watchPositionAsync を使う。
  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== "granted") {
        setStatus("位置情報の許可が得られませんでした");
        return;
      }
      try {
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            // ⚠️ この2つは「どちらかを満たせば」ではなく、両方が制約になる。
            // timeInterval = 最短でもこの間隔を空ける（Android専用）
            // distanceInterval = これだけ動いたときにしかコールバックが来ない
            // → **停車中はコールバックが一切来ない。** 停車の検知は
            //   下の setInterval に頼っている（位置の更新では気づけない）。
            timeInterval: 3000,
            // 起点の判定が5m単位なので、位置もそれと同じ粒度で受け取る。
            // 10mだと低速時にコールバックの間隔が空きすぎ、履歴が粗くなって
            // 方向転換からの復帰が遅れる。
            distanceInterval: MIN_DISTANCE_METERS,
          },
          (location) => {
            if (cancelled) return;
            const now = location.timestamp ?? Date.now();

            // 2分より古い点は捨てる。捨てないと履歴が延々と伸びるうえ、
            // 古い点を根拠に「まだ動いている」と誤判定してしまう。
            const history = historyRef.current.filter(
              (p) => now - p.timestamp <= MAX_HISTORY_AGE_MS,
            );
            history.push({ coords: location.coords, timestamp: now });

            // 起点が決まったら、それより古い点は用途が無いので捨てる。
            // 走行中は毎回ここで刈られるので、履歴はごく短いまま保たれる。
            const origin = findHeadingOrigin(history, location.coords, now);
            historyRef.current = origin
              ? history.slice(origin.index)
              : history;

            setCoords(location.coords);
            setHeading(
              origin
                ? calculateBearing(origin.point.coords, location.coords)
                : null,
            );
            setStatus("取得できました");
          },
        );
      } catch (e) {
        setStatus("取得に失敗しました: " + String(e));
      }
    })();

    // 画面を離れるときに監視を止める（止めないとGPSが動き続けて電池を食う）。
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  // ⚠️ **停車の検知はここでしかできない。**
  // distanceInterval があるため、停車中はコールバックが呼ばれない
  // ＝位置の更新をきっかけにした判定では「止まった」ことに永久に気づけない。
  // 時間の経過だけを頼りに、定期的に判定をやり直す。
  useEffect(() => {
    const timer = setInterval(() => {
      const history = historyRef.current;
      const latest = history[history.length - 1];
      if (!latest) return;
      const origin = findHeadingOrigin(history, latest.coords, Date.now());
      setHeading(
        origin ? calculateBearing(origin.point.coords, latest.coords) : null,
      );
      // ここでは履歴を刈らない。停車が続くと最終的に2分で全部落ちるので、
      // 動き出したときに備えて残しておく。
    }, 5000);
    return () => clearInterval(timer);
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
      // end は過去の位置で、end→start の向きが進行方向になる（US-2.03）。
      // 送信の直前に履歴から選び直す（止まっていれば見つからず、方位なしで送る）。
      const origin = findHeadingOrigin(historyRef.current, coords, Date.now());
      // 会話の最初の質問なら経過時間は無い（サーバー側でも省略扱い）。
      const startedAt = conversationStartedAt.current;
      const requestBody: AskRequest = {
        question: question.trim(),
        start: { latitude: coords.latitude, longitude: coords.longitude },
        ...(startedAt !== null
          ? { elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000) }
          : {}),
        ...(origin
          ? {
              end: {
                latitude: origin.point.coords.latitude,
                longitude: origin.point.coords.longitude,
              },
            }
          : {}),
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
      // 会話の起点は最初の質問が通った時刻。以降はここからの経過を送る。
      if (conversationStartedAt.current === null) {
        conversationStartedAt.current = Date.now();
      }
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
    // 会話が変わるので経過時間の起点も捨てる（次の質問がまた「最初」になる）。
    conversationStartedAt.current = null;
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
      {/* 実機で更新が反映されたかを確かめるための表示（走行中には使わない） */}
      <Text style={styles.version}>v{APP_VERSION}</Text>

      <Text style={styles.status}>{status}</Text>

      {coords && (
        <View style={styles.card}>
          <Text style={styles.label}>緯度</Text>
          <Text style={styles.value}>{coords.latitude}</Text>
          <Text style={styles.label}>経度</Text>
          <Text style={styles.value}>{coords.longitude}</Text>
          {/* 進行方位の確認用（US-2.03）。矢印が進行方向を指す。
              停車中・転回直後は出ない（それが正しい挙動）。 */}
          {heading !== null ? (
            <View style={styles.compass}>
              <Text
                style={[
                  styles.compassNeedle,
                  // 北を上として、方位のぶんだけ矢印を回す。
                  { transform: [{ rotate: `${heading}deg` }] },
                ]}
              >
                ↑
              </Text>
              <Text style={styles.compassLabel}>
                {bearingToCompass(heading)} {Math.round(heading)}°
              </Text>
              <Text style={styles.note}>
                右手: {bearingToCompass((heading + 90) % 360)} / 左手:{" "}
                {bearingToCompass((heading + 270) % 360)}
              </Text>
            </View>
          ) : (
            <Text style={styles.note}>進行方向: まだ出せません（停車中など）</Text>
          )}
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
  // 開発用の表示なので目立たせない。
  version: { fontSize: 11, color: "#666677" },
  compass: { alignItems: "center", marginTop: 12, gap: 2 },
  // 矢印そのものを回して進行方向を指す。
  compassNeedle: { fontSize: 34, color: "#FF6B35", lineHeight: 38 },
  compassLabel: { fontSize: 18, fontWeight: "bold", color: "#FFFFFF" },
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
