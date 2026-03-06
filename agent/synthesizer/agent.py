"""
Core synthesis agent loop.

Uses Claude claude-sonnet-4-5 with tool_use. Queries Supabase snapshot data only —
no live API calls at synthesis time.
"""

import json
import os
import anthropic

from synthesizer.tool_definitions import TOOLS
from synthesizer.tools import execute_tool
from prompts.system_prompt import build_system_prompt
from prompts.calendar_context import build_calendar_context


def _extract_text(response: anthropic.types.Message) -> str:
    """Pull the text content block out of a Claude response."""
    for block in response.content:
        if block.type == "text":
            return block.text
    return ""


def run_synthesis() -> str:
    """
    Run the full Claude agentic loop and return the final briefing as a string.
    Raises RuntimeError if ANTHROPIC_API_KEY is not set.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")

    client = anthropic.Anthropic(api_key=api_key)

    # Detect if running during market hours (9:30am - 4pm ET)
    from datetime import datetime
    from zoneinfo import ZoneInfo
    now_et = datetime.now(ZoneInfo("America/New_York"))
    is_intraday = 9 <= now_et.hour < 16 and now_et.weekday() < 5

    # Build the system prompt with today's calendar injected statically
    calendar_ctx = build_calendar_context()
    system_prompt = build_system_prompt(calendar_ctx, is_intraday=is_intraday)

    prompt_context = "intraday market update" if is_intraday else "morning briefing"
    messages: list[dict] = [
        {"role": "user", "content": f"Generate today's {prompt_context}."}
    ]

    max_turns = 10  # safety cap against runaway loops

    for turn in range(max_turns):
        response = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=4096,  # Increased for comprehensive trading analysis
            system=system_prompt,
            tools=TOOLS,
            messages=messages,
        )

        if response.stop_reason == "end_turn":
            return _extract_text(response)

        if response.stop_reason != "tool_use":
            # Unexpected stop reason — return whatever text exists
            text = _extract_text(response)
            return text or f"[Unexpected stop reason: {response.stop_reason}]"

        # Process tool calls
        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                result = execute_tool(block.name, block.input)
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": json.dumps(result, default=str),
                })
                print(f"  → Tool called: {block.name}")

        # Append assistant turn (including tool_use blocks) then tool results
        messages.append({"role": "assistant", "content": response.content})
        messages.append({"role": "user", "content": tool_results})

    return "[Error: synthesis loop exceeded max turns]"
