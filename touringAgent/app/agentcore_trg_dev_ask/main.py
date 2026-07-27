"""Minimal AgentCore agent for the touring app — conversation-continuity PoC.

Goal of this stage: prove that reusing one runtimeSessionId actually carries
context across invocations, and measure what that costs. Voice (Transcribe /
Polly), API-key auth, and heading context come later.

Deliberately trimmed from the CLI scaffold:
  - the example MCP client (mcp.exa.ai) is dropped: an external dependency
    would muddy the very thing we are measuring here.
  - the add_numbers demo tool is dropped for the same reason. Tool use is a
    later experiment (see pre-research/agentcore/ section 8).
  - SlidingWindowConversationManager replaces NullConversationManager, which
    keeps no history at all and so cannot answer a follow-up question.

Note the history is per process, so it survives only while the session's
microVM is alive. That is exactly the property under test — see the caveat on
`_SESSION_AGENTS` below.
"""

import os
from collections import OrderedDict

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from strands import Agent
from strands.agent.conversation_manager import SlidingWindowConversationManager

from model.load import load_model

app = BedrockAgentCoreApp()
log = app.logger

SYSTEM_PROMPT = """\
あなたはバイクでツーリング中のライダーを支援するAIです。
回答は音声で読み上げられ、ライダーは走行中で画面を見られません。

回答のルール:
- 2〜3文程度で簡潔に答える。前置きや復唱はしない。
- Markdown記法（**、#、箇条書き記号など）は一切使わない。読み上げると不自然になる。
- 方角や左右は、ユーザーから与えられた情報をそのまま使う。自分で計算し直さない。
- 確実でないことは「たぶん」「〜と思われます」と正直に伝える。
- 直前までの会話を踏まえ、「それ」「その山」のような指示語も文脈から解釈する。
"""

# How many turns to keep. Every turn is re-sent to Bedrock on the next call, so
# this is the direct lever on input-token cost; 20 is ~10 question/answer pairs.
MAX_TURNS = int(os.environ.get("AGENT_MAX_TURNS", "20"))

# Cap on concurrently cached sessions, so one long-lived process can neither
# leak history between sessions nor grow without bound.
MAX_CACHED_SESSIONS = 128

# session_id -> Agent. In-process only: AgentCore gives each session its own
# microVM, so this survives exactly as long as that microVM. A cold start (or
# an idle timeout) empties it and the conversation silently restarts. Durable
# history would need AgentCore Memory — an open question in
# pre-research/agentcore/ section 8.
_SESSION_AGENTS: "OrderedDict[str, Agent]" = OrderedDict()


def _get_or_create_agent(session_id: str) -> Agent:
    """Return the Agent for this session, creating it on first contact."""
    if session_id in _SESSION_AGENTS:
        _SESSION_AGENTS.move_to_end(session_id)
        return _SESSION_AGENTS[session_id]

    if len(_SESSION_AGENTS) >= MAX_CACHED_SESSIONS:
        evicted, _ = _SESSION_AGENTS.popitem(last=False)
        log.info("evicted session from cache: %s", evicted)

    log.info("creating agent for session: %s", session_id)
    _SESSION_AGENTS[session_id] = Agent(
        model=load_model(),
        system_prompt=SYSTEM_PROMPT,
        conversation_manager=SlidingWindowConversationManager(
            window_size=MAX_TURNS
        ),
    )
    return _SESSION_AGENTS[session_id]


def _extract_prompt(payload: dict) -> str:
    """Pull the question out of the request body.

    `prompt` is what the AgentCore CLI and console send, so accept that as well
    as this app's own `question` field.
    """
    for key in ("question", "prompt"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


@app.entrypoint
async def invoke(payload: dict, context):
    # AgentCore derives session_id from the runtimeSessionId on the request.
    # Same id -> same agent -> the earlier turns are still in context.
    session_id = getattr(context, "session_id", None) or "default-session"
    question = _extract_prompt(payload)

    if not question:
        yield {"error": "`question` (or `prompt`) is required and must be non-empty."}
        return

    agent = _get_or_create_agent(session_id)
    turns_before = len(agent.messages)
    log.info("session=%s turns_before=%d q=%r", session_id, turns_before, question[:80])

    async for event in agent.stream_async(question):
        # Pass through only the model stream events; the SDK also emits
        # bookkeeping dicts that the client has no use for.
        if isinstance(event, dict) and "event" in event:
            yield event


if __name__ == "__main__":
    app.run()
