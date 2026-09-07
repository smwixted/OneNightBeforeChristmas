// Research tool, NOT part of the regression harness (run.mjs) -- answers a
// one-off design question: "when a Grinch/Christmas parity or near-parity
// state occurs, how many players are typically still alive?" This matters
// for sizing a future "does a Christmas-winning line still exist" reachability
// checker (a worst-case-for-Christmas search over remaining roles/powers) --
// the board size at that moment bounds how expensive that search can be.
//
// This does NOT change gac-engine.js or any win-condition logic. It just
// drives the real engine with the same seeded policy as the main harness and
// records board size at every point the two teams are close in number.
//
// Run: node test/gac-sim/analyze-endgames.mjs
import { makeGame, resolveNight, checkWin, living, eliminate } from "../../gac-engine.js";
import { generateGame, PLAYER_COUNTS } from "./gameGen.mjs";
import { decideNight } from "./policy.mjs";
import { makeRng, pick, chance } from "./rng.mjs";

const MAX_NIGHTS = 40;
const MATRIX_BASE_SEED = 1000;
const RANDOM_BASE_SEED = 5_000_000;
const RANDOM_BATCH_SIZE = 5000;

function buildMatrixConfigs() {
  const configs = [];
  let idx = 0;
  for (const playerCount of PLAYER_COUNTS) {
    for (const winMode of ["majority", "total"]) {
      for (const grinchBasicCount of [1, 2, 3]) {
        for (const includeBadSanta of [false, true]) {
          for (const includeKrampus of [false, true]) {
            configs.push({ seed: MATRIX_BASE_SEED + idx, opts: { playerCount, winMode, grinchBasicCount, includeBadSanta, includeKrampus } });
            idx++;
          }
        }
      }
    }
  }
  return configs;
}

// Counts living() the same way checkWin does: grinches vs "others" (everyone
// else alive, minus Burgermeister since he isn't opposition either team).
function counts(game) {
  const live = living(game);
  const grinches = live.filter(p => p.team === "grinch").length;
  const others = live.filter(p => p.team !== "grinch" && p.roleId !== "Burger").length;
  return { livingTotal: live.length, grinches, others };
}

// Runs one game, recording a snapshot at every checkWin evaluation point
// (after each night, and after each synthetic day-vote) where the board is
// still contested (both sides > 0) and the gap between grinches and others
// is small.
function simulateWithSnapshots(rng, config) {
  const game = makeGame({ selectedCardIds: config.selectedCardIds, players: config.players, settings: config.settings });
  const snapshots = []; // { livingTotal, grinches, others, gap, exact, phase }
  let firstNearParitySeen = null;

  const record = phase => {
    const c = counts(game);
    if (c.grinches > 0 && c.others > 0) {
      const gap = Math.abs(c.grinches - c.others);
      if (gap <= 1) {
        const snap = { ...c, gap, exact: gap === 0, phase, winMode: config.winMode };
        snapshots.push(snap);
        if (!firstNearParitySeen) firstNearParitySeen = snap;
      }
    }
  };

  for (let n = 1; n <= MAX_NIGHTS; n++) {
    game.nightNumber = n;
    resolveNight(game, decideNight(rng, game));
    record("afterNight");
    if (checkWin(game, { afterVote: false })) break;

    const alive = living(game);
    if (alive.length > 0 && chance(rng, 0.7)) {
      eliminate(game, pick(rng, alive).id, "vote");
    }
    record("afterVote");
    if (checkWin(game, { afterVote: true })) break;
  }

  return { snapshots, firstNearParitySeen };
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[idx];
}

function summarize(label, values) {
  if (!values.length) {
    console.log(`${label}: no data`);
    return;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = (sum / sorted.length).toFixed(2);
  console.log(
    `${label}: n=${sorted.length}  min=${sorted[0]}  p25=${percentile(sorted, 0.25)}  median=${percentile(sorted, 0.5)}  mean=${mean}  p75=${percentile(sorted, 0.75)}  p90=${percentile(sorted, 0.9)}  max=${sorted[sorted.length - 1]}`
  );
  const hist = new Map();
  for (const v of sorted) hist.set(v, (hist.get(v) || 0) + 1);
  const histStr = [...hist.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([k, c]) => `${k}:${c}`)
    .join(", ");
  console.log(`  histogram (livingTotal:count) -> ${histStr}`);
}

function main() {
  const matrixConfigs = buildMatrixConfigs();
  const allRuns = [];

  for (const { seed, opts } of matrixConfigs) {
    const rng = makeRng(seed);
    const config = generateGame(rng, opts);
    allRuns.push({ seed, config, ...simulateWithSnapshots(rng, config) });
  }
  for (let i = 0; i < RANDOM_BATCH_SIZE; i++) {
    const seed = RANDOM_BASE_SEED + i;
    const rng = makeRng(seed);
    const config = generateGame(rng);
    allRuns.push({ seed, config, ...simulateWithSnapshots(rng, config) });
  }

  const totalGames = allRuns.length;
  const gamesReachingNearParity = allRuns.filter(r => r.firstNearParitySeen).length;
  const gamesReachingExactParity = allRuns.filter(r => r.snapshots.some(s => s.exact)).length;

  console.log(`Total games simulated: ${totalGames}`);
  console.log(`Games that ever reach near-parity (|grinches-others|<=1, both>0): ${gamesReachingNearParity} (${((gamesReachingNearParity / totalGames) * 100).toFixed(1)}%)`);
  console.log(`Games that ever reach EXACT parity (grinches===others): ${gamesReachingExactParity} (${((gamesReachingExactParity / totalGames) * 100).toFixed(1)}%)`);
  console.log("");

  // (A) First time each game gets near/at parity -- one data point per game.
  const firstNearParityTotals = allRuns.filter(r => r.firstNearParitySeen).map(r => r.firstNearParitySeen.livingTotal);
  const firstExactParityTotals = allRuns
    .map(r => r.snapshots.find(s => s.exact))
    .filter(Boolean)
    .map(s => s.livingTotal);

  console.log("=== A) Board size (living total) at the FIRST near-or-exact-parity moment per game ===");
  summarize("living total", firstNearParityTotals);
  console.log("");
  console.log("=== A2) Board size at the FIRST EXACT-parity moment per game (subset of the above) ===");
  summarize("living total", firstExactParityTotals);
  console.log("");

  // (B) Every qualifying snapshot across all games (a game can hover near
  // parity for several nights -- this is the fuller picture).
  const allNearParityTotals = allRuns.flatMap(r => r.snapshots.map(s => s.livingTotal));
  const allExactParityTotals = allRuns.flatMap(r => r.snapshots.filter(s => s.exact).map(s => s.livingTotal));

  console.log("=== B) Board size at EVERY near-or-exact-parity check point (all games, all qualifying moments) ===");
  summarize("living total", allNearParityTotals);
  console.log("");
  console.log("=== B2) Board size at EVERY EXACT-parity check point ===");
  summarize("living total", allExactParityTotals);
  console.log("");

  // Split by win mode, since total-mode games keep playing PAST parity (more
  // snapshots, and possibly different sizes) while majority-mode games stop
  // soon after.
  for (const mode of ["majority", "total"]) {
    const modeRuns = allRuns.filter(r => r.config.winMode === mode);
    const modeFirst = modeRuns.filter(r => r.firstNearParitySeen).map(r => r.firstNearParitySeen.livingTotal);
    console.log(`=== First near-parity board size, ${mode} mode only (n games=${modeRuns.length}) ===`);
    summarize("living total", modeFirst);
    console.log("");
  }
}

main();
