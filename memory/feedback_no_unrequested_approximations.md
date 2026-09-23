---
name: feedback-no-unrequested-approximations
description: Don't add correctness-reducing shortcuts/restrictions to a rules/win-condition algorithm without being asked, even when they're individually justifiable
metadata:
  type: feedback
---

When implementing a rules-sensitive algorithm (win conditions, game-state
reachability, anything Scott called "delicate"), do NOT introduce
branch-reduction shortcuts, heuristic restrictions, or "provably safe"
approximations on your own initiative — even ones you can individually
justify as correctness-preserving. Implement exactly what was asked
(brute-force / fully unrestricted, if that's what was requested), benchmark
it for real, and only bring back specific proposed restrictions — one at a
time, for explicit approval — if the benchmark shows an actual problem.

**Why:** In the GAC Grinch-win-condition redesign (2026-09-05), I proposed a
reachability search with five "provably safe" branch-reduction shortcuts
(skip non-grinch targets for offensive powers, restrict protect to only the
grinch's current target, etc.) before writing any code, reasoning that tiny
board sizes plus these restrictions would keep it fast. Scott rejected this
in the plan-review step: he explicitly did not want approximations in a win
condition, gave a concrete example of exactly the edge case he didn't want
silently dropped (protecting someone else to set up `lastProtectedNight` for
a future round), and said correctness wins over speed for this calculation.
His process instead: implement fully unrestricted first, benchmark honestly,
and only revisit with specific proposed restrictions if the benchmark proves
a real problem — each restriction shown and approved individually, not
bundled.

**How to apply:** For any future win-condition / rules-engine / reachability
work in this project (or similar exactness-matters logic elsewhere): default
to the literal, unrestricted request. If you foresee a real performance or
scale problem, say so explicitly and flag your concern in the plan/diff
review step — but do not pre-empt it by quietly building in restrictions.
Benchmark first; optimize only after a demonstrated need, and negotiate each
optimization as its own approval step. See [[gac-project-overview]] if that
memory exists for broader project context.
