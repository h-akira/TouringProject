/**
 * 無音検知（VAD）の閾値の保管と読み出し（US-2.04の終了側）。
 *
 * ⚠️ **端末で調整できることが要件。** 妥当な値は風切り音・エンジン音に左右され、
 * **走ってみないと決まらない**（pre-research/handsfree/FINDINGS.md §11）。
 * `.env` だけだとMacに戻らないと直せず、その場で詰められない。
 *
 * ⚠️ **秘密ではないので `expo-secure-store` には置かない**（あちらはAPIキー用）。
 * 設定値の保管は AsyncStorage が定石。
 *
 * 既定値の出どころは3段階で、**後のものが優先される**:
 *   1. コード上の既定値（DEFAULT_VAD_SETTINGS）
 *   2. `.env` の `EXPO_PUBLIC_SILENCE_*`（チーム共有・ビルド時に固定）
 *   3. 端末に保存された値（設定画面で入れたもの）← **最優先**
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { RecordingSource } from "expo-audio";

/** 保存先のキー名。⚠️ 変えると保存済みの設定が読めなくなる（既定値に戻る）。 */
const VAD_STORE_KEY = "touring.vadSettings";

export type VadSettings = {
  /** 無音とみなす音量の閾値（dBFS）。無音が -160、最大が 0。 */
  thresholdDb: number;
  /** この時間だけ無音が続いたら送る（ミリ秒）。 */
  durationMs: number;
  /** 録音開始からこの時間は無音でも止めない（ミリ秒）。 */
  graceMs: number;
  /**
   * 録音の上限（ミリ秒）。ここに達したら録れているぶんで送る。
   *
   * ⚠️ **一度も話さなかったときの唯一の出口。** 無音検知は「発話があった」
   * ことを条件にするため、無言のままだとこの上限でしか止まらない。
   */
  maxRecordingMs: number;
  /**
   * 録音の用途（Androidの `MediaRecorder.AudioSource`）。
   *
   * ⚠️ **端末側の音の加工が変わる。** `metering` の元になる
   * `MediaRecorder.maxAmplitude` の見え方に効くため、**設定として切り替えられる**
   * ようにしてある（FINDINGS.md §12）。
   *
   * ⚠️ **エンジン始動中は `metering` が 0 dBFS に飽和して無音検知が働かない。**
   * AGC（自動ゲイン調整）が原因なら、**AGCが切られる `voice_recognition`**
   * で解ける可能性がある。どれが効くかは**実機で試すしかない**。
   */
  audioSource: RecordingSource;
};

/**
 * 選べる録音の用途と、その説明。**設定画面の選択肢もこれを使う**
 * （並びと文言を1箇所に持つ）。
 *
 * ⚠️ **`RecordingSource` の全部は並べない。** `camcorder`（カメラ向き）
 * `remote_submix`（端末の再生音を録る）`voice_performance`（低遅延の実演向け）は
 * **この用途に無関係**なので、迷わせないために出さない。
 */
export const AUDIO_SOURCE_CHOICES: readonly {
  value: RecordingSource;
  label: string;
  hint: string;
}[] = [
  {
    value: "mic",
    label: "mic（既定）",
    hint: "汎用のマイク。加工が少ない。⚠️ エンジン始動中に飽和したのはこれ",
  },
  {
    value: "voice_recognition",
    label: "voice_recognition",
    hint: "音声認識向け。⚠️ AGC（自動ゲイン調整）が切られるので本命",
  },
  {
    value: "voice_communication",
    label: "voice_communication",
    hint: "通話向け。ノイズ抑制とエコー除去。⚠️ AGCは効いたまま",
  },
  {
    value: "unprocessed",
    label: "unprocessed",
    hint: "一切加工しない生の音。⚠️ 比較のための対照",
  },
];

/** 保存された値が選択肢のどれかであること。⚠️ 未知の値は既定に落とす。 */
function isAudioSource(value: unknown): value is RecordingSource {
  return AUDIO_SOURCE_CHOICES.some((choice) => choice.value === value);
}

/** 数値の環境変数を読む。未設定・数値でない場合は既定値。 */
function envNumber(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return raw !== undefined && Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * 保存された値が無いときに使う既定値。
 *
 * ⚠️ **閾値（dB）だけは推定のまま。** 実機の停車中では成立を確認したが、
 * 走行中の暗騒音で妥当かは未検証（FINDINGS.md §11）。
 *
 * 📌 **時間の2つは実機で試した上で決めた値**（2026-08-18）:
 *   - **猶予5秒** — ハンズフリー起動では、インカムのボタンを押してから
 *     話し始めるまでに間がある。短いと**話す前に空の録音が飛ぶ。**
 *   - **無音3秒** — 走行中は考えながら話すので「間」が空く。
 *     短いと**言い終える前に切れる**（切れる方が、少し待つより痛い）。
 */
export const DEFAULT_VAD_SETTINGS: VadSettings = {
  thresholdDb: envNumber(process.env.EXPO_PUBLIC_SILENCE_THRESHOLD_DB, -40),
  durationMs: envNumber(process.env.EXPO_PUBLIC_SILENCE_DURATION_MS, 3_000),
  graceMs: envNumber(process.env.EXPO_PUBLIC_SILENCE_GRACE_MS, 5_000),
  maxRecordingMs: envNumber(process.env.EXPO_PUBLIC_MAX_RECORDING_MS, 30_000),
  /**
   * ⚠️ **既定は `mic`**（指定しなかったときの `expo-audio` の既定と同じ）。
   * **飽和したのはこの値**なので、実機で他を試して当たりが出たら既定を変える。
   */
  audioSource: isAudioSource(process.env.EXPO_PUBLIC_AUDIO_SOURCE)
    ? process.env.EXPO_PUBLIC_AUDIO_SOURCE
    : "mic",
};

/**
 * 入力できる範囲。⚠️ **走行中に自分を締め出さないための歯止め。**
 *
 * 極端な値を入れると「録音が永久に止まらない」「話す前に送信される」といった、
 * **画面を見ずには復帰できない状態**を自分で作れてしまう。
 */
export const VAD_LIMITS = {
  thresholdDb: { min: -120, max: -5 },
  durationMs: { min: 500, max: 10_000 },
  graceMs: { min: 0, max: 30_000 },
  /**
   * ⚠️ **上限は「送れる大きさ」で決まっている。**
   * サーバーは 2MB を超える音声を 413 で弾く（Backend の `MAX_AUDIO_BYTES`）。
   * 64kbps・モノラルなら 2MB ≒ 262秒なので、**余裕を見て 180秒まで**にする
   * （AACのビットレートは厳密には一定でないため、上限ぎりぎりを許さない）。
   * ⚠️ **ここを緩めるならサーバー側の上限も一緒に見直すこと。**
   */
  maxRecordingMs: { min: 5_000, max: 180_000 },
} as const;

/** 値を範囲内に収める。範囲外の入力を弾くのではなく寄せる（走行中の入力なので）。 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 読み込んだ値を検証して整える。
 *
 * ⚠️ **保存された値を信用しない。** 手で書き換えられる場所ではないが、
 * 古い版の形が残っていることはある（キーの欠落・数値でない値）。
 * 壊れた値で起動して「録音が止まらない」より、既定値に戻る方が安全。
 */
export function normalizeVadSettings(raw: unknown): VadSettings {
  const source = (raw ?? {}) as Partial<Record<keyof VadSettings, unknown>>;
  const pick = (key: keyof typeof VAD_LIMITS): number => {
    const value = Number(source[key]);
    if (!Number.isFinite(value)) return DEFAULT_VAD_SETTINGS[key];
    const limit = VAD_LIMITS[key];
    return clamp(value, limit.min, limit.max);
  };
  return {
    thresholdDb: pick("thresholdDb"),
    durationMs: pick("durationMs"),
    graceMs: pick("graceMs"),
    maxRecordingMs: pick("maxRecordingMs"),
    // ⚠️ 数値ではないので pick を通せない（選択肢のどれかであることだけ見る）。
    audioSource: isAudioSource(source.audioSource)
      ? source.audioSource
      : DEFAULT_VAD_SETTINGS.audioSource,
  };
}

/** 保存された設定。未保存・読み出し失敗なら既定値。 */
export async function loadVadSettings(): Promise<VadSettings> {
  try {
    const stored = await AsyncStorage.getItem(VAD_STORE_KEY);
    if (stored === null) return DEFAULT_VAD_SETTINGS;
    return normalizeVadSettings(JSON.parse(stored));
  } catch {
    // 壊れたJSONや読み出し失敗。⚠️ **ここで落とさない**
    // （設定が壊れただけで、走行中にアプリが使えなくなる方が困る）。
    return DEFAULT_VAD_SETTINGS;
  }
}

/** 設定を端末に保存する。範囲外の値は寄せてから保存する。 */
export async function saveVadSettings(
  settings: VadSettings,
): Promise<VadSettings> {
  const normalized = normalizeVadSettings(settings);
  await AsyncStorage.setItem(VAD_STORE_KEY, JSON.stringify(normalized));
  return normalized;
}

/** 保存された設定を消して既定値に戻す。 */
export async function clearVadSettings(): Promise<void> {
  await AsyncStorage.removeItem(VAD_STORE_KEY);
}
