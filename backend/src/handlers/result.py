"""Handler for GET /ask/{requestId}: reports on a queued question.

This is what the app polls while it waits. It only reads the table - it never
calls the agent, so it stays fast however long the answer takes.

`pending` and `processing` are both reported as "pending": the distinction
exists to make duplicate deliveries safe (docs/03_dynamodb_table.md section 4)
and means nothing to the app, which either has an answer or does not.

The exception is a `processing` record whose worker died without recording
anything and whose retries are exhausted. Nothing will move it again, so
reporting it as pending would leave the app polling until it times out. It is
reported as an error instead - the rider gets told, rather than left waiting.
"""

import json
import time
from typing import Any

from lib import store

# Past this, a `processing` record has been abandoned: the queue's retries
# (3 x 180s visibility) are spent, so nothing is coming back for it.
ABANDONED_AFTER_SECONDS = 900


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

    if status == "processing" and _is_abandoned(item):
        return _response(
            200,
            {
                "status": "error",
                "error": "The question could not be answered.",
                "sessionId": session_id,
            },
        )

    return _response(200, {"status": "pending", "sessionId": session_id})


def _is_abandoned(item: dict[str, Any]) -> bool:
    """Whether a claimed question has been left unfinished for good."""
    claimed_at = item.get("claimedAt")
    if not isinstance(claimed_at, (int, float)):
        # Written by every claim; absent only on records from before that.
        return False
    return time.time() - float(claimed_at) > ABANDONED_AFTER_SECONDS
