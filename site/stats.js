// Shared counting rules for the site and the node tests.
// A win is the Winner cell on a game row. It matches a seat's deck nickname
// (or alias) when it can, and otherwise the commander's name.

(function (root) {
  const MONTHS = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const RESOLUTIONS = ["sheet", "corrected", "inferred", "manual", "ambiguous", "unresolved"];
  const COLORS = new Set(["W", "U", "B", "R", "G"]);

  function norm(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/\s+/g, " ");
  }

  function slug(value) {
    return norm(value)
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function parseDate(raw) {
    const text = String(raw ?? "").trim();
    if (text === "") return { iso: null, kind: "blank", raw: "" };
    if (text === "?") return { iso: null, kind: "unknown", raw: "?" };
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    if (iso) {
      const month = Number(iso[2]);
      const day = Number(iso[3]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return { iso: `${iso[1]}-${iso[2]}-${iso[3]}`, kind: "iso", raw: text };
      }
    }
    const legacy = /^(\d{1,2})([A-Za-z]{3})(\d{2})$/.exec(text);
    if (legacy) {
      const month = MONTHS[legacy[2].toLowerCase()];
      const day = Number(legacy[1]);
      if (month && day >= 1 && day <= 31) {
        const year = 2000 + Number(legacy[3]);
        const padded = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        return { iso: padded, kind: "legacy", raw: text };
      }
    }
    return { iso: null, kind: "invalid", raw: text };
  }

  function formatDate(iso) {
    const [year, month, day] = iso.split("-").map(Number);
    return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
  }

  function dateLabel(game) {
    if (game.date) return formatDate(game.date);
    if (game.dateKind === "unknown") return "Unknown date";
    if (game.dateKind === "blank") return "Date not recorded";
    return "Unreadable date";
  }

  function formatRate(wins, games) {
    if (!games) return "—";
    return `${Math.round((wins / games) * 100)}%`;
  }

  function formatRecord(wins, games) {
    return `${wins}–${games - wins}`;
  }

  function parseCsv(text) {
    const src = String(text).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < src.length; i += 1) {
      const char = src[i];
      if (inQuotes) {
        if (char === '"') {
          if (src[i + 1] === '"') {
            field += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        row.push(field);
        field = "";
      } else if (char === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }
    if (inQuotes) throw new Error("games.csv has an unclosed quote");
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    const records = rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
    if (!records.length) throw new Error("games.csv is empty");
    const headers = records[0].map((cell) => cell.trim());
    const games = records.slice(1).map((cells) => {
      if (cells.length !== headers.length) {
        throw new Error(
          `games.csv row has ${cells.length} columns and the header has ${headers.length}`
        );
      }
      const record = {};
      headers.forEach((header, index) => {
        record[header] = cells[index].trim();
      });
      return record;
    });
    return { headers, games };
  }

  function validScryfall(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      return (
        parsed.protocol === "https:" &&
        (parsed.hostname === "scryfall.com" || parsed.hostname.endsWith(".scryfall.com"))
      );
    } catch {
      return false;
    }
  }

  function commanderKeys(deck) {
    if (!deck || !deck.commander) return [];
    const full = String(deck.commander).trim();
    const head = full.split("//")[0].split(",")[0].trim();
    const keys = [full, head];
    if (/^the\s+/i.test(head)) keys.push(head.replace(/^the\s+/i, "").trim());
    return [...new Set(keys.map(norm))];
  }

  function deckLabels(deck) {
    return [deck.nickname, ...(deck.aliases || [])].map(norm);
  }

  function loadModel(playersDoc, decksDoc, csvText) {
    const errors = [];
    const meta = {
      name: playersDoc.name || "MTG Win Stats",
      sheetUrl: playersDoc.sheetUrl || "",
      repo: playersDoc.repo || "",
      importedFromSheet: playersDoc.importedFromSheet || "",
      commandersResolved: playersDoc.commandersResolved || decksDoc.resolved || "",
    };
    const players = Array.isArray(playersDoc.players) ? playersDoc.players : [];
    const decks = Array.isArray(decksDoc.decks) ? decksDoc.decks : [];
    const playerNames = new Set(players.map((player) => player.name));

    players.forEach((player) => {
      if (!player.name) errors.push("A player is missing a name");
    });

    const labelOwner = new Map();
    decks.forEach((deck) => {
      const who = `${deck.player || "?"} / ${deck.nickname || "?"}`;
      if (!playerNames.has(deck.player)) errors.push(`${who}: unknown player`);
      if (!deck.nickname) errors.push(`${who}: missing nickname`);
      if (!RESOLUTIONS.includes(deck.resolution)) {
        errors.push(`${who}: resolution must be one of ${RESOLUTIONS.join(", ")}`);
      }
      const open = deck.resolution === "ambiguous" || deck.resolution === "unresolved";
      if (open && deck.commander) {
        errors.push(`${who}: leave commander empty until the card is known`);
      }
      if (!open && !deck.commander) errors.push(`${who}: commander is missing`);
      if (deck.resolution === "ambiguous" && (!Array.isArray(deck.candidates) || deck.candidates.length < 2)) {
        errors.push(`${who}: list the possible cards`);
      }
      if (deck.resolution === "unresolved" && Array.isArray(deck.candidates) && deck.candidates.length) {
        errors.push(`${who}: an unresolved nickname should not list candidate cards`);
      }
      if (deck.commander && !validScryfall(deck.scryfall)) {
        errors.push(`${who}: add the https://scryfall.com card link`);
      }
      if (!Array.isArray(deck.colors) || deck.colors.some((color) => !COLORS.has(color))) {
        errors.push(`${who}: colors must be a list of W, U, B, R, G`);
      }
      if (deck.image != null && !String(deck.image).startsWith("https://")) {
        errors.push(`${who}: card image must be an https URL`);
      }
      if (!Array.isArray(deck.aliases)) errors.push(`${who}: aliases must be a list`);
      const labels = [deck.nickname, ...(deck.aliases || [])].filter(Boolean);
      labels.forEach((label) => {
        const key = `${deck.player}\0${norm(label)}`;
        if (labelOwner.has(key)) {
          errors.push(`${deck.player} has two decks called ${label}`);
        }
        labelOwner.set(key, deck);
      });
    });

    let table;
    try {
      table = parseCsv(csvText);
    } catch (error) {
      return { meta, players, decks, games: [], errors: errors.concat(error.message) };
    }

    const required = ["date", "players", "winner"];
    required.forEach((column) => {
      if (!table.headers.includes(column)) errors.push(`games.csv is missing the ${column} column`);
    });
    const seenHeaders = new Set();
    table.headers.forEach((header) => {
      if (!header) errors.push("games.csv has a blank column name");
      if (seenHeaders.has(header)) errors.push(`games.csv repeats the ${header} column`);
      seenHeaders.add(header);
      if (!required.includes(header) && header !== "notes" && !playerNames.has(header)) {
        errors.push(
          `games.csv column "${header}" is not a player. Add them to data/players.json or fix the header.`
        );
      }
    });

    const games = table.games.map((record, index) => {
      const line = index + 2;
      const seats = [];
      table.headers.forEach((header) => {
        if (required.includes(header) || header === "notes") return;
        if (!record[header]) return;
        const deck = labelOwner.get(`${header}\0${norm(record[header])}`) || null;
        if (!deck) {
          errors.push(`Line ${line}: ${header} played "${record[header]}", which is not in data/decks.json`);
        }
        seats.push({ player: header, deckName: record[header], deck });
      });
      const declared = record.players;
      if (!/^\d+$/.test(declared) || Number(declared) !== seats.length) {
        errors.push(
          `Line ${line}: players is ${declared || "blank"} but ${seats.length} people have a deck`
        );
      }
      const dated = parseDate(record.date);
      if (dated.kind === "invalid") errors.push(`Line ${line}: date "${record.date}" is not YYYY-MM-DD`);
      if (!record.winner) errors.push(`Line ${line}: winner is blank`);

      const game = {
        index: index + 1,
        line,
        date: dated.iso,
        dateKind: dated.kind,
        dateRaw: record.date,
        playerCount: seats.length,
        winner: record.winner,
        notes: record.notes || "",
        seats,
        result: null,
      };
      const winner = norm(record.winner);
      const byName = [];
      const byCommander = [];
      seats.forEach((seat) => {
        if (!seat.deck) return;
        if (deckLabels(seat.deck).includes(winner)) byName.push(seat);
        else if (commanderKeys(seat.deck).includes(winner)) byCommander.push(seat);
      });
      if (byName.length === 1) game.result = { player: byName[0].player, deck: byName[0].deck, via: "nickname" };
      else if (byName.length > 1) errors.push(`Line ${line}: winner "${record.winner}" matches more than one deck`);
      else if (byCommander.length === 1) {
        game.result = { player: byCommander[0].player, deck: byCommander[0].deck, via: "commander" };
      } else if (byCommander.length > 1) {
        errors.push(`Line ${line}: winner "${record.winner}" matches more than one commander`);
      } else if (record.winner) {
        errors.push(`Line ${line}: winner "${record.winner}" does not match anyone at the table`);
      }
      return game;
    });

    return { meta, players, decks, games, errors };
  }

  function tally(model) {
    const deckRows = model.decks.map((deck) => ({ deck, games: 0, wins: 0, last: 0 }));
    const byDeck = new Map(deckRows.map((row) => [`${row.deck.player}\0${row.deck.nickname}`, row]));
    const playerRows = model.players.map((player) => ({
      player,
      games: 0,
      wins: 0,
      last: 0,
      lastWin: 0,
    }));
    const byPlayer = new Map(playerRows.map((row) => [row.player.name, row]));

    model.games.forEach((game) => {
      game.seats.forEach((seat) => {
        if (!seat.deck) return;
        const deckRow = byDeck.get(`${seat.deck.player}\0${seat.deck.nickname}`);
        if (!deckRow) return;
        deckRow.games += 1;
        deckRow.last = game.index;
        if (game.result && game.result.deck === seat.deck) deckRow.wins += 1;
        const playerRow = byPlayer.get(seat.player);
        if (!playerRow) return;
        playerRow.games += 1;
        playerRow.last = game.index;
        if (game.result && game.result.player === seat.player) {
          playerRow.wins += 1;
          playerRow.lastWin = game.index;
        }
      });
    });
    return { decks: deckRows, players: playerRows };
  }

  function dump(model) {
    const totals = tally(model);
    return {
      errors: model.errors.slice(),
      winners: model.games.map((game) => ({
        index: game.index,
        date: game.dateRaw,
        winner: game.winner,
        player: game.result ? game.result.player : null,
        deck: game.result ? game.result.deck.nickname : null,
        via: game.result ? game.result.via : null,
        seats: game.seats.map((seat) => ({ player: seat.player, deck: seat.deckName })),
      })),
      decks: totals.decks.map((row) => ({
        player: row.deck.player,
        nickname: row.deck.nickname,
        games: row.games,
        wins: row.wins,
      })),
      players: totals.players.map((row) => ({
        name: row.player.name,
        games: row.games,
        wins: row.wins,
      })),
    };
  }

  root.Playgroup = {
    parseCsv,
    parseDate,
    slug,
    norm,
    commanderKeys,
    loadModel,
    tally,
    dump,
    formatRate,
    formatRecord,
    formatDate,
    dateLabel,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
