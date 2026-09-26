# GAC open work

Tracks work carried between sessions so nothing gets lost. Update this file
whenever an item's status changes — mark done items with the date shipped,
don't just delete them (keeps history of what was fixed and why).

## Recently shipped (context for what's below)

- **Bug A** — `gacApplyCardPicks()` never refreshed a player's `.powers`/
  `.shieldCount` after they confirmed their real card (physical deal), so
  anyone whose confirmed card differed from the "Elf1" setup placeholder
  (Mrs. Claus, Krampus, Buddy, Wet) had all their powers stuck unusable all
  game. Fixed by extracting `gacCardTeam`/`gacCardPowers`/`gacCardShield`
  into `gac-engine.js` as the single source of truth, used by `makePlayer`,
  `gacReassignRole` (Wet steal/Krampus), and `gacApplyCardPicks` alike.
- **Bug B** — the Bad Santa night-start check's "already asked this night"
  latch was set the instant the prompt was *sent*, not once it was
  *answered* — if the reply never arrived (also fixed: missing
  `gacRegisterPhoneHandler()` call on the Sam-phone path), a retry would
  skip re-asking and start the night with Bad Santa never eliminated. Fixed
  by moving the latch into the resolver and wrapping the resume in
  `try/finally` so it's genuinely unconditional. Confirmed independent of
  Bug A (the gate is `night > 1` only; Bug A happened on Night 1).
- Both confirmed via `node test/gac-sim/run.mjs` (0 rule-invariant
  violations, 33/33 scenarios) — still needs Scott's real-device pass on
  both before anything else stacks on top.
- **[shipped 2026-09-22]** Eliminating Scrooge mid-day was destroying
  overnight results still waiting on a gated recipient to reveal, AND — a
  bigger find made while investigating — Jack Frost's automatic revenge
  check (fires with no button press, on every night with deaths where Frost
  died, in EVERY distribution mode including ungated "everyone") was doing
  the exact same thing: `gacResultsRecipient()` re-derives who should see
  results on every call (a fresh coin-flip under "random" mode; silently
  reassigns under "picked" mode if that player has since died), and
  `gacBroadcastDaySummary` overwrote `gacPendingShareSummary`'s real
  deaths/swaps with empty ones whenever a caller passed no report. Root-cause
  fixed inside `gacBroadcastDaySummary` itself (one `stillPendingThisNight`
  check, reused for both the deaths/swaps fallback and recipient stability)
  so no current or future caller can repeat this. Separately, found and
  closed the actual door that let a vote outrun a reveal in the first
  place: the host's own `#gacStartVote` and `#gacNextNight` buttons had no
  `gacRevealPendingResults()` guard at all — only their Sam-phone
  equivalents did. Scrooge's public rule-break announcement also moved off
  `gacBroadcastDaySummary` entirely onto its own unconditional broadcast
  (`gac_rule_break` → a transient toast banner, doesn't rebuild any
  player's screen) — that function's distribution-gating and full-screen
  rebuild were never appropriate for a mid-day announcement to begin with.

- **[shipped 2026-09-23]** Real-device playtest found a family of ordering/
  routing bugs, all fixed:
  - **Wet Bandits center-card reveal fired before the clarifying question.**
    Physical deal, 2+ center cards: `onGacChoice`'s phone-dispatch handler and
    the host's own inline decision UI each guessed `centerCards[0]` and
    revealed it immediately, BEFORE `gacMaybeInsertWetCenterPick`'s "which
    center card was it?" question ever ran — telling Sam/the host the answer
    ahead of asking them. Fixed by gating that immediate reveal on
    `!wetAmbiguous` (physical + 2+ center cards) in both places, and adding a
    new reveal — using the real chosen card, not a guess — once the
    clarifying question is actually answered. Factored the reveal-and-hold
    logic (identical in both call sites) into one shared `gacSendWetStealReveal()`.
  - **Jack Frost's revenge prompt didn't route to Sam.** `gacCheckJackFrostRevenge()`'s
    "does Frost have his own phone?" check only looked at
    `settings.gacPlayerChoices` — it never checked for a non-host Sam running
    the night in Sam-inputs mode, so it fell through to the HOST's own
    tracker instead, unlike every other private decision (which all route to
    Sam first via the same priority order used in `gacDispatchToPhone`). Fixed
    to check `gacSamOnPhone()` first, same priority as everywhere else.
  - **Jack Frost's prompt could fire before results were revealed.** Both
    `gacOpenTracker` (night end) and `gacApplyVoteResult` (vote end) called
    `gacCheckJackFrostRevenge()` immediately after broadcasting the day
    summary — but if that summary was gated to a recipient (not yet shared to
    the table), the prompt could ask Sam/the host to resolve a death nobody
    had been told about yet. Fixed by only firing it immediately when NOT
    gated (`!gacPendingShareSummary`); the deferred case now fires from
    `gacRevealPendingResults()` itself, once results actually reach the
    table (covers both the explicit "Share Results" tap and the automatic
    reveal-on-advance guard).
  - **Host screen showed an app card image during a physical deal's card
    check.** `gacStartCardCheck()`'s per-player phone push and
    `gacPushChangedCards()` (Wet steal / Krampus-convert card refresh) both
    sent `image: r.image` unconditionally, gated only on `gacPlayerChoices`,
    never on `gacVirtualDeal` — unlike every other card-reveal path in the
    file (`gacShowTrackHostCard`, `gacShowHostOwnCard`,
    `gacRenderLoveRevealStatus`'s host card, `gacSendVirtualCards`), which all
    correctly show text instead of an image in a physical deal. Fixed both:
    `gacStartCardCheck` now sends a `physical:true` text-only payload (new
    `showCardCheckPhysical()` in `multiplayer-ui.js` renders it — no
    hold-to-reveal image control, just a confirm button, matching the
    existing host-inline physical wording); `gacPushChangedCards` now no-ops
    entirely in a physical deal (matches its own Krampus-conversion comment:
    physical games use the narrator's tap, not a phone popup).
  - All four verified via `node -c` on every touched file, module syntax
    check + div-balance on `index.html`, and `node test/gac-sim/run.mjs`
    (0 violations, 33/33 scenarios — unaffected since none of this touched
    `gac-engine.js`). **Needs Scott's real-device pass** — see the test list
    below.
  - **Investigated, not a bug found:** Mrs. Claus not being told who was
    attacked when she's the target. Traced the full pipeline (decision def →
    `gacBuildPhonePrompt`'s `{victim}` substitution → `gacDispatchToPhone`'s
    Sam-inputs routing → `gacSendPrompt` → `renderGacPrompt`'s `p.label`
    render; separately, the host-inline `gacRenderInlineDecision` path) —
    every step correctly includes the victim's name regardless of self-target.
    Could not reproduce the missing info from code alone. Needs more detail
    from Scott (exact screen/device, exact text seen) before touching
    anything here.
  - **ASK, resolved by the Frost routing fix above:** Sam's phone showed the
    "Eliminate Ebenezer Scrooge" button during the Frost prompt. Root cause:
    in the OLD (pre-fix) routing, Frost's decision never reached Sam's phone
    at all (see above) — it was resolved on the host's tracker instead, so
    Sam's phone just sat on its last-rendered day screen (with the Scrooge
    button, correctly shown per item 6 below) while nothing was pushed to it.
    Now that Frost's prompt correctly reaches Sam's phone, `renderGacPrompt`'s
    full-screen rebuild will hide the Scrooge button for the duration of that
    prompt automatically — same as it already does for every other private
    decision (wetSteal, santaInspect, etc.). Open design question for Scott:
    should the Scrooge button stay reachable even while another decision is
    pending (would need to move it outside the decision-prompt's rebuilt
    `wrap`, e.g. a floating element like the rule-break toast), or is
    "hidden during other decisions, same as everything else" the intended
    behavior? Not changed either way — flagging for a decision, not guessing.
    **[resolved 2026-09-26 — see below]** Scott confirmed: always visible
    during the day.

- **[shipped 2026-09-26]** Wrong-winner bug: the game could be declared over,
  shared as final, and broadcast as a win while Jack Frost's revenge kill was
  still outstanding — his kill can change who wins, so this wasn't a timing
  bug, it was a correctness bug. Root cause: last round's deferred-Frost-check
  fix (2026-09-23) lived only inside `gacRevealPendingResults()`, but
  `onGacShareResults`'s game-over branch bypasses that function entirely
  (it clears `gacPendingShareSummary` directly and calls `gacShareResults()`)
  — so a game-ending vote with a non-host Sam (routed to Sam via
  `routeToSamAtEnd`) could reach Share with Frost never having been asked.
  Fixed by gating on OBSERVABLE state instead of the `gacFrostPending` flag
  (the trap Scott called out: on this exact path the revenge check itself
  never ran, so the flag was never set) — new `gacFrostRevengeOutstanding()`
  checks for a dead, unresolved Frost directly. `gacResolveWin()` now returns
  a new `"frostpending"` sentinel (parallel to the existing `"coinpending"`)
  whenever a decisive result coincides with that, and a new `gacWinIsFinal(w)`
  helper (`!!w && w !== "coinpending" && w !== "frostpending"`) replaced
  every hand-rolled `w !== "coinpending"` check across the file (9 call
  sites: `onGacShareResults`'s gameOver check, `gacBroadcastDaySummary`'s
  win/gameEnded/routeToSamAtEnd computation, `gacShareResults`,
  `gacShowWinIfAny` — plus a new explicit no-op branch there for
  `"frostpending"` so it doesn't fall through to the generic "Game over"
  label — `gacUpdateTrackControls`'s Share-button gate, and the diagnostic
  chars table's Winner/Loser badges). Also added a defensive re-check inside
  the host's own Share Results click handler. This makes the fix self-
  reinforcing: while Frost is outstanding, `gameEnded`/`routeToSamAtEnd` are
  false, so results fall through to the NORMAL (ungated, non-final) reveal
  path instead of the game-end gate — which, combined with the existing
  `!gacPendingShareSummary` immediate-fire guard, means Frost's prompt fires
  as soon as results genuinely reach the table, exactly once, via the same
  single mechanism regardless of whether the game happens to be ending.
  Confirmed with Scott that "before results are revealed" means the WHOLE
  TABLE, not just the gated recipient holding them — the broader interpretation
  from 2026-09-23 was correct and stays; this closes the new hole without
  narrowing that. Verified: syntax + module + div-balance checks on all
  files, `node test/gac-sim/run.mjs` (0 violations — no `gac-engine.js`
  changes this round, run as a sanity check anyway given the scope).
- **[shipped 2026-09-26]** Mrs. Claus self-save block had no explanation on
  the phone (Sam's phone in Sam-inputs mode, or her own phone in player-
  choices mode) — only the Yes button going grey, no reason, while the host's
  own inline screen already explained it. Root cause, found while fixing:
  `gacBuildPhonePrompt` was setting `prompt.note` correctly, but
  `renderGacPrompt` (`multiplayer-ui.js`) never actually rendered `p.note` at
  all — it only exists in `showSamNarration`'s unrelated narration-beat
  renderer. Added the missing render to `renderGacPrompt` (generic, so it
  also surfaces Krampus's pre-existing "You will tap their shoulder…" note,
  which was silently swallowed the same way) and set the same wording the
  host shows ("Mrs. Claus can't save herself.") for the self-save case.
- **[shipped 2026-09-26]** Scrooge button scope: confirmed with Scott — when
  a non-host Sam is running, the host tracker's copy is now suppressed
  (`gacUpdateScroogeButton` checks `gacSamOnPhone()`); it still shows on the
  host tracker when there's no separate Sam. Also made it persistently
  visible on Sam's phone during the day per Scott's answer, and added
  `body.mpHasScroogeFloat .mpLayer{padding-bottom:150px}` so a long button
  list (Jack Frost's revenge — every living player) doesn't end up with its
  last rows hidden under the floating panel — **still needs Scott's real-
  device check per his item 5**, this was a code-level guess at enough
  clearance, not a measured one.

## Open items

1. **[done 2026-09-20]** Host screen flipped to the setup/character screen
   during the Bad Santa night-start prompt. Root cause: the four callers
   that advance to a new/restarted night (`onGacSamDay`'s `"nextNight"`,
   the moon button, `#gacRestartNight`, `#gacNextNight`) all hid the
   tracker *before* calling `gacStartNight` — if the Bad Santa gate then
   returned early (waiting on the check), the tracker was already gone and
   the narrator hadn't been shown yet, exposing the setup screen
   underneath. Fixed by moving the tracker-hide out of all four callers
   and into `gacStartNight` itself, right before the narrator screen is
   shown (i.e., only once the gate has resolved or didn't need to fire) —
   the tracker now stays up as the holding screen through any pause, for
   both narrator configs, with zero change to the gate's resume/`finally`
   logic.
2. **[done 2026-09-20]** Finishing a GAC game and starting an ONBC
   game leaves the player who was Sam the Snowman stuck on the previous
   game's screen (their cheat sheet still updates — only the main screen is
   frozen). Root cause confirmed: the `game_switch` message handler
   (`multiplayer-ui.js:2290-2293`) never resets Sam-specific client state
   (`samDayControls`/`samDayResults`/`samSetupState`/`samRunningBeat`) — the
   only places that ever clear it (`gacSleepScreen`, `showSamNarration`) are
   GAC-internal transitions that never fire on a cross-game switch. With
   `samDayControls` still truthy, every vote-related message handler
   (`vote_open`/`vote_countdown`/`vote_results`/etc. — shared with ONBC) is
   gated behind `if (!!samDayControls) return;` and silently drops, while
   the ungated `roles` handler keeps updating the cheat sheet normally —
   exactly matching the reported symptom. Fix: extract the reset block
   (currently duplicated identically in `gacSleepScreen`/`showSamNarration`)
   into one shared `gacResetSamState()`, call it from those two sites plus
   the `game_switch` handler, and show a neutral `waiting()` screen
   immediately after so the affected client isn't left blank until the next
   incoming message. ONBC-safe by construction — these variables are never
   set by any ONBC code path, so clearing an already-null value on switch
   changes nothing for an ONBC-only session.
3. **[done 2026-09-22, wording pending]** Bad Santa / Scrooge rule-break
   eliminations are no longer silent. `gacApplyBrokenRule(name, opts)` now
   ALWAYS sends a targeted `{eliminatedNow:true}` message to the eliminated
   player, raising their standing "eliminated" banner without touching
   anyone else's screen. For the two PUBLIC announcements: Bad Santa's
   (fires at night start, `{nightStart:true}`) is a narrated line-beat
   unshifted onto the front of that night's `gacSteps` (before "EVERYONE,
   go to sleep") via `gacPendingNightAnnouncement` — reaches the host and a
   non-host Sam for free through the existing narration/mirroring pipeline.
   Scrooge's (fires during the actual day) went through two designs — first
   `payload.ruleBreakAnnouncement` riding the day-summary broadcast, revised
   after a playtest showed that broadcast's distribution-gating and
   full-screen rebuild are wrong for a mid-day event (see the "Eliminating
   Scrooge" entry above) — now its own unconditional broadcast,
   `gacBroadcastRuleBreakAnnouncement()` (`multiplayer.js`) → `gac_rule_break`
   → a transient top-pinned toast (`mpShowRuleBreakBanner`,
   `multiplayer-ui.js`) that never rebuilds `wrap`, so it can't interrupt a
   vote or discussion. Export chain verified end to end (export in
   `multiplayer.js`, import+re-export in `multiplayer-ui.js`, import+usage
   in `index.html`) — ONBC never sends this message type.
   - **Still pending:** Scott is choosing the final wording for both
     announcement strings (currently placeholder text in the code, clearly
     marked). Both are one-line string edits once decided.
   - **Follow-up, don't forget:** the Bad Santa announcement line has no
     pre-recorded audio clip (`gacAudioFor` only matches fixed, pre-recorded
     strings) — under "Game Narrates" it shows as text but is NOT spoken
     (confirmed silent no-op, not an error). Record + map an audio clip for
     the Bad Santa elimination announcement if it should be spoken aloud —
     do this alongside the wording decision above, once wording is final.
4. Day-results screen: host + other-player screens should match the
   Sam-screen look (the one Scott likes) — the bigger renderer-unification
   (below) is still queued. **[centering done 2026-09-20]** the host's day
   screen not being centered is fixed: added a targeted `#gacTrackResult{text-align:center}`
   rule (kept separate from the pre-existing shared `#gacSetupWarn,
   #gacTrackResult{...}` rule, so the setup-warning screen's own alignment
   is untouched). Centering cause was: `.mpWrap` (the player/Sam
   container, `multiplayer-ui.js:68`) is
   `max-width:520px;margin:0 auto;text-align:center`; the host's
   `#gacTrackResult` (`index.html:713`) was `max-width:680px;margin:10px
   auto` — centered as a block, but missing `text-align:center` entirely.
   The full "match the Sam-screen look" (not just centering) still needs
   the renderer-unification in item 5 below.
5. End-game after Sam shares results: host screen looks worse than
   players' — make "You Win"/"You Lose", the "Team Wins!" area, and the
   Results header match the player screens; center the Results header.
   This is the host-vs-player renderer drift again (see CLAUDE.md/session
   history — `gacRenderTrackResult`/`gacShowWinIfAny` vs `appendResultLines`)
   — prefer routing the host through the player renderer over patching
   another hand-built copy. Same underlying fix as item 4 above (both are
   the host's hand-built HTML vs. the shared `appendResultLines`) — worth
   doing together. Needs: (a) a working view still for a pure-narrator host
   (not a player) — `appendResultLines` assumes a player-shaped payload
   (`s.win`/`me.won`), so this needs a small adapter, not a blind
   pass-through; (b) confirm ONBC untouched (shares `appendResultLines`,
   but the host-side reshaping is GAC-only code, doesn't touch ONBC's own
   call path).
   - **[investigated 2026-09-23, root causes confirmed, not built yet —
     Scott wants to see the approach first]**
     - **The doubled "results are with X, waiting to be revealed" message**:
       confirmed two independent hand-built copies of the exact same string,
       rendered into two different elements that both stay on screen at once.
       `gacRenderTrackerResultArea()` (`index.html`) writes it into
       `#gacTrackResult` as plain text whenever `gacPendingShareSummary` is
       gated away from the host. Separately, `gacShowWinIfAny()` writes the
       SAME string into `#gacTrackWin` as a boxed `.win` div, specifically
       once the game has ended AND results are still gated to Sam — which
       can both be true at once (a game-ending night, results gated),
       producing the visible double-render Scott saw.
     - **The garbage-box emoji**: `#gacTrackResult`/`.win`/etc. inherit the
       custom decorative `"NitemareFont"` (`Fonts/Nitemare.ttf`), applied
       broadly across the host UI's CSS (starting from `body`). Display
       fonts like this typically don't carry emoji glyphs, and the browser
       won't fall through the font stack once a font claims a codepoint (even
       with a blank/placeholder glyph) — this matches Scott's own diagnosis.
       The player/Sam side (`multiplayer-ui.js`'s `.mpSub`/`.mpGacResult`
       etc.) doesn't use NitemareFont, which is why the exact same emoji
       render fine there.
     - **The adapter need, confirmed structurally, not just payload-shape**:
       `appendResultLines(wrap, s)` also reads `myName` from its ENCLOSING
       closure (inside `startPlayerClient`), not just from its `s`/`wrap`
       parameters — so it can't be called as-is from `index.html`. Proposed:
       add `myName` as an explicit third parameter (defaulting call sites
       inside `multiplayer-ui.js` to the existing closure variable, so
       nothing changes for players/Sam), export the function, and have the
       host build a small adapter object (`{ win, players: [...], swaps,
       afterVote, votedOut, deaths, ... }` shaped like what `appendResultLines`
       already expects, using `gacGame`/`gacLastNightReport`/etc.) and pass
       `settings.mpHostName` (or `null` for a pure narrator) as `myName`.
       Both `gacRenderTrackResult` and `gacShowWinIfAny`'s text-generation
       would route through this shared call; `gacRenderTrackList`'s
       tap-to-toggle roster and the Sam Settings button are separate DOM
       sections, untouched by this — the host keeps both host-only
       affordances exactly as today.
     - Fixing the double-render and font issues piecemeal (patch each hand-
       built copy separately) is possible but would leave a third
       independent copy for future results-related text to drift from — the
       renderer-unification above still seems the better fix given how many
       times this exact "hand-copied on the host, correct on the phone"
       pattern has bitten this project already (Scrooge button, the day-
       results centering, now this). Scott asked to see the approach before
       it's built — this is that proposal, not yet implemented.
6. Scrooge confirmation: change the button-relabel "tap to confirm" flow
   into a Yes/No popup. Apply to BOTH the host tracker's Scrooge button and
   Sam's-phone Scrooge button, reading from the same shared `GAC_SCROOGE_SPEC`
   so the two can't drift from each other.
7. **[bug, found 2026-09-22, not fixed]** The host's own `#gacStartVote`
   candidate list (`index.html`, `startHostVoting({... candidates:
   gacGame.players.filter(p => p.alive).map(...) })`) doesn't exclude Sam —
   CLAUDE.md is explicit that Sam is never a vote candidate. The Sam-driven
   `"startVote"` handler (`onGacSamDay`) builds its own candidate list
   correctly (`p.alive && p.roleId !== "Sam"`). The host's own version is
   the one that's wrong. Confirmed by reading both side by side; not fixed
   this pass — logged separately per Scott's instruction.
8. **[HELD — its own project, not scoped yet]** Reword "killing" to
   "robbing their house" game-wide: Belsnickel, Grinches, Krampus, Mrs.
   Claus's save, Jack Frost, manual host adjustments, spoken narration, the
   simple/smart logs, and the narration audio clips. Needs the full replacement
   vocabulary decided FIRST (what "eliminated"/"killed"/"attacked" each
   become) before any sweep — don't start editing text until that's settled.
