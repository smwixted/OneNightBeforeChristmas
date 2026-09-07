// Entry point. Run with:
//   node test/gac-sim/run.mjs
// Replay one exact failing case (seed printed by a run, plus its opts JSON
// if it came from the coverage matrix -- both are printed together):
//   node test/gac-sim/run.mjs --replay <seed> [--opts '<json>']
//
// This never modifies gac-engine.js / gac-roles.js / gac-script.js. It only
// reports. See TEST_REPORT.md (rewritten by every run) for the full write-up.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { makeRng } from "./rng.mjs";
import { generateGame, PLAYER_COUNTS } from "./gameGen.mjs";
import { simulateGame } from "./sim.mjs";
import { runScenarios, runFindings, runGrinchWinReachabilityScenarios } from "./scenarios.mjs";
import { runFuzz } from "./fuzz.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");
const REPORT_PATH = path.join(REPO_ROOT, "TEST_REPORT.md");

const MATRIX_BASE_SEED = 1000;
const RANDOM_BASE_SEED = 5_000_000;
const RANDOM_BATCH_SIZE = 2000;
const FUZZ_ITERATIONS = 300;

// ------------------------------------------------------------- replay mode

function tryReplay() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--replay");
  if (i === -1) return false;
  const seed = Number(args[i + 1]);
  const optsIdx = args.indexOf("--opts");
  const opts = optsIdx !== -1 ? JSON.parse(args[optsIdx + 1]) : {};

  const rng = makeRng(seed);
  const config = generateGame(rng, opts);
  const { game, trace } = simulateGame(rng, config);

  console.log(`Replay of seed=${seed} opts=${JSON.stringify(opts)}`);
  console.log(`Player count: ${config.playerCount}, win mode: ${config.winMode}`);
  console.log(`Selected cards: ${config.selectedCardIds.join(", ")}`);
  console.log(`Players: ${config.players.map(p => `${p.name}=${p.roleId}`).join(", ")}`);
  console.log("");
  console.log("Night-by-night (night resolution, then the synthetic day stand-in -- see TEST_REPORT.md 'Known gap'):");
  const voteByNight = new Map(trace.votes.map(v => [v.n, v.votedOut]));
  for (const night of trace.nights) {
    console.log(`  Night ${night.n}: decisions=${JSON.stringify(night.decisions)} deaths=${JSON.stringify(night.deaths)}`);
    if (voteByNight.has(night.n)) {
      const votedOut = voteByNight.get(night.n);
      console.log(`    Day ${night.n} (synthetic): votedOut=${votedOut ? votedOut : "(nobody)"}`);
    }
  }
  console.log("");
  console.log(`Winner: ${trace.stalemate ? "STALEMATE" : trace.winner}`);
  if (trace.violations.length) {
    console.log("");
    console.log("Violations:");
    trace.violations.forEach(v => console.log("  - " + v));
  }
  console.log("");
  console.log("Final game state:");
  console.log(JSON.stringify(game, null, 2));
  return true;
}

// ------------------------------------------------------------ matrix setup

function buildMatrixConfigs() {
  const configs = [];
  let idx = 0;
  for (const playerCount of PLAYER_COUNTS) {
    for (const winMode of ["majority", "total"]) {
      for (const grinchBasicCount of [1, 2, 3]) {
        for (const includeBadSanta of [false, true]) {
          for (const includeKrampus of [false, true]) {
            configs.push({
              seed: MATRIX_BASE_SEED + idx,
              opts: { playerCount, winMode, grinchBasicCount, includeBadSanta, includeKrampus },
            });
            idx++;
          }
        }
      }
    }
  }
  return configs;
}

function runOne(seed, opts) {
  const rng = makeRng(seed);
  const config = generateGame(rng, opts);
  const { trace } = simulateGame(rng, config);
  return { seed, opts, config, trace };
}

function aggregate(runs) {
  const summary = { total: runs.length, winners: {}, stalemates: [] };
  for (const r of runs) {
    const key = r.trace.stalemate ? "stalemate" : r.trace.winner;
    summary.winners[key] = (summary.winners[key] || 0) + 1;
    if (r.trace.stalemate) {
      summary.stalemates.push({ seed: r.seed, opts: r.opts, playerCount: r.config.playerCount, winMode: r.config.winMode });
    }
  }
  return summary;
}

function normalize(msg) {
  return msg.replace(/\d+/g, "N");
}

function groupViolations(runs) {
  const groups = new Map();
  for (const r of runs) {
    for (const msg of r.trace.violations) {
      const key = normalize(msg);
      if (!groups.has(key)) groups.set(key, { example: msg, count: 0, seeds: [] });
      const g = groups.get(key);
      g.count++;
      if (g.seeds.length < 5) {
        g.seeds.push({ seed: r.seed, opts: r.opts, playerCount: r.config.playerCount, winMode: r.config.winMode });
      }
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

// ------------------------------------------------------------- report text

function fmtSeedRef(s) {
  const optsStr = s.opts && Object.keys(s.opts).length ? ` --opts '${JSON.stringify(s.opts)}'` : "";
  return `\`node test/gac-sim/run.mjs --replay ${s.seed}${optsStr}\` (${s.playerCount} players, ${s.winMode})`;
}

function buildReportMarkdown({ summary, violationGroups, scenarioResults, findings, fuzzResults, matrixCount, randomCount }) {
  const lines = [];
  const now = new Date().toISOString();

  lines.push("# GAC Engine Test Report");
  lines.push("");
  lines.push(`_Auto-generated by \`node test/gac-sim/run.mjs\`. Re-run the harness to refresh this file -- don't hand-edit it. Last run: ${now}._`);
  lines.push("");
  lines.push("## Scope");
  lines.push("");
  lines.push("This harness drives `gac-engine.js` directly (pure state/logic, no DOM). It covers night resolution, role reassignment (Wet steal, Krampus convert), and win-checking.");
  lines.push("");
  lines.push("**Known gap -- not covered by this pass:** the day-vote pipeline, Charlie Brown's exact-tie death, Bad Santa/Scrooge self-elimination for breaking silence, and Jack Frost's revenge kill all live in `index.html` (DOM-coupled), not in `gac-engine.js`. \"Days\" in this harness are a synthetic stand-in (random elimination via the exported `eliminate()`, or no elimination) purely to advance state between nights so the afterVote-gated parity win gets exercised. This is a placeholder for driving state transitions, not a test of real day-vote/tie/self-elimination rules. A follow-up pass would need to either extract those functions from `index.html` into something DOM-free, or drive a headless DOM.");
  lines.push("");
  lines.push("## How to reproduce any result below");
  lines.push("");
  lines.push("Every Monte Carlo game is seeded. Copy the command shown next to a finding and run it -- it replays that exact game night-by-night and dumps the final state.");
  lines.push("");

  lines.push("## Monte Carlo summary");
  lines.push("");
  lines.push(`- Coverage matrix: ${matrixCount} games (every combination of player count ${PLAYER_COUNTS.join("/")}, win mode majority/total, 1-3 basic Grinch cards, Bad Santa in/out, Krampus in/out -- waking/special role subsets randomized per seed).`);
  lines.push(`- Random batch: ${randomCount} fully-random games.`);
  lines.push(`- Total: ${summary.total} games.`);
  lines.push("");
  lines.push("Outcome distribution:");
  lines.push("");
  for (const [k, v] of Object.entries(summary.winners)) {
    lines.push(`- ${k}: ${v} (${((v / summary.total) * 100).toFixed(1)}%)`);
  }
  lines.push("");
  if (summary.stalemates.length) {
    lines.push(`**${summary.stalemates.length} game(s) hit the 40-night stalemate cap without a winner.** This is more likely a harness artifact (the synthetic random day-elimination not applying enough pressure) than an engine bug, but worth a look if the count is large. Examples:`);
    lines.push("");
    summary.stalemates.slice(0, 5).forEach(s => lines.push(`- ${fmtSeedRef(s)}`));
  } else {
    lines.push("No stalemates -- every simulated game reached a winner within 40 nights.");
  }
  lines.push("");

  lines.push("## Rule-invariant violations found during Monte Carlo runs");
  lines.push("");
  if (!violationGroups.length) {
    lines.push("None. Every invariant checked (Sam excluded from living(), lovers share fate, once-per-game powers never double-fire, win results match the team counts that justify them, parity wins respect `gacChristmasHasPathToVictory` plus the lover-pair/Frost short-circuits, total-mode never ends early) held across all games above.");
  } else {
    lines.push(`${violationGroups.length} distinct issue(s):`);
    lines.push("");
    violationGroups.forEach((g, i) => {
      lines.push(`### V${i + 1}. ${g.example}`);
      lines.push("");
      lines.push(`Occurred ${g.count} time(s) across the runs above. Reproduce with:`);
      lines.push("");
      g.seeds.forEach(s => lines.push(`- ${fmtSeedRef(s)}`));
      lines.push("");
    });
  }
  lines.push("");

  lines.push("## Targeted scenarios (hand-built, exact expectations)");
  lines.push("");
  const passCount = scenarioResults.filter(s => s.pass).length;
  lines.push(`${passCount}/${scenarioResults.length} passed.`);
  lines.push("");
  for (const s of scenarioResults) {
    lines.push(`### ${s.id}. ${s.pass ? "PASS" : "FAIL"} -- ${s.title}`);
    lines.push("");
    lines.push(`- **Manual/spec reference:** ${s.manualRef}`);
    lines.push(`- **Result:** ${s.details}`);
    lines.push("");
  }

  lines.push("## Discrepancies found (for your judgment -- not changed)");
  lines.push("");
  lines.push("These are real, reproducible behaviors of `gac-engine.js` that either don't match the manual's plain-English wording, the manual doesn't address at all, or don't match the engine's own documentation. None of these have been changed -- sorted below into three buckets so you can go through them by kind.");
  lines.push("");

  const CATEGORY_INFO = {
    "code-bug": {
      heading: "Likely code bugs",
      blurb: "A real gap in gac-engine.js itself, independent of any rules question -- fixable without needing a ruling from you first.",
    },
    "stale-doc": {
      heading: "Likely stale doc/comment",
      blurb: "The running code is fine (or fine enough); a comment or another piece of code describing it is wrong or out of date.",
    },
    "ambiguous-rules": {
      heading: "Ambiguous -- needs your rules/design call",
      blurb: "Behavior that depends on an intent question only you can settle: is gac-engine.js meant to enforce every rule itself, or is index.html's UI the sole gatekeeper by design (with the engine trusting whatever it's handed)? Also includes places where the engine does something reasonable-sounding that the printed manual simply doesn't document.",
    },
  };

  for (const [cat, info] of Object.entries(CATEGORY_INFO)) {
    const items = findings.filter(f => f.category === cat);
    lines.push(`### ${info.heading}`);
    lines.push("");
    lines.push(`_${info.blurb}_`);
    lines.push("");
    if (!items.length) {
      lines.push("(none)");
      lines.push("");
      continue;
    }
    for (const f of items) {
      lines.push(`#### ${f.id}. ${f.title}`);
      lines.push("");
      lines.push(`- **Where:** ${f.codeRef}`);
      lines.push(`- **What happens:** ${f.detail}`);
      lines.push("");
    }
  }

  lines.push("## Fuzz / robustness pass");
  lines.push("");
  lines.push(`${fuzzResults.iterations} games fed deliberately malformed decisions each night (dead actors, dead/nonexistent targets, empty strings, degenerate pairs) for ${8} nights each.`);
  lines.push("");
  if (!fuzzResults.crashes.length) {
    lines.push("No crashes -- resolveNight()/checkWin() never threw on any malformed input tried.");
  } else {
    lines.push(`**${fuzzResults.crashes.length} crash(es):**`);
    lines.push("");
    fuzzResults.crashes.slice(0, 10).forEach(c => {
      lines.push(`- seed=${c.seed}: ${c.message}`);
    });
  }
  lines.push("");
  if (!fuzzResults.violations.length) {
    lines.push("No structural corruption (no duplicate death log entries, no negative shields, no non-boolean `alive`) found either.");
  } else {
    lines.push(`**${fuzzResults.violations.length} structural-sanity violation(s):**`);
    lines.push("");
    fuzzResults.violations.slice(0, 10).forEach(v => {
      lines.push(`- seed=${v.seed}, night=${v.night}: ${v.problems.join("; ")}`);
    });
  }
  lines.push("");

  return lines.join("\n");
}

// ------------------------------------------------------------------- main

function main() {
  if (tryReplay()) return;

  console.log("GAC engine test harness\n");

  const matrixConfigs = buildMatrixConfigs();
  const matrixRuns = matrixConfigs.map(({ seed, opts }) => runOne(seed, opts));

  const randomRuns = [];
  for (let i = 0; i < RANDOM_BATCH_SIZE; i++) {
    randomRuns.push(runOne(RANDOM_BASE_SEED + i, {}));
  }

  const allRuns = [...matrixRuns, ...randomRuns];
  const summary = aggregate(allRuns);
  const violationGroups = groupViolations(allRuns);

  const scenarioResults = [...runScenarios(), ...runGrinchWinReachabilityScenarios()];
  const findings = runFindings();

  const fuzzResults = runFuzz(makeRng(999999), FUZZ_ITERATIONS);

  console.log(`Monte Carlo: ${summary.total} games (${matrixRuns.length} matrix + ${randomRuns.length} random)`);
  console.log("Outcomes:", summary.winners);
  console.log(`Stalemates: ${summary.stalemates.length}`);
  console.log(`Rule-invariant violation groups: ${violationGroups.length}`);
  violationGroups.slice(0, 10).forEach(g => console.log(`  - (${g.count}x) ${g.example}`));
  console.log("");
  const passCount = scenarioResults.filter(s => s.pass).length;
  console.log(`Targeted scenarios: ${passCount}/${scenarioResults.length} passed`);
  scenarioResults.filter(s => !s.pass).forEach(s => console.log(`  FAIL ${s.id}: ${s.title}`));
  console.log("");
  console.log(`Findings (discrepancies to review): ${findings.length}`);
  findings.forEach(f => console.log(`  ${f.id}: ${f.title}`));
  console.log("");
  console.log(`Fuzz: ${fuzzResults.iterations} games, ${fuzzResults.crashes.length} crashes, ${fuzzResults.violations.length} structural violations`);
  console.log("");

  const md = buildReportMarkdown({
    summary,
    violationGroups,
    scenarioResults,
    findings,
    fuzzResults,
    matrixCount: matrixRuns.length,
    randomCount: randomRuns.length,
  });
  fs.writeFileSync(REPORT_PATH, md);
  console.log(`Wrote ${REPORT_PATH}`);
}

main();
