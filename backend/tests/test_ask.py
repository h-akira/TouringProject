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


def test_second_point_is_included_only_when_it_differs(ask):
    capture: dict = {}
    same = {"latitude": 35.0, "longitude": 139.0}
    _call(ask, {"question": "q", "start": same, "end": same}, capture=capture)
    assert "直前の位置" not in json.loads(capture["payload"].decode())["question"]

    _call(
        ask,
        {"question": "q", "start": same, "end": {"latitude": 36.0, "longitude": 139.0}},
        capture=capture,
    )
    assert "直前の位置" in json.loads(capture["payload"].decode())["question"]


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
