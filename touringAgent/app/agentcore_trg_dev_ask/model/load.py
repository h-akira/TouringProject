import os

from strands.models.bedrock import BedrockModel

# Inference-profile id, not a bare model id: every Anthropic model here is
# INFERENCE_PROFILE-only. The CLI scaffolds a `global.` Sonnet 4.5 id, which
# this account cannot invoke (AccessDeniedException). See pre-research/bedrock/.
#
# `us.` rather than `jp.`: the whole project sits in us-east-1 because the
# Web Search Tool connector is offered there and nowhere else
# (pre-research/websearch/). `jp.` is an ap-northeast-only profile and fails
# from us-east-1 with "The provided model identifier is invalid".
DEFAULT_MODEL_ID = "us.anthropic.claude-sonnet-4-6"

# Answers are read aloud while riding, so cap the output length. This also caps
# the per-request output cost (docs/01_architecture.md section 7.1).
DEFAULT_MAX_TOKENS = 300


def load_model() -> BedrockModel:
    """Get Bedrock model client using IAM credentials."""
    return BedrockModel(
        model_id=os.environ.get("BEDROCK_MODEL_ID", DEFAULT_MODEL_ID),
        region_name=os.environ.get("BEDROCK_REGION", "us-east-1"),
        max_tokens=int(os.environ.get("BEDROCK_MAX_TOKENS", DEFAULT_MAX_TOKENS)),
    )
