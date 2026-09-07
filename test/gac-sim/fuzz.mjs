// Robustness pass, separate from the manual-compliance tracks above: feeds
// resolveNight() deliberately malformed / stale decisions (dead actors, dead
// targets, nonexistent ids, wrong-shaped arrays, self-targets) across many
// random rosters. This isn't about matching the manual -- it's about the
// engine never throwing and never producing an impossible state when a
// glitchy client (or the known actor-alive-check gaps in TEST_REPORT.md)
// hands it garbage.
import { makeGame, resolveNight, checkWin, living, eliminate } from "../../gac-engine.js";
import { generateGame } from "./gameGen.mjs";
import { checkStateInvariants } from "./assertions.mjs";
import { pick, chance } from "./rng.mjs";

const FUZZ_NIGHTS = 8;

function anyId(rng, game) {
  return pick(rng, game.players).id;
}
function deadId(game) {
  const dead = game.players.filter(p => !p.alive);
  return dead.length ? dead[0].id : null;
}
function garbageTarget(rng, game, key) {
  const roll = rng();
  if (roll < 0.15) return "ghost-" + key; // nonexistent id
  if (roll < 0.3) return ""; // empty string
  if (roll < 0.45) {
    const d = deadId(game);
    if (d) return d;
  }
  return anyId(rng, game);
}

function garbageDecisions(rng, game) {
  const decisions = {};
  if (chance(rng, 0.5)) decisions.protect = garbageTarget(rng, game, "protect");
  if (chance(rng, 0.6)) decisions.grinchKill = garbageTarget(rng, game, "grinchKill");
  if (chance(rng, 0.3)) decisions.krampusConvert = chance(rng, 0.5);
  if (chance(rng, 0.3)) decisions.mrsSave = garbageTarget(rng, game, "mrsSave");
  if (chance(rng, 0.3)) decisions.mrsPoison = garbageTarget(rng, game, "mrsPoison");
  if (chance(rng, 0.3)) decisions.santaInspect = garbageTarget(rng, game, "santaInspect");
  if (chance(rng, 0.3)) decisions.belsnickelKill = garbageTarget(rng, game, "belsnickelKill");
  if (chance(rng, 0.2)) {
    // Sometimes a real pair, sometimes degenerate (same id twice / one ghost).
    const a = anyId(rng, game);
    const b = chance(rng, 0.5) ? a : garbageTarget(rng, game, "buddyB");
    decisions.buddySwap = [a, b];
  }
  if (game.nightNumber === 1 && chance(rng, 0.2)) {
    const a = anyId(rng, game);
    const b = chance(rng, 0.5) ? a : garbageTarget(rng, game, "cupidB");
    decisions.cupidLink = [a, b];
  }
  if (game.nightNumber === 1 && chance(rng, 0.2)) {
    decisions.wetSteal = chance(rng, 0.5) ? "center" : garbageTarget(rng, game, "wetSteal");
  }
  return decisions;
}

// Structural sanity that has nothing to do with "did this match the manual"
// -- just "is the resulting state even coherent."
function checkStructuralSanity(game) {
  const problems = [];
  const seenDeathIds = new Set();
  for (const entry of game.log) {
    if (entry.type === "death") {
      if (seenDeathIds.has(entry.playerId)) {
        problems.push(`Duplicate death log entry for playerId=${entry.playerId}.`);
      }
      seenDeathIds.add(entry.playerId);
    }
  }
  for (const p of game.players) {
    if (typeof p.alive !== "boolean") problems.push(`${p.name}.alive is not a boolean.`);
    if (p.shieldCount < 0) problems.push(`${p.name} has negative shieldCount.`);
  }
  return problems;
}

export function runFuzz(masterRng, iterations = 300) {
  const results = { iterations, crashes: [], violations: [] };

  for (let i = 0; i < iterations; i++) {
    const seed = Math.floor(masterRng() * 2 ** 31);
    const rng = (() => {
      // local seeded stream per iteration, independent of masterRng draws
      // after this point, so this iteration is replayable from `seed` alone
      let a = seed >>> 0;
      return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    })();

    const config = generateGame(rng);
    const game = makeGame({
      selectedCardIds: config.selectedCardIds,
      players: config.players,
      settings: config.settings,
    });

    try {
      for (let n = 1; n <= FUZZ_NIGHTS; n++) {
        game.nightNumber = n;
        const decisions = garbageDecisions(rng, game);
        resolveNight(game, decisions);

        const problems = [...checkStateInvariants(game), ...checkStructuralSanity(game)];
        if (problems.length) {
          results.violations.push({ seed, night: n, problems });
        }

        checkWin(game, { afterVote: false });
        const alive = living(game);
        if (alive.length && chance(rng, 0.5)) {
          eliminate(game, pick(rng, alive).id, "vote");
        }
        checkWin(game, { afterVote: true });
      }
    } catch (err) {
      results.crashes.push({ seed, message: err && err.message, stack: err && err.stack });
    }
  }

  return results;
}
