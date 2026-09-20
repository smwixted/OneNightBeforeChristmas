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
2. Day-results screen: host + other-player screens should match the
   Sam-screen look (the one Scott likes); the host's day screen isn't
   centered.
3. End-game after Sam shares results: host screen looks worse than
   players' — make "You Win"/"You Lose", the "Team Wins!" area, and the
   Results header match the player screens; center the Results header.
   This is the host-vs-player renderer drift again (see CLAUDE.md/session
   history — `gacRenderTrackResult`/`gacShowWinIfAny` vs `appendResultLines`)
   — prefer routing the host through the player renderer over patching
   another hand-built copy.
4. Scrooge confirmation: change the button-relabel "tap to confirm" flow
   into a Yes/No popup. Apply to BOTH the host tracker's Scrooge button and
   Sam's-phone Scrooge button, reading from the same shared `GAC_SCROOGE_SPEC`
   so the two can't drift from each other.
5. **[HELD — its own project, not scoped yet]** Reword "killing" to
   "robbing their house" game-wide: Belsnickel, Grinches, Krampus, Mrs.
   Claus's save, Jack Frost, manual host adjustments, spoken narration, the
   simple/smart logs, and the narration audio clips. Needs the full replacement
   vocabulary decided FIRST (what "eliminated"/"killed"/"attacked" each
   become) before any sweep — don't start editing text until that's settled.
