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
import uuid
from typing import Any, Optional

import boto3

from handlers.geocode import describe_location

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


def _build_prompt(question: str, start: Optional[dict], end: Optional[dict]) -> str:
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

    context = f"現在地: 緯度 {lat}, 経度 {lon}"

    # Stated as fact so the model uses it instead of guessing from the numbers.
    place = describe_location(lat, lon)
    if place:
        context += f"\n現在地の住所: {place}（この住所は正確です。自分で座標から推測しないこと）"
    # Heading is US-2.03; until then `end` is usually absent. When both points
    # are present the agent is left to interpret them - this handler does not
    # compute a bearing, so as not to pre-empt that story.
    if isinstance(end, dict):
        end_lat, end_lon = end.get("latitude"), end.get("longitude")
        if isinstance(end_lat, (int, float)) and isinstance(end_lon, (int, float)):
            if (end_lat, end_lon) != (lat, lon):
                context += f"\n直前の位置: 緯度 {end_lat}, 経度 {end_lon}"

    return f"{context}\n\n質問: {question}"


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

    prompt = _build_prompt(question, body.get("start"), body.get("end"))

    try:
        result = _client.invoke_agent_runtime(
            agentRuntimeArn=AGENT_ARN,
            runtimeSessionId=session_id,
            payload=json.dumps({"question": prompt}).encode(),
        )
        answer = _extract_answer(result["response"])
    except Exception as error:  # noqa: BLE001 - surface one shape to the client
        # Logged for CloudWatch; the client gets a generic message rather than
        # the raw AWS error, which can name internal resources.
        print(f"invoke_agent_runtime failed: {type(error).__name__}: {error}")
        return _response(502, {"error": "The agent could not be reached."})

    if not answer:
        return _response(502, {"error": "The agent returned no answer."})

    return _response(200, {"answer": answer, "sessionId": session_id})
