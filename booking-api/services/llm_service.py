import os
import logging
from pathlib import Path
from typing import List, Optional, Union
from dotenv import load_dotenv
from google import genai
from google.genai import types
from google.genai.errors import APIError

# Set up logging
logger = logging.getLogger("booking_api.llm_service")

# Load environment variables
load_dotenv()

def resolve_credentials() -> None:
    """
    Ensure GOOGLE_APPLICATION_CREDENTIALS points to a valid file path.
    If the env variable points to a container-specific path (e.g. `/secrets/...`)
    and it does not exist locally, we fallback to finding the file in the workspace root.
    """
    creds_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if not creds_path:
        logger.warning("GOOGLE_APPLICATION_CREDENTIALS environment variable is not set.")
        return

    path_obj = Path(creds_path)
    
    # If the file exists at the specified path, we are done
    if path_obj.exists():
        logger.info(f"Using credentials file at: {path_obj.resolve()}")
        return

    # Fallback: search for the same filename in the workspace root
    filename = path_obj.name
    # Relative path from this file (booking-api/services/llm_service.py) to booking-api root is parent
    root_path = Path(__file__).resolve().parent.parent / filename
    if root_path.exists():
        resolved_path = str(root_path.resolve())
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = resolved_path
        logger.info(f"Credentials not found at {creds_path}. Resolved to workspace root path: {resolved_path}")
        return

    # Check the current working directory
    cwd_path = Path.cwd() / filename
    if cwd_path.exists():
        resolved_path = str(cwd_path.resolve())
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = resolved_path
        logger.info(f"Credentials not found at {creds_path}. Resolved to current working directory path: {resolved_path}")
        return

    logger.warning(
        f"Credentials file '{filename}' was not found at specified path '{creds_path}', "
        f"workspace root, or current working directory."
    )

# Resolve credentials paths before initializing the client
resolve_credentials()

# Configuration variables
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT")
LOCATION = os.getenv("GOOGLE_CLOUD_REGION", "us-central1")
CHAT_MODEL = os.getenv("VERTEX_CHAT_MODEL", "gemini-2.5-flash")

# Initialize the official Gen AI client for Vertex AI
# We initialize this lazily to ensure environment variables are fully set up.
_client: Optional[genai.Client] = None

def get_client() -> genai.Client:
    """
    Get or initialize the Google Gen AI client with Vertex AI settings.
    """
    global _client
    if _client is not None:
        return _client
    
    try:
        if not PROJECT_ID:
            logger.warning("GOOGLE_CLOUD_PROJECT is not set. Google GenAI initialization might fail.")
            
        _client = genai.Client(
            vertexai=True,
            project=PROJECT_ID,
            location=LOCATION
        )
        logger.info("Google GenAI client initialized successfully for Vertex AI.")
        return _client
    except Exception as e:
        logger.error(f"Failed to initialize Google GenAI client: {e}")
        raise RuntimeError(
            f"Google GenAI Client initialization failed. Check your credentials and configuration. Error: {e}"
        ) from e

def generate_response(
    prompt: Union[str, List[Union[str, types.Part]]],
    system_instruction: Optional[str] = None,
    temperature: Optional[float] = None,
    max_output_tokens: Optional[int] = None,
    tools: Optional[List[types.Tool]] = None,
) -> str:
    """
    Generate content using the configured Gemini chat model via Vertex AI.

    Args:
        prompt: The input prompt string or structured parts/messages.
        system_instruction: Optional system instruction/persona for the model.
        temperature: Controls randomness in generation (0.0 to 2.0).
        max_output_tokens: Maximum number of tokens to generate.
        tools: Optional list of tools (functions) for function calling.

    Returns:
        The generated text response.
    """
    client = get_client()
    
    # Configure generation settings
    config_args = {}
    if system_instruction is not None:
        config_args["system_instruction"] = system_instruction
    if temperature is not None:
        config_args["temperature"] = temperature
    if max_output_tokens is not None:
        config_args["max_output_tokens"] = max_output_tokens
    if tools is not None:
        config_args["tools"] = tools

    config_args["response_mime_type"] = "application/json"

    config = types.GenerateContentConfig(**config_args)

    response = client.models.generate_content(
        model=CHAT_MODEL,
        contents=[
            types.Content(
                role="user",
                parts=[types.Part(text=prompt)]
            )
        ],
        config=config
    )

    print("\n================ FULL GEMINI RESPONSE ================\n")
    print(response)
    print("\n======================================================\n")

    if response.text:
        return response.text.strip()

    if response.candidates:
        for candidate in response.candidates:
            if candidate.content and candidate.content.parts:
                texts = []

                for part in candidate.content.parts:
                    if getattr(part, "text", None):
                        texts.append(part.text)

                if texts:
                    return "\n".join(texts).strip()

    return ""
