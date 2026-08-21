/**
 * 声で質問するための録音設定と送信（US-2.01 / US-2.02、docs/01 §7）。
 *
 * ⚠️ **アプリは録音して送るだけ。** STT/TTS はバックエンドが呼ぶ。
 * 音声が Lambda を通るので「録音は何秒まで」を手前で強制できる
 * （アプリ側の上限は目安で、**本当の関門はサーバー側**。adr/002）。
 */
import { RecordingPresets, type RecordingOptions } from "expo-audio";
import { API_KEY_HEADER } from "@/api/apiKey";
import type { AskAcceptedResponse, Coordinates } from "@/api/types";
import type { VadSettings } from "@/api/vadSettings";

/**
 * 録音の設定。**M4A（AAC）で録る。**
 *
 * ⚠️ **Transcribe の推奨は FLAC / WAV だが、Androidの録音APIはどちらも出せない**
 * （`AndroidOutputFormat` に該当する値が無い）。両者が重なるのが M4A で、
 * `HIGH_QUALITY` プリセットの既定でもあるため**変換が要らない**（docs/01 §7）。
 *
 * プリセットから変えているのは2点だけ:
 *   - **モノラル**: 音声認識にステレオは要らず、素直に半分のサイズになる
 *   - **16kHz**: 人の声はこれで足りる（Transcribe も 16kHz 以上を想定）。
 *     ⚠️ 走行中は電波が細いので、送るものは小さいほどよい
 *
 * ⚠️ **`isMeteringEnabled` は無音検知（VAD）のために必須**。これが false だと
 * `getStatus().metering` が `undefined` のままになり、録音の自動終了が
 * 一切働かない（下記 SILENCE_* 参照）。
 */
export const RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 64000,
  isMeteringEnabled: true,
};

/**
 * 音量を見に行く間隔。
 *
 * ⚠️ **`MediaRecorder.maxAmplitude` は「前回読んでからの最大値」で、読むと
 * リセットされる。** つまりこの間隔がそのまま測定窓になるので、
 * **`getStatus()` を読む場所は1箇所に限ること**（`useAudioRecorderState` と
 * 併用すると値を奪い合い、どちらも正しい音量を見られなくなる）。
 */
export const METERING_INTERVAL_MS = 100;

/**
 * 録音するときの音声モード。読み上げの途中で録り始めると自分の声に回答が被る。
 *
 * ⚠️ **`setAudioModeAsync` はプロセス全体に効く。** 画面ごとに値を書くと
 * **後から呼んだ画面の設定が全体を上書きする**ので、
 * **録音向き・再生向きの2つに固定し、ここだけで持つ。**
 */
export const AUDIO_MODE_RECORDING = {
  allowsRecording: true,
  playsInSilentMode: true,
} as const;

/**
 * 録音していないときの音声モード。**録音を終えたら必ずこれに戻す。**
 *
 * ⚠️ **`shouldPlayInBackground: true` が要る（US-2.04）。** これが無いと
 * `expo-audio` は**アプリが背面に回った瞬間に再生を止める**
 * （`AudioModule.kt` の `OnActivityEntersBackground` が全プレイヤーを pause）。
 * 回答が届いた時点でマップアプリへ戻り、**背面で読み上げを続ける**のが要件なので、
 * ⚠️ **false に戻すと「マップに戻った瞬間に無音になる」形で壊れる。**
 *
 * ⚠️ **設定画面の音量測定もこれを使うこと。** あちらは背面再生と無関係だが、
 * プロセス全体に効くため、独自の値に戻すと**次のハンズフリー応答が背面で黙る。**
 */
export const AUDIO_MODE_PLAYBACK = {
  allowsRecording: false,
  playsInSilentMode: true,
  shouldPlayInBackground: true,
  /**
   * ⚠️ **`mixWithOthers` にする（US-2.04）。**
   *
   * 応答後はマップアプリを前面に戻すが、**マップは案内の音声のために
   * オーディオフォーカスを取る。** 既定（フォーカスを要求する側）のままだと、
   * `expo-audio` はフォーカスを奪われた時点で
   * **プレイヤーを一時停止する**（`AudioModule.kt` の `AUDIOFOCUS_LOSS*`）ため、
   * ⚠️ **戻った瞬間に読み上げが止まりうる。**
   *
   * `mixWithOthers` は**フォーカスを要求しない**ので、奪われることもない。
   * 📌 **ナビの音声と重なって鳴るが、それが正しい**
   * （どちらも走行中に聞きたい情報で、片方を黙らせる理由がない）。
   */
  interruptionMode: "mixWithOthers",
} as const;

/**
 * 無音が続いた時間から「もう送ってよいか」を判定する。
 *
 * 実際の計時は呼び出し側（連続した無音の開始時刻）が持ち、ここは判定だけを担う。
 * ⚠️ **閾値は引数で受け取る**（設定画面で端末ごとに変わるため。src/api/vadSettings.ts）。
 *
 * 止める条件は3つすべてを満たしたとき:
 *   1. **一度は声が乗った**（`hasSpoken`）
 *   2. 猶予（`graceMs`）を過ぎた
 *   3. 無音が `durationMs` 続いた
 *
 * ⚠️ **①が要る理由。** これが無いと、**猶予を過ぎた時点で既に無音が
 * `durationMs` 分たまっている**ため、**話し始めが遅れただけで空の録音が飛ぶ**
 * （猶予5秒・無音3秒なら、5秒黙っていた時点で即送信になる）。
 * ハンズフリー起動では、ボタンを押してから話し出すまでの間が読めないので致命的。
 * **一度も話さなければ自動送信はせず、上限（`maxRecordingMs`）に任せる。**
 *
 * ⚠️ **猶予より前に溜まった無音は数えない。** 数えてしまうと、
 * **短く言い淀んでから考え込んだ場合に、猶予が明けた瞬間に送信される**
 * （「えーと」だけが送られる）。実際にあった不具合で、猶予を伸ばすほど悪化する。
 * 無音の計測は**猶予が明けてから**始まったものとして扱う。
 *
 * @param metering  直近の音量（dBFS）。`undefined` は測れなかったということ
 * @param silentForMs 無音が連続して続いている時間
 * @param recordedForMs 録音開始からの経過時間
 * @param hasSpoken 録音開始から一度でも閾値を超えたか
 * @param settings 端末に保存された閾値
 */
export function shouldStopForSilence(
  metering: number | undefined,
  silentForMs: number,
  recordedForMs: number,
  hasSpoken: boolean,
  settings: VadSettings,
): boolean {
  // 測れないなら判定しない。⚠️ **無音と混同してはいけない**
  // （metering が取れない端末で、話す前に毎回送信されてしまう）。
  if (metering === undefined) return false;
  // まだ一度も声が乗っていない ＝ これから話す。待つ。
  if (!hasSpoken) return false;
  const sinceGrace = recordedForMs - settings.graceMs;
  if (sinceGrace < 0) return false;
  // 猶予明けより前の無音は切り捨てる（上記の理由）。
  return Math.min(silentForMs, sinceGrace) >= settings.durationMs;
}

/**
 * 上限に達した録音を、送らずに捨てるべきか。
 *
 * ⚠️ **騒音で無音検知が働かなかった場合を弾く。** 風切り音・エンジン音が
 * 閾値を超え続けると「ずっと喋っている」ように見え、無音検知が一度も
 * 成立しないまま上限に達する。**そのまま送ると、騒音だけの録音が
 * Transcribe → AgentCore まで流れ、課金されたうえで意味不明な回答が返る。**
 * 走行中は画面を見ないので、利用者には原因が分からない。
 *
 * 判定材料は「**録音中に一度でも無音になったか**」。
 *   - 一度でも途切れた → 人が話していたとみなして**送る**
 *     （長い質問を上限で切られただけ。捨てる方が損）
 *   - 一度も途切れない → **環境音が閾値を超え続けている**とみなして捨てる
 *
 * ⚠️ **`hasSpoken` では区別できない**（騒音でも真になる）。
 * 「静かになった瞬間があったか」で見るのが肝。
 *
 * ⚠️ **既知の割り切り: 上限いっぱい息継ぎなしで話し続けると捨てられる。**
 * 「ずっと喋っている」と「ずっとうるさい」は音量だけでは区別できないため。
 * ただし**上限（既定30秒）を無言の間なしで話し切るのは現実的でない**うえ、
 * **捨てても読み上げで知らせる**ので、黙って騒音を送るより実害が小さい。
 * 気になる場合は設定画面で上限を伸ばせる。
 *
 * @param everSilent 録音中に一度でも無音と判定されたか
 * @param metering 直近の音量。`undefined`（測れない端末）なら捨てない
 */
export function shouldDiscardAsNoise(
  everSilent: boolean,
  metering: number | undefined,
): boolean {
  // ⚠️ 音量が測れない端末では無音検知そのものが働かない。
  // その場合に捨てると**一切送信できなくなる**ので、必ず送る側に倒す。
  if (metering === undefined) return false;
  return !everSilent;
}

/**
 * 「一度でも無音になった」とみなすのに必要な、無音の継続時間。
 *
 * ⚠️ **1サンプルで判断してはいけない。** `expo-audio` は
 * **`maxAmplitude` が 0 のとき `-160` を返す**（AudioRecorder.kt）。これは
 * 実測値ではなく番兵で、**録音開始直後（まだサンプルが溜まっていない）や
 * 読み取り失敗時にも出る**。実機ログでも録音開始 109ms 時点で `-160` が観測され、
 * それだけで騒音ガードが無効化されていた。
 *
 * この時間だけ連続して無音が続いて初めて「本当に静かになった」と数える。
 */
export const SUSTAINED_SILENCE_MS = 500;

/**
 * 録音開始直後の値を無視する時間。
 *
 * ⚠️ **`maxAmplitude` の最初の読み取りは 0（＝`-160`）になりやすい。**
 * 「前回読んでからの最大値」を返す仕様なので、**1回目には測る材料が無い**。
 */
export const METERING_WARMUP_MS = 300;

/**
 * いまの音量が「無音」か。
 *
 * `expo-audio` の `metering` は **dBFS で、無音が -160、最大が 0**
 * （Android実装は `MediaRecorder.maxAmplitude` を `20*log10(amp/32767)` に変換）。
 * ⚠️ **-160 は「完全な無音」で実環境ではまず出ない。** ヘルメット内でも暗騒音が
 * 乗るため、閾値は無音寄りではなく**「声が乗っていない状態」**に置く。
 */
export function isSilent(
  metering: number | undefined,
  settings: VadSettings,
): boolean {
  return metering !== undefined && metering < settings.thresholdDb;
}

/** 送信できる録音の上限。⚠️ サーバー側の MAX_AUDIO_BYTES と同じ値。 */
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

/**
 * 📌 **録音の上限は `VadSettings.maxRecordingMs`**（src/api/vadSettings.ts）。
 *
 * ⚠️ **走行中は「止める」操作を忘れやすい**うえ、**一度も話さなかったときは
 * 上限だけが録音を止める**（無音検知は発話があったことを条件にするため）。
 * 既定値をここに二重に置くと必ず片方が古くなるので、`vadSettings.ts` に集約する。
 */

/** `POST /ask-audio` に添える位置情報（`location` パート）。 */
export type VoiceLocation = {
  start: Coordinates;
  end?: Coordinates;
  elapsedSeconds?: number;
};

/**
 * 録音した音声を `POST /ask-audio` に送る。
 *
 * 戻りは `POST /ask` と同じ形（202 + requestId）なので、**待ち方は共通**
 * ＝ 呼び出し側は `GET /ask/{requestId}` を今までどおりポーリングすればよい。
 *
 * ⚠️ **multipart で送る。** base64 にすると 1.33 倍に膨らみ、
 * その上限が録音の長さの上限でもあるため（docs/02）。
 * `fetch` の FormData に `{uri, name, type}` を渡すのは React Native の作法で、
 * ファイルの中身は端末側が読む（JS側にバイト列を載せない）。
 */
export async function sendVoiceQuestion(
  baseUrl: string,
  apiKey: string,
  audioUri: string,
  location: VoiceLocation,
  sessionId?: string | null,
): Promise<AskAcceptedResponse & { error?: string; httpStatus: number }> {
  const form = new FormData();
  // ⚠️ type は audio/mp4。サーバーは M4A 以外を 400 で弾く（形式が違うと
  // 文字起こしが数分後に失敗し、「聞き取れませんでした」に化けるため）。
  form.append("audio", {
    uri: audioUri,
    name: "question.m4a",
    type: "audio/mp4",
  } as unknown as Blob);
  form.append("location", JSON.stringify(location));
  if (sessionId) form.append("sessionId", sessionId);

  const res = await fetch(`${baseUrl}/ask-audio`, {
    method: "POST",
    headers: {
      // ⚠️ Content-Type は指定しない。境界文字列つきの multipart ヘッダを
      // fetch が組み立てるので、手で書くと境界が合わずサーバー側で
      // パースできなくなる。
      [API_KEY_HEADER]: apiKey,
    },
    body: form,
  });

  const data = (await res.json()) as AskAcceptedResponse & { error?: string };
  return { ...data, httpStatus: res.status };
}
