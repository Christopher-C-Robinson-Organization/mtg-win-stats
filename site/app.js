(function () {
  const PG = globalThis.Playgroup;
  const state = {
    model: null,
    totals: null,
    view: "log",
    player: "all",
    needs: false,
    query: "",
    sort: "games",
  };

  const PIP_NAMES = { W: "white", U: "blue", B: "black", R: "red", G: "green", C: "colorless" };

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.entries(attrs).forEach(([key, value]) => {
        if (value == null || value === false) return;
        if (key === "class") node.className = value;
        else if (key.startsWith("on") && typeof value === "function") {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else node.setAttribute(key, value === true ? "" : String(value));
      });
    }
    children.flat(Infinity).forEach((child) => {
      if (child == null || child === false || child === "") return;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    });
    return node;
  }

  function badge(deck) {
    if (!deck) return el("span", { class: "badge" }, "Unknown deck");
    if (deck.resolution === "unresolved" || deck.resolution === "ambiguous") {
      return el("span", { class: "badge" }, "Needs commander");
    }
    if (deck.resolution === "inferred") return el("span", { class: "badge info" }, "Nickname match");
    if (deck.resolution === "corrected") return el("span", { class: "badge info" }, "Sheet name adjusted");
    if (deck.resolution === "manual") return el("span", { class: "badge info" }, "Added by the group");
    return null;
  }

  function pips(deck) {
    if (!deck || !deck.commander) return null;
    const colors = deck.colors && deck.colors.length ? deck.colors : ["C"];
    const label = colors.map((color) => PIP_NAMES[color] || color).join(", ");
    const row = el("span", { class: "pips", "aria-label": `Color identity ${label}` });
    colors.forEach((color) => {
      row.append(el("span", { class: `pip ${color}`, title: PIP_NAMES[color] || color, "aria-hidden": "true" }, color));
    });
    return row;
  }

  function cardImage(deck, className) {
    if (!deck || !deck.image) return null;
    const image = el("img", {
      class: className || "card-img",
      src: deck.image,
      alt: `${deck.commander || deck.nickname} card`,
      width: "146",
      height: "204",
      loading: "lazy",
      decoding: "async",
    });
    image.addEventListener("error", () => image.remove());
    return image;
  }

  function commanderLink(deck) {
    if (!deck || !deck.commander) return el("span", { class: "cmd quiet" }, "Commander unknown");
    const label = deck.commander;
    if (!deck.scryfall) return el("span", { class: "cmd" }, label);
    return el("a", { class: "cmd", href: deck.scryfall, target: "_blank", rel: "noopener noreferrer" }, label);
  }

  function sheetLines(deck, games, wins) {
    const sheet = deck.sheet;
    if (!sheet) return [];
    const lines = [];
    if (sheet.commander && sheet.commander !== deck.commander) {
      lines.push(`Spreadsheet commander cell: ${sheet.commander}`);
    }
    const counted = sheet.games != null && sheet.wins != null;
    const differ = counted && (sheet.games !== games || sheet.wins !== wins);
    if (differ) lines.push(`Spreadsheet row: ${sheet.wins} wins in ${sheet.games} games.`);
    if (sheet.accuracy && sheet.accuracy !== "ok") lines.push(`Spreadsheet flag: ${sheet.accuracy}`);
    else if (sheet.accuracy === "ok" && differ) lines.push("Spreadsheet marked this row ok.");
    if (sheet.notes) lines.push(sheet.notes);
    return lines;
  }

  function playedLabel(index) {
    if (!index) return "Not in the log yet";
    const game = state.model.games[index - 1];
    if (game.date) return `Last played ${PG.formatDate(game.date)}`;
    return `Last played in game ${index} (${PG.dateLabel(game).toLowerCase()})`;
  }

  async function fetchFirst(paths) {
    let status = "missing";
    for (const path of paths) {
      const response = await fetch(path);
      if (response.ok) return response.text();
      status = String(response.status);
    }
    throw new Error(`${paths[0]} (${status})`);
  }

  async function load() {
    const [playersText, decksText, gamesText] = await Promise.all([
      fetchFirst(["data/players.json", "../data/players.json"]),
      fetchFirst(["data/decks.json", "../data/decks.json"]),
      fetchFirst(["data/games.csv", "../data/games.csv"]),
    ]);
    const model = PG.loadModel(JSON.parse(playersText), JSON.parse(decksText), gamesText);
    state.model = model;
    state.totals = PG.tally(model);
    const sheet = document.querySelector("#sheet-link");
    if (model.meta.sheetUrl && sheet) sheet.href = model.meta.sheetUrl;
    if (model.meta.repo) {
      const repo = model.meta.repo.replace(/\/$/, "");
      document.querySelector("#add-game").href = `${repo}/blob/main/CONTRIBUTING.md`;
      document.querySelector("#edit-log").href = `${repo}/edit/main/data/games.csv`;
      document.querySelector("#edit-decks").href = `${repo}/edit/main/data/decks.json`;
    }
    applyHash();
    render();
  }

  function applyHash() {
    const raw = decodeURIComponent(location.hash.replace(/^#/, ""));
    const [view, rest] = raw.split("/");
    state.view = view === "players" || view === "decks" ? view : "log";
    if (state.view === "decks" && rest && state.model) {
      const player = state.model.players.find((item) => PG.slug(item.name) === rest);
      if (player) state.player = player.name;
    }
  }

  function writeHash() {
    let next = `#${state.view}`;
    if (state.view === "decks" && state.player !== "all") next = `#decks/${PG.slug(state.player)}`;
    if (location.hash !== next) history.replaceState(null, "", next);
  }

  function render() {
    document.querySelectorAll(".tab").forEach((button) => {
      button.setAttribute("aria-selected", String(button.dataset.view === state.view));
    });
    renderTotals();
    const main = document.querySelector("#app");
    const view = state.view === "players" ? renderPlayers() : state.view === "decks" ? renderDecks() : renderLog();
    main.replaceChildren(view);
    writeHash();
  }

  function renderTotals() {
    const root = document.querySelector("#totals");
    const games = state.model.games.length;
    const pilots = state.totals.players.filter((row) => row.games > 0).length;
    const played = state.totals.decks.filter((row) => row.games > 0).length;
    const needs = state.model.decks.filter(
      (deck) => deck.resolution === "unresolved" || deck.resolution === "ambiguous"
    ).length;
    const needsButton = el(
      "button",
      {
        class: "stat button",
        type: "button",
        onClick: () => {
          state.view = "decks";
          state.needs = true;
          state.player = "all";
          render();
        },
      },
      el("strong", {}, String(needs)),
      el("span", {}, needs === 1 ? "needs a commander" : "need a commander")
    );
    root.replaceChildren(
      el("div", { class: "stat" }, el("strong", { "data-stat": "games" }, String(games)), el("span", {}, "games")),
      el("div", { class: "stat" }, el("strong", {}, String(pilots)), el("span", {}, "players")),
      el("div", { class: "stat" }, el("strong", {}, String(played)), el("span", {}, "decks played")),
      needsButton
    );
  }

  function errorBanner() {
    if (!state.model.errors.length) return null;
    return el(
      "div",
      { class: "banner", role: "alert" },
      el("strong", {}, "The log needs a fix before every win can be counted."),
      el("ul", {}, state.model.errors.map((error) => el("li", {}, error)))
    );
  }

  function renderLog() {
    const undated = state.model.games.filter((game) => !game.date).length;
    const blocks = [];
    state.model.games.forEach((game) => {
      const key = game.date || game.dateKind;
      const last = blocks[blocks.length - 1];
      if (last && last.key === key) last.games.push(game);
      else blocks.push({ key, games: [game] });
    });
    const ordered = blocks.reverse().map((block) => ({ ...block, games: block.games.slice().reverse() }));
    return el(
      "section",
      {},
      errorBanner(),
      el(
        "p",
        { class: "intro" },
        undated
          ? `${undated} games have no calendar date. Newest row first. A winner cell that names the commander, such as Morska, is matched to that deck.`
          : "Newest row first. A winner cell that names the commander, such as Morska, is matched to that deck."
      ),
      ordered.map((block) => {
        const label = PG.dateLabel(block.games[0]);
        const count = block.games.length === 1 ? "1 game" : `${block.games.length} games`;
        return el("section", { class: "night" }, el("h2", {}, `${label} · ${count}`), block.games.map(renderGame));
      })
    );
  }

  function renderGame(game) {
    const winnerSeat = game.result
      ? game.seats.find((seat) => seat.deck === game.result.deck && seat.player === game.result.player)
      : null;
    const others = game.seats.filter((seat) => seat !== winnerSeat);
    const winnerCard = winnerSeat
      ? el(
          "div",
          { class: "winner-card" },
          cardImage(winnerSeat.deck),
          el(
            "div",
            {},
            el(
              "p",
              { class: "kicker" },
              PG.norm(game.winner) === PG.norm(winnerSeat.deckName) ? "Winner" : `Winner cell: ${game.winner}`
            ),
            el("p", { class: "who-name" }, winnerSeat.player),
            el("div", { class: "deck-name" }, winnerSeat.deckName),
            commanderLink(winnerSeat.deck),
            pips(winnerSeat.deck),
            badge(winnerSeat.deck)
          )
        )
      : el("div", { class: "banner" }, `Winner “${game.winner}” does not match a single seat.`);
    return el(
      "article",
      { class: "game", "data-game": String(game.index) },
      el("p", { class: "game-meta" }, `Game ${game.index} · ${game.playerCount} players`),
      winnerCard,
      others.length
        ? el(
            "ul",
            { class: "seat-list", "aria-label": "Rest of the table" },
            others.map((seat) =>
              el(
                "li",
                { class: "seat" },
                el("span", { class: "who" }, seat.player),
                el("span", { class: "deck-name" }, seat.deckName),
                seat.deck ? commanderLink(seat.deck) : el("span", { class: "badge" }, "Unknown deck"),
                seat.deck ? pips(seat.deck) : null,
                seat.deck ? badge(seat.deck) : null
              )
            )
          )
        : null,
      game.notes ? el("p", { class: "notes" }, game.notes) : null
    );
  }

  function renderPlayers() {
    const rows = state.totals.players.slice().sort((a, b) => {
      const ar = a.games ? a.wins / a.games : -1;
      const br = b.games ? b.wins / b.games : -1;
      if (br !== ar) return br - ar;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.games !== a.games) return b.games - a.games;
      return a.player.name.localeCompare(b.player.name);
    });
    return el(
      "section",
      {},
      errorBanner(),
      el(
        "p",
        { class: "intro" },
        "Win rate is wins divided by games in the log. A one-game hot streak sits next to longer records, so read the wins and losses with the percent."
      ),
      rows.map((row, index) => renderPilot(row, index + 1))
    );
  }

  function renderPilot(row, rank) {
    const decks = state.totals.decks
      .filter((item) => item.deck.player === row.player.name)
      .slice()
      .sort((a, b) => b.games - a.games || a.deck.nickname.localeCompare(b.deck.nickname));
    const sheet = row.player;
    let sheetLine = null;
    if (sheet.sheetGames != null && sheet.sheetWins != null && (sheet.sheetGames !== row.games || sheet.sheetWins !== row.wins)) {
      let extra = "";
      if (sheet.sheetGames > row.games) extra = " The spreadsheet counted games that are not in this log.";
      else if (row.games > sheet.sheetGames) extra = " The log has games the spreadsheet total does not.";
      sheetLine = `Spreadsheet total: ${sheet.sheetWins} wins in ${sheet.sheetGames} games.${extra}`;
    }
    return el(
      "article",
      { class: "pilot", id: `player-${PG.slug(row.player.name)}` },
      el(
        "div",
        { class: "pilot-top" },
        el("span", { class: "rank" }, row.games ? String(rank) : "–"),
        el("h3", {}, row.player.name),
        el("p", { class: "record" }, row.games ? `${PG.formatRecord(row.wins, row.games)} · ${PG.formatRate(row.wins, row.games)}` : "No games")
      ),
      row.games ? el("div", { class: "bar", "aria-hidden": "true" }, el("span", { style: `--p:${Math.round((row.wins / row.games) * 100)}` })) : null,
      el("p", { class: "quiet" }, playedLabel(row.last)),
      sheetLine ? el("p", { class: "quiet" }, sheetLine) : null,
      el(
        "ul",
        { class: "deck-pills" },
        decks.map((item) =>
          el(
            "li",
            {},
            el(
              "button",
              {
                type: "button",
                onClick: () => openDeck(item.deck),
              },
              item.games
                ? `${item.deck.nickname} ${PG.formatRecord(item.wins, item.games)}`
                : `${item.deck.nickname} · not in the log`
            )
          )
        )
      )
    );
  }

  function openDeck(deck) {
    state.view = "decks";
    state.player = deck.player;
    state.needs = false;
    state.query = deck.nickname;
    render();
  }

  function renderDecks() {
    const list = el("div", { id: "deck-list" });
    const view = el(
      "section",
      {},
      errorBanner(),
      el(
        "p",
        { class: "intro" },
        "Filter by who sat down with the deck. A nickname with more than one possible card, or no card, is left blank."
      ),
      renderDeckTools(),
      list
    );
    fillDeckList(list);
    return view;
  }

  function renderDeckTools() {
    const search = el("input", {
      class: "search",
      type: "search",
      placeholder: "Search nickname or commander",
      value: state.query,
      "aria-label": "Search decks",
      onInput: (event) => {
        state.query = event.target.value;
        const list = document.querySelector("#deck-list");
        if (list) fillDeckList(list);
      },
    });
    const sort = el(
      "select",
      {
        class: "sort",
        "aria-label": "Sort decks",
        onChange: (event) => {
          state.sort = event.target.value;
          const list = document.querySelector("#deck-list");
          if (list) fillDeckList(list);
        },
      },
      el("option", { value: "games" }, "Most games"),
      el("option", { value: "wins" }, "Most wins"),
      el("option", { value: "rate" }, "Win rate"),
      el("option", { value: "name" }, "Name")
    );
    sort.value = state.sort;
    const chips = el(
      "div",
      { class: "chips", role: "toolbar", "aria-label": "Filter decks" },
      el(
        "button",
        {
          class: "chip",
          type: "button",
          "aria-pressed": String(state.player === "all" && !state.needs),
          onClick: () => {
            state.player = "all";
            state.needs = false;
            render();
          },
        },
        "All"
      ),
      el(
        "button",
        {
          class: "chip",
          type: "button",
          "aria-pressed": String(state.needs),
          onClick: () => {
            state.needs = !state.needs;
            render();
          },
        },
        "Needs commander"
      ),
      state.model.players.map((player) =>
        el(
          "button",
          {
            class: "chip",
            type: "button",
            "aria-pressed": String(state.player === player.name),
            onClick: () => {
              state.player = player.name;
              render();
            },
          },
          player.name
        )
      )
    );
    return el("div", {}, el("div", { class: "toolbar" }, search, sort), chips);
  }

  function visibleDecks() {
    const query = PG.norm(state.query);
    const rows = state.totals.decks.filter((row) => {
      if (state.player !== "all" && row.deck.player !== state.player) return false;
      if (state.needs && row.deck.resolution !== "unresolved" && row.deck.resolution !== "ambiguous") return false;
      if (!query) return true;
      const haystack = [
        row.deck.nickname,
        row.deck.player,
        row.deck.commander,
        row.deck.notes,
        ...(row.deck.aliases || []),
        ...(row.deck.candidates || []).map((card) => card.name),
        row.deck.sheet && row.deck.sheet.commander,
      ]
        .map((part) => PG.norm(part))
        .join(" ");
      return haystack.includes(query);
    });
    const rate = (row) => (row.games ? row.wins / row.games : -1);
    rows.sort((a, b) => {
      if (state.sort === "name") {
        return a.deck.nickname.localeCompare(b.deck.nickname) || a.deck.player.localeCompare(b.deck.player);
      }
      if (state.sort === "rate") {
        return rate(b) - rate(a) || b.games - a.games || a.deck.nickname.localeCompare(b.deck.nickname);
      }
      if (state.sort === "wins") {
        return b.wins - a.wins || b.games - a.games || a.deck.nickname.localeCompare(b.deck.nickname);
      }
      return b.games - a.games || b.wins - a.wins || a.deck.nickname.localeCompare(b.deck.nickname);
    });
    return rows;
  }

  function fillDeckList(list) {
    const rows = visibleDecks();
    const count = rows.length === 1 ? "1 deck" : `${rows.length} decks`;
    const cards = rows.length ? rows.map(renderDeck) : [el("p", {}, "No decks match.")];
    list.replaceChildren(el("p", { class: "quiet" }, count), ...cards);
  }

  function renderDeck(row) {
    const deck = row.deck;
    const lines = sheetLines(deck, row.games, row.wins);
    const candidates =
      deck.candidates && deck.candidates.length
        ? el(
            "details",
            state.needs ? { open: true } : {},
            el("summary", {}, `${deck.candidates.length} possible cards, none selected`),
            el(
              "div",
              { class: "candidates" },
              deck.candidates.map((card) =>
                el(
                  "a",
                  { class: "candidate", href: card.scryfall, target: "_blank", rel: "noopener noreferrer" },
                  card.image
                    ? el("img", {
                        src: card.image,
                        alt: "",
                        width: "146",
                        height: "204",
                        loading: "lazy",
                      })
                    : null,
                  el("span", {}, card.name)
                )
              )
            )
          )
        : null;
    const seeAlso =
      deck.seeAlso && deck.seeAlso.length
        ? el(
            "p",
            { class: "quiet" },
            "Different card, not selected: ",
            deck.seeAlso.map((card, index) => [
              index ? ", " : "",
              el("a", { href: card.scryfall, target: "_blank", rel: "noopener noreferrer" }, card.name),
            ])
          )
        : null;
    return el(
      "article",
      {
        class: "deck",
        id: `deck-${PG.slug(deck.player)}--${PG.slug(deck.nickname)}`,
        "data-resolution": deck.resolution,
      },
      el(
        "div",
        { class: "deck-top" },
        cardImage(deck),
        el(
          "div",
          {},
          el("h3", {}, deck.nickname),
          commanderLink(deck),
          el("div", { class: "quiet" }, deck.player),
          pips(deck),
          badge(deck)
        ),
        el(
          "p",
          { class: "record" },
          row.games ? `${PG.formatRecord(row.wins, row.games)} · ${PG.formatRate(row.wins, row.games)}` : "Not played"
        )
      ),
      el("p", { class: "quiet" }, playedLabel(row.last)),
      deck.notes ? el("p", { class: "notes" }, deck.notes) : null,
      lines.map((line) => el("p", { class: "quiet" }, line)),
      seeAlso,
      candidates
    );
  }

  document.querySelectorAll(".tab").forEach((button) => {
    button.addEventListener("click", () => {
      if (!state.model) return;
      state.view = button.dataset.view;
      render();
    });
  });
  window.addEventListener("hashchange", () => {
    if (!state.model) return;
    applyHash();
    render();
  });

  load().catch((error) => {
    document.querySelector("#app").replaceChildren(
      el("div", { class: "banner", role: "alert" }, `Could not read the playgroup files. ${error.message}`)
    );
  });
})();
