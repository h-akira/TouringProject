#!/bin/sh
# Copy the API contract (master: docs/) into the App repository,
# so that App can generate its types without the parent repository.
set -eu
cd "$(dirname "$0")/.."
cp docs/02_api_openapi.yaml App/src/api/openapi.yaml
echo "copied: docs/02_api_openapi.yaml -> App/src/api/openapi.yaml (commit it in App/)"
