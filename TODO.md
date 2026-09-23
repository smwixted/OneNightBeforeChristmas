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
