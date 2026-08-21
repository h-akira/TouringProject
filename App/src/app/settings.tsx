/**
 * 設定画面（docs/01_architecture.md §8）。
 *
 * 走行中には使わない画面なので、作り込みは最小限にとどめる
 * （CLAUDE.md「モバイルは必要最低限」）。停車中に触る想定。
 *
 * 扱うのは2つ:
 *   - **APIキー**（一度入れたら変えない）
 *   - **無音検知の閾値**（⚠️ **走行環境ごとに詰める必要がある**。
 *     風切り音・エンジン音で妥当な値が変わるため、端末で直せることが要件。
 *     pre-research/handsfree/FINDINGS.md §11）
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View, Pressable, StyleSheet, TextInput, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  useAudioRecorder,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import { loadApiKey, saveApiKey, clearApiKey } from "@/api/apiKey";
import {
  RECORDING_OPTIONS,
  METERING_INTERVAL_MS,
  AUDIO_MODE_RECORDING,
  AUDIO_MODE_PLAYBACK,
  isSilent,
} from "@/api/voice";
import {
  loadReturnApp,
  saveReturnApp,
  type LaunchableApp,
} from "@/api/returnApp";
import AppForeground from "@/native/app-foreground";
import {
  DEFAULT_VAD_SETTINGS,
  VAD_LIMITS,
  loadVadSettings,
  saveVadSettings,
  clearVadSettings,
  normalizeVadSettings,
  type VadSettings,
} from "@/api/vadSettings";

/** 数秒後に自動で消える通知を扱う。 */
const MESSAGE_TIMEOUT_MS = 3_000;

/**
 * 一定時間で自動的に消えるメッセージ。
 *
 * ⚠️ **消えないと「反映されたか」が分からなくなる。** 出したままだと、
 * 2回目に保存したとき**前回の「保存しました」が残っているのか、
 * 今回出たのか区別できない**（同じ文言なので変化が見えない）。
 * 一度消してから出し直すことで、押すたびに必ず変化が起きる。
 */
function useTransientMessage(): [string | null, (message: string | null) => void] {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((next: string | null) => {
    if (timer.current) clearTimeout(timer.current);
    // ⚠️ 一度 null にしてから出す。同じ文言でも「消えて出た」が見えるように。
    setMessage(null);
    if (next === null) return;
    // 次のフレームで出す（同じレンダーで戻すと変化が見えない）。
    timer.current = setTimeout(() => {
      setMessage(next);
      timer.current = setTimeout(() => setMessage(null), MESSAGE_TIMEOUT_MS);
    }, 50);
  }, []);

  // 画面を離れるときにタイマーを残さない。
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return [message, show];
}

export default function Settings() {
  const [apiKey, setApiKey] = useState("");
  // 保存済みかどうか。入力欄には既存のキーを出さないので、
  // 「もう入れてあるのか」はこの表示でしか分からない。
  const [stored, setStored] = useState<boolean>(false);
  // ⚠️ 数秒で消える（出しっぱなしだと、2回目の保存で反映されたか分からない）。
  const [message, setMessage] = useTransientMessage();
  const [loading, setLoading] = useState(true);

  // 無音検知の閾値。入力途中は数値にならないので、文字列のまま持つ。
  // ⚠️ **数値でstateを持つと「-」や「1.」の途中入力が消えて打てなくなる。**
  const [thresholdDb, setThresholdDb] = useState("");
  const [durationSec, setDurationSec] = useState("");
  const [graceSec, setGraceSec] = useState("");
  const [maxRecordingSec, setMaxRecordingSec] = useState("");
  const [vadMessage, setVadMessage] = useTransientMessage();
  // 保存済みの値。音量表示の「無音/音あり」判定に使う。
  const [vad, setVad] = useState<VadSettings>(DEFAULT_VAD_SETTINGS);

  // 音量の実測表示。⚠️ **これが無いと閾値を勘で決めることになる。**
  // 停車中にエンジンをかけたまま値を見れば、走る前に当たりをつけられる。
  const meterRecorder = useAudioRecorder(RECORDING_OPTIONS);
  const [monitoring, setMonitoring] = useState(false);
  const [meterDb, setMeterDb] = useState<number | null>(null);

  // 応答後に戻る先のアプリ（US-2.04）。null は「戻らない」。
  const [apps, setApps] = useState<LaunchableApp[]>([]);
  const [returnApp, setReturnApp] = useState<string | null>(null);
  const [returnAppMessage, setReturnAppMessage] = useTransientMessage();
  const monitorTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // 停止処理を effect の後片付けからも呼ぶので、最新の実体を ref で持つ。
  const stopMonitorRef = useRef<() => void>(() => {});

  const insets = useSafeAreaInsets();

  // ⚠️ 保存済みのキーを入力欄に流し込まない。
  // 画面に出す必要が無いうえ、肩越しに見られる・スクショに写る経路を増やすため。
  // 「設定済みか」だけを見せ、変更したいときは入力し直してもらう。
  //
  // 📌 **閾値の方は逆に、現在値を入力欄に出す**（秘密ではなく、
  // 「いまいくつか」を見ながら微調整するための画面なので）。
  useEffect(() => {
    (async () => {
      setStored((await loadApiKey()) !== null);
      const settings = await loadVadSettings();
      setVad(settings);
      setThresholdDb(String(settings.thresholdDb));
      // ⚠️ 入力はミリ秒ではなく秒で受ける（走行中に読む値なので桁を減らす）。
      setDurationSec(String(settings.durationMs / 1000));
      setGraceSec(String(settings.graceMs / 1000));
      setMaxRecordingSec(String(settings.maxRecordingMs / 1000));
      setReturnApp(await loadReturnApp());
      setLoading(false);
    })();
    // 戻り先に選べるアプリの一覧。⚠️ **失敗しても設定画面全体は使えるようにする**
    // （一覧が空でも、APIキーや閾値の設定は独立して成立する）。
    (async () => {
      try {
        setApps(await AppForeground.listLaunchableApps());
      } catch (e) {
        console.warn("failed to list launchable apps", e);
      }
    })();
  }, []);

  /**
   * 戻り先のアプリを選ぶ。⚠️ **選んだ時点で保存する**（保存ボタンを作らない）。
   * 走行前に触る設定なので、押し忘れで効かない方が困る。
   */
  async function onSelectReturnApp(packageName: string | null) {
    setReturnApp(packageName);
    try {
      await saveReturnApp(packageName);
      setReturnAppMessage(
        packageName === null ? "戻らないようにしました" : "保存しました",
      );
    } catch {
      setReturnAppMessage("保存できませんでした");
    }
  }

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

  /**
   * 音量の監視を止める。
   *
   * ⚠️ **マイクと音声モードを必ず戻す。** 掴んだままにすると、
   * 戻った先の録音が始められず、読み上げも鳴らなくなる（index.tsx と同じ理由）。
   */
  function stopMonitor() {
    if (monitorTimer.current) {
      clearInterval(monitorTimer.current);
      monitorTimer.current = null;
    }
    setMonitoring(false);
    setMeterDb(null);
    void (async () => {
      try {
        await meterRecorder.stop();
        await setAudioModeAsync(AUDIO_MODE_PLAYBACK);
      } catch {
        // 既に止まっている場合は失敗しうる。捨てててよい。
      }
    })();
  }

  /**
   * 音量の監視を始める。
   *
   * ⚠️ **録音はするが保存も送信もしない。** 閾値を決めるために値を見るだけで、
   * 止めた時点で録れたファイルは捨てる。
   */
  async function startMonitor() {
    if (monitoring) return;
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        setVadMessage("マイクの許可が得られませんでした");
        return;
      }
      await setAudioModeAsync(AUDIO_MODE_RECORDING);
      await meterRecorder.prepareToRecordAsync();
      meterRecorder.record();
      setMonitoring(true);
      setVadMessage(null);
      monitorTimer.current = setInterval(() => {
        // ⚠️ maxAmplitude は読むとリセットされるので、読むのはここだけ
        // （src/api/voice.ts）。
        setMeterDb(meterRecorder.getStatus().metering ?? null);
      }, METERING_INTERVAL_MS);
    } catch (e) {
      stopMonitor();
      setVadMessage("音量の測定を開始できませんでした: " + String(e));
    }
  }

  // ⚠️ **レンダー中に ref を書かない**（Reactの禁じ手。捨てられるレンダーでも
  // 書き換わる）。最新の停止処理は副作用の中で差し替える。
  useEffect(() => {
    stopMonitorRef.current = stopMonitor;
  });

  // 画面を離れるときに必ず止める（マイクを掴んだままにしない）。
  useEffect(() => {
    return () => stopMonitorRef.current();
  }, []);

  async function onSaveVad() {
    // 秒で受けてミリ秒に直す。数値でない入力は保存済みの値を据え置く。
    const parsed = normalizeVadSettings({
      thresholdDb: Number(thresholdDb),
      durationMs: Number(durationSec) * 1000,
      graceMs: Number(graceSec) * 1000,
      maxRecordingMs: Number(maxRecordingSec) * 1000,
    });
    try {
      const saved = await saveVadSettings(parsed);
      setVad(saved);
      // ⚠️ **範囲外の入力は寄せて保存されるので、入力欄も直った値に揃える**
      // （画面と実際の設定がズレたままになるのを防ぐ）。
      setThresholdDb(String(saved.thresholdDb));
      setDurationSec(String(saved.durationMs / 1000));
      setGraceSec(String(saved.graceMs / 1000));
      setMaxRecordingSec(String(saved.maxRecordingMs / 1000));
      setVadMessage("保存しました");
    } catch (e) {
      setVadMessage("保存に失敗しました: " + String(e));
    }
  }

  async function onResetVad() {
    try {
      await clearVadSettings();
      setVad(DEFAULT_VAD_SETTINGS);
      setThresholdDb(String(DEFAULT_VAD_SETTINGS.thresholdDb));
      setDurationSec(String(DEFAULT_VAD_SETTINGS.durationMs / 1000));
      setGraceSec(String(DEFAULT_VAD_SETTINGS.graceMs / 1000));
      setMaxRecordingSec(String(DEFAULT_VAD_SETTINGS.maxRecordingMs / 1000));
      setVadMessage("既定値に戻しました");
    } catch (e) {
      setVadMessage("戻せませんでした: " + String(e));
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

      {/* ⚠️ **無音検知の調整。** 走行中は画面を触れないので、
          「話し終えたら自動で送る」が成立しないとハンズフリーにならない。
          妥当な値は風切り音・エンジン音で変わるため、ここで詰められるようにする。 */}
      <View style={styles.divider} />
      <Text style={styles.title}>音声の自動送信</Text>
      <Text style={styles.note}>
        話し終えて静かになったら、自動で録音を止めて送ります。
        うまく止まらない・途中で切れる場合はここで調整してください。
      </Text>

      {/* 実測値を見ながら決めるための表示。⚠️ **勘で決めさせない。** */}
      <View style={styles.meterCard}>
        <Text style={styles.meterValue}>
          {!monitoring
            ? "— 停止中 —"
            : meterDb === null
              ? "測定できません"
              : `${meterDb.toFixed(1)} dB`}
        </Text>
        {monitoring && meterDb !== null && (
          <Text
            style={isSilent(meterDb, vad) ? styles.meterSilent : styles.meterVoice}
          >
            {isSilent(meterDb, vad)
              ? "無音と判定（この状態が続けば送信）"
              : "音ありと判定（録音を続ける）"}
          </Text>
        )}
        <Pressable
          style={monitoring ? styles.monitorButtonOn : styles.monitorButton}
          onPress={monitoring ? stopMonitor : startMonitor}
        >
          <Text style={styles.monitorButtonText}>
            {monitoring ? "■ 測定を止める" : "🎤 いまの音量を測る"}
          </Text>
        </Pressable>
        <Text style={styles.hint}>
          ⚠️ エンジンをかけた状態で測ると、走行中に近い値が分かります。
          黙っているときの値より少し高めを閾値にしてください。
        </Text>
      </View>

      <Text style={styles.fieldLabel}>
        無音とみなす音量（dB・{VAD_LIMITS.thresholdDb.min}〜
        {VAD_LIMITS.thresholdDb.max}）
      </Text>
      <Text style={styles.hint}>
        これを下回ると無音。⚠️ 低くしすぎると止まらず、高すぎると話の途中で切れます。
      </Text>
      <TextInput
        style={styles.input}
        value={thresholdDb}
        onChangeText={setThresholdDb}
        // ⚠️ 負の数を打つので numeric ではなく numbers-and-punctuation。
        keyboardType="numbers-and-punctuation"
        placeholder={String(DEFAULT_VAD_SETTINGS.thresholdDb)}
        placeholderTextColor="#888899"
      />

      <Text style={styles.fieldLabel}>
        送信するまでの無音の長さ（秒・{VAD_LIMITS.durationMs.min / 1000}〜
        {VAD_LIMITS.durationMs.max / 1000}）
      </Text>
      <Text style={styles.hint}>
        短いと言葉の「間」で切れ、長いと待たされます。
      </Text>
      <TextInput
        style={styles.input}
        value={durationSec}
        onChangeText={setDurationSec}
        keyboardType="numbers-and-punctuation"
        placeholder={String(DEFAULT_VAD_SETTINGS.durationMs / 1000)}
        placeholderTextColor="#888899"
      />

      <Text style={styles.fieldLabel}>
        話し始めるまでの猶予（秒・{VAD_LIMITS.graceMs.min / 1000}〜
        {VAD_LIMITS.graceMs.max / 1000}）
      </Text>
      <Text style={styles.hint}>
        録音開始から この間は無音でも送りません。⚠️ 短いと話す前に送信されます。
      </Text>
      <TextInput
        style={styles.input}
        value={graceSec}
        onChangeText={setGraceSec}
        keyboardType="numbers-and-punctuation"
        placeholder={String(DEFAULT_VAD_SETTINGS.graceMs / 1000)}
        placeholderTextColor="#888899"
      />

      <Text style={styles.fieldLabel}>
        録音の上限（秒・{VAD_LIMITS.maxRecordingMs.min / 1000}〜
        {VAD_LIMITS.maxRecordingMs.max / 1000}）
      </Text>
      <Text style={styles.hint}>
        ⚠️ 一度も話さなかったときは、ここでしか止まりません。
        長い質問をしたいときは伸ばしてください（長すぎると送信に失敗します）。
      </Text>
      <TextInput
        style={styles.input}
        value={maxRecordingSec}
        onChangeText={setMaxRecordingSec}
        keyboardType="numbers-and-punctuation"
        placeholder={String(DEFAULT_VAD_SETTINGS.maxRecordingMs / 1000)}
        placeholderTextColor="#888899"
      />

      <Pressable style={styles.button} onPress={onSaveVad}>
        <Text style={styles.buttonText}>保存</Text>
      </Pressable>
      <Pressable style={styles.clearButton} onPress={onResetVad}>
        <Text style={styles.clearButtonText}>既定値に戻す</Text>
      </Pressable>

      {vadMessage && <Text style={styles.message}>{vadMessage}</Text>}

      <View style={styles.divider} />

      <Text style={styles.title}>応答後に戻るアプリ</Text>
      <Text style={styles.note}>
        インカムのボタンで起動したときだけ、回答が届いた時点でこのアプリに戻ります
        （読み上げは戻ったあとも続きます）。ナビ中のアプリを選んでください。
      </Text>
      <Text style={styles.note}>
        ⚠️ 案内中のルートは壊れません（開き直すのではなく、元の画面に戻ります）。
      </Text>

      <Pressable
        style={[
          styles.appRow,
          returnApp === null && styles.appRowSelected,
        ]}
        onPress={() => void onSelectReturnApp(null)}
      >
        <Text style={styles.appRowText}>
          {returnApp === null ? "◉" : "○"}　戻らない
        </Text>
      </Pressable>

      {apps.length === 0 ? (
        <Text style={styles.note}>アプリの一覧を取得できませんでした。</Text>
      ) : (
        apps.map((app) => (
          <Pressable
            key={app.packageName}
            style={[
              styles.appRow,
              returnApp === app.packageName && styles.appRowSelected,
            ]}
            onPress={() => void onSelectReturnApp(app.packageName)}
          >
            <Text style={styles.appRowText} numberOfLines={1}>
              {returnApp === app.packageName ? "◉" : "○"}　{app.label}
            </Text>
          </Pressable>
        ))
      )}

      {returnAppMessage && (
        <Text style={styles.message}>{returnAppMessage}</Text>
      )}

      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backButtonText}>戻る</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    // ⚠️ center にしない。項目が増えて画面より縦に長くなったため、
    // 中央寄せだと上端が切れてスクロールしても戻せなくなる。
    justifyContent: "flex-start",
    backgroundColor: "#1E1E2E",
    padding: 24,
    paddingTop: 40,
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
  appRow: {
    backgroundColor: "#2A2A3E",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  appRowSelected: { borderColor: "#FF6B35" },
  appRowText: { color: "#FFFFFF", fontSize: 15 },
  divider: {
    borderTopWidth: 1,
    borderTopColor: "#3A3A4E",
    marginTop: 12,
    paddingTop: 4,
  },
  fieldLabel: { fontSize: 14, color: "#FFFFFF", fontWeight: "bold" },
  hint: { fontSize: 12, color: "#888899", lineHeight: 17 },
  meterCard: {
    backgroundColor: "#2A2A3E",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    gap: 10,
  },
  // 測っている値そのもの。閾値を決める根拠なので大きく出す。
  meterValue: { fontSize: 28, fontWeight: "bold", color: "#FF6B35" },
  meterSilent: { fontSize: 14, color: "#7FD1AE", fontWeight: "bold" },
  meterVoice: { fontSize: 14, color: "#FF9E7A", fontWeight: "bold" },
  monitorButton: {
    alignSelf: "stretch",
    borderWidth: 2,
    borderColor: "#FF6B35",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  monitorButtonOn: {
    alignSelf: "stretch",
    backgroundColor: "#C0392B",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  monitorButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "bold" },
  backButton: { paddingVertical: 12, alignItems: "center" },
  backButtonText: { color: "#AAAAAA", fontSize: 16 },
});
