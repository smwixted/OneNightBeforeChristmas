// Builds one night's `decisions` object for resolveNight(), playing "by the
// manual." Several targeting rules (no self-protect, no repeat-protect two
// nights running, etc.) are enforced by index.html's candidate-list UI, NOT
// by gac-engine.js itself -- see TEST_REPORT.md "Known gap". This policy
// enforces them on the harness side so a Monte Carlo run is a fair test of
// "does the engine behave correctly given LEGAL input." Deliberately illegal
// input is fuzz.mjs's job, not this file's.
import { living } from "../../gac-engine.js";
import { pick, pickN, chance } from "./rng.mjs";

export function decideNight(rng, game) {
  const decisions = {};
  const alive = living(game);
  const aliveIds = alive.map(p => p.id);
  const find = roleId => alive.find(p => p.roleId === roleId);
  const night = game.nightNumber;

  if (night === 1) {
    const cupid = find("Cupid");
    if (cupid && aliveIds.length >= 2) {
      decisions.cupidLink = pickN(rng, aliveIds, 2);
    }

    const wet = find("Wet");
    if (wet) {
      const targets = alive.filter(p => p.id !== wet.id);
      const canStealCenter = game.centerCards && game.centerCards.length > 0;
      if (canStealCenter && (!targets.length || chance(rng, 0.5))) {
        decisions.wetSteal = "center";
      } else if (targets.length) {
        decisions.wetSteal = pick(rng, targets).id;
      }
    }
  }

  const shelf = find("Shelf");
  if (shelf) {
    // Manual: "never themselves," and "cannot protect the same player two
    // nights in a row." Neither is enforced inside resolveNight(), so the
    // policy enforces both here.
    const candidates = alive.filter(p => p.id !== shelf.id && p.lastProtectedNight !== night - 1);
    if (candidates.length) decisions.protect = pick(rng, candidates).id;
  }

  // Grinches MUST kill every night -- no decline option (CLAUDE.md). They
  // may target anyone living, including a teammate; mostly they won't.
  const grinches = alive.filter(p => p.team === "grinch");
  if (grinches.length) {
    const nonGrinch = alive.filter(p => p.team !== "grinch");
    const pool = nonGrinch.length && chance(rng, 0.85) ? nonGrinch : alive;
    decisions.grinchKill = pick(rng, pool).id;
  }

  const krampus = find("Krampus");
  if (krampus && krampus.powers.krampusConvert && decisions.grinchKill) {
    decisions.krampusConvert = chance(rng, 0.5);
  }

  const mrs = find("Mrs");
  if (mrs) {
    if (mrs.powers.mrsClausSave && chance(rng, 0.5)) {
      // Usually save the actual victim; sometimes "waste" it elsewhere to
      // exercise the never-in-danger branch.
      decisions.mrsSave = decisions.grinchKill && chance(rng, 0.7) ? decisions.grinchKill : pick(rng, aliveIds);
    }
    if (mrs.powers.mrsClausPoison && chance(rng, 0.35)) {
      const targets = alive.filter(p => p.id !== mrs.id);
      if (targets.length) decisions.mrsPoison = pick(rng, targets).id;
    }
  }

  const santa = find("Santa");
  if (santa && aliveIds.length) {
    decisions.santaInspect = pick(rng, aliveIds);
  }

  const bels = find("Belsnickel");
  if (bels) {
    const targets = alive.filter(p => p.id !== bels.id);
    if (targets.length) decisions.belsnickelKill = pick(rng, targets).id;
  }

  const buddy = find("Buddy");
  if (buddy && buddy.powers.buddySwap && aliveIds.length >= 2 && chance(rng, 0.3)) {
    decisions.buddySwap = pickN(rng, aliveIds, 2);
  }

  return decisions;
}
