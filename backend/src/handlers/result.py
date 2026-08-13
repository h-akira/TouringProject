"""Handler for GET /ask/{requestId}: reports on a queued question.

This is what the app polls while it waits. It only reads the table - it never
calls the agent, so it stays fast however long the answer takes.

`pending` and `processing` are both reported as "pending": the distinction
exists to make duplicate deliveries safe (docs/03_dynamodb_table.md section 4)
and means nothing to the app, which either has an answer or does not.
"""

import json
from typing import Any

from lib import store


def _response(status: int, body: dict[str, Any]) -> dict[str, Any]:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, ensure_ascii=False),
    }


def handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    request_id = (event.get("pathParameters") or {}).get("requestId")
    if not isinstance(request_id, str) or not request_id:
        return _response(400, {"error": "`requestId` is required."})

    try:
        item = store.get(request_id)
    except Exception as error:  # noqa: BLE001 - surface one shape to the client
        print(f"failed to read result: {type(error).__name__}: {error}")
        return _response(502, {"error": "The result could not be read."})

    # Also covers a requestId whose record has passed its TTL, which is
    # indistinguishable from one that never existed - and means the same thing
    # to the app either way.
    if item is None:
        return _response(404, {"error": "No such request."})

    status = item.get("status")
    session_id = item.get("sessionId", "")

    if status == "done":
        return _response(
            200,
            {
                "status": "done",
                "answer": item.get("answer", ""),
                "sessionId": session_id,
            },
        )

    if status == "error":
        return _response(
            200,
            {
                "status": "error",
                "error": item.get("error", "The question could not be answered."),
                "sessionId": session_id,
            },
        )

    return _response(200, {"status": "pending", "sessionId": session_id})
