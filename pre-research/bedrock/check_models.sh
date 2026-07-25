#!/usr/bin/env bash
#
# Bedrock model availability check (ap-northeast-1 / Tokyo).
#
# Verifies which Anthropic models this AWS account can actually call. The model
# list from `list-inference-profiles` is NOT proof of access: profiles show up
# as ACTIVE and still fail on invocation. Only a real `converse` call tells you.
#
# Usage:
#   ./check_models.sh                        # uses AWS_PROFILE / default creds
#   AWS_PROFILE=touring ./check_models.sh
#   REGION=us-east-1 ./check_models.sh
#
# Cost: each probe is a ~10-token call, so a full run is well under 1 JPY.

set -uo pipefail

REGION="${REGION:-ap-northeast-1}"

# Inference-profile ids, newest first. A bare `anthropic.claude-*` id will NOT
# work in this region — every Anthropic model is INFERENCE_PROFILE-only.
# `jp.` keeps inference within Japan; `global.` may route abroad.
MODELS=(
  "global.anthropic.claude-opus-5"
  "global.anthropic.claude-sonnet-5"
  "global.anthropic.claude-fable-5"
  "jp.anthropic.claude-opus-4-8"
  "jp.anthropic.claude-opus-4-7"
  "jp.anthropic.claude-sonnet-4-6"
  "jp.anthropic.claude-sonnet-4-5-20250929-v1:0"
  "jp.anthropic.claude-haiku-4-5-20251001-v1:0"
)

GREEN=$'\033[32m'; RED=$'\033[31m'; YELLOW=$'\033[33m'; DIM=$'\033[2m'; RESET=$'\033[0m'

echo "Region : ${REGION}"
echo "Profile: ${AWS_PROFILE:-(default)}"
echo

usable=()

for model in "${MODELS[@]}"; do
  printf '%-48s ' "${model}"

  output=$(aws bedrock-runtime converse \
    --region "${REGION}" \
    --model-id "${model}" \
    --messages '[{"role":"user","content":[{"text":"OK とだけ返して"}]}]' \
    --inference-config '{"maxTokens":20}' 2>&1)

  if [[ $? -eq 0 ]]; then
    echo "${GREEN}OK${RESET}"
    usable+=("${model}")
    continue
  fi

  # Distinguish the failure modes — they need different fixes.
  case "${output}" in
    *AccessDeniedException*)
      echo "${RED}NG${RESET}  ${DIM}not available for this account${RESET}"
      ;;
    *"use case details have not been submitted"*)
      echo "${YELLOW}--${RESET}  ${DIM}Anthropic use case form not submitted (see README §1)${RESET}"
      ;;
    *ResourceNotFoundException*)
      echo "${RED}NG${RESET}  ${DIM}profile not found in this region${RESET}"
      ;;
    *ValidationException*)
      echo "${RED}NG${RESET}  ${DIM}invalid id — on-demand not supported, use a profile id${RESET}"
      ;;
    *ThrottlingException*)
      echo "${YELLOW}--${RESET}  ${DIM}throttled, retry later${RESET}"
      ;;
    *)
      echo "${RED}NG${RESET}  ${DIM}$(echo "${output}" | head -1 | cut -c1-70)${RESET}"
      ;;
  esac
done

echo
if [[ ${#usable[@]} -eq 0 ]]; then
  echo "${RED}No usable model.${RESET}"
  echo "If you see '--' above, submit the Anthropic use case form:"
  echo "  AWS Console -> Bedrock (${REGION}) -> Model access -> use case details"
  echo "  It takes up to ~15 min to apply. See README.md section 1."
  exit 1
fi

echo "${GREEN}Usable (${#usable[@]}):${RESET}"
printf '  %s\n' "${usable[@]}"
echo
echo "${DIM}Current backend default: jp.anthropic.claude-sonnet-4-6${RESET}"
echo "${DIM}Override via the BEDROCK_MODEL_ID env var (see backend/template.yaml).${RESET}"
