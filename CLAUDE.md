# CLAUDE.md — One Night Before Christmas / Grinches Attack Christmas

This file briefs you (Claude) on this project. Read it fully before making changes.
Scott is a self-taught JS developer. Be direct and honest; flag mistakes rather
than smoothing over them. Never flatter. If something can't be verified from here
(real-device behavior, live multiplayer, audio on a phone), say so plainly —
don't claim it "works" when you can't confirm it.

## What this project is

A static web app (no build step) hosting TWO party games that share one codebase
and one Supabase realtime multiplayer session:

- **ONBC** — "One Night Before Christmas": a finished, shipped 44-card one-night
  social-deduction game. **It must keep working through every change. Never break
  ONBC while editing GAC.** If a change could touch shared code, check ONBC too.
- **GAC** — "Grinches Attack Christmas": a multi-night Mafia/Werewolf-style game,
  actively being built. Most work happens here.

Stack: plain HTML/CSS/JS (ES modules), Supabase realtime for multiplayer,
deployed to GitHub Pages (repo `smwixted/OneNightBeforeChristmas`, live at
https://smwixted.github.io/OneNightBeforeChristmas/). Deploy is via GitHub Desktop
(commit + push; Pages rebuilds in 1–3 min).

## Golden rules (these have burned us before)

1. **ONBC must never regress.** Shared files (`multiplayer.js`, `multiplayer-ui.js`)
   power both games.
2. **Ship complete code.** Scott wants working code and honest tradeoffs, not
   half-answers. Prefer root-cause fixes over patches that "usually work."
3. **Don't flip-flop.** If a fix was correct earlier, don't silently reverse it.
   If you're unsure of the intended behavior, ASK — especially rules questions
   (see the Buddy saga below: three "fixes" passed all checks and were still
   wrong because the real question was "who acts?", which only Scott could answer).
4. **Green checks ≠ correct behavior.** Syntax/simulation checks catch logic and
   build bugs. They CANNOT catch real-device, real-browser, real-audio, or live
   multiplayer bugs. Those are Scott's manual test. Be explicit about which is which.
5. **No green result/win boxes.** Scott dislikes them — use neutral dark
   `rgba(...)` backgrounds for result/win banners.

## File map

- `index.html` (~8500 lines) — the host/narrator engine + ALL GAC and ONBC host
  UI, plus a big injected `<script type="module">` at the bottom holding most GAC
  host logic. This is where most edits land.
- `multiplayer.js` — Supabase session + message routing. Exports session helpers
  and `gac*` broadcast/send functions. **Shared by ONBC and GAC.**
- `multiplayer-ui.js` (~2500 lines) — host helpers + the player phone client.
  It **re-exports everything from `multiplayer.js`**, so a new export must be added
  to BOTH its import line from `multiplayer.js` AND its own re-export block, or
  `index.html`'s import will fail and halt the module. **Shared by ONBC and GAC.**
- `gac-engine.js` — pure game logic: `makeGame`, `resolveNight`, `checkWin`,
  `eliminate`, `living`, `applyWetSteal`, `gacReassignRole`. No DOM. Easy to unit-test with Node.
- `gac-roles.js` — `GAC_ROSTER` (26 role entries: id, name, image, team, desc).
- `gac-script.js` — the night beats: `GAC_NIGHT1` and `GAC_NIGHTN` (wake order,
  spoken lines, which beats carry a `decision`).
- `night-engine.js`, `print-data.js`, `print.html`, `gac-print.html` — ONBC engine
  and printable reference sheets.
- `Audio/` — narration and gameplay clips (mp3). GAC narration in
  `Audio/GAC_Narration/`, mono 24kHz ~48kbps.

## GAC roster & teams (source of truth: gac-roles.js)

26 entries: 20 christmas, 5 grinch, 1 moderator (Sam). Wake order (see gac-script.js):
Sam (moderator, whole game), Cupid (N1), Calvin (N1, re-checks N2 if Wet),
Wet (N1 only), Shelf, Grinch, Krampus, Mrs, Santa, Belsnickel, Buddy (last).
Non-waking: Elf, Scrooge, Cindy, Frost, Burger, CharlieBrown, Yukon, BadSanta.

Key rules:
- **Grinches MUST kill every night** — no "None"/decline option. They may target
  any living player, including another Grinch. (Use `gacPlayerOpts(false)`.)
- **Yukon** survives the first NIGHT attack only.
- **Belsnickel** kills every night.
- **Krampus** once/game converts a would-otherwise-die victim to Grinch (keeps
  their card, only team flips; fails if the victim is protected/saved/shielded).
- **Mrs. Claus** save + poison, once each.
- **Buddy** swap once. **CharlieBrown** dies on an exact tie vote. **Frost** revenge
  on death. **BadSanta** must say "Grinch" daily or self-eliminate; **Scrooge** may
  only say "BAH HUMBUG" all game. **Burger** only wins if the Grinches win.
- Engine sets on each player: `team`, `startTeam`, `converted` (Krampus),
  `shieldCount`, `protectedThisNight` (only during resolveNight), `powers` (per role).
- `living()` EXCLUDES `roleId === "Sam"`. Sam is the moderator, never a player:
  exclude Sam from win/loss lists, logs, vote candidates/voters, out-lists.

## Sam the Snowman (narrator) model

`gacSamAssignment()` is the single source of truth → `{inPlay, mode, samName, takesSeat}`.
Modes: solo → "host"; virtual → "dealt"; physical → "pick". In a hosted physical
game the mode is "pick" EVEN WHEN THE HOST PICKS THEMSELVES — so "is the host Sam?"
must compare the resolved Sam name to the host name (see `gacHostIsSam()`), not
just check `mode === "host"`.

Sam Settings has two independent axes:
- **Pace**: Manual Tap (`gacAutoAdvance=false`, the default) / Auto-Advance.
- **Narration Audio**: Player Narrates (`gacReadAloud=false`, silent, default) /
  Game Narrates (`gacReadAloud=true`, app speaks the clips).

Host-is-Sam physical + full tracking → the host assigns each player's card on a
host-side screen (`gacShowHostAssign`), which must look IDENTICAL to the phone's
Sam assignment screen (it reuses the phone's `mp*` styles via exported `ensureStyles`).

## Conventions that bite if you forget them

- **Selected-button class is `.sel`** (green). Host `.gacModeBtn`/`.gacChoiceBtn`
  and phone `.mpBtn.gac` all use `.sel` when selected. The class `.on` has NO
  styling for these — using it gives an invisible-selection bug. (Tile grids DO
  use `"on"`, but not these buttons.)
- **Strict-mode / ES modules**: assigning to an UNDECLARED variable throws a
  ReferenceError and halts the whole module (blank screen). Always `let`/`const`
  declare. An unguarded top-level `getElementById("X").onclick` throws if X is
  missing — guard with `if (el)`.
- **Module-scope vs inline onclick**: functions in the `<script type="module">`
  are NOT global, so `onclick="myFn()"` in HTML CANNOT reach them. Wire buttons
  with `el.onclick = ...` in JS (give the button an id), never inline onclick.
- **Audio on mobile**: an `<audio>` element stays silent unless its FIRST play()
  happens during a real user tap. Narration is unlocked on Begin taps via
  `gacUnlockNarrAudio()`. The WebAudio context also needs `AudioGain.ensureCtx()`
  when a night starts (Sam may drive remotely, giving the host no per-beat gesture).
- **Wake lock**: call `WakeLock.acquire()` when a GAC night starts, or phones sleep.
- **Sticky roster**: the host keeps every player who has ever joined this session,
  even if their phone sleeps and drops from Supabase presence (see `startSession`
  in multiplayer.js). Don't rebuild the roster purely from live presence.
- **Physical vs virtual deal**: in a PHYSICAL deal the app is NOT the source of
  truth for cards — never show an app card image (Wet steal, card check, etc.);
  show text instead. Only show card images when `settings.gacVirtualDeal`.
- **Sam-inputs mode** (`!settings.gacPlayerChoices` with a non-host Sam): private
  results (Wet steal, Santa naughty/nice) go to SAM, not the acting player.
- **Message-ordering / Sam beats**: use `gacBroadcastWaitExcept(msg, samPhone)` to
  exclude Sam from table-wide waits while Sam is on a beat.

## Versioning & cache-busting (do this EVERY build)

- **The version number MUST increment on every build.** Folder is named
  `One_Night_Before_Christmas_vNN`.
- `index.html` imports other files with `?v=NN` cache-bust query strings. When you
  edit a file, BUMP its `?v=` so browsers don't serve a stale cached copy:
  - `multiplayer-ui.js?v=` (in index.html) — bump when you edit multiplayer-ui.js
  - `multiplayer.js?v=` (in multiplayer-ui.js) — bump when you edit multiplayer.js
  - `gac-script.js?v=` and `gac-engine.js?v=` (in index.html) — bump when edited
  - `index.html` itself has NO self cache-bust → a hard refresh (Cmd+Shift+R) is
    required after editing it. Tell Scott to hard-refresh.

## Verification checklist (run before declaring a change done)

These catch build/logic bugs (NOT device/audio/multiplayer bugs — those are Scott's).

1. `node -c multiplayer.js && node -c multiplayer-ui.js && node -c gac-engine.js &&
   node -c gac-script.js && node -c gac-roles.js` — syntax.
2. Brace balance of the injected module in index.html, and `<div>`/`</div>` balance.
3. Unguarded-id audit: parse HTML `id="..."` vs every
   `getElementById("X").onclick/onchange/oninput/checked/value` in the module —
   flag any id used but not present.
4. Import/export resolution across index.html ↔ multiplayer-ui.js ↔ multiplayer.js
   (every imported name must be exported down the chain).
5. For engine/rules changes, write a small Node `.mjs` that imports gac-engine.js
   and asserts the behavior (this is how the Buddy/Krampus/Santa cases were proven).
6. Confirm ONBC still loads and its flow is untouched if you edited shared files.

The local sandbox wipes between runs and browser click-through is unreliable, so
lean on Node simulations + static checks, and always end by telling Scott exactly
what to test on real devices.

## How to test locally (serve over HTTP — ES modules need it)

From the repo folder:  `python3 -m http.server 8000`  then open
`http://localhost:8000`. For phone testing, find the Mac IP with
`ipconfig getifaddr en0` and open `http://THAT-IP:8000` on a phone on the same
Wi-Fi. Multiplayer still uses live Supabase over the internet. Wake lock may
behave differently over plain http:// than the deployed https:// site.

## Working style

- Explain fixes and tradeoffs directly. Reasonable pushback is welcome.
- For any rules/behavior ambiguity, ASK Scott rather than guessing — the cost of a
  wrong guess (see Buddy) is higher than a quick question.
- Prefer proposing a plan / showing diffs before committing, especially early on.
