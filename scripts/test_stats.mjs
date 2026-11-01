import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sandbox = { console, URL };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(root, "site/stats.js"), "utf8"), sandbox);
const PG = sandbox.Playgroup;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function realModel() {
  const players = JSON.parse(read("data/players.json"));
  const decks = JSON.parse(read("data/decks.json"));
  return PG.loadModel(players, decks, read("data/games.csv"));
}

function fixture(csv, decks, players = [{ name: "Kiley" }, { name: "Dylan S" }, { name: "Chris" }]) {
  return PG.loadModel(
    { players },
    { decks },
    ["date,players,winner,Kiley,Dylan S,Chris,notes", csv].join("\n")
  );
}

function runFixtures() {
  const detectives = {
    player: "Kiley",
    nickname: "Detectives",
    aliases: [],
    commander: "Morska, Undersea Sleuth",
    resolution: "sheet",
    colors: ["W", "U", "G"],
    scryfall: "https://scryfall.com/card/mkc/3/morska-undersea-sleuth",
    candidates: [],
  };
  const mirko = {
    player: "Dylan S",
    nickname: "Mirko",
    aliases: [],
    commander: "Mirko, Obsessive Theorist",
    resolution: "sheet",
    colors: ["U", "B"],
    scryfall: "https://scryfall.com/card/mkc/2/mirko-obsessive-theorist",
    candidates: [],
  };
  const model = fixture("?,2,Morska,Detectives,Mirko,,", [detectives, mirko]);
  assert(model.errors.length === 0, model.errors.join("; "));
  assert(model.games[0].result.player === "Kiley", "Morska should be Kiley's Detectives");
  assert(model.games[0].result.deck.nickname === "Detectives", "winner deck");
  assert(model.games[0].result.via === "commander", "Morska matches the commander, not the nickname");

  const kenrith = {
    player: "Dylan S",
    nickname: "Gilgamesh",
    aliases: [],
    commander: "Kenrith, the Returned King",
    resolution: "sheet",
    colors: ["W", "U", "B", "R", "G"],
    scryfall: "https://scryfall.com/card/plst/ELD-303/kenrith-the-returned-king",
    candidates: [],
  };
  const named = fixture("2026-08-15,2,Gilgamesh,Detectives,Gilgamesh,,", [detectives, kenrith]);
  assert(named.games[0].result.deck.nickname === "Gilgamesh", "nickname beats a commander-name collision");
  assert(named.games[0].result.via === "nickname", "via nickname");

  const byCommander = fixture("2026-08-15,2,Kenrith,Detectives,Gilgamesh,,", [detectives, kenrith]);
  assert(byCommander.games[0].result.deck.nickname === "Gilgamesh", "Kenrith resolves to Gilgamesh");

  const mono = {
    player: "Chris",
    nickname: "Mono Green",
    aliases: ["Mono Green (CR)"],
    commander: "Yedora, Grave Gardener",
    resolution: "sheet",
    colors: ["G"],
    scryfall: "https://scryfall.com/card/dsc/209/yedora-grave-gardener",
    candidates: [],
  };
  const alias = PG.loadModel(
    { players: [{ name: "Chris" }] },
    { decks: [mono] },
    "date,players,winner,Chris,notes\n15Aug26,1,Mono Green (CR),Mono Green (CR),\n"
  );
  assert(alias.errors.length === 0, alias.errors.join("; "));
  assert(alias.games[0].date === "2026-08-15", "legacy dates parse");
  assert(alias.games[0].seats[0].deck.nickname === "Mono Green", "CR suffix is Chris's Mono Green");
  assert(alias.games[0].result.via === "nickname", "alias counts as the deck name");

  const quoted = PG.parseCsv('date,players,winner,notes\n2026-11-01,2,Daredevil,"won on turn 9, combat"\n');
  assert(quoted.games[0].notes === "won on turn 9, combat", "quoted commas stay inside the field");

  const doubled = fixture("?,2,Detectives,Detectives,Detectives,,", [detectives, { ...detectives, player: "Dylan S" }]);
  assert(doubled.errors.some((error) => error.includes("more than one deck")), "two nicknames must not both win");

  assert(PG.slug("Dylan S") === "dylan-s", "slug");
  assert(PG.slug("Mr. Negative") === "mr-negative", "slug punctuation");
  assert(PG.slug("Ur-Dragon") === "ur-dragon", "slug hyphen");
  assert(PG.formatRate(1, 3) === "33%", "rate rounding");
  assert(PG.formatRecord(2, 5) === "2–3", "record");
}

function runSeed() {
  const model = realModel();
  assert(model.games.length >= 30, "seed log");
  assert(model.errors.length === 0, model.errors.join("\n"));
  const uringer = model.decks.find((deck) => deck.player === "Dylan S" && deck.nickname === "Uringer");
  const oneDrop = model.decks.find((deck) => deck.nickname === "One Drop");
  const hobbit = model.decks.find((deck) => deck.nickname === "Hobbit");
  const gilgamesh = model.decks.find((deck) => deck.nickname === "Gilgamesh");
  assert(uringer.commander == null && uringer.resolution === "unresolved", "Uringer stays unresolved");
  assert(oneDrop.commander == null, "One Drop stays unresolved");
  assert(hobbit.commander == null && hobbit.candidates.length === 0, "Hobbit is not assigned a Halfling");
  assert(gilgamesh.commander === "Kenrith, the Returned King", "Gilgamesh is Kenrith");
  assert(!JSON.stringify(model.decks).includes('"Ur-Drago"'), "fuzzy Ur-Drago was not used");
  const totals = PG.tally(model);
  const kileyFungus = totals.decks.find((row) => row.deck.player === "Kiley" && row.deck.nickname === "Fungus");
  assert(kileyFungus.games === 5 && kileyFungus.wins === 2, "Fungus log record");
  const parsed = PG.parseCsv(read("data/games.csv"));
  assert(parsed.games.length === model.games.length, "every csv row loads");
}

if (process.argv.includes("--dump")) {
  process.stdout.write(JSON.stringify(PG.dump(realModel())));
} else {
  runFixtures();
  runSeed();
  console.log("stats ok");
}
