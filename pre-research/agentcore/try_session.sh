#!/usr/bin/env bash
#
# Does reusing one session id actually carry conversation context?
#
# Asks a first question, then a follow-up whose subject is only a pronoun
# ("それ" = "that one"). Answering the follow-up is impossible without the
# earlier turn, so a correct answer proves context carried over.
#
# Runs the same follow-up twice:
#   A) same session id  -> expect the pronoun to resolve
#   B) fresh session id -> expect the agent to be unable to resolve it
# B is the control: without it, a lucky guess looks like success.
#
# Usage:
#   ./try_session.sh                     # against a local agent
#   ENDPOINT=http://localhost:8080 ./try_session.sh
#
# Start the agent first (see pre-research/agentcore/README.md):
#   cd Agent/app/agentcore_trg_dev_ask
#   eval "$(AWS_PROFILE=touring aws configure export-credentials --format env)"
#   AWS_DEFAULT_REGION=ap-northeast-1 .venv/bin/python main.py

set -uo pipefail

ENDPOINT="${ENDPOINT:-http://localhost:8080}"
SESSION_HEADER="X-Amzn-Bedrock-AgentCore-Runtime-Session-Id"

Q1="${Q1:-富士山の標高は？}"
Q2="${Q2:-それは何県にありますか？}"

BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'

# ask <session-id> <question>
# Prints the assistant's text. The runtime answers with SSE, so collect the
# text deltas and concatenate them.
ask() {
  local sid="$1" question="$2"
  curl -s -m 120 -X POST "${ENDPOINT}/invocations" \
    -H "Content-Type: application/json" \
    -H "${SESSION_HEADER}: ${sid}" \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"question": sys.argv[1]}))' "${question}")" \
  | python3 -c '
import json, sys

parts = []
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    if line.startswith("data: "):
        line = line[6:]
    try:
        event = json.loads(line)
    except json.JSONDecodeError:
        continue
    if "error" in event:
        print("[ERROR] {}".format(event["error"]), file=sys.stderr)
        continue
    delta = event.get("event", {}).get("contentBlockDelta", {}).get("delta", {})
    if "text" in delta:
        parts.append(delta["text"])
print("".join(parts).strip() or "(no text returned)")
'
}

echo "Endpoint: ${ENDPOINT}"
echo

# --- A) same session: the follow-up should resolve the pronoun --------------
SID_A="continuity-$(date +%s)-a"
echo "${BOLD}[A] same session id${RESET} ${DIM}(${SID_A})${RESET}"
echo "${DIM}Q1:${RESET} ${Q1}"
echo "${DIM}A1:${RESET} $(ask "${SID_A}" "${Q1}")"
echo
echo "${DIM}Q2:${RESET} ${Q2}"
echo "${GREEN}A2:${RESET} $(ask "${SID_A}" "${Q2}")"
echo

# --- B) control: a fresh session has nothing to resolve against -------------
SID_B="continuity-$(date +%s)-b"
echo "${BOLD}[B] fresh session id — control${RESET} ${DIM}(${SID_B})${RESET}"
echo "${DIM}Q2 only:${RESET} ${Q2}"
echo "${YELLOW}A:${RESET} $(ask "${SID_B}" "${Q2}")"
echo

echo "${DIM}Expected: A2 names the prefecture; B cannot tell what \"それ\" refers to.${RESET}"
echo "${DIM}If B also answers confidently, the pronoun was not actually ambiguous —${RESET}"
echo "${DIM}pick a Q1/Q2 pair where the follow-up is meaningless on its own.${RESET}"
