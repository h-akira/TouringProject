"""Handler for POST /ask: accepts a question and queues it for the agent.

The Lambda is a gatekeeper, not the brains (pre-research/agentcore/AUTH.md):
it validates the request, settles the facts the model should not guess at (the
address, the heading), and hands the result to the queue. The agent is called
by handlers/worker.py, and the app collects the answer from
handlers/result.py.

⚠️ This endpoint used to wait for the answer and return it. It no longer does:
API Gateway caps a request at 29s and the agent alone measured 25.5s, so the
wait was moved off the request path entirely (docs/01_architecture.md section
5). The response is now 202 with a requestId to poll.
"""

import json
import os
import time
import uuid
from typing import Any, Optional

import boto3

from handlers.geocode import describe_location
from lib import store
from lib.geo import (
    MIN_DISTANCE_METERS,
    bearing_to_compass,
    calculate_bearing,
    haversine_distance,
    relative_direction,
)

# Answers are read aloud while riding, so a question that long is a mistake
# (and caps input cost - docs/01_architecture.md section 9).
MAX_QUESTION_CHARS = 500

# AgentCore rejects a runtimeSessionId below this length.
MIN_SESSION_ID_CHARS = 33

QUEUE_URL = os.environ.get("QUEUE_URL", "")

# Created once per container so warm invocations skip client setup.
_sqs = boto3.client("sqs")


def _response(status: int, body: dict[str, Any]) -> dict[str, Any]:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body, ensure_ascii=False),
    }


def _new_session_id() -> str:
    # uuid4().hex is 32 chars, one short of the minimum, so it is prefixed.
    return f"touring-{uuid.uuid4().hex}"


def _format_elapsed(elapsed_seconds: Any) -> Optional[str]:
    """Say how long since the conversation started, for the agent's benefit.

    Every turn carries its own position, so the history ends up holding several
    of them. Without a sense of time the agent cannot tell whether "that
    mountain" refers to where the rider is now or where they were asked three
    minutes and two kilometres ago. Elapsed time is used rather than a
    timestamp: it is what the agent actually needs, and it keeps a log of the
    rider's movements out of the prompt.
    """
    if not isinstance(elapsed_seconds, int) or isinstance(elapsed_seconds, bool):
        return None
    if elapsed_seconds < 0:
        return None
    # Below a minute the rider has not meaningfully moved, so the note would be
    # noise; the first question of a conversation has no elapsed time at all.
    if elapsed_seconds < 60:
        return None

    minutes = elapsed_seconds // 60
    return f"【この質問は、会話の最初の質問から約{minutes}分後のものです】"


def _build_prompt(
    question: str,
    start: Optional[dict],
    end: Optional[dict],
    elapsed_seconds: Any = None,
) -> str:
    """Prepend the rider's location, which the agent's prompt expects.

    The address is resolved here rather than left to the model, which places
    coordinates unreliably (see handlers/geocode.py). The raw coordinates go in
    too, since they are what any later tool call would need.
    """
    if not isinstance(start, dict):
        return question

    lat, lon = start.get("latitude"), start.get("longitude")
    if not isinstance(lat, (int, float)) or not isinstance(lon, (int, float)):
        return question

    context = ""
    elapsed = _format_elapsed(elapsed_seconds)
    if elapsed:
        context += f"{elapsed}\n"
    context += f"現在地: 緯度 {lat}, 経度 {lon}"

    # Stated as fact so the model uses it instead of guessing from the numbers.
    place = describe_location(lat, lon)
    if place:
        context += f"\n現在地の住所: {place}（この住所は正確です。自分で座標から推測しないこと）"
    heading = _describe_heading(lat, lon, end)
    if heading:
        context += f"\n{heading}"

    return f"{context}\n\n質問: {question}"


def _describe_heading(lat: float, lon: float, end: Optional[dict]) -> Optional[str]:
    """Describe the direction of travel, and which way is left and right.

    The bearing is computed here rather than described to the model as two
    coordinate pairs: it is plain trigonometry, and the model places coordinates
    unreliably (learning/61 section 2).

    Note the direction the two points are read in. `start` is the rider's
    current position (it is what the address is resolved from), so `end` is the
    OLDER fix and the rider is travelling away from it - the bearing therefore
    runs end -> start. Reading them the other way round points the heading
    backwards, which swaps the rider's left and right.

    Returns None whenever a heading would be meaningless - no second point, or
    the rider has barely moved - so a stationary rider simply gets no heading
    rather than one derived from GPS jitter.
    """
    if not isinstance(end, dict):
        return None

    end_lat, end_lon = end.get("latitude"), end.get("longitude")
    if not isinstance(end_lat, (int, float)) or not isinstance(end_lon, (int, float)):
        return None

    current = {"latitude": lat, "longitude": lon}
    previous = {"latitude": end_lat, "longitude": end_lon}
    if haversine_distance(previous, current) < MIN_DISTANCE_METERS:
        return None

    bearing = calculate_bearing(previous, current)
    # Spelled out for the model, which is told not to work directions out for
    # itself (see the agent's system prompt).
    return (
        f"進行方向: {bearing_to_compass(bearing)}（真北から{round(bearing)}度）\n"
        f"ライダーから見て右手は{relative_direction(bearing, 90)}、"
        f"左手は{relative_direction(bearing, -90)}の方角"
    )


def handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    if not QUEUE_URL:
        return _response(502, {"error": "QUEUE_URL is not configured."})

    # API Gateway (proxy integration) passes the body as a JSON string.
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _response(400, {"error": "Request body must be valid JSON."})
    if not isinstance(body, dict):
        return _response(400, {"error": "Request body must be a JSON object."})

    question = body.get("question")
    if not isinstance(question, str) or not question.strip():
        return _response(400, {"error": "`question` is required and must be non-empty."})
    question = question.strip()
    if len(question) > MAX_QUESTION_CHARS:
        return _response(
            400,
            {"error": f"`question` must be at most {MAX_QUESTION_CHARS} characters."},
        )

    # The app owns the session id and holds on to it; a request without one
    # starts a new conversation.
    session_id = body.get("sessionId")
    if session_id is None:
        session_id = _new_session_id()
    elif not isinstance(session_id, str) or len(session_id) < MIN_SESSION_ID_CHARS:
        return _response(
            400,
            {"error": f"`sessionId` must be at least {MIN_SESSION_ID_CHARS} characters."},
        )

    # The address is resolved here rather than in the worker so that a failure
    # to place the rider surfaces while the app is still on the request, and so
    # the coordinates never have to be written to the table.
    started = time.monotonic()
    prompt = _build_prompt(
        question, body.get("start"), body.get("end"), body.get("elapsedSeconds")
    )
    geocode_ms = (time.monotonic() - started) * 1000

    request_id = str(uuid.uuid4())
    try:
        store.create_pending(request_id, session_id, prompt)
        _sqs.send_message(
            QueueUrl=QUEUE_URL,
            MessageBody=json.dumps({"requestId": request_id}),
        )
    except Exception as error:  # noqa: BLE001 - surface one shape to the client
        # Logged for CloudWatch; the client gets a generic message rather than
        # the raw AWS error, which can name internal resources.
        print(f"failed to queue question: {type(error).__name__}: {error}")
        return _response(502, {"error": "The question could not be accepted."})

    # Neither coordinates nor the resolved address are logged: where the rider
    # has been is theirs (docs/03_dynamodb_table.md section 4).
    print(f"timing: geocode={geocode_ms:.0f}ms queued={request_id}")

    # 202: accepted, not answered. The app polls GET /ask/{requestId}.
    return _response(202, {"requestId": request_id, "sessionId": session_id})
