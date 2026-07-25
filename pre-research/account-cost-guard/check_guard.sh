#!/usr/bin/env bash
#
# Account-wide AI cost guard check (ap-northeast-1 / Tokyo).
#
# Confirms the building blocks for a Bedrock kill switch are in place:
# Organizations feature set, SCP enablement, the SCPs attached to this account,
# and whether Bedrock token metrics are actually being recorded. Read-only:
# it changes no policy and creates nothing, so it costs nothing.
#
# Note: the Organizations calls must run against the MANAGEMENT account, not the
# workload account. Set MGMT_PROFILE when your default profile is the workload
# one. Account IDs are intentionally not hardcoded - this repo is public.
#
# Usage:
#   AWS_PROFILE=touring ./check_guard.sh
#   AWS_PROFILE=touring MGMT_PROFILE=<mgmt-profile> ./check_guard.sh
#   REGION=us-west-2 ./check_guard.sh

set -uo pipefail

REGION="${REGION:-ap-northeast-1}"

GREEN=$'\033[32m'; RED=$'\033[31m'; YELLOW=$'\033[33m'
DIM=$'\033[2m'; BOLD=$'\033[1m'; RESET=$'\033[0m'

# Organizations is global; these calls need the management account.
org() {
  if [[ -n "${MGMT_PROFILE:-}" ]]; then
    aws --profile "${MGMT_PROFILE}" "$@"
  else
    aws "$@"
  fi
}

echo "Region      : ${REGION}"
echo "Profile     : ${AWS_PROFILE:-(default)}"
echo "Mgmt profile: ${MGMT_PROFILE:-(same as above)}"
echo

# --- 0. Who am I -------------------------------------------------------------
echo "${BOLD}0. Caller identity${RESET}"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null)
if [[ -z "${ACCOUNT_ID}" || "${ACCOUNT_ID}" == "None" ]]; then
  echo "  ${RED}failed${RESET} ${DIM}cannot resolve caller identity; check credentials${RESET}"
  exit 1
fi
echo "  account: ${ACCOUNT_ID}"
echo

# --- 1. Organizations prerequisites -----------------------------------------
# SCP requires FeatureSet=ALL. Anything else means the kill switch is impossible.
echo "${BOLD}1. Organizations prerequisites${RESET}"
printf '%-34s ' "feature set"
FEATURE_SET=$(org organizations describe-organization \
  --query 'Organization.FeatureSet' --output text 2>/dev/null)
case "${FEATURE_SET}" in
  ALL) echo "${GREEN}ALL${RESET} ${DIM}SCP usable${RESET}" ;;
  CONSOLIDATED_BILLING)
    echo "${RED}CONSOLIDATED_BILLING${RESET} ${DIM}SCP NOT usable${RESET}" ;;
  *)  echo "${YELLOW}unknown${RESET} ${DIM}needs management-account credentials (MGMT_PROFILE)${RESET}" ;;
esac

printf '%-34s ' "management account"
MGMT_ID=$(org organizations describe-organization \
  --query 'Organization.MasterAccountId' --output text 2>/dev/null)
if [[ -n "${MGMT_ID}" && "${MGMT_ID}" != "None" ]]; then
  if [[ "${MGMT_ID}" == "${ACCOUNT_ID}" ]]; then
    # SCPs never restrict the management account, so workloads must live elsewhere.
    echo "${RED}${MGMT_ID}${RESET} ${DIM}this IS the mgmt account - SCP cannot restrict it${RESET}"
  else
    echo "${GREEN}${MGMT_ID}${RESET} ${DIM}separate from workload - good${RESET}"
  fi
else
  echo "${YELLOW}unknown${RESET}"
fi

printf '%-34s ' "SCP policy type"
SCP_STATUS=$(org organizations list-roots \
  --query 'Roots[0].PolicyTypes[?Type==`SERVICE_CONTROL_POLICY`].Status | [0]' \
  --output text 2>/dev/null)
case "${SCP_STATUS}" in
  ENABLED) echo "${GREEN}ENABLED${RESET}" ;;
  ""|None) echo "${YELLOW}unknown${RESET}" ;;
  *)       echo "${RED}${SCP_STATUS}${RESET}" ;;
esac
echo

# --- 2. SCPs attached to this account ---------------------------------------
# The kill switch rewrites an already-attached policy, so list what is there.
echo "${BOLD}2. SCPs attached to ${ACCOUNT_ID}${RESET}"
POLICIES=$(org organizations list-policies-for-target \
  --target-id "${ACCOUNT_ID}" --filter SERVICE_CONTROL_POLICY \
  --query 'Policies[].[Id,Name]' --output text 2>/dev/null)
if [[ -z "${POLICIES}" ]]; then
  echo "  ${YELLOW}none listed${RESET} ${DIM}needs management-account credentials${RESET}"
else
  echo "${POLICIES}" | while IFS=$'\t' read -r pid pname; do
    [[ -z "${pid}" ]] && continue
    printf '  %-16s %s\n' "${pid}" "${pname}"
  done
  echo
  # Report whether Bedrock is already denied, i.e. kill switch currently engaged.
  # Loop in the current shell (here-string, not a pipe) so DENIED survives.
  printf '  %-32s ' "bedrock currently denied?"
  DENIED="no"
  while IFS=$'\t' read -r pid _; do
    [[ -z "${pid}" ]] && continue
    content=$(org organizations describe-policy --policy-id "${pid}" \
      --query 'Policy.Content' --output text 2>/dev/null)
    case "${content}" in
      *bedrock*) DENIED="yes" ;;
    esac
  done <<<"${POLICIES}"
  if [[ "${DENIED}" == "yes" ]]; then
    echo "${RED}YES - kill switch engaged${RESET}"
  else
    echo "${GREEN}no${RESET} ${DIM}Bedrock allowed (normal operation)${RESET}"
  fi
fi
echo

# --- 3. Bedrock token metrics -----------------------------------------------
# Token metrics are the low-latency (~2-5 min) detection signal.
echo "${BOLD}3. Bedrock CloudWatch metrics${RESET}"
METRICS=$(aws cloudwatch list-metrics --namespace AWS/Bedrock --region "${REGION}" \
  --query 'Metrics[].MetricName' --output text 2>/dev/null | tr '\t' '\n' | sort -u)
if [[ -z "${METRICS}" ]]; then
  echo "  ${YELLOW}no metrics${RESET} ${DIM}Bedrock not invoked yet in this region${RESET}"
else
  for want in InputTokenCount OutputTokenCount Invocations; do
    printf '  %-32s ' "${want}"
    if grep -qx "${want}" <<<"${METRICS}"; then
      echo "${GREEN}present${RESET}"
    else
      echo "${YELLOW}absent${RESET}"
    fi
  done
fi

printf '  %-32s ' "AgentCore metrics"
AC_COUNT=$(aws cloudwatch list-metrics --namespace AWS/BedrockAgentCore \
  --region "${REGION}" --query 'length(Metrics)' --output text 2>/dev/null)
if [[ "${AC_COUNT}" =~ ^[0-9]+$ ]] && (( AC_COUNT > 0 )); then
  echo "${GREEN}${AC_COUNT} metric(s)${RESET}"
else
  echo "${DIM}none yet (AgentCore not deployed)${RESET}"
fi
echo

# --- 4. Budgets (slow backstop) ---------------------------------------------
echo "${BOLD}4. AWS Budgets${RESET}"
printf '  %-32s ' "budgets configured"
BUDGET_COUNT=$(aws budgets describe-budgets --account-id "${ACCOUNT_ID}" \
  --query 'length(Budgets)' --output text 2>/dev/null)
if [[ "${BUDGET_COUNT}" =~ ^[0-9]+$ ]] && (( BUDGET_COUNT > 0 )); then
  echo "${GREEN}${BUDGET_COUNT}${RESET}"
else
  echo "${YELLOW}none${RESET} ${DIM}no cost backstop yet${RESET}"
fi
echo

echo "${DIM}Reminder: Budgets data lags hours to a day. Token metrics (~2-5 min)"
echo "are the primary signal; see README.md section 4.${RESET}"
