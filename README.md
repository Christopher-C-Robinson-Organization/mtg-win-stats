# MTG Win Stats

Commander game log for the playgroup. It records who sat down, which deck they played, and who won. The site then shows player win rates and deck / commander win rates.

Wins are counted from [`data/games.csv`](data/games.csv). Deck nicknames and official commanders live in [`data/decks.json`](data/decks.json). Player names, plus the old spreadsheet totals, live in [`data/players.json`](data/players.json).

**Site:** https://christopher-c-robinson-organization.github.io/mtg-win-stats/

That address starts serving after the branch is merged and GitHub Pages is pointed at the Actions workflow. The one-time click is under [Enable GitHub Pages](#enable-github-pages).

## Add a game

Anyone in the group can add a game from the GitHub website. A local checkout and an SSH key are not required.

The short version is in [CONTRIBUTING.md](CONTRIBUTING.md): edit `data/games.csv` in the browser, add a row at the bottom, and commit. If the deck nickname is new, add it to `data/decks.json` in the same change. If you do not have write access, GitHub will fork the repo and open a pull request for you.

## What the numbers mean

A deck's games are the rows where that player's column contains that nickname. A win is a row whose Winner cell matches that nickname, or matches the commander's name when the nickname does not. `Morska` is Kiley's Detectives deck because the commander is Morska, Undersea Sleuth. `Gilgamesh` stays the deck name; the card is Kenrith, the Returned King.

The Win Rates tab from the original spreadsheet is kept on each deck as notes. Those totals include games from before this log, and they are not the numbers on the leaderboard. When the two disagree, the site shows both.

## Seed

Imported 2026-10-31 from the [MTG Win Stats spreadsheet](https://docs.google.com/spreadsheets/d/1jwvDHDmozn2W8RYwfcsq7JMukdxcRq71E_-GPSInP58/edit). The untouched export is in [`data/source/`](data/source/). Commanders were resolved on 2026-11-01 with the [Scryfall API](https://api.scryfall.com). A nickname was left blank when Scryfall did not have one matching card.

### Needs a commander

Unresolved. No card was chosen:

- **Dylan S · Uringer.** Scryfall has no card named Uringer. Exact and fuzzy search both miss. Ureni of the Unwritten and Ureni, the Song Unending are different names and were not used.
- **Dylan K · One Drop.** The spreadsheet cell says "elf guy", which is not a card name.
- **John · Hobbit.** No single official card is named Hobbit. Many legendary Halflings exist, and none was selected.

Ambiguous. The site lists the real candidates and does not pick one:

- **Dylan K · Mono Green.** The sheet says "Titania", which is not a full card name. Six legendary Titanias exist.
- **Dylan K · Omnath** and **Chris · Omnath.** Six legendary Omnaths. The two pilots are tracked separately.
- **Chris · Bruna.** Two legendary Brunas. Dylan S's Bruna is Bruna, Light of Alabaster, and that mapping was not copied onto Chris.
- **Alex · Kirol.** Kirol, Attentive First-Year and Kirol, History Buff.
- **Keegan · Samut.** Seven legendary Samuts.
- **Keegan · Koma.** Koma, Cosmos Serpent; Koma, World-Eater; and Koma and Toski, Compleated.

### Nickname matches to confirm

These have a commander filled in from the nickname, not from that player's spreadsheet row:

- Aaron · Sonic → Sonic the Hedgehog (Aaron also plays Eggman)
- Aaron · Eggman → Dr. Eggman
- John · Fantastic Four → The Fantastic Four (same card as Kiley's deck; John's games are separate)
- John · Ayula and Keegan · Ayula → Ayula, Queen Among Bears
- John · Ur-Dragon → The Ur-Dragon. Scion of the Ur-Dragon was not selected.
- Helin · Mermaids → Hakbal of the Surging Soul. The sheet said "Hakbal of the Surging Storm". That is the only Hakbal card. The deck has no logged games yet.

Gilgamesh is Kenrith, the Returned King, because the spreadsheet says so.

## Enable GitHub Pages

1. Merge this branch into `main`.
2. Open **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Open the **Actions** tab and run **Pages** if a deploy has not already finished.
5. The site is https://christopher-c-robinson-organization.github.io/mtg-win-stats/

If the Actions tab is missing, open **Settings → Actions → General**, choose **Allow all actions**, and run the workflow again.

Each push to `main` republishes the site. Adding a game on github.com is enough. There is no server to restart.

## Checks

Pull requests and pushes run `python3 scripts/validate.py` and `node scripts/test_stats.mjs`. The check fails when a winner does not match someone at the table, a nickname is missing from `data/decks.json`, or a commander was filled in without a Scryfall link. The original 30 games are also pinned in [`scripts/expected-winners.json`](scripts/expected-winners.json). New games belong at the bottom of the CSV. Correcting one of those original winners means updating that file too.

## Local preview

```bash
python3 scripts/validate.py
node scripts/test_stats.mjs
python3 scripts/assemble_site.py
python3 -m http.server 8000 --directory _site
```

Open http://127.0.0.1:8000/

`python3 scripts/build_seed.py` rewrites the data files from `data/source/` and calls Scryfall. Use it for a fresh spreadsheet import. Day-to-day games are added by editing `data/games.csv`.

Card images are loaded from Scryfall. This is a fan log and is not affiliated with Wizards of the Coast.
