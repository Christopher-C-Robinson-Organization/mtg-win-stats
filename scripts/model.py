#!/usr/bin/env python3
"""Python twin of site/stats.js. validate.py checks the two agree."""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESOLUTIONS = {"sheet", "corrected", "inferred", "manual", "ambiguous", "unresolved"}
COLORS = set("WUBRG")
MONTHS = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}


def norm(value) -> str:
    text = "" if value is None else str(value)
    text = text.strip().lower().replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    return " ".join(text.split())


def parse_date(raw: str) -> dict:
    text = (raw or "").strip()
    if text == "":
        return {"iso": None, "kind": "blank", "raw": ""}
    if text == "?":
        return {"iso": None, "kind": "unknown", "raw": "?"}
    iso = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", text)
    if iso:
        month, day = int(iso.group(2)), int(iso.group(3))
        if 1 <= month <= 12 and 1 <= day <= 31:
            return {"iso": f"{iso.group(1)}-{iso.group(2)}-{iso.group(3)}", "kind": "iso", "raw": text}
    legacy = re.fullmatch(r"(\d{1,2})([A-Za-z]{3})(\d{2})", text)
    if legacy:
        month = MONTHS.get(legacy.group(2).lower())
        day = int(legacy.group(1))
        if month and 1 <= day <= 31:
            year = 2000 + int(legacy.group(3))
            return {
                "iso": f"{year:04d}-{month:02d}-{day:02d}",
                "kind": "legacy",
                "raw": text,
            }
    return {"iso": None, "kind": "invalid", "raw": text}


def valid_scryfall(url) -> bool:
    if not url or not isinstance(url, str):
        return False
    if not url.startswith("https://"):
        return False
    host = url.split("/")[2]
    return host == "scryfall.com" or host.endswith(".scryfall.com")


def commander_keys(deck) -> set[str]:
    if not deck or not deck.get("commander"):
        return set()
    full = str(deck["commander"]).strip()
    head = full.split("//")[0].split(",")[0].strip()
    keys = {norm(full), norm(head)}
    if head.lower().startswith("the "):
        keys.add(norm(head[4:]))
    return keys


def deck_labels(deck) -> set[str]:
    names = [deck.get("nickname") or "", *(deck.get("aliases") or [])]
    return {norm(name) for name in names if name}


def load() -> dict:
    players_doc = json.loads((ROOT / "data" / "players.json").read_text())
    decks_doc = json.loads((ROOT / "data" / "decks.json").read_text())
    with (ROOT / "data" / "games.csv").open(newline="") as handle:
        reader = csv.DictReader(handle)
        headers = reader.fieldnames or []
        records = list(reader)
    return build(players_doc, decks_doc, headers, records)


def build(players_doc, decks_doc, headers, records) -> dict:
    errors = []
    meta = {
        "name": players_doc.get("name") or "MTG Win Stats",
        "sheetUrl": players_doc.get("sheetUrl") or "",
        "repo": players_doc.get("repo") or "",
    }
    players = players_doc.get("players") or []
    decks = decks_doc.get("decks") or []
    player_names = {player.get("name") for player in players}
    label_owner = {}
    for deck in decks:
        who = f"{deck.get('player') or '?'} / {deck.get('nickname') or '?'}"
        if deck.get("player") not in player_names:
            errors.append(f"{who}: unknown player")
        if not deck.get("nickname"):
            errors.append(f"{who}: missing nickname")
        resolution = deck.get("resolution")
        if resolution not in RESOLUTIONS:
            errors.append(f"{who}: bad resolution")
        open_ended = resolution in {"ambiguous", "unresolved"}
        if open_ended and deck.get("commander"):
            errors.append(f"{who}: leave commander empty until the card is known")
        if not open_ended and not deck.get("commander"):
            errors.append(f"{who}: commander is missing")
        candidates = deck.get("candidates") or []
        if resolution == "ambiguous" and len(candidates) < 2:
            errors.append(f"{who}: list the possible cards")
        if resolution == "unresolved" and candidates:
            errors.append(f"{who}: an unresolved nickname should not list candidate cards")
        if deck.get("commander") and not valid_scryfall(deck.get("scryfall")):
            errors.append(f"{who}: add the https://scryfall.com card link")
        colors = deck.get("colors")
        if not isinstance(colors, list) or any(color not in COLORS for color in colors):
            errors.append(f"{who}: colors must be a list of W, U, B, R, G")
        if deck.get("image") not in (None, "") and not str(deck.get("image")).startswith("https://"):
            errors.append(f"{who}: card image must be an https URL")
        if not isinstance(deck.get("aliases"), list):
            errors.append(f"{who}: aliases must be a list")
        for label in [deck.get("nickname"), *(deck.get("aliases") or [])]:
            if not label:
                continue
            key = (deck.get("player"), norm(label))
            if key in label_owner:
                errors.append(f"{deck.get('player')} has two decks called {label}")
            label_owner[key] = deck

    required = ["date", "players", "winner"]
    for column in required:
        if column not in headers:
            errors.append(f"games.csv is missing the {column} column")
    seen = set()
    for header in headers:
        if not header:
            errors.append("games.csv has a blank column name")
        if header in seen:
            errors.append(f"games.csv repeats the {header} column")
        seen.add(header)
        if header not in required and header != "notes" and header not in player_names:
            errors.append(f'games.csv column "{header}" is not a player')

    games = []
    for index, record in enumerate(records):
        line = index + 2
        seats = []
        for header in headers:
            if header in required or header == "notes":
                continue
            cell = (record.get(header) or "").strip()
            if not cell:
                continue
            deck = label_owner.get((header, norm(cell)))
            if deck is None:
                errors.append(f'Line {line}: {header} played "{cell}", which is not in data/decks.json')
            seats.append({"player": header, "deckName": cell, "deck": deck})
        declared = (record.get("players") or "").strip()
        if not declared.isdigit() or int(declared) != len(seats):
            errors.append(f"Line {line}: players is {declared or 'blank'} but {len(seats)} people have a deck")
        dated = parse_date(record.get("date") or "")
        if dated["kind"] == "invalid":
            errors.append(f'Line {line}: date "{record.get("date")}" is not YYYY-MM-DD')
        winner = (record.get("winner") or "").strip()
        if not winner:
            errors.append(f"Line {line}: winner is blank")
        game = {
            "index": index + 1,
            "dateRaw": (record.get("date") or "").strip(),
            "winner": winner,
            "seats": seats,
            "result": None,
        }
        wanted = norm(winner)
        by_name = [seat for seat in seats if seat["deck"] and wanted in deck_labels(seat["deck"])]
        by_commander = [
            seat
            for seat in seats
            if seat["deck"] and wanted not in deck_labels(seat["deck"]) and wanted in commander_keys(seat["deck"])
        ]
        if len(by_name) == 1:
            game["result"] = {"player": by_name[0]["player"], "deck": by_name[0]["deck"], "via": "nickname"}
        elif len(by_name) > 1:
            errors.append(f'Line {line}: winner "{winner}" matches more than one deck')
        elif len(by_commander) == 1:
            game["result"] = {
                "player": by_commander[0]["player"],
                "deck": by_commander[0]["deck"],
                "via": "commander",
            }
        elif len(by_commander) > 1:
            errors.append(f'Line {line}: winner "{winner}" matches more than one commander')
        elif winner:
            errors.append(f'Line {line}: winner "{winner}" does not match anyone at the table')
        games.append(game)

    return {"meta": meta, "players": players, "decks": decks, "games": games, "errors": errors}


def tally(model) -> dict:
    deck_rows = [
        {"deck": deck, "games": 0, "wins": 0}
        for deck in model["decks"]
    ]
    by_deck = {(row["deck"]["player"], row["deck"]["nickname"]): row for row in deck_rows}
    player_rows = [{"player": player, "games": 0, "wins": 0} for player in model["players"]]
    by_player = {row["player"]["name"]: row for row in player_rows}
    for game in model["games"]:
        for seat in game["seats"]:
            deck = seat["deck"]
            if not deck:
                continue
            deck_row = by_deck.get((deck["player"], deck["nickname"]))
            if deck_row:
                deck_row["games"] += 1
                if game["result"] and game["result"]["deck"] is deck:
                    deck_row["wins"] += 1
            player_row = by_player.get(seat["player"])
            if player_row:
                player_row["games"] += 1
                if game["result"] and game["result"]["player"] == seat["player"]:
                    player_row["wins"] += 1
    return {"decks": deck_rows, "players": player_rows}


def dump(model) -> dict:
    totals = tally(model)
    return {
        "errors": list(model["errors"]),
        "winners": [
            {
                "index": game["index"],
                "date": game["dateRaw"],
                "winner": game["winner"],
                "player": None if game["result"] is None else game["result"]["player"],
                "deck": None if game["result"] is None else game["result"]["deck"]["nickname"],
                "via": None if game["result"] is None else game["result"]["via"],
                "seats": [{"player": seat["player"], "deck": seat["deckName"]} for seat in game["seats"]],
            }
            for game in model["games"]
        ],
        "decks": [
            {
                "player": row["deck"]["player"],
                "nickname": row["deck"]["nickname"],
                "games": row["games"],
                "wins": row["wins"],
            }
            for row in totals["decks"]
        ],
        "players": [
            {"name": row["player"]["name"], "games": row["games"], "wins": row["wins"]}
            for row in totals["players"]
        ],
    }
