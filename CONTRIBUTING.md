# Adding a game

You can do this entirely on github.com. You do not need Git installed, and you do not need an SSH key. You do need a GitHub account.

If Chris has added you as a collaborator, you can commit straight to `main`. If not, the same pencil button forks the repo and opens a pull request. Either way the site updates after the change lands on `main` (about a minute).

## 1. Add the row

Open [`data/games.csv`](https://github.com/Christopher-C-Robinson-Organization/mtg-win-stats/edit/main/data/games.csv) and click the pencil.

The columns are:

`date,players,winner,Kiley,Dylan S,Dylan K,Chris,Helin,Brett,Adam,Alex,Aaron,John,Keegan,notes`

Append one row at the bottom. Leave a player's cell empty if they did not play. `players` is how many people have a deck in that row, and it has to match the filled seats.

```csv
2026-11-01,4,Daredevil,Daredevil,Dina,Group Hug,Ninjas,,,,,,,,won on turn 9
```

That row is Kiley on Daredevil, Dylan S on Dina, Dylan K on Group Hug, Chris on Ninjas. Daredevil won. The date is `YYYY-MM-DD`. Use `?` when the night is unknown, or leave the date blank if you will fill it in later.

`winner` is the deck nickname written in someone's column. `Morska` also works when that person played Detectives, because the commander is Morska, Undersea Sleuth. Spell the nickname the same way as the column.

Notes are optional. If the note itself contains a comma, wrap it in quotes: `"extra turn, then combat"`.

Commit the file. The suggested message is fine: `Add the 1 Nov game`.

## 2. New nickname

If the nickname is not already in [`data/decks.json`](https://github.com/Christopher-C-Robinson-Organization/mtg-win-stats/edit/main/data/decks.json), add an object to the `decks` array in the same commit. Copy this and edit it:

```json
{
  "player": "Alex",
  "nickname": "New Deck",
  "aliases": [],
  "commander": null,
  "resolution": "unresolved",
  "colors": [],
  "type": null,
  "scryfall": null,
  "image": null,
  "sheet": null,
  "notes": "",
  "candidates": [],
  "seeAlso": []
}
```

Put a comma between objects. `resolution` stays `"unresolved"` until the table knows the card. The deck still counts wins under the nickname.

When you know the card, look it up on [Scryfall](https://scryfall.com), then set:

- `commander` to the full card name, copied from Scryfall
- `resolution` to `"manual"`
- `colors` to the color identity, using `W`, `U`, `B`, `R`, `G` (colorless is `[]`)
- `scryfall` to the card page URL (`https://scryfall.com/card/...`)
- `image` to the small image URL if you want the thumbnail, or leave it `null`

`sheet` stays `null` for decks that were not on the original spreadsheet.

If several legendary cards share the name and you do not know which one it is, leave `commander` null, set `resolution` to `"ambiguous"`, and list the Scryfall cards under `candidates`. Each candidate needs `name`, `colors`, `type`, `scryfall`, and `image`.

Two nicknames already have aliases, so either spelling works in the log:

- Chris's Mono Green is also `Mono Green (CR)` (Yedora, Grave Gardener)
- Dylan K's Mono Green is also `Mono Green (DK)` (the Titania list, still unresolved)

## 3. New player

Add them to `players` in [`data/players.json`](https://github.com/Christopher-C-Robinson-Organization/mtg-win-stats/edit/main/data/players.json):

```json
{ "name": "Sam", "sheetGames": null, "sheetWins": null }
```

Add a `Sam` column to `games.csv` immediately before `notes`, on the header and on every existing row (empty cells for old games). New columns belong at the end so the older cells stay under the right names. The site reads the header, not a fixed position, but a shifted header assigns decks to the wrong people.

## If the check fails

The repo runs a check on every push. It fails with a plain reason, for example:

- `Line 32: winner "Zur" does not match anyone at the table`
- `Line 32: players is 4 but 5 people have a deck`
- `Line 32: Alex played "New Deck", which is not in data/decks.json`
- `Alex / New Deck: add the https://scryfall.com card link`

Open the failed **Check** job in the Actions tab and read the first lines. Fix the CSV or the deck entry and commit again.

The original 30 games are listed in `scripts/expected-winners.json`. Appending a row does not touch that file. Changing who won one of those imported games does, so update the matching entry in the same commit.

## Preview on your machine

```bash
python3 scripts/validate.py
node scripts/test_stats.mjs
python3 scripts/assemble_site.py
python3 -m http.server 8000 --directory _site
```

Opening `site/index.html` as a file will not load the data. Use the local server above, or the GitHub Pages site.
