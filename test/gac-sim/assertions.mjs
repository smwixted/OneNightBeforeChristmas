// The actual "does this match the manual/CLAUDE.md rules" checks. Split in
// two because they run at two different moments:
//   - checkStateInvariants(game): general sanity, run after every night (and
//     after the synthetic day-elimination) so a violation is pinned to the
//     exact night it first appeared.
//   - checkWinResult(game, winMode, result): run ONLY at the instant
//     checkWin() returns non-null, so `game` is the exact state the engine
//     based its decision on -- nothing has changed since.
import { living, gacChristmasHasPathToVictory } from "../../gac-engine.js";

export function checkStateInvariants(game) {
  const problems = [];
  const night = game.nightNumber;

  // Sam is the moderator, never a player -- living() must exclude them
  // unconditionally (gac-engine.js:156).
  if (living(game).some(p => p.roleId === "Sam")) {
    problems.push(`[night ${night}] Sam appeared in living() -- moderator must never count as a player.`);
  }

  for (const p of game.players) {
    if (p.shieldCount < 0) {
      problems.push(`[night ${night}] ${p.name} has negative shieldCount (${p.shieldCount}).`);
    }
    if (p.loverOf) {
      const lover = game.players.find(x => x.id === p.loverOf);
      // Manual: "if either lover dies -- by any means -- the other
      // immediately dies of a broken heart." They must always match.
      if (lover && p.alive !== lover.alive) {
        problems.push(`[night ${night}] Lover mismatch: ${p.name} alive=${p.alive}, lover ${lover.name} alive=${lover.alive}.`);
      }
    }
    if (p.converted && p.team !== "grinch") {
      problems.push(`[night ${night}] ${p.name} is marked converted but team is "${p.team}", expected "grinch".`);
    }
  }

  // Once-per-game powers must never succeed twice in one game.
  const successes = (power, result) => (game.events || []).filter(e => e.power === power && e.result === result).length;
  if (successes("Krampus", "converted") > 1) problems.push(`[night ${night}] Krampus converted more than once.`);
  if (successes("Mrs. Claus", "saved") > 1) problems.push(`[night ${night}] Mrs. Claus saved more than once.`);
  if (successes("Mrs. Claus", "poisoned") > 1) problems.push(`[night ${night}] Mrs. Claus poisoned more than once.`);
  const buddySwaps = (game.events || []).filter(e => e.power === "Buddy the Elf" && String(e.result || "").startsWith("swapped")).length;
  if (buddySwaps > 1) problems.push(`[night ${night}] Buddy swapped more than once.`);

  return problems;
}

export function checkWinResult(game, winMode, result) {
  const problems = [];
  const live = living(game);
  const grinches = live.filter(p => p.team === "grinch");
  // "others" excludes Burgermeister -- manual: he only wins if the Grinches
  // do, so he's not opposition for their victory condition.
  const others = live.filter(p => p.team !== "grinch" && p.roleId !== "Burger");

  if (result === "draw" && live.length !== 0) {
    problems.push(`"draw" declared with ${live.length} players still alive.`);
  }
  if (result === "lovers" && live.length !== 2) {
    problems.push(`"lovers" declared with ${live.length} alive (expected exactly 2).`);
  }
  if (result === "christmas" && !(grinches.length === 0 && others.length > 0)) {
    problems.push(`"christmas" declared with grinches=${grinches.length}, others=${others.length}.`);
  }
  if (result === "grinch") {
    const isTotalElim = others.length === 0;
    if (!(grinches.length > 0 && grinches.length >= others.length)) {
      problems.push(`"grinch" declared but grinches=${grinches.length}, others=${others.length}.`);
    }
    if (!isTotalElim) {
      if ((winMode || "majority") === "total") {
        problems.push(`"grinch" parity win granted in TOTAL-elimination mode (others=${others.length} > 0) -- manual says total mode plays to full elimination.`);
      } else {
        const anyCrossTeamLoverPairAlive = live.some(p => {
          if (!p.loverOf) return false;
          const partner = live.find(x => x.id === p.loverOf);
          return !!(partner && partner.team !== p.team);
        });
        const anyFrostAlive = live.some(p => p.roleId === "Frost");
        if (anyCrossTeamLoverPairAlive) {
          problems.push(`"grinch" parity win granted while a living cross-team lover pair still exists.`);
        } else if (anyFrostAlive) {
          problems.push(`"grinch" parity win granted while Frost is still alive.`);
        } else if (gacChristmasHasPathToVictory(game)) {
          problems.push(`"grinch" parity win granted while gacChristmasHasPathToVictory(game) is still true.`);
        }
      }
    }
  }
  return problems;
}
