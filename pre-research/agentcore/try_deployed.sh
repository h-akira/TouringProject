#!/usr/bin/env bash
#
# Same continuity check as try_session.sh, but against the deployed runtime
# instead of a local process — does reusing one runtimeSessionId carry context
# on AWS too?
#
# Uses boto3 rather than `agentcore invoke` so it works even when the CLI's
# deployed-state.json is stale (it is only written when `agentcore deploy`
# finishes in the foreground; a timeout leaves it empty while the stack itself
# deploys fine).
#
# Usage:
#   AWS_PROFILE=touring ./try_deployed.sh
#
# Cost: four short invocations. The session stays billable until it idles out
# (default 15 min) — see README.md section 7.

set -uo pipefail

REGION="${REGION:-ap-northeast-1}"

Q1="${Q1:-富士山の標高は？}"
Q2="${Q2:-それは何県にありますか？}"

BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; RESET=$'\033[0m'

RUNTIME_ARN="${RUNTIME_ARN:-$(aws bedrock-agentcore-control list-agent-runtimes \
  --region "${REGION}" --query 'agentRuntimes[0].agentRuntimeArn' --output text 2>/dev/null)}"

if [[ -z "${RUNTIME_ARN}" || "${RUNTIME_ARN}" == "None" ]]; then
  echo "No agent runtime found in ${REGION}. Deploy first: cd Agent && agentcore deploy" >&2
  exit 1
fi

echo "Region : ${REGION}"
echo "Runtime: ${RUNTIME_ARN##*/}"
echo

# ask <session-id> <question>
# Session ids must be at least 33 characters, so callers pass an already-padded
# id. The runtime replies with SSE; collect the text deltas and concatenate.
ask() {
  RUNTIME_ARN="${RUNTIME_ARN}" REGION="${REGION}" python3 - "$1" "$2" <<'PY'
import json, os, sys

import boto3

session_id, question = sys.argv[1], sys.argv[2]
client = boto3.client("bedrock-agentcore", region_name=os.environ["REGION"])

try:
    response = client.invoke_agent_runtime(
        agentRuntimeArn=os.environ["RUNTIME_ARN"],
        runtimeSessionId=session_id,
        payload=json.dumps({"question": question}).encode(),
    )
except Exception as exc:  # surface the API error rather than an empty answer
    print(f"[ERROR] {exc}")
    raise SystemExit(1)

parts = []
for raw in response["response"].iter_lines():
    if not raw:
        continue
    line = raw.decode() if isinstance(raw, bytes) else raw
    if line.startswith("data: "):
        line = line[6:]
    try:
        event = json.loads(line)
    except json.JSONDecodeError:
        continue
    if "error" in event:
        print(f"[ERROR] {event['error']}")
        continue
    delta = event.get("event", {}).get("contentBlockDelta", {}).get("delta", {})
    if "text" in delta:
        parts.append(delta["text"])

print("".join(parts).strip() or "(no text returned)")
PY
}

STAMP="$(date +%s)"

# --- A) same session: the follow-up should resolve the pronoun --------------
SID_A="deployed-continuity-a-${STAMP}-padding"
echo "${BOLD}[A] same session id${RESET} ${DIM}(${SID_A})${RESET}"
echo "${DIM}Q1:${RESET} ${Q1}"
echo "${DIM}A1:${RESET} $(ask "${SID_A}" "${Q1}")"
echo
echo "${DIM}Q2:${RESET} ${Q2}"
echo "${GREEN}A2:${RESET} $(ask "${SID_A}" "${Q2}")"
echo

# --- B) control: a fresh session has nothing to resolve against -------------
SID_B="deployed-continuity-b-${STAMP}-padding"
echo "${BOLD}[B] fresh session id — control${RESET} ${DIM}(${SID_B})${RESET}"
echo "${DIM}Q2 only:${RESET} ${Q2}"
echo "${YELLOW}A:${RESET} $(ask "${SID_B}" "${Q2}")"
echo

echo "${DIM}Expected: A2 names the prefecture; B cannot tell what \"それ\" refers to.${RESET}"
