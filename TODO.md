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
3. **[done 2026-09-20, wording pending]** Bad Santa / Scrooge rule-break
   eliminations are no longer silent. `gacApplyBrokenRule(name, opts)` now
   takes `{nightStart:true}` (used only by the Bad Santa night-start gate):
   skips the day-summary broadcast (which was wrongly yanking every other
   player's phone, and a remote Sam's screen, into a "Day N — Results" view
   mid-night — a real bug found while investigating this, now fixed
   regardless of the announcement feature) and instead sends a targeted
   `{eliminatedNow:true}` message to Bad Santa alone, which raises his
   standing "eliminated" banner without touching anyone else's screen. The
   table announcement is a normal narrated line-beat, unshifted onto the
   front of that night's `gacSteps` (before "EVERYONE, go to sleep") via a
   new `gacPendingNightAnnouncement` — reaches the host and a non-host Sam
   for free through the existing narration/mirroring pipeline. Scrooge's
   elimination (genuinely daytime, no mid-night side effect) keeps the
   normal day-summary broadcast, now additionally carrying
   `payload.ruleBreakAnnouncement`, rendered as a distinct line in
   `appendResultLines` (confirmed purely additive for ONBC — that field is
   only ever set by `gacBroadcastDaySummary`, a GAC-only function; ONBC's
   own vote-results payload comes from a completely different, untouched
   function, `multiplayer.js`'s `tally()`).
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
6. Scrooge confirmation: change the button-relabel "tap to confirm" flow
   into a Yes/No popup. Apply to BOTH the host tracker's Scrooge button and
   Sam's-phone Scrooge button, reading from the same shared `GAC_SCROOGE_SPEC`
   so the two can't drift from each other.
7. **[HELD — its own project, not scoped yet]** Reword "killing" to
   "robbing their house" game-wide: Belsnickel, Grinches, Krampus, Mrs.
   Claus's save, Jack Frost, manual host adjustments, spoken narration, the
   simple/smart logs, and the narration audio clips. Needs the full replacement
   vocabulary decided FIRST (what "eliminated"/"killed"/"attacked" each
   become) before any sweep — don't start editing text until that's settled.
