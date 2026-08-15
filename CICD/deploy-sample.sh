#!/bin/bash
# Deploys the CI/CD stacks themselves (not the application).
#
# ⚠️ COPY THIS FILE to deploy.sh and fill in the values. deploy.sh is
# gitignored because CodeStarConnectionArn contains the AWS account id, and
# this repository is public.
#
#   cp deploy-sample.sh deploy.sh && vi deploy.sh && ./deploy.sh
#
# Run it once (and again whenever these templates change). After that, pushing
# to the branch is what deploys the application.
set -euo pipefail

ENV=dev
REGION=ap-northeast-1
GITHUB_BRANCH=main

# ⚠️ Fill this in. Create and APPROVE the connection in the console first -
# see CICD/README.md. A connection left "Pending" produces builds that cannot
# fetch the source.
# ⚠️ Keep the quotes: the placeholders contain < and >, which the shell would
# otherwise read as redirection (this file does not even parse without them).
CODESTAR_CONNECTION_ARN="arn:aws:codeconnections:ap-northeast-1:<ACCOUNT_ID>:connection/<CONNECTION_ID>"

# One topic shared across environments.
NOTICE_ENV=common

# ⚠️ Fail early if the connection is not usable. A connection left PENDING
# produces a stack that cannot fetch the source, and the failure only surfaces
# later as an unhelpful build error.
CONNECTION_STATUS=$(aws codeconnections get-connection \
  --connection-arn "${CODESTAR_CONNECTION_ARN}" \
  --region "${REGION}" \
  --query 'Connection.ConnectionStatus' --output text)
if [ "${CONNECTION_STATUS}" != "AVAILABLE" ]; then
  echo "GitHub connection is ${CONNECTION_STATUS}, not AVAILABLE." >&2
  echo "Approve it in the console (Developer Tools > Settings > Connections)." >&2
  exit 1
fi

# ⚠️ An APPROVED connection is NOT enough on its own. A CodeBuild project with
# a GITHUB source and a webhook also needs the connection registered as
# CodeBuild's OWN source credential, or stack creation fails at CreateWebhook:
#   "Access token not found in CodeBuild project for server type github"
#
# The registration is per account+region, not per project, so this is a no-op
# once it has been done.
if ! aws codebuild list-source-credentials --region "${REGION}" \
     --query 'sourceCredentialsInfos[?serverType==`GITHUB`]' --output text | grep -q .; then
  echo "Registering the connection as CodeBuild's GitHub credential..."
  aws codebuild import-source-credentials \
    --server-type GITHUB --auth-type CODECONNECTIONS \
    --token "${CODESTAR_CONNECTION_ARN}" \
    --region "${REGION}" >/dev/null
fi

# ⚠️ Use the right profile. Another profile may point at a different account (the organisation's
# management account); pointing at it produces AccessDenied errors, or worse,
# resources created in the wrong place.
export AWS_PROFILE=touring

# 1. Notification topic. Deploy first: build.yaml imports its export.
aws cloudformation deploy \
  --stack-name "stack-trg-${NOTICE_ENV}-cicd-notice" \
  --template-file notice.yaml \
  --region "${REGION}" \
  --parameter-overrides Env="${NOTICE_ENV}"

# 2. The CodeBuild project.
aws cloudformation deploy \
  --stack-name "stack-trg-${ENV}-cicd-main" \
  --template-file build.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "${REGION}" \
  --parameter-overrides \
    Env="${ENV}" \
    GitHubBranch="${GITHUB_BRANCH}" \
    CodeStarConnectionArn="${CODESTAR_CONNECTION_ARN}" \
    EnableWebhook=true \
    EnableNotification=true \
    NotificationEnv="${NOTICE_ENV}"

echo "CI/CD stacks deployed. Push to ${GITHUB_BRANCH} to trigger a build."
echo "⚠️ Subscribe to the SNS topic by hand to actually receive notifications."
