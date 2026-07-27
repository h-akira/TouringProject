import os

from strands.models.bedrock import BedrockModel

# Inference-profile id, not a bare model id: in ap-northeast-1 every Anthropic
# model is INFERENCE_PROFILE-only, and the `jp.` prefix keeps inference inside
# Japan. The CLI scaffolds a `global.` Sonnet 4.5 id, which this account cannot
# invoke (AccessDeniedException). See pre-research/bedrock/.
DEFAULT_MODEL_ID = "jp.anthropic.claude-sonnet-4-6"

# Answers are read aloud while riding, so cap the output length. This also caps
# the per-request output cost (docs/01_architecture.md section 7.1).
DEFAULT_MAX_TOKENS = 300


def load_model() -> BedrockModel:
    """Get Bedrock model client using IAM credentials."""
    return BedrockModel(
        model_id=os.environ.get("BEDROCK_MODEL_ID", DEFAULT_MODEL_ID),
        region_name=os.environ.get("BEDROCK_REGION", "ap-northeast-1"),
        max_tokens=int(os.environ.get("BEDROCK_MAX_TOKENS", DEFAULT_MAX_TOKENS)),
    )
