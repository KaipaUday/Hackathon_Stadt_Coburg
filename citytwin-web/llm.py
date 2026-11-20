"""One place for all LLM calls (chat assistant + reading reports).

With an API key set  -> any OpenAI-compatible cloud API (OpenAI by default).
Without an API key   -> local Ollama, as before.

Settings (environment variables):
  LLM_API_KEY   your key (OPENAI_API_KEY also works)
  LLM_BASE_URL  default https://api.openai.com/v1
                Gemini:  https://generativelanguage.googleapis.com/v1beta/openai
                Mistral: https://api.mistral.ai/v1
                Groq:    https://api.groq.com/openai/v1
  LLM_MODEL     default gpt-4.1-mini (cloud) / qwen2.5:7b (Ollama)
"""

import json
import os
import urllib.error
import urllib.request

API_KEY = os.environ.get("LLM_API_KEY") or os.environ.get("OPENAI_API_KEY")
BASE_URL = os.environ.get("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
MODEL = os.environ.get("LLM_MODEL") or ("gpt-4.1-mini" if API_KEY else "qwen2.5:7b")
PROVIDER = "cloud" if API_KEY else "ollama"
TIMEOUT = int(os.environ.get("LLM_TIMEOUT", "120"))


class LLMError(RuntimeError):
    pass


def _cloud(payload: dict) -> dict:
    req = urllib.request.Request(
        f"{BASE_URL}/chat/completions",
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            return json.load(res)["choices"][0]["message"]
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")[:500]
        hint = {401: "API key is wrong", 404: "model name or LLM_BASE_URL is wrong",
                429: "rate limit or no credit left on the account"}.get(e.code, "")
        raise LLMError(f"LLM API error {e.code} {hint}: {body}") from None
    except urllib.error.URLError as e:
        raise LLMError(f"Cannot reach the LLM API ({BASE_URL}): {e.reason}") from None


def chat(messages: list, tools: list | None = None, json_mode: bool = False):
    """Returns (message_to_append, text, tool_calls).
    tool_calls is a list of (call_id, name, arguments_dict)."""
    if PROVIDER == "cloud":
        payload = {"model": MODEL, "messages": messages}
        if tools:
            payload["tools"] = tools
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        msg = _cloud(payload)
        calls = []
        for c in msg.get("tool_calls") or []:
            try:
                args = json.loads(c["function"].get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            calls.append((c["id"], c["function"]["name"], args))
        # Keep only the fields the API accepts back in the history.
        keep = {"role": "assistant", "content": msg.get("content")}
        if msg.get("tool_calls"):
            keep["tool_calls"] = msg["tool_calls"]
        return keep, msg.get("content") or "", calls

    import ollama
    try:
        reply = ollama.chat(model=MODEL, messages=messages, tools=tools,
                            format="json" if json_mode else None,
                            options={"temperature": 0} if json_mode else None)
    except Exception as e:
        raise LLMError(f"Ollama error (is it running, is {MODEL} pulled?): {e}") from None
    msg = reply["message"]
    calls = [(None, c["function"]["name"], c["function"]["arguments"] or {})
             for c in (msg.get("tool_calls") or [])]
    return msg, msg.get("content") or "", calls


def tool_result(call_id, content: str) -> dict:
    """Message that returns a tool result to the model."""
    if PROVIDER == "cloud":
        return {"role": "tool", "tool_call_id": call_id, "content": content}
    return {"role": "tool", "content": content}
