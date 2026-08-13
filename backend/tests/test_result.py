"""Tests for GET /ask/{requestId}, which the app polls while it waits.

The contract matters more than it looks: the app decides whether to keep
polling from `status`, so anything ambiguous here turns into a client that
either gives up early or never stops.
"""

import importlib
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

SESSION_ID = "touring-" + "a" * 32


@pytest.fixture
def result():
    module = importlib.import_module("handlers.result")
    importlib.reload(module)
    return module


def _call(result, item, request_id="req-1", raises=None):
    def fake_get(_request_id):
        if raises is not None:
            raise raises
        return item

    result.store.get = fake_get
    return result.handler({"pathParameters": {"requestId": request_id}}, None)


def test_pending_is_reported_while_the_agent_works(result):
    response = _call(result, {"status": "pending", "sessionId": SESSION_ID})
    body = json.loads(response["body"])

    assert response["statusCode"] == 200
    assert body["status"] == "pending"
    assert "answer" not in body


def test_processing_looks_the_same_as_pending_to_the_app(result):
    # `processing` exists only to make duplicate deliveries safe; the app has
    # no use for the distinction and should keep polling either way.
    response = _call(result, {"status": "processing", "sessionId": SESSION_ID})

    assert json.loads(response["body"])["status"] == "pending"


def test_done_returns_the_answer(result):
    response = _call(
        result,
        {"status": "done", "answer": "それは富士山です", "sessionId": SESSION_ID},
    )
    body = json.loads(response["body"])

    assert body["status"] == "done"
    assert body["answer"] == "それは富士山です"
    # Echoed so the app can keep the conversation going.
    assert body["sessionId"] == SESSION_ID


def test_error_is_reported_as_a_200_with_a_status(result):
    # Not an HTTP error: the request itself succeeded, and the app needs to
    # read the status to know to stop polling.
    response = _call(
        result,
        {"status": "error", "error": "The agent could not be reached.", "sessionId": SESSION_ID},
    )
    body = json.loads(response["body"])

    assert response["statusCode"] == 200
    assert body["status"] == "error"
    assert body["error"]


def test_unknown_request_is_404(result):
    # Also what an expired record looks like, which means the same thing here.
    response = _call(result, None)
    assert response["statusCode"] == 404


def test_missing_request_id_is_rejected(result):
    response = result.handler({"pathParameters": None}, None)
    assert response["statusCode"] == 400


def test_read_failure_does_not_leak_details(result):
    response = _call(
        result,
        None,
        raises=RuntimeError("arn:aws:iam::123456789012:table/secret denied"),
    )

    assert response["statusCode"] == 502
    assert "123456789012" not in response["body"]
