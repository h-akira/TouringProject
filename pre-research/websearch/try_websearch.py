#!/usr/bin/env python3
"""Call the AgentCore Gateway Web Search Tool directly over MCP.

This bypasses the agent entirely: it measures what the connector itself
returns, so search quality and latency can be judged without a model in
the loop. Requires botocore and requests.

Usage:
    export GATEWAY_URL="https://<id>.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp"
    eval "$(aws configure export-credentials --profile touring --format env)"
    python3 try_websearch.py "今日の東京の天気は？"
"""

import json
import os
import sys
import time

import requests
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
from botocore.session import Session

REGION = os.environ.get("AWS_REGION", "us-east-1")
SERVICE = "bedrock-agentcore"


def _signed_post(url: str, payload: dict) -> requests.Response:
    """POST to the gateway with SigV4 auth (the gateway uses AWS_IAM)."""
    body = json.dumps(payload)
    request = AWSRequest(
        method="POST",
        url=url,
        data=body,
        # MCP streamable-http replies with either JSON or SSE, so accept both.
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        },
    )
    credentials = Session().get_credentials()
    if credentials is None:
        sys.exit("No AWS credentials found. Run the export-credentials line above.")
    SigV4Auth(credentials.get_frozen_credentials(), SERVICE, REGION).add_auth(request)

    return requests.post(url, data=body, headers=dict(request.headers), timeout=60)


def _parse(response: requests.Response) -> dict:
    """Return the JSON-RPC payload from either a plain or SSE response."""
    text = response.text
    if response.headers.get("Content-Type", "").startswith("text/event-stream"):
        for line in text.splitlines():
            if line.startswith("data:"):
                return json.loads(line[len("data:"):].strip())
        raise ValueError(f"no data frame in SSE response: {text[:400]}")
    return json.loads(text)


def main() -> None:
    url = os.environ.get("GATEWAY_URL")
    if not url:
        sys.exit("Set GATEWAY_URL to the gateway's /mcp endpoint.")

    query = sys.argv[1] if len(sys.argv) > 1 else "今日の東京の天気は？"

    # 1. Discover the tool name the gateway exposes.
    listed = _parse(_signed_post(url, {
        "jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {},
    }))
    tools = [t["name"] for t in listed.get("result", {}).get("tools", [])]
    print(f"tools/list -> {tools}")
    if not tools:
        sys.exit(f"gateway exposed no tools: {json.dumps(listed, ensure_ascii=False)}")

    # The gateway also exposes its own tool-discovery search
    # (x_amz_bedrock_agentcore_search), so pick the web search target by name
    # rather than taking whatever happens to come first.
    web_search = next((t for t in tools if t.endswith("WebSearch")), None)
    if web_search is None:
        sys.exit(f"no WebSearch tool among {tools}")
    print(f"using -> {web_search}")

    # 2. Search, timing only the round trip to the gateway.
    started = time.monotonic()
    called = _parse(_signed_post(url, {
        "jsonrpc": "2.0", "id": 2, "method": "tools/call",
        "params": {"name": web_search, "arguments": {"query": query, "maxResults": 5}},
    }))
    elapsed_ms = (time.monotonic() - started) * 1000

    if "error" in called:
        print(json.dumps(called["error"], ensure_ascii=False, indent=2))
        sys.exit(1)

    print(f"\nquery: {query}")
    print(f"latency: {elapsed_ms:.0f} ms\n")

    for block in called.get("result", {}).get("content", []):
        if block.get("type") != "text":
            continue
        # The connector packs its results as JSON inside a text block.
        try:
            results = json.loads(block["text"]).get("results", [])
        except json.JSONDecodeError:
            print(block["text"])
            continue
        for i, item in enumerate(results, 1):
            print(f"[{i}] {item.get('title')}")
            print(f"    {item.get('url')}  ({item.get('publishedDate')})")
            print(f"    {(item.get('text') or '')[:200].strip()}\n")


if __name__ == "__main__":
    main()
