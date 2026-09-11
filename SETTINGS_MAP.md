# GAC Settings Map

What every GAC-specific setting/toggle/mode actually controls, whether it's
FLOW (which screens show, who inputs what, how night/day is sequenced) or
COSMETIC (audio/color/text only), what it interacts with, and whether the
Node harness (`test/gac-sim/`, which only imports `gac-engine.js`) can reach
it at all.

**Scope note, confirmed by grep, not assumed:** every GAC setting lives in
and is read entirely from `index.html`. `multiplayer.js` never references
`settings` at all, and `multiplayer-ui.js` never references `settings.gac*`
either — both are pure transport/session primitives that `index.html` calls
into with already-resolved values (a recipient's name, a phone id to
exclude). So the entire settings-driven branching surface is one file:
`index.html`. That matters for part (b) below.

All persisted settings live in `DEFAULT_SETTINGS` (`index.html:1484`).

## Quick-reference table

| Setting | Cluster | Flow or Cosmetic | Harness-reachable? |
|---|---|---|---|
| `gacVirtualDeal` | Deal & Input | **Flow** | No (DOM/UI only) |
| `gacPlayersPickCards` | Deal & Input | **Flow** | No |
| `gacPlayerChoices` | Deal & Input | **Flow** | No |
| `gacNoTracking` | Deal & Input | **Flow** (can disable win detection entirely) | No |
| `gacMinGrinches` | Deal & Input | **Flow** (changes actual role distribution) | Partially — the bias math itself is portable, see part (b) |
| `gacReadAloud` | Sam/Narrator | Cosmetic in effect, but device-synced (see below) | No |
| `gacAutoAdvance` | Sam/Narrator | **Flow** (removes manual-tap gating) | No |
| `gacAutoAdvanceMin` / `gacAutoAdvanceMax` | Sam/Narrator | Cosmetic (timing only) | No |
| `gacInfoPause` | Sam/Narrator | Cosmetic (timing only) | No |
| `gacResultsTo` | Results Routing | **Flow** (who sees private info) | No |
| `gacResultsPicked` | Results Routing | **Flow** (sub-value of the above) | No |
| `gacWinMode` | Win Rules | **Flow** (changes when the game ends) | **Yes** — `gac-engine.js` reads it directly, harness already covers both modes |
| `gacCoinFlipDraw` | Win Rules | **Flow** (draw becomes a winner) | No — the coin-flip itself is UI-side; `gac-engine.js`'s `"draw"` result is already harness-tested |
| `gacCheatDay` | Misc | Nominally cosmetic (visibility of a reference sheet) | No — **and see finding below: looks unwired** |
| `gacNoMusic` | Misc | Cosmetic | No |
| `musicRandom` | Misc (shared w/ ONBC) | Cosmetic | No |

Runtime-only Sam-flow state (not in `DEFAULT_SETTINGS`, not persisted, but
part of the same decision surface): `gacSamPickedInline`,
`gacAwaitingSamSettings`, `gacSamSettingsShown`, `gacPendingNight1`,
`gacSamCtrl`. Covered under the Sam/Narrator cluster below since they only
make sense alongside it.

Shared (not GAC-prefixed) settings GAC leans on heavily: `mpHostPlayer`,
`mpHostName`, `mpCheat`, `mpShowVotes`. Noted inline where they interact.

---

## Cluster 1: Card Deal & Role Input

This is the single most consequential cluster in the app — it's a "two
question" model in the UI (`index.html:7287-7342`) that collapses onto four
internal flags:

```
Q1 "How are cards dealt?"      -> physical | virtual
Q2 "How are characters input?" (physical only) -> players | sam | none
  virtual                 -> gacVirtualDeal = true
  physical + players      -> gacPlayersPickCards = true
  physical + sam          -> gacPlayerChoices = false (Sam/narrator inputs)
  physical + none         -> gacNoTracking = true
```
`gacDealMode()` / `gacInputMode()` (`index.html:7304-7310`) are the read-side
of this mapping and are worth knowing about directly — they're the
closest thing to a single source of truth for "what mode is this game in."

### `gacVirtualDeal`
- **Controls:** the app deals roles by shuffling and assigns each player a
  card the app tracks; players view their card on their phone. Off means a
  physical deal — real cards at the table, app doesn't originate role
  assignment.
- **Flow or cosmetic:** Flow. It changes which screens exist at all — e.g.
  `gacShowHostOwnCard()` only shows the host's own card box `if
  (!settings.gacVirtualDeal)` returns early (`index.html:3543`); the whole
  "Sam is dealt like any other card" branch of `gacSamAssignment()` only
  exists when this is true (`index.html:3470-3472`).
- **Interacts with:** Forces `gacPlayerChoices = true` and clears
  `gacPlayersPickCards` / `gacNoTracking` the moment it's turned on
  (`gacSetDealMode`, `index.html:7320-7333`) — virtual deal always implies
  players choosing on their own phones, no other input mode is reachable
  while it's on. Also gates `gacMinGrinches` (that setting is greyed out /
  meaningless for a physical deal — `gacSyncMinGrinchesBtns`,
  `index.html:7386-7392`). Also changes `gacSamAssignment()`'s `mode` from
  `"pick"` to `"dealt"`, which cascades into `gacHostIsSam()` and every
  screen gated on "is the host actually Sam."
- **Harness-reachable:** No. This never reaches `gac-engine.js` — the deal
  itself (who gets which card) happens entirely in `gacDealVirtualCardsNow()`
  in `index.html`, which then calls `makeGame()` with an already-decided
  `players` array. The harness's own `gameGen.mjs` does something
  structurally similar (random role assignment) but is a separate,
  parallel implementation for testing purposes — it does not exercise this
  function.

### `gacPlayersPickCards`
- **Controls:** physical deal only. Each player taps their own dealt card
  on their phone to tell the app what they have (self-report), instead of
  Sam/the narrator entering it.
- **Flow or cosmetic:** Flow — changes whether a card-selection UI screen
  appears at all (`gacStartCardSelection()`, gated at `index.html:4282`).
- **Interacts with:** Mutually exclusive with `gacNoTracking` and with
  `gacVirtualDeal` (all three represent different points on the same "how
  do I know who has what" axis — see the Q1/Q2 model above; only one can be
  true, enforced by `gacApplyInputMode()`). Also feeds `gacInputMode()`'s
  return value, which several gates read (`index.html:3833, 4010, 4018` all
  check `!settings.gacPlayersPickCards` before showing the host-assign
  screen — i.e. host-assign only makes sense when nobody else is self-
  reporting or being tracked-off).
- **Harness-reachable:** No — this is purely which UI screen a player sees;
  the resulting `roleId` assignment it produces is indistinguishable to
  `gac-engine.js` from any other way of populating `players`.

### `gacPlayerChoices`
- **Controls:** whether each living player answers their own night
  decisions on their own phone (true), or whether Sam/the narrator enters
  every decision on one screen for the whole table (false — "Sam-inputs
  mode", the physical-deal default). This is the single most-referenced GAC
  setting in the file (20+ read sites).
- **Flow or cosmetic:** Flow, and a big one. It changes: whether a decision
  beat waits for phone input at all (`index.html:2066`); who privately
  receives a result like Wet Bandits' steal or Santa's naughty/nice check —
  the acting player (`true`) or Sam (`false`) — at `index.html:2946, 2977`;
  whether card-selection UI shows (`4282`); whether "live reveal" (seeing
  your card update in real time) is active (`4326, 4343`); and the decision-
  routing used by `gacBroadcastWaitExcept`-style waits at `4502, 4786,
  5240, 6590`. **This is exactly the class of bug CLAUDE.md's "Sam-inputs
  mode" rule exists for** — private results going to the wrong recipient is
  precisely the "Wet card leaking to the host" bug class Scott described.
- **Interacts with:** Auto-forced to match the deal/input model (see
  cluster intro). Independently, it self-disables if not everyone has
  joined a device (`index.html:3949-3956`): "can't route per-phone choices
  if someone's not on a device" — a good defensive guard, but also a case
  where the setting's *effective* value can silently differ from its
  *stored* value depending on roster state at the moment the Sam Settings
  screen is opened. Worth knowing: **the stored setting and the live
  "is this actually usable right now" state can disagree**, and I did not
  find anywhere that re-validates this at the moment a night actually
  starts (only when the Sam Settings screen is rendered) — if a player's
  phone drops between opening that screen and the night beginning, I
  cannot confirm from reading alone whether the routing gracefully falls
  back or silently misroutes. Flagging as unverified rather than guessing.
- **Harness-reachable:** No. This decides which *phone* receives a prompt
  and where a private result is sent — none of that exists in
  `gac-engine.js`'s model at all (the engine has no concept of "who is
  looking at this screen").

### `gacNoTracking`
- **Controls:** the app becomes a pure timer/narrator tool — it does not
  track who has which role at all. No results, no votes, no win detection.
- **Flow or cosmetic:** Flow, and the most drastic one in this cluster —
  it doesn't just change a screen, it turns off entire subsystems.
  `checkWin()` is never even called when this is on (`index.html:6358`:
  `settings.gacNoTracking ? null : gacResolveWin(checkWin(...))`), and
  several tracker/log screens short-circuit to "nothing to show"
  (`4382, 5605, 6373, 6523`).
- **Interacts with:** Mutually exclusive with `gacPlayersPickCards` /
  `gacVirtualDeal` (same axis, see cluster intro). Also gates host-assign
  visibility the same way `gacPlayersPickCards` does.
- **Harness-reachable:** No, and this is worth stating plainly: this mode
  means `gac-engine.js` is **not used at all** for that session (no
  `makeGame`, no `resolveNight`, no `checkWin` calls happen). There is
  nothing for the harness to reach because nothing engine-side runs.

### `gacMinGrinches`
- **Controls:** virtual deal only. Guarantees at least this many
  grinch-team cards (Grinch/Krampus/BadSanta) land among the actually-dealt
  players, rather than risking them all landing in the center. Default 1.
- **Flow or cosmetic:** Flow — it changes the actual role distribution
  players receive, which is about as flow-critical as it gets for a hidden-
  role game.
- **Interacts with:** Only meaningful when `gacVirtualDeal` is on; greyed
  out and presumably inert otherwise (`gacSyncMinGrinchesBtns`,
  `index.html:7386-7392` — I did not find a runtime guard that also
  *ignores* the value for a physical deal, only a UI-greying; since
  `gacDealVirtualCardsNow()`, the only place `gacMinGrinches` is actually
  read, `index.html:3499`, is itself only ever called for a virtual deal,
  this is safe in practice, but the safety comes from "this function is
  never called," not from an explicit value check inside it).
- **Harness-reachable:** Partially, and this is the most promising
  extraction candidate in the whole map — see part (b).

---

## Cluster 2: Sam / Narrator (pace & audio)

Per `CLAUDE.md`, Sam Settings is explicitly documented as two independent
axes. Confirmed by reading: they really are independent (no shared gating
between them), but both interact with whether Sam is even in the game.

### `gacReadAloud`
- **Controls:** "Game Narrates" (true) vs. "Player Narrates" (false,
  default) — whether the app speaks each night prompt via narration audio
  clips, or a human reads the line aloud instead.
- **Flow or cosmetic:** Mostly cosmetic in *effect* (it's audio), but not
  cosmetic in *mechanism* — its value is broadcast across devices as part
  of Sam's settings payload (`narr: settings.gacReadAloud ? "game" :
  "player"`, `index.html:4144`) and read back on the receiving side
  (`v.narr`, `2879`), so a sync bug here is a real cross-device flow bug,
  not just a wrong color. This is also exactly the setting CLAUDE.md's
  "Audio on mobile" convention warns about (`gacUnlockNarrAudio()` must
  fire on a real tap) — the setting's *value* is simple, but its *correct
  behavior* depends on mobile audio-unlock timing that nothing here can
  verify.
- **Interacts with:** Nothing else gates it directly, but it's set as part
  of the same Sam Settings payload as `gacAutoAdvance`, so a bug in that
  payload's construction/parsing could plausibly desync both at once.
- **Harness-reachable:** No — audio playback has no representation in
  `gac-engine.js` at all.

### `gacAutoAdvance`
- **Controls:** "Auto-Advance" (true) vs. "Manual Tap" (false, default) —
  whether the narrator screen paces itself with randomized delays, or
  waits for an explicit tap between beats.
- **Flow or cosmetic:** Flow — it removes a required user gesture from the
  sequence, which also has a knock-on audio consequence (CLAUDE.md: mobile
  audio needs a real tap to unlock; auto-advance beats may not get one).
- **Interacts with:** **Forced on when Sam isn't in the selected roster at
  all** (`index.html:7489-7491`: "the app MUST self-pace" when there's no
  human narrator) — a real, confirmed, well-commented interaction, not
  speculation. When Sam IS in play, it's a free choice.
- **Harness-reachable:** No.

### `gacAutoAdvanceMin` / `gacAutoAdvanceMax` / `gacInfoPause`
- **Controls:** the randomized delay range for decision beats, and the
  fixed delay for pure-information beats (love reveal, Calvin's thumb ID),
  respectively, while Auto-Advance is active.
- **Flow or cosmetic:** Cosmetic — pure timing, doesn't change which
  screens appear or who inputs what, only how long a beat sits before
  auto-continuing.
- **Interacts with:** Only meaningful while `gacAutoAdvance` is true.
  Note: `gacInfoPause` is set from the SAME timer-picker control as the
  unrelated `roleTimer` setting (`index.html:7140`:
  `t => { settings.roleTimer = t.ms; settings.gacInfoPause = t.ms; ... }`)
  — one UI control writes two different settings simultaneously. Not
  obviously wrong, but worth knowing if `roleTimer` is ever reused for a
  GAC-specific purpose later, since it isn't independently adjustable from
  this control.
- **Harness-reachable:** No.

### Runtime Sam-flow state (`gacSamCtrl`, `gacSamPickedInline`, `gacAwaitingSamSettings`, `gacSamSettingsShown`, `gacPendingNight1`)
- **Controls:** who is *currently* driving the Sam Settings screen
  (`gacSamCtrl`: `"host"` or `"sam"`), which physical player was picked as
  Sam inline (`gacSamPickedInline`), and a small state machine gating
  whether Night 1 is blocked waiting on Sam Settings to be confirmed
  first (the other three).
- **Flow or cosmetic:** Flow — this is literally the mechanism CLAUDE.md
  calls out as the "host-is-Sam" bug source (`gacHostIsSam()` must compare
  resolved names, not just check `mode === "host"`).
- **Interacts with:** `gacVirtualDeal` (mode `"dealt"` skips this entirely
  — Sam Settings still applies, but "picking" doesn't), `mpHostPlayer` /
  `mpHostName` (whether the host is themselves a player, and their name,
  both feed the same-name comparison in `gacHostIsSam()`).
- **Harness-reachable:** No — none of this is persisted `settings` at all;
  it's page-lifetime state tied to DOM elements and one specific setup
  session.

---

## Cluster 3: Night-Results Routing

### `gacResultsTo` / `gacResultsPicked`
- **Controls:** who receives the morning's "what happened overnight"
  summary — `"everyone"` (broadcast to all phones, default), `"designated"`
  (Sam, else host, else a random living player), `"random"` (a fresh random
  living player each night), or `"picked"` (one host-chosen player, set at
  game start via `gacResultsPicked`, falling back to the designated chain
  if that player is no longer available).
- **Flow or cosmetic:** Flow — this decides who learns overnight
  information, which is exactly the kind of thing that, done wrong, IS an
  information leak.
- **Interacts with:** The whole function (`gacResultsRecipient()`,
  `index.html:5830-5862`) has one hard override baked in ahead of all four
  modes: **if a non-host Sam is running the night on their own phone, they
  are always the recipient, no matter what `gacResultsTo` says** — with an
  explicit comment explaining why ("otherwise 'everyone' mode would leak
  the overnight results before Sam narrates them"). This is a
  well-reasoned, well-documented override, but it does mean the setting's
  displayed/stored value can be actively contradicted by runtime behavior
  whenever a non-host Sam is in play — worth knowing so a report of
  "results went to the wrong person" isn't assumed to be a bug in
  `gacResultsTo` itself without first checking whether a non-host Sam
  explains it.
- **Harness-reachable:** No — "who receives a broadcast" has no
  representation in `gac-engine.js`.

---

## Cluster 4: Win Rules

### `gacWinMode`
- **Controls:** `"majority"` (default — Grinches win at parity, checked
  after a day vote) vs. `"total"` (play to full elimination of one side, or
  a surviving cross-team lover pair).
- **Flow or cosmetic:** Flow — it changes when the game actually ends.
- **Interacts with:** Nothing else gates it, but it's live-mutable
  *mid-game*: `gacSetWinMode()` writes straight into `gacGame.settings.
  gacWinMode` for a game already in progress (`index.html:7373-7381`),
  with a comment confirming this is intentional ("picks up the new rule
  immediately"). That is a real, deliberate design choice, but it also
  means the Node harness's coverage — which always constructs a game with
  a *fixed* win mode from the start — does not exercise a mode change
  happening mid-game. I don't have evidence this is broken, only that it's
  untested by the harness specifically because the harness never
  represents "the host changed this setting while a game was already
  running."
- **Harness-reachable:** **Yes, directly** — `gac-engine.js`'s `checkWin()`
  reads `game.settings.gacWinMode` itself (see `CLAUDE.md`'s Grinch-win
  writeup), and the harness's Monte Carlo matrix already runs both modes
  from the start of a game. The one gap is the mid-game-change path above.

### `gacCoinFlipDraw`
- **Controls:** on a mutual-annihilation draw (last Grinch and last
  Christmas-side killer take each other out the same night), flip a coin
  for a winner instead of leaving it a draw.
- **Flow or cosmetic:** Flow, narrowly — it only fires in the specific
  "both sides simultaneously eliminated" edge case (`index.html:6240`:
  `if (!settings.gacCoinFlipDraw) return "draw";`).
- **Interacts with:** Nothing else.
- **Harness-reachable:** No, not directly — the *coin flip itself* is
  UI-side and has no `gac-engine.js` representation, but the `"draw"`
  result it operates on is already a harness-verified engine outcome (the
  Monte Carlo matrix produces real draws and asserts `living().length ===
  0` for every one — see `TEST_REPORT.md`). So the input to this setting
  is trustworthy; only the coin-flip presentation layer on top of it is
  unverified.

---

## Cluster 5: Cosmetic / Misc

### `gacCheatDay`
- **Controls (nominally):** per its own comment, "allow the cheat sheet to
  be viewed during the day phase."
- **Finding, not a guess — verified by grep across all three files:** I
  could not find anywhere this setting is actually *read* to gate
  behavior. Every reference is either the checkbox's own init/onchange/
  reset (`index.html:1007, 7128, 7280, 7523`) or its `DEFAULT_SETTINGS`
  declaration. The actual cheat-sheet-during-voting gate that DOES exist
  and IS read (`index.html:5699`: `if (settings.mpHostPlayer &&
  settings.mpCheat)`) is a *different* setting, `mpCheat` (shared with
  ONBC, labeled "Allow cheat sheet during voting" at `index.html:1267`).
  **`gacCheatDay` looks like a checkbox that currently does nothing** —
  either dead/unwired code, or wired to a check I didn't find under a
  different name. Worth confirming directly rather than trusting this
  write-up blindly, but I looked hard and came up empty.
- **Flow or cosmetic:** Would be cosmetic (visibility of a reference
  panel) if it did anything.
- **Harness-reachable:** No.

### `gacNoMusic`
- **Controls:** mutes GAC background music.
- **Flow or cosmetic:** Cosmetic.
- **Interacts with:** Turning it on force-disables `musicRandom`
  (`index.html:6889`: `if (settings.gacNoMusic) settings.musicRandom =
  false;`) — a small, sensible, confirmed interaction (no point picking
  random tracks for music that's muted).
- **Harness-reachable:** No.

### `musicRandom` (shared with ONBC)
- **Controls:** pick a random track each time vs. the specifically
  selected one.
- **Flow or cosmetic:** Cosmetic.
- **Interacts with:** See `gacNoMusic` above.
- **Harness-reachable:** No.

---

## (a) Highest flow-risk settings — worth deliberate playtesting

1. **`gacPlayerChoices` (Sam-inputs vs. player-phones routing)** — the
   highest-touchpoint setting in the file (20+ sites); directly controls
   who receives private results. This is the exact mechanism behind the
   "Wet card leaking to the host" bug class. Test both values, and
   specifically test the join-state guard (`3949-3956`) by toggling it
   with a player mid-join or mid-drop.
2. **`gacNoTracking`** — turns off `checkWin`/results/votes entirely. If
   anything downstream assumes `gacGame` state exists unconditionally
   (rather than checking this flag first), that's a hard failure, not a
   degraded one. Worth a dedicated pass through every screen in this mode
   specifically looking for anything that assumes tracking is on.
3. **`gacResultsTo` × non-host Sam** — the "Sam always overrides" behavior
   is well-documented but means the four visible modes don't tell the
   full story. Test all four modes both with and without a non-host Sam
   in play, to confirm the override actually fires every time it should
   (and never fires when it shouldn't, e.g. a host-is-Sam game).
4. **Deal/input mode transitions** (`gacSetDealMode` / `gacApplyInputMode`)
   — specifically switching BETWEEN modes mid-setup (e.g. start physical +
   players, switch to virtual, switch back to physical + Sam) rather than
   picking one mode and starting fresh. The forced-flag-clearing logic
   (`7320-7333`) is exactly the kind of code that's easy to get right for
   the common path and wrong for a change-your-mind path.
5. **`gacWinMode` changed mid-game** — confirmed live-mutable, confirmed
   untested by the harness. Start a game in `majority`, get to a near-tie
   board, switch to `total` mid-game (and the reverse), and confirm the
   very next vote resolves under the NEW rule correctly, not the one the
   game started with.
6. **`gacAutoAdvance` forced-on when Sam isn't selected** — combined with
   `gacReadAloud`/audio-unlock timing (CLAUDE.md's mobile-audio warning):
   test a no-Sam game specifically for whether narration audio still
   unlocks correctly when there's no per-beat human tap to rely on.
7. **Host-is-Sam physical + `gacPlayersPickCards` off** (i.e., Sam
   assigns everyone's card) — this is the exact scenario CLAUDE.md calls
   out for needing the host-assign screen to look IDENTICAL to the
   phone's own Sam-assignment screen. A visual/behavioral mismatch here
   is easy to miss in code review and easy to catch by just looking at
   both screens side by side on real devices.

## (b) Harness-testable-later vs. real-device-only — honest assessment

**Could realistically be pulled out and made harness-testable:**

- **`gacMinGrinches`'s bias math** (`index.html:3499-3512`, inside
  `gacDealVirtualCardsNow()`). The actual algorithm — split the pool into
  grinch-team vs. other, guarantee N grinch cards land in the dealt set,
  shuffle the rest — is pure array logic with zero DOM dependency. It's
  just currently entangled with `gacSelected`, `gacPlayers`, and
  `gacSamAssignment()` reads inline in the same function. Extracting it
  into a standalone function like `gacBuildDealPool(selectedCardIds,
  playerCount, samSeatInfo, minGrinches) -> {dealtSet, center}` would make
  it directly unit-testable — "does a 1000-trial run at minGrinches=2
  actually never produce fewer than 2 grinch cards dealt" is exactly the
  kind of property the existing harness's Monte Carlo style is already
  built for.
- **`gacResultsRecipient()`'s resolution logic** (`index.html:5830-5862`).
  This is already almost pure — it takes settings values, game state, and
  a "who's Sam on which phone" fact, and returns a name or null. The one
  DOM/session dependency is `gacSamOnPhone()`. If that were passed in as a
  parameter instead of read from ambient state, the whole function could
  move to a pure module and get exhaustive scenario coverage (all 4 modes
  × Sam-on-phone/not × picked-player-alive/dead) the same way `gac-engine.js`'s
  scenarios do today.
- **`gacDealMode()` / `gacInputMode()` / the Q1×Q2 mapping** — already
  nearly pure functions of `settings` alone; genuinely trivial to test in
  isolation if they were exported from a non-DOM module. Low value on
  their own (they're simple), but useful as a foundation the two items
  above could build on.

**Fundamentally real-device-only, no realistic path to a harness:**

- **`gacReadAloud`, `gacNoMusic`, and anything audio** — correctness here
  is "did the phone's speaker actually make sound after a real tap
  unlocked the `<audio>` element." There's no meaningful way to assert
  that from Node.
- **`gacPlayerChoices` and `gacPlayersPickCards`'s actual UI flow** — the
  *setting values* could theoretically be modeled, but what actually
  breaks in practice (per Scott's own bug list: missing mobile-vote
  button, wrong screen after host-is-Sam) is rendering/DOM/event-wiring
  bugs, not decision logic. A harness that mocks the DOM enough to catch
  "this button doesn't exist" would essentially be re-implementing a
  browser test framework (Playwright/Puppeteer territory) — a much bigger
  investment than extending `test/gac-sim/`, and a genuinely different
  kind of tool than what exists today.
- **`gacAutoAdvance`'s timing/pacing correctness** — whether a real human
  perceives the pacing as "waiting too long" or "moving too fast" isn't a
  testable assertion at all, harness or otherwise.
- **The Sam-Settings sync payload** (`narr`/`pace` broadcast between
  devices) — the VALUES are simple, but the bug risk is in Supabase
  message timing/ordering across two real devices, which is exactly what
  `multiplayer.js` exists to handle and exactly what no Node harness can
  simulate without faking an entire realtime transport.

**Bottom line:** the settings that are "just decision logic" (win mode,
results routing, deal-pool math) are the ones worth investing harness
effort in — they're a natural, incremental extension of the same pattern
`test/gac-sim/` already uses. The settings whose entire risk is "does this
actually render/play/sync on a real device" (audio, screen selection,
cross-device timing) will only ever be verified by Scott playing the game,
no matter how much this repo's test infrastructure grows.
