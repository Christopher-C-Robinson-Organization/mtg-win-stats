#!/usr/bin/env python3
"""Build data/games.csv, data/decks.json, and data/players.json from the sheet export.

Reads data/source/*.csv, looks up card names on Scryfall, and writes the files the
site reads. Re-run only when re-importing the sheet. Day-to-day edits belong in
data/games.csv and data/decks.json, not here.
"""

from __future__ import annotations

import csv
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "source"
UA = (
    "mtg-win-stats/1.0 "
    "(+https://github.com/Christopher-C-Robinson-Organization/mtg-win-stats)"
)

# Log cells that are the same deck as a shorter nickname.
ALIASES = {
    ("Chris", "Mono Green"): ["Mono Green (CR)"],
    ("Dylan K", "Mono Green"): ["Mono Green (DK)"],
}

TITANIAS = [
    "Titania, Gaea Incarnate",
    "Titania, Nature's Force",
    "Titania, Protector of Argoth",
    "Titania, Proud Pummeler",
    "Titania, Rugged Rumbler",
    "Titania, Voice of Gaea",
]
OMNATHS = [
    "Omnath, Locus of All",
    "Omnath, Locus of Creation",
    "Omnath, Locus of Mana",
    "Omnath, Locus of Rage",
    "Omnath, Locus of the Roil",
    "Omnath, Locus of the Void",
]
KOMAS = [
    "Koma and Toski, Compleated",
    "Koma, Cosmos Serpent",
    "Koma, World-Eater",
]
SAMUTS = [
    "Samut, Hazoret's Champion",
    "Samut, the Driving Force",
    "Samut, the Tested",
    "Samut, Tyrant of Naktamun",
    "Samut, Tyrant Smasher",
    "Samut, Vizier of Naktamun",
    "Samut, Voice of Dissent",
]
BRUNAS = [
    "Bruna, Light of Alabaster",
    "Bruna, the Fading Light",
]
KIROLS = [
    "Kirol, Attentive First-Year",
    "Kirol, History Buff // Pack a Punch",
]

# Decks the win-rate sheet names, but whose commander cell is not one card.
SHEET_SPECIAL = {
    ("Dylan K", "One Drop"): {
        "resolution": "unresolved",
        "commander": None,
        "candidates": [],
        "notes": 'The win-rate sheet\'s commander cell says "elf guy", which is not a card name.',
    },
    ("Dylan K", "Mono Green"): {
        "resolution": "ambiguous",
        "commander": None,
        "candidates": TITANIAS,
        "notes": (
            'The sheet\'s commander cell says "Titania", which is not a full card name. '
            "Six legendary Titanias exist. Four are mono-green, which fits the nickname, "
            "and two are not. None is selected. The log cell Mono Green (DK) is this deck."
        ),
    },
    ("Helin", "Mermaids"): {
        "resolution": "corrected",
        "commander": "Hakbal of the Surging Soul",
        "candidates": [],
        "notes": (
            'The sheet says "Hakbal of the Surging Storm". The only Scryfall card named '
            "Hakbal is Hakbal of the Surging Soul, so Storm is recorded as a slip."
        ),
    },
    ("Dylan K", "Planeswalker"): {
        "resolution": "sheet",
        "commander": "Jared Carthalion",
        "candidates": [],
        "notes": (
            "The sheet names Jared Carthalion, the five-color planeswalker. "
            "Jared Carthalion, True Heir is a different card and was not used."
        ),
        "see_also": ["Jared Carthalion, True Heir"],
    },
    ("Dylan S", "Gilgamesh"): {
        "resolution": "sheet",
        "commander": "Kenrith, the Returned King",
        "candidates": [],
        "notes": "The sheet maps the Gilgamesh nickname to Kenrith, the Returned King.",
    },
}

# Decks that show up in the log and are not on the win-rate sheet.
NEW_DECKS = {
    ("Dylan S", "Uringer"): {
        "resolution": "unresolved",
        "commander": None,
        "candidates": [],
        "notes": (
            'No Scryfall card matches "Uringer" (exact and fuzzy both miss). '
            "Ureni of the Unwritten and Ureni, the Song Unending are different names "
            "and were not assumed to be typos."
        ),
    },
    ("Dylan K", "Omnath"): {
        "resolution": "ambiguous",
        "commander": None,
        "candidates": OMNATHS,
        "notes": (
            "Not on the win-rate sheet. Six legendary Omnaths exist. None is selected. "
            "Counted separately from Chris's Omnath."
        ),
    },
    ("Chris", "Omnath"): {
        "resolution": "ambiguous",
        "commander": None,
        "candidates": OMNATHS,
        "notes": (
            "Not on the win-rate sheet. Counted separately from Dylan K's Omnath, "
            "since the log does not say they are the same deck. Six legendary Omnaths exist. None is selected."
        ),
    },
    ("Chris", "Bruna"): {
        "resolution": "ambiguous",
        "commander": None,
        "candidates": BRUNAS,
        "notes": (
            "Not on the win-rate sheet. Dylan S's Bruna is Bruna, Light of Alabaster, "
            "but this seat is Chris's, so that mapping was not copied. Two legendary Brunas exist."
        ),
    },
    ("Alex", "Kirol"): {
        "resolution": "ambiguous",
        "commander": None,
        "candidates": KIROLS,
        "notes": (
            "Not on the win-rate sheet. Two legendary Kirols exist: "
            "Kirol, Attentive First-Year and Kirol, History Buff. Neither is selected."
        ),
    },
    ("Aaron", "Sonic"): {
        "resolution": "inferred",
        "commander": "Sonic the Hedgehog",
        "candidates": [],
        "notes": (
            "Not on the win-rate sheet. Matched to Sonic the Hedgehog, the only legendary "
            "creature whose name starts with Sonic. Aaron also plays Eggman (Dr. Eggman) "
            "from the same Secret Lair. Confirm if this is a different card."
        ),
    },
    ("Aaron", "Eggman"): {
        "resolution": "inferred",
        "commander": "Dr. Eggman",
        "candidates": [],
        "notes": "Not on the win-rate sheet. Scryfall's only Eggman card is Dr. Eggman.",
    },
    ("John", "Fantastic Four"): {
        "resolution": "inferred",
        "commander": "The Fantastic Four",
        "candidates": [],
        "notes": (
            "Not on this player's win-rate rows. The nickname Fantastic Four is "
            "The Fantastic Four on Kiley's sheet, and that is the only card by that name. "
            "John's games are counted separately from Kiley's."
        ),
    },
    ("John", "Hobbit"): {
        "resolution": "unresolved",
        "commander": None,
        "candidates": [],
        "notes": (
            "Not on the win-rate sheet. No single official card is named Hobbit. "
            "Many legendary Halflings exist (Bilbo, Frodo, Samwise, Merry, Pippin, and others). "
            "None is selected."
        ),
    },
    ("John", "Ayula"): {
        "resolution": "inferred",
        "commander": "Ayula, Queen Among Bears",
        "candidates": [],
        "notes": (
            "Not on the win-rate sheet. Ayula, Queen Among Bears is the only legendary "
            "card named Ayula. Counted separately from Keegan's Ayula."
        ),
    },
    ("John", "Ur-Dragon"): {
        "resolution": "inferred",
        "commander": "The Ur-Dragon",
        "candidates": [],
        "notes": (
            "Not on the win-rate sheet. Matched to The Ur-Dragon. "
            "Scion of the Ur-Dragon was not selected."
        ),
        "see_also": ["Scion of the Ur-Dragon"],
    },
    ("Keegan", "Ayula"): {
        "resolution": "inferred",
        "commander": "Ayula, Queen Among Bears",
        "candidates": [],
        "notes": (
            "Not on the win-rate sheet. Ayula, Queen Among Bears is the only legendary "
            "card named Ayula. Counted separately from John's Ayula."
        ),
    },
    ("Keegan", "Samut"): {
        "resolution": "ambiguous",
        "commander": None,
        "candidates": SAMUTS,
        "notes": "Not on the win-rate sheet. Seven legendary cards start with Samut. None is selected.",
    },
    ("Keegan", "Koma"): {
        "resolution": "ambiguous",
        "commander": None,
        "candidates": KOMAS,
        "notes": "Not on the win-rate sheet. Three legendary cards start with Koma. None is selected.",
    },
}

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


def parse_sheet_date(raw: str) -> str:
    text = raw.strip()
    if text in ("", "?"):
        return text
    # 15Aug26
    day = int(text[:-5])
    mon = MONTHS[text[-5:-2].lower()]
    year = 2000 + int(text[-2:])
    return f"{year:04d}-{mon:02d}-{day:02d}"


def canonical(player: str, cell: str) -> str:
    for (owner, nickname), aliases in ALIASES.items():
        if owner == player and (cell == nickname or cell in aliases):
            return nickname
    return cell


def read_win_rates():
    players = []
    decks = []
    current = None
    with (SOURCE / "win-rates.csv").open(newline="") as handle:
        rows = list(csv.reader(handle))
    for row in rows[1:]:
        row = row + [""] * (9 - len(row))
        name, title, commander, _ident, games, wins, _rate, accuracy, notes = row[:9]
        if name.strip():
            current = name.strip()
            players.append(
                {
                    "name": current,
                    "sheetGames": int(games) if games.strip() else None,
                    "sheetWins": int(wins) if wins.strip() else None,
                }
            )
            if title.strip():
                raise SystemExit(f"Player header {current} also has a deck title")
            continue
        if not title.strip():
            continue
        if current is None:
            raise SystemExit(f"Deck {title} has no player")
        decks.append(
            {
                "player": current,
                "nickname": title.strip(),
                "sheet": {
                    "commander": commander.strip(),
                    "games": int(games) if games.strip() else None,
                    "wins": int(wins) if wins.strip() else None,
                    "accuracy": accuracy.strip(),
                    "notes": notes.strip(),
                },
            }
        )
    return players, decks


def read_games(player_names):
    with (SOURCE / "game-log.csv").open(newline="") as handle:
        rows = list(csv.reader(handle))
    header = rows[0]
    if header[3:] != player_names:
        # Players only on the log (no win-rate section) still need to be known.
        pass
    log_players = header[3:]
    games = []
    for row in rows[1:]:
        row = row + [""] * (len(header) - len(row))
        seats = []
        for player, cell in zip(log_players, row[3:]):
            cell = cell.strip()
            if cell:
                seats.append({"player": player, "deck": cell})
        games.append(
            {
                "date": parse_sheet_date(row[0]),
                "players": int(row[1]),
                "winner": row[2].strip(),
                "seats": seats,
            }
        )
        if len(seats) != games[-1]["players"]:
            raise SystemExit(
                f"Game {len(games)} has {len(seats)} seats but players={games[-1]['players']}"
            )
    return log_players, games


def scryfall_json(url, body=None):
    data = None if body is None else json.dumps(body).encode()
    headers = {"User-Agent": UA, "Accept": "application/json"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def fetch_cards(names):
    # Collection lookup misses some double-faced names. Those fall back to /cards/named.
    payload = scryfall_json(
        "https://api.scryfall.com/cards/collection",
        {"identifiers": [{"name": name} for name in names]},
    )
    found = {card["name"]: slim(card) for card in payload.get("data", [])}
    missing = [name for name in names if name not in found]
    for name in missing:
        time.sleep(0.12)
        card = scryfall_json(
            "https://api.scryfall.com/cards/named?exact=" + urllib.parse.quote(name)
        )
        found[card["name"]] = slim(card)
    still = [name for name in names if name not in found]
    if still:
        raise SystemExit(f"Scryfall did not find: {', '.join(still)}")
    return found


def slim(card):
    faces = card.get("card_faces") or []
    uris = card.get("image_uris") or (faces[0].get("image_uris") if faces else {}) or {}
    order = {color: index for index, color in enumerate("WUBRG")}
    colors = sorted(card.get("color_identity") or [], key=lambda color: order.get(color, 9))
    return {
        "name": card["name"],
        "colors": colors,
        "type": card.get("type_line") or "",
        "scryfall": (card.get("scryfall_uri") or "").split("?")[0],
        "image": uris.get("small"),
    }


def spec_for(player, nickname, sheet):
    key = (player, nickname)
    if key in SHEET_SPECIAL:
        spec = dict(SHEET_SPECIAL[key])
        return spec
    if key in NEW_DECKS:
        return dict(NEW_DECKS[key])
    if sheet is None:
        raise SystemExit(f"No commander rule for {player} / {nickname}")
    cell = sheet["commander"]
    if not cell or cell.lower() in {"elf guy", "titania"}:
        raise SystemExit(f"Refusing to treat {cell!r} as a card for {player} / {nickname}")
    return {
        "resolution": "sheet",
        "commander": cell,
        "candidates": [],
        "notes": "",
    }


def materialize(spec, cards):
    commander = spec.get("commander")
    card = cards[commander] if commander else None
    candidates = [cards[name] for name in spec.get("candidates") or []]
    see_also = []
    for name in spec.get("see_also") or []:
        extra = dict(cards[name])
        extra["note"] = "Different card. Not selected."
        see_also.append(extra)
    return {
        "commander": commander,
        "resolution": spec["resolution"],
        "colors": card["colors"] if card else [],
        "type": card["type"] if card else None,
        "scryfall": card["scryfall"] if card else None,
        "image": card["image"] if card else None,
        "notes": spec.get("notes") or "",
        "candidates": candidates,
        "seeAlso": see_also,
    }


def main():
    sheet_players, sheet_decks = read_win_rates()
    # Log-only players keep sheet totals empty. Order follows the game-log columns.
    with (SOURCE / "game-log.csv").open(newline="") as handle:
        log_players = next(csv.reader(handle))[3:]
    sheet_by_name = {player["name"]: player for player in sheet_players}
    players = []
    for name in log_players:
        sheet = sheet_by_name.get(name)
        players.append(
            {
                "name": name,
                "sheetGames": None if sheet is None else sheet["sheetGames"],
                "sheetWins": None if sheet is None else sheet["sheetWins"],
            }
        )
    _log_players, games = read_games(log_players)

    sheet_index = {(deck["player"], deck["nickname"]): deck for deck in sheet_decks}
    first_seen = []
    seen = set(sheet_index)
    for game in games:
        for seat in game["seats"]:
            nickname = canonical(seat["player"], seat["deck"])
            key = (seat["player"], nickname)
            if key not in seen:
                seen.add(key)
                first_seen.append(key)

    records = []
    for player in players:
        owned = [deck for deck in sheet_decks if deck["player"] == player["name"]]
        extras = [key for key in first_seen if key[0] == player["name"]]
        for deck in owned:
            records.append((player["name"], deck["nickname"], deck["sheet"]))
        for key in extras:
            records.append((key[0], key[1], None))

    drafted = []
    for player, nickname, sheet in records:
        spec = spec_for(player, nickname, sheet)
        drafted.append((player, nickname, sheet, spec))

    names = []
    for _player, _nickname, _sheet, spec in drafted:
        if spec.get("commander"):
            names.append(spec["commander"])
        names.extend(spec.get("candidates") or [])
        names.extend(spec.get("see_also") or [])
    cards = fetch_cards(sorted(set(names)))

    decks_out = []
    for player, nickname, sheet, spec in drafted:
        body = materialize(spec, cards)
        decks_out.append(
            {
                "player": player,
                "nickname": nickname,
                "aliases": ALIASES.get((player, nickname), []),
                "commander": body["commander"],
                "resolution": body["resolution"],
                "colors": body["colors"],
                "type": body["type"],
                "scryfall": body["scryfall"],
                "image": body["image"],
                "sheet": sheet,
                "notes": body["notes"],
                "candidates": body["candidates"],
                "seeAlso": body["seeAlso"],
            }
        )

    games_path = ROOT / "data" / "games.csv"
    fieldnames = ["date", "players", "winner", *log_players, "notes"]
    with games_path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        for game in games:
            row = {name: "" for name in fieldnames}
            row["date"] = game["date"]
            row["players"] = game["players"]
            row["winner"] = game["winner"]
            for seat in game["seats"]:
                row[seat["player"]] = seat["deck"]
            writer.writerow(row)

    players_doc = {
        "name": "MTG Win Stats",
        "sheetUrl": "https://docs.google.com/spreadsheets/d/1jwvDHDmozn2W8RYwfcsq7JMukdxcRq71E_-GPSInP58/edit",
        "repo": "https://github.com/Christopher-C-Robinson-Organization/mtg-win-stats",
        "importedFromSheet": "2026-10-31",
        "commandersResolved": "2026-11-01",
        "players": players,
    }
    decks_doc = {
        "resolved": "2026-11-01",
        "scryfall": "https://scryfall.com",
        "decks": decks_out,
    }
    (ROOT / "data" / "players.json").write_text(json.dumps(players_doc, indent=2) + "\n")
    (ROOT / "data" / "decks.json").write_text(json.dumps(decks_doc, indent=2) + "\n")

    written = list(csv.DictReader(games_path.open()))
    if len(written) != len(games):
        raise SystemExit("games.csv row count does not match the sheet export")
    for index, (raw, game) in enumerate(zip(written, games), start=1):
        if raw["date"] != game["date"] or raw["winner"] != game["winner"]:
            raise SystemExit(f"games.csv drifted on game {index}")
        for seat in game["seats"]:
            if raw[seat["player"]] != seat["deck"]:
                raise SystemExit(f"games.csv seat drifted on game {index}")

    print(f"games {len(games)}")
    print(f"decks {len(decks_out)}")
    for deck in decks_out:
        if deck["resolution"] in {"unresolved", "ambiguous", "inferred", "corrected"}:
            print(f"  {deck['resolution']:12} {deck['player']} / {deck['nickname']} -> {deck['commander']}")


if __name__ == "__main__":
    main()
