// Runs one game to completion by driving the REAL engine's night resolution
// and win-check, night after night. The "day" in between is a synthetic
// stand-in (random elimination, or none) -- the real day-vote logic (ties,
// Charlie Brown, Bad Santa/Scrooge self-elimination) lives in index.html,
// not gac-engine.js, and is out of scope for this pass (see TEST_REPORT.md
// "Known gap"). The stand-in exists only to advance state between nights so
// the afterVote-gated parity win actually gets exercised.
import { makeGame, resolveNight, checkWin, living, eliminate } from "../../gac-engine.js";
import { decideNight } from "./policy.mjs";
import { checkWinResult, checkStateInvariants } from "./assertions.mjs";
import { pick, chance } from "./rng.mjs";

const MAX_NIGHTS = 40;

export function simulateGame(rng, config) {
  const game = makeGame({
    selectedCardIds: config.selectedCardIds,
    players: config.players,
    settings: config.settings,
  });

  const trace = { nights: [], votes: [], winner: null, stalemate: false, violations: [] };
  const record = problems => {
    if (problems && problems.length) trace.violations.push(...problems);
  };

  for (let n = 1; n <= MAX_NIGHTS; n++) {
    game.nightNumber = n;
    const decisions = decideNight(rng, game);
    const report = resolveNight(game, decisions);
    trace.nights.push({ n, decisions, deaths: report.deaths.map(d => d.playerId) });
    record(checkStateInvariants(game));

    let result = checkWin(game, { afterVote: false });
    if (result) {
      record(checkWinResult(game, config.settings.gacWinMode, result));
      trace.winner = result;
      return { game, trace };
    }

    const alive = living(game);
    let votedOut = null;
    if (alive.length > 0 && chance(rng, 0.7)) {
      votedOut = pick(rng, alive).id;
      eliminate(game, votedOut, "vote");
      record(checkStateInvariants(game));
    }
    trace.votes.push({ n, votedOut });

    result = checkWin(game, { afterVote: true });
    if (result) {
      record(checkWinResult(game, config.settings.gacWinMode, result));
      trace.winner = result;
      return { game, trace };
    }
  }

  trace.stalemate = true;
  return { game, trace };
}
