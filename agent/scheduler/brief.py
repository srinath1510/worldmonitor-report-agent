"""
brief.py — Morning briefing entry point.

Run this at 8am via GitHub Actions (brief.yml) or locally:
    cd agent && uv run scheduler/brief.py
"""

import sys
import os
from pathlib import Path
from datetime import datetime, timezone
from dotenv import load_dotenv

# Ensure agent/ is on sys.path so package-relative imports (storage.*, synthesizer.*) work
_agent_dir = Path(__file__).resolve().parent.parent
_repo_root = _agent_dir.parent
sys.path.insert(0, str(_agent_dir))

load_dotenv(dotenv_path=_repo_root / '.env')

from synthesizer.agent import run_synthesis  # noqa: E402


def main() -> str:
    print("Running morning briefing synthesis...\n")
    print("Querying Supabase snapshots and calling Claude...\n")

    try:
        briefing = run_synthesis()
    except Exception as e:
        print(f"Error running synthesis: {e}", file=sys.stderr)
        sys.exit(1)

    print("\n" + "=" * 72)
    print(briefing)
    print("=" * 72 + "\n")

    # Save output
    output_dir = _agent_dir / "output"
    output_dir.mkdir(exist_ok=True)
    today = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d")
    output_file = output_dir / f"brief_{today}.md"
    output_file.write_text(briefing)
    print(f"Briefing saved to {output_file}")

    return briefing


if __name__ == "__main__":
    main()
