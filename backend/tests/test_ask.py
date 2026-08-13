"""Tests for the /ask handler.

The AgentCore call is stubbed throughout: these cover the gatekeeper's own job
(validation, session handling, building the prompt, parsing the SSE stream),
not the agent's behaviour.
"""

import importlib
import json
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))


@pytest.fixture
def ask(monkeypatch):
    """Import the handler with an ARN configured, isolated per test.

    Reverse-geocoding is stubbed out by default so these tests neither need
    credentials nor depend on Amazon Location's answers; the tests that care
    about the address override it.
    """
    monkeypatch.setenv("AGENT_ARN", "arn:aws:bedrock-agentcore:us-east-1:000:runtime/test")
    module = importlib.import_module("handlers.ask")
    importlib.reload(module)
    module.describe_location = lambda _lat, _lon: None
    return module


class _FakeStream:
    """Stands in for the runtime's SSE response body."""

    def __init__(self, lines):
        self._lines = lines

    def iter_lines(self):
        return iter(self._lines)


def _sse(*texts: str) -> _FakeStream:
    lines = [
        b'data: ' + json.dumps(
            {"event": {"contentBlockDelta": {"delta": {"text": t}}}}
        ).encode()
        for t in texts
    ]
    return _FakeStream(lines)


def _event(body) -> dict:
    return {"body": body if isinstance(body, str) else json.dumps(body)}


def _call(ask, body, stream=None, capture=None):
    """Invoke the handler with invoke_agent_runtime stubbed out."""
    def fake_invoke(**kwargs):
        if capture is not None:
            capture.update(kwargs)
        return {"response": stream if stream is not None else _sse("答え")}

    ask._client.invoke_agent_runtime = fake_invoke
    return ask.handler(_event(body), None)


def test_answer_and_session_are_returned(ask):
    result = _call(ask, {"question": "富士山とは？"}, stream=_sse("富士", "山です"))
    body = json.loads(result["body"])

    assert result["statusCode"] == 200
    # Text deltas are reassembled in order.
    assert body["answer"] == "富士山です"
    # A session id is generated so the app can continue the conversation.
    assert len(body["sessionId"]) >= ask.MIN_SESSION_ID_CHARS


def test_supplied_session_id_is_passed_through(ask):
    session_id = "touring-" + "a" * 32
    capture: dict = {}
    result = _call(ask, {"question": "続き", "sessionId": session_id}, capture=capture)

    # The same id must reach the runtime, or the conversation would restart.
    assert capture["runtimeSessionId"] == session_id
    assert json.loads(result["body"])["sessionId"] == session_id


def test_generated_session_ids_differ_between_conversations(ask):
    first = json.loads(_call(ask, {"question": "q"})["body"])["sessionId"]
    second = json.loads(_call(ask, {"question": "q"})["body"])["sessionId"]

    assert first != second


def test_location_is_prepended_to_the_prompt(ask):
    capture: dict = {}
    _call(
        ask,
        {"question": "この山は？", "start": {"latitude": 35.5, "longitude": 139.5}},
        capture=capture,
    )

    prompt = json.loads(capture["payload"].decode())["question"]
    assert "35.5" in prompt and "139.5" in prompt
    assert "この山は？" in prompt


def test_resolved_address_is_stated_as_fact(ask):
    # The model places coordinates unreliably, so the address is given to it
    # along with an instruction not to second-guess the numbers.
    ask.describe_location = lambda _lat, _lon: "神奈川県箱根町"
    capture: dict = {}
    _call(
        ask,
        {"question": "この辺の名物は？", "start": {"latitude": 35.23, "longitude": 139.02}},
        capture=capture,
    )

    prompt = json.loads(capture["payload"].decode())["question"]
    assert "神奈川県箱根町" in prompt
    assert "推測しないこと" in prompt


def test_question_still_sent_when_the_address_is_unknown(ask):
    # At sea the lookup returns nothing; the question must go through anyway.
    ask.describe_location = lambda _lat, _lon: None
    capture: dict = {}
    _call(
        ask,
        {"question": "ここはどこ？", "start": {"latitude": 35.0, "longitude": 141.5}},
        capture=capture,
    )

    prompt = json.loads(capture["payload"].decode())["question"]
    assert "ここはどこ？" in prompt
    assert "現在地の住所" not in prompt


def test_heading_is_resolved_before_the_prompt_is_built(ask):
    # US-2.03. The bearing is stated outright, along with which way is right,
    # because the agent is told not to work directions out for itself.
    # `start` is where the rider is now and `end` the older fix, so travelling
    # north means `end` sits to the SOUTH of `start`.
    capture: dict = {}
    _call(
        ask,
        {
            "question": "右手に見える山は？",
            "start": {"latitude": 36.0, "longitude": 139.0},
            "end": {"latitude": 35.0, "longitude": 139.0},
        },
        capture=capture,
    )

    prompt = json.loads(capture["payload"].decode())["question"]
    assert "進行方向: 北" in prompt
    assert "右手は東" in prompt
    assert "左手は西" in prompt


def test_heading_is_not_reversed(ask):
    # Guards the end -> start reading: getting it backwards would still produce
    # a plausible-looking heading, just the opposite one, and would tell the
    # rider that the mountain on their right is on their left.
    capture: dict = {}
    _call(
        ask,
        {
            "question": "右手に見える山は？",
            "start": {"latitude": 35.0, "longitude": 139.0},
            "end": {"latitude": 36.0, "longitude": 139.0},  # came from the north
        },
        capture=capture,
    )

    prompt = json.loads(capture["payload"].decode())["question"]
    assert "進行方向: 南" in prompt
    assert "右手は西" in prompt


def test_no_heading_when_the_rider_has_not_moved(ask):
    # Stopped at a light: the two points are metres apart and the bearing would
    # be GPS noise. Better to say nothing than to point the rider the wrong way.
    capture: dict = {}
    same = {"latitude": 35.0, "longitude": 139.0}
    _call(ask, {"question": "この辺は？", "start": same, "end": same}, capture=capture)

    prompt = json.loads(capture["payload"].decode())["question"]
    assert "進行方向" not in prompt
    assert "この辺は？" in prompt


def test_no_heading_when_the_two_points_are_close_but_not_identical(ask):
    # The realistic stationary case: GPS drift means a stopped rider's two
    # fixes are never exactly equal, just a metre or two apart. Comparing for
    # equality would miss this and hand the model a heading built from noise.
    capture: dict = {}
    _call(
        ask,
        {
            "question": "この辺は？",
            "start": {"latitude": 35.0, "longitude": 139.0},
            # ~1.1m north - well inside MIN_DISTANCE_METERS.
            "end": {"latitude": 35.00001, "longitude": 139.0},
        },
        capture=capture,
    )

    prompt = json.loads(capture["payload"].decode())["question"]
    assert "進行方向" not in prompt
    assert "この辺は？" in prompt


def test_heading_appears_once_the_rider_clears_the_threshold(ask):
    # The other side of the same boundary, so the threshold cannot be raised
    # far enough to suppress headings for a genuinely moving rider.
    capture: dict = {}
    _call(
        ask,
        {
            "question": "右手の山は？",
            "start": {"latitude": 35.001, "longitude": 139.0},  # ~111m north
            "end": {"latitude": 35.0, "longitude": 139.0},
        },
        capture=capture,
    )

    assert "進行方向: 北" in json.loads(capture["payload"].decode())["question"]


def test_elapsed_time_is_stated_for_a_later_question(ask):
    # Each turn carries its own position, so the agent needs to know how much
    # time (and therefore distance) separates them to resolve "that mountain".
    capture: dict = {}
    _call(
        ask,
        {
            "question": "さっきの山の標高は？",
            "start": {"latitude": 35.0, "longitude": 139.0},
            "elapsedSeconds": 185,
        },
        capture=capture,
    )

    assert "約3分後" in json.loads(capture["payload"].decode())["question"]


def test_no_elapsed_note_on_the_first_question(ask):
    capture: dict = {}
    _call(
        ask,
        {"question": "この辺は？", "start": {"latitude": 35.0, "longitude": 139.0}},
        capture=capture,
    )

    assert "分後" not in json.loads(capture["payload"].decode())["question"]


def test_no_elapsed_note_when_barely_any_time_has_passed(ask):
    # Asking a follow-up straight away: the rider has not moved, so the note
    # would be noise.
    capture: dict = {}
    _call(
        ask,
        {
            "question": "もっと詳しく",
            "start": {"latitude": 35.0, "longitude": 139.0},
            "elapsedSeconds": 20,
        },
        capture=capture,
    )

    assert "分後" not in json.loads(capture["payload"].decode())["question"]


@pytest.mark.parametrize("value", ["180", -5, True, None, 1.5])
def test_bogus_elapsed_seconds_is_ignored(ask, value):
    # A malformed value must not take the answer down with it.
    capture: dict = {}
    result = _call(
        ask,
        {
            "question": "この辺は？",
            "start": {"latitude": 35.0, "longitude": 139.0},
            "elapsedSeconds": value,
        },
        capture=capture,
    )

    assert result["statusCode"] == 200
    assert "分後" not in json.loads(capture["payload"].decode())["question"]


def test_no_heading_when_the_second_point_is_absent(ask):
    # `end` is optional in the contract; the question still goes through.
    capture: dict = {}
    _call(
        ask,
        {"question": "ここはどこ？", "start": {"latitude": 35.0, "longitude": 139.0}},
        capture=capture,
    )

    prompt = json.loads(capture["payload"].decode())["question"]
    assert "進行方向" not in prompt
    assert "ここはどこ？" in prompt


def test_malformed_second_point_is_ignored(ask):
    # A partial `end` must not take the answer down with it.
    capture: dict = {}
    _call(
        ask,
        {
            "question": "この辺は？",
            "start": {"latitude": 35.0, "longitude": 139.0},
            "end": {"latitude": 36.0},
        },
        capture=capture,
    )

    prompt = json.loads(capture["payload"].decode())["question"]
    assert "進行方向" not in prompt
    assert "この辺は？" in prompt


@pytest.mark.parametrize(
    "body",
    [
        {},                                    # no question
        {"question": "   "},                   # blank question
        {"question": "x" * 501},               # too long
        {"question": "q", "sessionId": "short"},  # session id under 33 chars
    ],
)
def test_invalid_requests_are_rejected(ask, body):
    result = _call(ask, body)
    assert result["statusCode"] == 400
    assert "error" in json.loads(result["body"])


def test_malformed_json_is_rejected(ask):
    result = _call(ask, "{not json")
    assert result["statusCode"] == 400


def test_empty_answer_becomes_502(ask):
    result = _call(ask, {"question": "q"}, stream=_FakeStream([]))
    assert result["statusCode"] == 502


def test_agent_failure_does_not_leak_details(ask):
    def boom(**_kwargs):
        raise RuntimeError("arn:aws:iam::123456789012:role/secret not authorized")

    ask._client.invoke_agent_runtime = boom
    result = ask.handler(_event({"question": "q"}), None)

    assert result["statusCode"] == 502
    # The AWS error may name internal resources, so it must not be echoed.
    assert "123456789012" not in result["body"]


def test_missing_arn_is_reported(monkeypatch):
    monkeypatch.delenv("AGENT_ARN", raising=False)
    module = importlib.import_module("handlers.ask")
    importlib.reload(module)

    result = module.handler(_event({"question": "q"}), None)
    assert result["statusCode"] == 502
