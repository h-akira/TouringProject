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
 */
export const RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 64000,
};

/** 送信できる録音の上限。⚠️ サーバー側の MAX_AUDIO_BYTES と同じ値。 */
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

/**
 * これ以上は録らずに打ち切る。
 *
 * ⚠️ **走行中は「止める」操作を忘れやすい。** 手が塞がっていて画面も見ないので、
 * 押し忘れれば延々と録り続け、サイズ上限に達して**質問そのものが失われる**。
 * 質問は数秒〜十数秒なので、これを超えたら押し忘れとみなす方が実害が小さい。
 */
export const MAX_RECORDING_MS = 30_000;

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
