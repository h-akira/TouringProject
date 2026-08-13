"""DynamoDB access for the async /ask flow.

One table holds every entity type, keyed by pk/sk - see
docs/03_dynamodb_table.md. This module owns the "ASK#" records: the status of a
question between the app posting it and collecting the answer.

Nothing here stores coordinates or a resolved address. The answer text may name
places, which is unavoidable, but the raw position is not written down; records
also expire after an hour (same doc, section 4).
"""

import os
import time
from typing import Any, Optional

import boto3
from botocore.exceptions import ClientError

TABLE_NAME = os.environ.get("TABLE_NAME", "")

# Long enough that a poll can never outlive the record (the app gives up after
# 80s), short enough that answers naming the rider's location do not linger.
TTL_SECONDS = 3600

# When a claim is old enough that its holder cannot still be running, and so may
# be taken over. Must exceed the queue's visibility timeout (180s in
# template.yaml) - below that, a worker still doing its job could have the
# question taken off it, and the agent would be called twice.
CLAIM_STALE_SECONDS = 300

# Created once per container so warm invocations skip client setup.
_resource = boto3.resource("dynamodb")


def _table() -> Any:
    return _resource.Table(TABLE_NAME)


def _key(request_id: str) -> dict[str, str]:
    return {"pk": f"ASK#{request_id}", "sk": "STATUS"}


def create_pending(request_id: str, session_id: str, prompt: str) -> None:
    """Record a question as accepted, before anything has been generated.

    The prompt is stored because the worker runs in a separate invocation and
    needs it; it already has the address folded in, so the coordinates
    themselves never have to be written.
    """
    now = int(time.time())
    _table().put_item(
        Item={
            **_key(request_id),
            "status": "pending",
            "sessionId": session_id,
            "prompt": prompt,
            "createdAt": now,
            "expiresAt": now + TTL_SECONDS,
        }
    )


def claim(request_id: str) -> Optional[dict[str, Any]]:
    """Take ownership of a question, or return None if someone already has it.

    SQS delivers at least once, so the same question can arrive twice; without
    this the agent would be called - and billed - twice over. The conditional
    write is what makes that safe: only one caller can move a record out of
    `pending`, and the loser returns None and stops.

    A claim can also be taken over once it has gone stale. A worker killed
    mid-flight - a Lambda timeout leaves no chance to record anything - would
    otherwise strand the record in `processing`, where it reads as "still
    working" to the app until it gives up. Past CLAIM_STALE_SECONDS the record
    is treated as abandoned, which is safe because the queue's visibility
    timeout has expired by then: whoever held it is no longer running.
    """
    now = int(time.time())
    try:
        result = _table().update_item(
            Key=_key(request_id),
            UpdateExpression="SET #s = :processing, claimedAt = :now",
            # Fresh work, or work whose owner has demonstrably stopped.
            ConditionExpression=(
                "#s = :pending OR (#s = :processing AND claimedAt < :stale)"
            ),
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={
                ":processing": "processing",
                ":pending": "pending",
                ":now": now,
                ":stale": now - CLAIM_STALE_SECONDS,
            },
            ReturnValues="ALL_NEW",
        )
    except ClientError as error:
        if error.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return None
        raise
    return result.get("Attributes")


def save_answer(request_id: str, answer: str) -> None:
    _table().update_item(
        Key=_key(request_id),
        UpdateExpression="SET #s = :done, answer = :answer REMOVE prompt",
        ExpressionAttributeNames={"#s": "status"},
        ExpressionAttributeValues={":done": "done", ":answer": answer},
    )


def save_error(request_id: str, message: str) -> None:
    """Record a failure. `message` is shown to the rider, so keep it generic."""
    _table().update_item(
        Key=_key(request_id),
        UpdateExpression="SET #s = :error, #e = :message REMOVE prompt",
        ExpressionAttributeNames={"#s": "status", "#e": "error"},
        ExpressionAttributeValues={":error": "error", ":message": message},
    )


def get(request_id: str) -> Optional[dict[str, Any]]:
    return _table().get_item(Key=_key(request_id)).get("Item")
