#!/bin/sh
# Record one take and convert it to the format Transcribe streaming needs
# (mono 16-bit 16kHz PCM WAV). Uses only built-in macOS tools.
#
# Usage:
#   ./record.sh 01          # records recordings/01.wav
#
# Recording needs a mic-capable CLI; macOS ships none, so this drives
# QuickTime Player via AppleScript. If that is blocked, see the manual
# fallback printed on failure.
set -eu

TAKE="${1:-}"
if [ -z "$TAKE" ]; then
  echo "usage: $0 <take-number>   e.g. $0 01" >&2
  exit 1
fi

DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$DIR/recordings"
RAW="$OUT_DIR/$TAKE.raw.m4a"
WAV="$OUT_DIR/$TAKE.wav"
mkdir -p "$OUT_DIR"

cat <<EOF
Take $TAKE — read the line for this take from SCRIPT.md.

Speak at the pace you would while riding: normal volume, no over-enunciating.
Press Return to stop recording.
EOF

# QuickTime writes on stop, so start it, wait for the user, then stop.
start_recording() {
  osascript >/dev/null 2>&1 <<'APPLESCRIPT'
tell application "QuickTime Player"
  activate
  set doc to (new audio recording)
  tell doc to start
end tell
APPLESCRIPT
}

if ! start_recording; then
  echo "" >&2
  echo "Could not drive QuickTime (likely a permissions prompt)." >&2
  echo "Fallback: record a Voice Memo or QuickTime audio clip yourself," >&2
  echo "export it, then convert with:" >&2
  echo "  afconvert -f WAVE -d LEI16@16000 -c 1 <your-file> $WAV" >&2
  exit 1
fi

printf "recording... press Return to stop: "
read -r _ignored

osascript <<APPLESCRIPT >/dev/null
tell application "QuickTime Player"
  tell document 1
    pause
    stop
    -- Export rather than save, so we get a plain file with no dialog.
    export in POSIX file "$RAW" using settings preset "Audio Only"
    close saving no
  end tell
  quit
end tell
APPLESCRIPT

# LEI16@16000 = little-endian 16-bit PCM at 16kHz; -c 1 forces mono.
afconvert -f WAVE -d LEI16@16000 -c 1 "$RAW" "$WAV"
rm -f "$RAW"

echo ""
echo "saved: $WAV"
afinfo "$WAV" | grep -iE 'duration|format' || true
