"""
Calendar context builder for the synthesis prompt.

Reads daily_context from Supabase and formats it as a human-readable
static block injected into the system prompt (not a tool call).
"""

from datetime import date as _date
from storage.reader import fetch_daily_context


def build_calendar_context(target_date: str | None = None) -> str:
    events = fetch_daily_context(target_date)

    if not events:
        return "No scheduled events data available for today."

    lines: list[str] = []

    earnings: list[dict] = events.get("earnings", [])
    if earnings:
        symbols = [f"{e.get('symbol', '?')} ({e.get('time', '?')})" for e in earnings]
        lines.append(f"Earnings: {', '.join(symbols)}")
    else:
        lines.append("Earnings: None scheduled")

    macro: list = events.get("macro_releases", [])
    if macro:
        if isinstance(macro[0], dict):
            macro_strs = [f"{m.get('name', m)} {m.get('time', '')}" for m in macro]
        else:
            macro_strs = [str(m) for m in macro]
        lines.append(f"Macro releases: {', '.join(macro_strs)}")
    else:
        lines.append("Macro releases: None scheduled")

    return "\n".join(lines)
