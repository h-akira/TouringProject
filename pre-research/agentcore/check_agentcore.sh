#!/usr/bin/env bash
#
# AgentCore availability check (ap-northeast-1 / Tokyo).
#
# Confirms the AgentCore control-plane and data-plane APIs respond in this
# region, and lists whatever agent runtimes / memories already exist. Read-only:
# it creates nothing and therefore costs nothing.
#
# Usage:
#   AWS_PROFILE=touring ./check_agentcore.sh
#   REGION=us-west-2 ./check_agentcore.sh

set -uo pipefail

REGION="${REGION:-ap-northeast-1}"

GREEN=$'\033[32m'; RED=$'\033[31m'; DIM=$'\033[2m'; BOLD=$'\033[1m'; RESET=$'\033[0m'

echo "Region : ${REGION}"
echo "Profile: ${AWS_PROFILE:-(default)}"
echo

# probe <label> <aws-cli-args...>
# Reports whether an API responds, without printing raw payloads.
probe() {
  local label="$1"; shift
  printf '%-34s ' "${label}"
  local out
  if out=$(aws "$@" --region "${REGION}" 2>&1); then
    echo "${GREEN}available${RESET}"
    return 0
  fi
  case "${out}" in
    *AccessDenied*|*UnrecognizedClient*|*not\ authorized*)
      echo "${RED}denied${RESET}    ${DIM}IAM permissions missing${RESET}" ;;
    *"Could not connect"*|*EndpointConnectionError*|*"does not exist"*)
      echo "${RED}n/a${RESET}       ${DIM}not offered in this region${RESET}" ;;
    *"Invalid choice"*|*"argument command"*)
      echo "${RED}n/a${RESET}       ${DIM}AWS CLI too old — upgrade it${RESET}" ;;
    *)
      echo "${RED}error${RESET}     ${DIM}$(echo "${out}" | head -1 | cut -c1-56)${RESET}" ;;
  esac
  return 1
}

echo "${BOLD}-- control plane (create/manage resources) --${RESET}"
probe "list-agent-runtimes"  bedrock-agentcore-control list-agent-runtimes
probe "list-memories"        bedrock-agentcore-control list-memories

echo
echo "${BOLD}-- data plane (invoke / sessions) --${RESET}"
# Bedrock's own (preview) session API — separate from AgentCore, listed here
# only to keep the two straight while comparing options. See ../bedrock/README.md.
probe "bedrock session api"  bedrock-agent-runtime list-sessions

echo
echo "${BOLD}-- existing resources --${RESET}"

runtimes=$(aws bedrock-agentcore-control list-agent-runtimes --region "${REGION}" \
  --query 'agentRuntimes[].agentRuntimeName' --output text 2>/dev/null)
if [[ -n "${runtimes}" && "${runtimes}" != "None" ]]; then
  echo "agent runtimes:"
  printf '  %s\n' ${runtimes}
else
  echo "${DIM}agent runtimes : none yet${RESET}"
fi

memories=$(aws bedrock-agentcore-control list-memories --region "${REGION}" \
  --query 'memories[].id' --output text 2>/dev/null)
if [[ -n "${memories}" && "${memories}" != "None" ]]; then
  echo "memories:"
  printf '  %s\n' ${memories}
else
  echo "${DIM}memories       : none yet${RESET}"
fi

echo
echo "${DIM}Next: deploy a minimal agent via S3 source (.zip) and verify that${RESET}"
echo "${DIM}reusing one runtimeSessionId actually carries context. See README.md section 8.${RESET}"
