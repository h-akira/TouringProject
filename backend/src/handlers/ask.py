"""Handler for the /ask endpoint: forwards the question to the AgentCore agent.

The Lambda is a gatekeeper, not the brains (pre-research/agentcore/AUTH.md):
it validates the request and passes it to the AgentCore runtime, which owns
the conversation history, the model, and web search.

Two things to know about the shape of this code:

  - The runtime lives in us-east-1 while this Lambda runs in ap-northeast-1,
    because the web-search connector is only offered there. The region is
    therefore explicit rather than inherited from the environment.
  - The runtime replies with an SSE stream of Strands events, so the answer
    arrives as a series of text deltas that have to be reassembled.
"""

import json
import os
import time
import uuid
from typing import Any, Optional

import boto3

from handlers.geocode import describe_location
from lib.geo import (
    MIN_DISTANCE_METERS,
    bearing_to_compass,
    calculate_bearing,
    haversine_distance,
    relative_direction,
)

# Where the agent runs. Deliberately not this Lambda's own region; see above.
AGENT_REGION = os.environ.get("AGENT_REGION", "us-east-1")

# Set from the SAM template. Without it there is nothing to call.
AGENT_ARN = os.environ.get("AGENT_ARN", "")

# Answers are read aloud while riding, so a question that long is a mistake
# (and caps input cost - docs/01_architecture.md section 7.1).
MAX_QUESTION_CHARS = 500

# AgentCore rejects a runtimeSessionId below this length.
MIN_SESSION_ID_CHARS = 33

# Created once per container so warm invocations skip client setup.
_client = boto3.client("bedrock-agentcore", region_name=AGENT_REGION)


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


def _extract_answer(stream: Any) -> str:
    """Reassemble the answer from the runtime's SSE event stream."""
    answer = ""
    for raw in stream.iter_lines():
        if not raw:
            continue
        line = raw.decode() if isinstance(raw, bytes) else raw
        if not line.startswith("data:"):
            continue
        try:
            event = json.loads(line[len("data:"):].strip())
        except json.JSONDecodeError:
            continue
        # The agent yields its own {"error": ...} for a rejected payload.
        if isinstance(event, dict) and "error" in event and "event" not in event:
            raise RuntimeError(str(event["error"]))
        delta = (
            event.get("event", {})
            .get("contentBlockDelta", {})
            .get("delta", {})
            .get("text")
        )
        if delta:
            answer += delta
    return answer.strip()


def handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    if not AGENT_ARN:
        return _response(502, {"error": "AGENT_ARN is not configured."})

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

    # Timings are logged per stage because the 29s API Gateway ceiling is close
    # (25.5s measured) and the split between address lookup, the agent's cold
    # start and generation decides what is worth changing. No coordinates or
    # addresses are logged here - see .memory/issues.md on location privacy.
    started = time.monotonic()
    prompt = _build_prompt(
        question, body.get("start"), body.get("end"), body.get("elapsedSeconds")
    )
    geocode_ms = (time.monotonic() - started) * 1000

    agent_started = time.monotonic()
    try:
        result = _client.invoke_agent_runtime(
            agentRuntimeArn=AGENT_ARN,
            runtimeSessionId=session_id,
            payload=json.dumps({"question": prompt}).encode(),
        )
        # The call returns as soon as the stream opens, so time to first byte
        # and time to the full answer are measured separately: a slow cold
        # start shows up in the former, a long answer in the latter.
        first_byte_ms = (time.monotonic() - agent_started) * 1000
        answer = _extract_answer(result["response"])
    except Exception as error:  # noqa: BLE001 - surface one shape to the client
        # Logged for CloudWatch; the client gets a generic message rather than
        # the raw AWS error, which can name internal resources.
        print(f"invoke_agent_runtime failed: {type(error).__name__}: {error}")
        return _response(502, {"error": "The agent could not be reached."})

    print(
        "timing: geocode=%.0fms agent_open=%.0fms agent_total=%.0fms answer_chars=%d"
        % (
            geocode_ms,
            first_byte_ms,
            (time.monotonic() - agent_started) * 1000,
            len(answer),
        )
    )

    if not answer:
        return _response(502, {"error": "The agent returned no answer."})

    return _response(200, {"answer": answer, "sessionId": session_id})
