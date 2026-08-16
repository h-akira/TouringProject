"""Tests for the EventBridge transcription-completion handler.

This is where the recorded path rejoins the typed one, so these check that what
lands on the queue is indistinguishable from what POST /ask puts there - same
prompt, same facts settled - and that a failure tells the rider rather than
leaving the app polling something nothing will move.
"""

import importlib
import json

import pytest


def _event(job_name="req-1", status="COMPLETED"):
    return {
        "detail": {
            "TranscriptionJobName": job_name,
            "TranscriptionJobStatus": status,
        }
    }


def _transcript(text="この山は何ですか"):
    return json.dumps({"results": {"transcripts": [{"transcript": text}]}}).encode()


class _FakeBody:
    def __init__(self, payload: bytes):
        self._payload = payload

    def read(self) -> bytes:
        return self._payload


class _FakeStore:
    """Stands in for the DynamoDB record."""

    def __init__(self, record=None):
        self.record = (
            record
            if record is not None
            else {
                "status": "transcribing",
                "sessionId": "touring-" + "a" * 32,
                "location": {"start": {"latitude": 35.0, "longitude": 139.0}},
            }
        )
        self.prompt = None
        self.saved_error = None

    def get(self, _request_id):
        return self.record

    def start_pending(self, _request_id, prompt):
        self.prompt = prompt

    def save_error(self, _request_id, message):
        self.saved_error = message


@pytest.fixture
def transcribe_done(monkeypatch):
    """Import the handler with the address lookup stubbed out.

    ⚠️ The stub goes on lib.prompt, which is what actually calls it - patching
    the handler would leave the real Amazon Location call in place.
    """
    monkeypatch.setenv("QUEUE_URL", "https://sqs.example/queue")
    monkeypatch.setenv("AUDIO_BUCKET", "bucket-test")
    prompt_module = importlib.import_module("lib.prompt")
    importlib.reload(prompt_module)
    prompt_module.describe_location = lambda _lat, _lon: None
    module = importlib.import_module("handlers.transcribe_done")
    importlib.reload(module)
    module.prompt_builder = prompt_module
    return module


def _run(transcribe_done, store, event=None, transcript=None, fail_on=None):
    queued = []

    def fake_get_object(**_kwargs):
        if fail_on == "s3":
            raise RuntimeError("transcript unavailable")
        return {"Body": _FakeBody(transcript if transcript is not None else _transcript())}

    def fake_send_message(**kwargs):
        if fail_on == "queue":
            raise RuntimeError("queue unavailable")
        queued.append(kwargs)

    transcribe_done.store = store
    transcribe_done._s3.get_object = fake_get_object
    transcribe_done._sqs.send_message = fake_send_message
    transcribe_done.handler(event if event is not None else _event(), None)
    return queued


def test_transcribed_question_reaches_the_queue(transcribe_done):
    store = _FakeStore()
    queued = _run(transcribe_done, store)

    assert len(queued) == 1
    assert json.loads(queued[0]["MessageBody"])["requestId"] == "req-1"


def test_the_prompt_carries_the_transcript_and_the_position(transcribe_done):
    # The worker cannot tell a recorded question from a typed one, which is the
    # whole point of building the prompt here.
    store = _FakeStore()
    _run(transcribe_done, store)

    assert "この山は何ですか" in store.prompt
    assert "35.0" in store.prompt and "139.0" in store.prompt


def test_heading_is_settled_for_a_recorded_question_too(transcribe_done):
    # US-2.03 applies whether the question was typed or spoken.
    store = _FakeStore(
        record={
            "status": "transcribing",
            "sessionId": "touring-" + "a" * 32,
            "location": {
                "start": {"latitude": 36.0, "longitude": 139.0},
                "end": {"latitude": 35.0, "longitude": 139.0},
            },
        }
    )
    _run(transcribe_done, store)

    assert "進行方向: 北" in store.prompt
    assert "右手は東" in store.prompt


def test_failed_transcription_tells_the_rider(transcribe_done):
    # Without this the record sits in `transcribing` and the app polls until it
    # gives up, which reads as "slow" rather than "failed".
    store = _FakeStore()
    queued = _run(transcribe_done, store, event=_event(status="FAILED"))

    assert store.saved_error is not None
    assert queued == []


def test_silence_is_not_sent_to_the_agent(transcribe_done):
    # A recording of road noise transcribes to nothing; asking the agent about
    # an empty question costs a call and answers nothing.
    store = _FakeStore()
    queued = _run(transcribe_done, store, transcript=_transcript(""))

    assert store.saved_error is not None
    assert queued == []


def test_unreadable_transcript_is_reported(transcribe_done):
    store = _FakeStore()
    queued = _run(transcribe_done, store, fail_on="s3")

    assert store.saved_error is not None
    assert queued == []


def test_queue_failure_is_recorded_on_the_item(transcribe_done):
    # The app is polling; a failure it never hears about is the worst outcome.
    store = _FakeStore()
    _run(transcribe_done, store, fail_on="queue")

    assert store.saved_error is not None


def test_unknown_request_is_ignored(transcribe_done):
    # An expired record, or an event from something else in the account.
    store = _FakeStore(record=None)
    store.record = None
    queued = _run(transcribe_done, store)

    assert queued == []
    assert store.saved_error is None


@pytest.mark.parametrize(
    "event",
    [
        {"detail": {}},
        {"detail": {"TranscriptionJobName": "req-1"}},
        {"detail": {"TranscriptionJobStatus": "COMPLETED"}},
        {},
    ],
)
def test_malformed_events_are_ignored(transcribe_done, event):
    store = _FakeStore()
    queued = _run(transcribe_done, store, event=event)

    assert queued == []
    assert store.saved_error is None


def test_the_transcript_is_not_logged(transcribe_done, capsys):
    # It is what the rider said, and it names where they are.
    store = _FakeStore()
    _run(transcribe_done, store)

    assert "この山は何ですか" not in capsys.readouterr().out
