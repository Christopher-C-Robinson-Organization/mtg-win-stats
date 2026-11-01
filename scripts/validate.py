#!/usr/bin/env python3
"""Check the playgroup files, then check that the site's JavaScript agrees."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from model import dump, load  # noqa: E402


def main() -> int:
    model = load()
    python_dump = dump(model)
    oracle = json.loads((ROOT / "scripts" / "expected-winners.json").read_text())
    failures = []

    if len(python_dump["winners"]) < len(oracle):
        failures.append(
            f"games.csv has {len(python_dump['winners'])} games; the imported log has {len(oracle)}. "
            "New games go at the bottom."
        )
    for index, expected in enumerate(oracle):
        if index >= len(python_dump["winners"]):
            break
        actual = python_dump["winners"][index]
        same = (
            actual["date"] == expected["date"]
            and actual["winner"] == expected["winner"]
            and actual["player"] == expected["player"]
            and actual["deck"] == expected["deck"]
        )
        if not same:
            failures.append(
                f"Seed game {index + 1} no longer matches the imported sheet "
                f"(expected {expected['winner']} by {expected['player']} / {expected['deck']}, "
                f"found {actual['winner']} by {actual['player']} / {actual['deck']}). "
                "Add new games at the bottom. If you are correcting one of the original games, "
                "update scripts/expected-winners.json too."
            )

    completed = subprocess.run(
        ["node", "scripts/test_stats.mjs", "--dump"],
        cwd=ROOT,
        check=False,
        text=True,
        capture_output=True,
    )
    if completed.returncode != 0:
        failures.append(completed.stderr.strip() or completed.stdout.strip() or "node dump failed")
    else:
        javascript_dump = json.loads(completed.stdout)
        if javascript_dump != python_dump:
            failures.append("The site counter and scripts/model.py disagree. See the diff below.")
            failures.append(_brief_diff(python_dump, javascript_dump))

    if python_dump["errors"]:
        failures.extend(python_dump["errors"])

    if failures:
        print("Playgroup data check failed:\n")
        for failure in failures:
            print(f"- {failure}")
        return 1

    wins = sorted(python_dump["players"], key=lambda row: (-(row["wins"] / row["games"] if row["games"] else -1), -row["wins"], row["name"]))
    print(f"OK {len(python_dump['winners'])} games, {len(python_dump['decks'])} decks")
    for row in wins:
        if not row["games"]:
            continue
        rate = round(100 * row["wins"] / row["games"])
        print(f"  {row['name']:10} {row['wins']}–{row['games'] - row['wins']}  {rate}%  ({row['games']} games)")
    return 0


def _brief_diff(python_dump, javascript_dump) -> str:
    for key in ("winners", "decks", "players", "errors"):
        if python_dump[key] != javascript_dump[key]:
            return f"{key} differs\npython: {python_dump[key][:3]}\njs: {javascript_dump[key][:3]}"
    return "dumps differ"


if __name__ == "__main__":
    sys.exit(main())
