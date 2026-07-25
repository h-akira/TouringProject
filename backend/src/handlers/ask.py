"""Mock handler for the /ask endpoint.

At this stage it does NOT call Bedrock/Transcribe/Polly. It only verifies the
app <-> backend wiring: accept a POST, echo back what it received as a fixed
JSON response. Real STT -> LLM -> TTS logic is added later.
"""

import json
from typing import Any


def handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    # API Gateway (proxy integration) passes the request body as a JSON string.
    raw_body = event.get("body") or "{}"
    try:
        body = json.loads(raw_body)
    except json.JSONDecodeError:
        body = {}

    # These fields mirror the planned request shape (see docs/01_architecture.md).
    # For the mock we just read and echo them; nothing is validated yet.
    start = body.get("start")  # 1st GPS point {latitude, longitude}
    end = body.get("end")  # 2nd GPS point {latitude, longitude}

    response_body = {
        "message": "mock backend is alive",
        "received": {"start": start, "end": end},
        "answer": "これはモックの回答です。バックエンド連携が通っています。",
    }

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(response_body, ensure_ascii=False),
    }
