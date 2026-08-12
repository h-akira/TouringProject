#!/usr/bin/env python3
"""Run the whole option-1 voice chain once: STT -> agent -> TTS.

Verifies the three things option 1 depends on, using a real recording of a
human voice rather than synthesized speech (`say` is too clean to tell us
anything about place-name accuracy):

  1. Transcribe understands Japanese, including hard-to-read place names.
  2. The deployed AgentCore agent answers the transcribed text.
  3. Polly reads the answer back in Japanese.

Each stage is timed separately, so the per-turn latency that option 1 trades
away can be judged against the round trip a rider would actually feel.

Usage:
    ./record.sh 01                       # record, then:
    eval "$(aws configure export-credentials --profile touring --format env)"
    export AGENT_ARN="arn:aws:bedrock-agentcore:us-east-1:<ACCOUNT_ID>:runtime/<name>"
    python3 try_voice.py recordings/01.wav

    --keep-session reuses the session id in .session so a follow-up question
    continues the previous conversation (US-1.02).
"""

import argparse
import json
import os
import pathlib
import subprocess
import sys
import time
import uuid

import boto3

# Transcribe streaming and the agent live in different regions: the agent is
# pinned to us-east-1 by the web-search connector, while Transcribe/Polly are
# fine in Tokyo and are lower latency from Japan.
AGENT_REGION = os.environ.get("AGENT_REGION", "us-east-1")
SPEECH_REGION = os.environ.get("SPEECH_REGION", "ap-northeast-1")

# Transcribe streaming wants raw little-endian PCM; record.sh produces exactly
# this. Keep in sync with that script.
SAMPLE_RATE = 16000
LANGUAGE = "ja-JP"

# Polly's Japanese neural voices: Kazuha, Tomoko (female), Takumi (male).
POLLY_VOICE = os.environ.get("POLLY_VOICE", "Kazuha")

# AgentCore rejects a runtimeSessionId shorter than 33 characters.
SESSION_FILE = pathlib.Path(__file__).parent / ".session"


def transcribe(wav_path: pathlib.Path) -> str:
    """Stream a WAV file to Transcribe and return the final transcript.

    Uses amazon-transcribe's async streaming client, which is the same path a
    live microphone would take, so the measured latency stays representative.
    """
    import asyncio

    from amazon_transcribe.client import TranscribeStreamingClient
    from amazon_transcribe.handlers import TranscriptResultStreamHandler

    pcm = _wav_to_pcm(wav_path)

    class _Handler(TranscriptResultStreamHandler):
        def __init__(self, stream):
            super().__init__(stream)
            self.text = ""

        async def handle_transcript_event(self, event):
            for result in event.transcript.results:
                # Partial results arrive repeatedly as the model revises its
                # guess; only the settled ones are worth keeping.
                if not result.is_partial and result.alternatives:
                    self.text += result.alternatives[0].transcript

    async def _run() -> str:
        client = TranscribeStreamingClient(region=SPEECH_REGION)
        stream = await client.start_stream_transcription(
            language_code=LANGUAGE,
            media_sample_rate_hz=SAMPLE_RATE,
            media_encoding="pcm",
        )
        handler = _Handler(stream.output_stream)

        async def _send() -> None:
            # Roughly 100ms per chunk, mimicking a live mic feed.
            chunk = SAMPLE_RATE * 2 // 10
            for i in range(0, len(pcm), chunk):
                await stream.input_stream.send_audio_event(audio_chunk=pcm[i:i + chunk])
            await stream.input_stream.end_stream()

        await asyncio.gather(_send(), handler.handle_events())
        return handler.text

    return asyncio.run(_run()).strip()


def _wav_to_pcm(wav_path: pathlib.Path) -> bytes:
    """Strip the WAV container, returning raw PCM samples.

    Validates the format rather than resampling: a mismatch here shows up as
    silently terrible transcription, which is much harder to debug later.
    """
    import wave

    with wave.open(str(wav_path), "rb") as wav:
        if wav.getnchannels() != 1 or wav.getframerate() != SAMPLE_RATE or wav.getsampwidth() != 2:
            sys.exit(
                f"{wav_path} must be mono 16-bit {SAMPLE_RATE}Hz PCM, got "
                f"{wav.getnchannels()}ch {wav.getframerate()}Hz "
                f"{wav.getsampwidth() * 8}-bit. Re-run record.sh."
            )
        return wav.readframes(wav.getnframes())


def ask_agent(question: str, session_id: str) -> str:
    """Send the transcript to the deployed agent and collect its answer."""
    agent_arn = os.environ.get("AGENT_ARN")
    if not agent_arn:
        sys.exit("Set AGENT_ARN to the deployed runtime's ARN.")

    client = boto3.client("bedrock-agentcore", region_name=AGENT_REGION)
    response = client.invoke_agent_runtime(
        agentRuntimeArn=agent_arn,
        runtimeSessionId=session_id,
        payload=json.dumps({"question": question}).encode(),
    )

    # The agent streams SSE frames of Strands events; reassemble the text
    # deltas into the spoken answer.
    answer = ""
    for raw in response["response"].iter_lines():
        if not raw:
            continue
        line = raw.decode() if isinstance(raw, bytes) else raw
        if not line.startswith("data:"):
            continue
        try:
            event = json.loads(line[len("data:"):].strip())
        except json.JSONDecodeError:
            continue
        delta = (
            event.get("event", {})
            .get("contentBlockDelta", {})
            .get("delta", {})
            .get("text")
        )
        if delta:
            answer += delta
    return answer.strip()


def speak(text: str, out_path: pathlib.Path) -> None:
    """Synthesize the answer with Polly and play it."""
    polly = boto3.client("polly", region_name=SPEECH_REGION)
    audio = polly.synthesize_speech(
        Text=text,
        OutputFormat="mp3",
        VoiceId=POLLY_VOICE,
        Engine="neural",
        LanguageCode=LANGUAGE,
    )
    out_path.write_bytes(audio["AudioStream"].read())
    subprocess.run(["afplay", str(out_path)], check=False)


def _session_id(keep: bool) -> str:
    """Return a session id, reusing the stored one when continuing a chat."""
    if keep and SESSION_FILE.exists():
        return SESSION_FILE.read_text().strip()
    # Must be >= 33 chars; uuid4().hex is 32, so prefix it.
    session_id = f"voice-{uuid.uuid4().hex}"
    SESSION_FILE.write_text(session_id)
    return session_id


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("wav", type=pathlib.Path, help="recording from record.sh")
    parser.add_argument(
        "--keep-session",
        action="store_true",
        help="continue the previous conversation instead of starting a new one",
    )
    parser.add_argument("--no-play", action="store_true", help="skip Polly playback")
    args = parser.parse_args()

    if not args.wav.exists():
        sys.exit(f"{args.wav} not found. Record it first: ./record.sh {args.wav.stem}")

    session_id = _session_id(args.keep_session)
    # Without --keep-session every run pays the ~9s microVM cold start, which
    # is easy to mistake for the agent being slow. See README section 6.
    kind = "continued" if args.keep_session else "new - expect a ~9s cold start"
    print(f"session: {session_id}  ({kind})\n")

    started = time.monotonic()
    question = transcribe(args.wav)
    stt_ms = (time.monotonic() - started) * 1000
    print(f"[STT  {stt_ms:7.0f} ms] {question or '(nothing recognized)'}")
    if not question:
        sys.exit("Transcribe returned nothing. Check the mic level and re-record.")

    started = time.monotonic()
    answer = ask_agent(question, session_id)
    agent_ms = (time.monotonic() - started) * 1000
    print(f"[AGENT{agent_ms:7.0f} ms] {answer or '(empty answer)'}")
    if not answer:
        sys.exit("The agent returned nothing.")

    tts_ms = 0.0
    if not args.no_play:
        started = time.monotonic()
        speak(answer, args.wav.with_suffix(".answer.mp3"))
        tts_ms = (time.monotonic() - started) * 1000
        print(f"[TTS  {tts_ms:7.0f} ms] played with {POLLY_VOICE}")

    # This total is the number that decides whether option 1's turn-taking
    # delay is tolerable while riding.
    print(f"\ntotal: {(stt_ms + agent_ms + tts_ms) / 1000:.1f} s")


if __name__ == "__main__":
    main()
