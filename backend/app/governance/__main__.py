"""CLI: validate the books contract and record the run.

    uv run python -m backend.app.governance [--trigger cli|ci]

Exits 1 when a critical expectation fails (warnings are reported, not fatal),
so it can gate a pipeline.
"""
from __future__ import annotations

import argparse
import sys

from backend.app.governance.runs import run_now


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--trigger", default="cli", choices=["cli", "ci"])
    run = run_now(ap.parse_args().trigger)
    print(f"governance run #{run['run_id']}: {run['status']} — "
          f"{run['successful']}/{run['evaluated']} expectations met, "
          f"{run['critical_failures']} critical, {run['warnings']} warning(s)")
    if run["error"]:
        print(run["error"], file=sys.stderr)
    return 1 if run["status"] in ("failed", "error") else 0


if __name__ == "__main__":
    sys.exit(main())
