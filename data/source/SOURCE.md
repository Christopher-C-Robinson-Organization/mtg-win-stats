# Source

Google Sheet: https://docs.google.com/spreadsheets/d/1jwvDHDmozn2W8RYwfcsq7JMukdxcRq71E_-GPSInP58/edit

Title: MTG Win Stats

Imported 2026-10-31 CT as the initial seed for this repo.

Players in Game Log columns: Kiley, Dylan S, Dylan K, Chris, Helin, Brett, Adam, Alex, Aaron, John, Keegan

Win Rates sheet currently has sections for Kiley through Adam. Alex, Aaron, John, and Keegan appear in later games but have no Win Rates section yet.

`game-log.csv` and `win-rates.csv` in this folder are the untouched export. The site does not read them.

`data/games.csv` is the playable log. Dates are ISO (`15Aug26` became `2026-08-15`). `?` and blank dates are preserved. Deck nicknames are copied as written, including `Mono Green (CR)` and `Mono Green (DK)`.

`data/decks.json` holds each nickname, the official commander when one is known, and Scryfall links. Commanders were resolved on 2026-11-01 against `https://api.scryfall.com`. A nickname with more than one possible card, or no card, has `"commander": null`. Nothing was filled in by guessing.

`data/players.json` holds the Win Rates header totals (games and wins) for comparison. Those totals are notes. The site counts wins from `data/games.csv`.
