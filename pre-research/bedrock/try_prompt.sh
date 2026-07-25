#!/usr/bin/env bash
#
# Send one touring-style question to Bedrock and show the answer, token usage,
# and latency. Use this to iterate on the system prompt without deploying, or
# to sanity-check a different model.
#
# Usage:
#   ./try_prompt.sh
#   ./try_prompt.sh "この辺りの名物は？"
#   MODEL=jp.anthropic.claude-haiku-4-5-20251001-v1:0 ./try_prompt.sh
#
# Note: this deliberately states the heading and left/right in the prompt.
# The model must NOT derive them from coordinates — it gets that wrong (see
# README section 5). The real backend computes them in lib/geo.py.

set -euo pipefail

REGION="${REGION:-ap-northeast-1}"
MODEL="${MODEL:-jp.anthropic.claude-sonnet-4-6}"
MAX_TOKENS="${MAX_TOKENS:-300}"

QUESTION="${1:-右手に見える山は何ですか？}"

# Keep this in sync with backend/src/lib/bedrock.py `_SYSTEM_PROMPT`.
SYSTEM_PROMPT='あなたはバイクでツーリング中のライダーを支援するAIです。
回答は音声で読み上げられ、ライダーは走行中で画面を見られません。

回答のルール:
- 2〜3文程度で簡潔に答える。前置きや復唱はしない。
- Markdown記法（**、#、箇条書き記号など）は一切使わない。読み上げると不自然になる。
- 方角や左右は、ユーザーから与えられた情報をそのまま使う。自分で計算し直さない。
- 確実でないことは「たぶん」「〜と思われます」と正直に伝える。
- 走行の妨げになる長い説明はしない。'

# Mirrors build_context_prompt() in backend/src/lib/bedrock.py.
USER_PROMPT="質問: ${QUESTION}
現在の進行方向: 北北東（方位角 22度）
ライダーから見て右手は東南東、左手は西北西の方角です。
現在地の付近: 静岡県富士市"

echo "Model : ${MODEL}"
echo "Region: ${REGION}"
echo "Q     : ${QUESTION}"
echo

# Build the JSON with python3 so quotes/newlines in the prompts are escaped
# properly — string-interpolating them into JSON by hand breaks on any quote.
payload=$(SYSTEM_PROMPT="${SYSTEM_PROMPT}" USER_PROMPT="${USER_PROMPT}" \
  python3 -c 'import json, os; print(json.dumps({
    "system": [{"text": os.environ["SYSTEM_PROMPT"]}],
    "messages": [{"role": "user", "content": [{"text": os.environ["USER_PROMPT"]}]}],
  }))')

response=$(aws bedrock-runtime converse \
  --region "${REGION}" \
  --model-id "${MODEL}" \
  --system "$(echo "${payload}" | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin)["system"]))')" \
  --messages "$(echo "${payload}" | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin)["messages"]))')" \
  --inference-config "{\"maxTokens\":${MAX_TOKENS}}")

echo "${response}" | python3 -c '
import json, sys

r = json.load(sys.stdin)
# content may hold several blocks (e.g. thinking); keep only the text ones.
blocks = r.get("output", {}).get("message", {}).get("content", [])
text = "".join(b["text"] for b in blocks if "text" in b).strip()

print("--- answer ---")
print(text)
print()

usage = r.get("usage", {})
metrics = r.get("metrics", {})
stop_reason = r.get("stopReason")
print("--- stats ---")
print("stop_reason : {}".format(stop_reason))
print("tokens      : in={} out={}".format(
    usage.get("inputTokens"), usage.get("outputTokens")))
print("latency     : {} ms".format(metrics.get("latencyMs")))

# Flag issues that matter for text-to-speech playback.
if any(m in text for m in ("**", "##", "- ", "* ")):
    print()
    print("WARN: markdown detected - it would be read aloud verbatim by Polly.")
'
