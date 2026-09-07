// Hand-built, minimal, exact scenarios -- the same style CLAUDE.md describes
// for the Buddy/Krampus/Santa cases ("write a small Node .mjs that imports
// gac-engine.js and asserts the behavior"). Two kinds of result:
//
//   `scenarios` -- a known-correct expectation, pass/fail.
//   `findings`  -- no verdict. These demonstrate real engine behavior that
//                  doesn't match the manual's plain-English description, or
//                  that the manual doesn't address at all. Per instructions,
//                  this file only REPORTS them -- it never patches
//                  gac-engine.js. Whether each one is a bug or an accepted
//                  gap is Scott's call; see TEST_REPORT.md.
import { makeGame, resolveNight, checkWin, living, eliminate } from "../../gac-engine.js";

function mkGame(players, settings = {}) {
  return makeGame({ selectedCardIds: players.map(p => p.roleId), players, settings });
}
function byName(game, name) {
  return game.players.find(p => p.name === name);
}

// ---------------------------------------------------------------- scenarios

function scenarioElfBlocksKrampus() {
  const game = mkGame([
    { name: "Shelf", roleId: "Shelf" },
    { name: "Grinch", roleId: "Grinch1" },
    { name: "Krampus", roleId: "Krampus" },
    { name: "Victim", roleId: "Elf1" },
  ]);
  game.nightNumber = 1;
  const victim = byName(game, "Victim");
  resolveNight(game, { protect: victim.id, grinchKill: victim.id, krampusConvert: true });
  const krampus = byName(game, "Krampus");
  const failedEvent = (game.events || []).some(e => e.power === "Krampus" && e.result === "convert failed");
  const pass = victim.alive === true && krampus.powers.krampusConvert === false && failedEvent;
  return {
    id: "S1",
    title: "Elf protection blocks a Grinch kill AND makes a simultaneous Krampus convert attempt fail (power still spent)",
    manualRef: 'Elf on the Shelf: "That player cannot be killed that night." CLAUDE.md: Krampus "fails if the victim is protected/saved/shielded."',
    pass,
    details: `victim.alive=${victim.alive}, krampus convert power remaining=${krampus.powers.krampusConvert}, "convert failed" logged=${failedEvent}`,
  };
}

function scenarioMrsSaveWasted() {
  // Mrs. Claus's save is a yes/no on THIS victim (the Grinches' chosen
  // target), not a free pick -- see finding F7. To hit the "wasted" branch
  // for real, the victim has to already be safe some OTHER way (here, Elf
  // protection) when she offers the cookie.
  const game = mkGame([
    { name: "Shelf", roleId: "Shelf" },
    { name: "Grinch", roleId: "Grinch1" },
    { name: "Mrs", roleId: "Mrs" },
    { name: "Victim", roleId: "Elf1" },
  ]);
  game.nightNumber = 1;
  const victim = byName(game, "Victim");
  resolveNight(game, { protect: victim.id, grinchKill: victim.id, mrsSave: true });
  const mrs = byName(game, "Mrs");
  const wastedEvent = (game.events || []).some(e => e.power === "Mrs. Claus" && e.result === "save wasted");
  const pass = victim.alive === true && mrs.powers.mrsClausSave === false && wastedEvent;
  return {
    id: "S2",
    title: 'Offering the cookie to an already-protected victim is "wasted" -- the power is still spent',
    manualRef: "Mrs. Claus how-it-plays: her save is one-time, spent whether or not it was needed.",
    pass,
    details: `victim.alive=${victim.alive}, save power remaining=${mrs.powers.mrsClausSave}, "save wasted" logged=${wastedEvent}`,
  };
}

function scenarioYukonShieldTravelsWithCard() {
  const game = mkGame([
    { name: "Grinch", roleId: "Grinch1" },
    { name: "Yukon", roleId: "Yukon" },
    { name: "Wet", roleId: "Wet" },
  ]);
  // Simulate the Yukon card's shield having already been spent by an earlier
  // holder, by setting the persistent per-CARD flag directly. (Wet's steal is
  // now correctly night-1-only per the F5 fix, so "attack Yukon, THEN steal
  // the card" can no longer be sequenced across nights the way this scenario
  // used to -- that ordering isn't reachable in real play either, since
  // Wet's one steal opportunity is always night 1, before any attack. Setting
  // game.spentShields directly tests the same mechanic -- gacReassignRole
  // honoring an already-spent card -- without relying on an unreachable
  // sequence.)
  game.spentShields = { Yukon: true };
  game.nightNumber = 1;
  resolveNight(game, { wetSteal: byName(game, "Yukon").id });
  const wet = byName(game, "Wet");
  const pass = wet.roleId === "Yukon" && wet.shieldCount === 0;
  return {
    id: "S3",
    title: "A shield already spent by the Yukon card does not refresh when Wet Bandits steal that card",
    manualRef: "CLAUDE.md: shields belong to the CARD, and spent state travels with it (game.spentShields).",
    pass,
    details: `precondition spentShields.Yukon=true; after steal: newHolder.roleId=${wet.roleId}, newHolder.shieldCount=${wet.shieldCount}`,
  };
}

function scenarioOverkillAttribution() {
  const game = mkGame([
    { name: "Grinch", roleId: "Grinch1" },
    { name: "Belsnickel", roleId: "Belsnickel" },
    { name: "Victim", roleId: "Elf1" },
  ]);
  game.nightNumber = 1;
  const victim = byName(game, "Victim");
  const report = resolveNight(game, { grinchKill: victim.id, belsnickelKill: victim.id });
  const pass = report.deaths.length === 1 && report.deaths[0].source === "belsnickel";
  return {
    id: "S4",
    title: "A player targeted by both the Grinches and Belsnickel the same night dies exactly once, attributed to whichever source resolves last",
    manualRef: "Not stated in the manual (nobody expects to be targeted twice) -- documenting actual behavior.",
    pass,
    details: `deaths=${JSON.stringify(report.deaths)}. Not a bug: one death either way. Flagging only because if a "cause of death" is ever shown, it will say Belsnickel (step 5) and never mention the Grinches also chose them (step 2).`,
  };
}

function scenarioLoversWinBeatsParity() {
  const game = mkGame([
    { name: "Grinch", roleId: "Grinch1" },
    { name: "Lover", roleId: "Elf1" },
    { name: "Cupid", roleId: "Cupid" },
    { name: "Filler", roleId: "Elf2" },
  ]);
  game.nightNumber = 1;
  const grinch = byName(game, "Grinch");
  const lover = byName(game, "Lover");
  resolveNight(game, { cupidLink: [grinch.id, lover.id] });
  eliminate(game, byName(game, "Cupid").id, "test");
  eliminate(game, byName(game, "Filler").id, "test");
  // living now: Grinch + Lover -- cross-team lovers, which ALSO happens to be
  // exact 1v1 parity. Lovers must win the tie-break, not the Grinch team.
  const result = checkWin(game, { afterVote: true });
  const pass = result === "lovers";
  return {
    id: "S5",
    title: "Cross-team lovers left as the final two win as lovers, even when that board also satisfies the Grinch parity condition",
    manualRef: 'Manual: "if Cupid linked two players from opposite teams and those two are the last two alive, their love wins out over either team."',
    pass,
    details: `checkWin result=${result} (grinch=1, lover-team=christmas, so parity would also read as a Grinch win if lovers weren't checked first)`,
  };
}

function scenarioParityBlockedByBelsnickel() {
  function build(secondRole) {
    const game = mkGame([
      { name: "Grinch", roleId: "Grinch1" },
      { name: "Other", roleId: secondRole },
      { name: "Filler1", roleId: "Elf1" },
      { name: "Filler2", roleId: "Elf2" },
    ]);
    eliminate(game, byName(game, "Filler1").id, "test");
    eliminate(game, byName(game, "Filler2").id, "test");
    return game;
  }
  const blockedResult = checkWin(build("Belsnickel"), { afterVote: true });
  const openResult = checkWin(build("Elf3"), { afterVote: true });
  const pass = blockedResult === null && openResult === "grinch";
  return {
    id: "S6",
    title: "Grinch parity win is withheld while Christmas can still kill overnight (Belsnickel alive, unused), and granted once that's no longer true",
    manualRef: "gac-engine.js gacChristmasHasPathToVictory() -- see finding F8 for the manual-ambiguity writeup.",
    pass,
    details: `1 Grinch vs 1 Belsnickel (unused): result=${blockedResult}; 1 Grinch vs 1 plain Elf: result=${openResult}`,
  };
}

function scenarioSamNeverCountsAsPlayer() {
  const game = mkGame([
    { name: "SamPlayer", roleId: "Sam" }, // misuse -- CLAUDE.md says Sam is never dealt as a player
    { name: "Elf", roleId: "Elf1" },
  ]);
  const live = living(game);
  const pass = live.length === 1 && live[0].roleId === "Elf1";
  return {
    id: "S7",
    title: "living() excludes a player misdealt the Sam card, unconditionally",
    manualRef: "CLAUDE.md: \"living() EXCLUDES roleId === 'Sam'. Sam is the moderator, never a player.\"",
    pass,
    details: `living() length=${live.length}, contents=${live.map(p => p.roleId).join(",")}`,
  };
}

function scenarioMutualKillDraw() {
  const game = mkGame([
    { name: "Grinch", roleId: "Grinch1" },
    { name: "Belsnickel", roleId: "Belsnickel" },
  ]);
  game.nightNumber = 1;
  const grinch = byName(game, "Grinch");
  const bels = byName(game, "Belsnickel");
  resolveNight(game, { grinchKill: bels.id, belsnickelKill: grinch.id });
  const result = checkWin(game, { afterVote: false });
  const pass = result === "draw" && living(game).length === 0;
  return {
    id: "S8",
    title: "The last Grinch and the last Christmas defender killing each other the same night ends in a draw, not a hang",
    manualRef: "gac-engine.js comment: \"e.g. a Grinch and Belsnickel kill each other on the final night -> nobody wins.\"",
    pass,
    details: `checkWin result=${result}, living count=${living(game).length}`,
  };
}

function scenarioMrsPowerCannotDoubleUse() {
  const game = mkGame([
    { name: "Grinch", roleId: "Grinch1" },
    { name: "Mrs", roleId: "Mrs" },
    { name: "V1", roleId: "Elf1" },
    { name: "V2", roleId: "Elf2" },
  ]);
  game.nightNumber = 1;
  const v1 = byName(game, "V1");
  resolveNight(game, { grinchKill: v1.id, mrsSave: v1.id });
  const firstSaveWorked = v1.alive === true;

  game.nightNumber = 2;
  const v2 = byName(game, "V2");
  resolveNight(game, { grinchKill: v2.id, mrsSave: v2.id });
  const secondSaveIgnored = v2.alive === false;

  const mrs = byName(game, "Mrs");
  const pass = firstSaveWorked && secondSaveIgnored && mrs.powers.mrsClausSave === false;
  return {
    id: "S9",
    title: "Mrs. Claus's save cannot fire a second time once used, even across multiple nights",
    manualRef: "Manual: her save is a one-time power, once each all game.",
    pass,
    details: `night 1 save worked=${firstSaveWorked} (v1.alive=${v1.alive}), night 2 save ignored=${secondSaveIgnored} (v2.alive=${v2.alive})`,
  };
}

function scenarioKrampusVsShieldedYukon() {
  const game = mkGame([
    { name: "Grinch", roleId: "Grinch1" },
    { name: "Krampus", roleId: "Krampus" },
    { name: "Yukon", roleId: "Yukon" },
  ]);
  game.nightNumber = 1;
  const yukon = byName(game, "Yukon");
  resolveNight(game, { grinchKill: yukon.id, krampusConvert: true });
  const krampus = byName(game, "Krampus");
  const failedEvent = (game.events || []).some(e => e.power === "Krampus" && e.result === "convert failed");
  const pass = yukon.alive === true && yukon.team === "christmas" && yukon.shieldCount === 0 && krampus.powers.krampusConvert === false && failedEvent;
  return {
    id: "S14",
    title: "Krampus cannot convert a victim whose Yukon shield is about to absorb the attack -- the convert fails and the power is still spent",
    manualRef: "CLAUDE.md: Krampus \"fails if the victim is protected/saved/shielded.\"",
    pass,
    details: `yukon.alive=${yukon.alive}, yukon.team=${yukon.team}, yukon.shieldCount=${yukon.shieldCount}, krampus power remaining=${krampus.powers.krampusConvert}`,
  };
}

function scenarioBuddySwapMovesFateAndProtection() {
  const game = mkGame([
    { name: "Grinch", roleId: "Grinch1" },
    { name: "Shelf", roleId: "Shelf" },
    { name: "Buddy", roleId: "Buddy" },
    { name: "A", roleId: "Elf1" },
    { name: "B", roleId: "Elf2" },
  ]);
  game.nightNumber = 1;
  const A = byName(game, "A");
  const B = byName(game, "B");
  // Elf protects A; Grinches target B; Buddy swaps A and B -- both the
  // attack on B's seat and the protection on A's seat should travel.
  resolveNight(game, { protect: A.id, grinchKill: B.id, buddySwap: [A.id, B.id] });
  const pass = A.alive === false && B.alive === true;
  return {
    id: "S15",
    title: "Buddy's swap moves BOTH the incoming attack and the Elf's protection to the new seat, not the person",
    manualRef: 'Manual: "Any fate aimed at one of them that night -- a Grinch kill, a poison, anything -- follows the swap and lands on the other instead."',
    pass,
    details: `A (was protected, swapped into B's targeted-but-unprotected seat): alive=${A.alive} (expected false). B (was targeted, swapped into A's protected seat): alive=${B.alive} (expected true).`,
  };
}

function scenarioGrinchCanKillTeammate() {
  const game = mkGame([
    { name: "Grinch1", roleId: "Grinch1" },
    { name: "Grinch2", roleId: "Grinch2" },
  ]);
  game.nightNumber = 1;
  const target = byName(game, "Grinch2");
  resolveNight(game, { grinchKill: target.id });
  const pass = target.alive === false;
  return {
    id: "S16",
    title: "The Grinches can kill one of their own -- no built-in teammate immunity",
    manualRef: 'CLAUDE.md: "They may target any living player, including another Grinch."',
    pass,
    details: `target(Grinch2).alive=${target.alive}`,
  };
}

function scenarioTotalModeNoEarlyParityWin() {
  const game = mkGame(
    [
      { name: "Grinch", roleId: "Grinch1" },
      { name: "Elf", roleId: "Elf1" },
      { name: "Filler1", roleId: "Elf2" },
    ],
    { gacWinMode: "total" }
  );
  eliminate(game, byName(game, "Filler1").id, "test");
  // Living = Grinch + Elf, exact 1v1 parity -- total mode must NOT end here.
  const result = checkWin(game, { afterVote: true });
  const pass = result === null;
  return {
    id: "S17",
    title: 'In "total" win mode, reaching numeric parity does not end the game early',
    manualRef: 'Manual: "(In a total-elimination game, they instead win only once the entire Christmas team is gone.)"',
    pass,
    details: `1 Grinch vs 1 Elf under gacWinMode:"total": checkWin result=${result} (expected null)`,
  };
}

// ---- Group 1 engine-hardening scenarios (prove F1/F2/F3/F4/F5/F6 fixed) ----

function scenarioBelsnickelNoopWhenDead() {
  const game = mkGame([
    { name: "Belsnickel", roleId: "Belsnickel" },
    { name: "Target", roleId: "Elf1" },
    { name: "Grinch", roleId: "Grinch1" },
  ]);
  const bels = byName(game, "Belsnickel");
  const target = byName(game, "Target");
  eliminate(game, bels.id, "test");
  game.nightNumber = 1;
  resolveNight(game, { belsnickelKill: target.id });
  const pass = target.alive === true;
  return {
    id: "S18",
    title: "A stale belsnickelKill decision is a no-op once Belsnickel is dead",
    manualRef: "Engine hardening (F1 resolved): the engine no longer trusts a kill decision with no living actor behind it.",
    pass,
    details: `target.alive=${target.alive} (expected true -- kill did not land)`,
  };
}

function scenarioElfNoopWhenDead() {
  const game = mkGame([
    { name: "Shelf", roleId: "Shelf" },
    { name: "Target", roleId: "Elf1" },
    { name: "Grinch", roleId: "Grinch1" },
  ]);
  const shelf = byName(game, "Shelf");
  const target = byName(game, "Target");
  eliminate(game, shelf.id, "test");
  game.nightNumber = 1;
  resolveNight(game, { protect: target.id, grinchKill: target.id });
  const pass = target.alive === false;
  return {
    id: "S19",
    title: "A stale protect decision is a no-op once Elf on the Shelf is dead",
    manualRef: "Engine hardening (F2 resolved).",
    pass,
    details: `target.alive=${target.alive} (expected false -- protection did not apply, Grinch kill landed)`,
  };
}

function scenarioGrinchKillNoopWithNoGrinches() {
  const game = mkGame([
    { name: "Grinch", roleId: "Grinch1" },
    { name: "Target", roleId: "Elf1" },
  ]);
  const grinch = byName(game, "Grinch");
  const target = byName(game, "Target");
  eliminate(game, grinch.id, "test");
  game.nightNumber = 1;
  resolveNight(game, { grinchKill: target.id });
  const pass = target.alive === true;
  return {
    id: "S20",
    title: "A stale grinchKill decision is a no-op with zero living Grinches",
    manualRef: "Engine hardening (F4 resolved).",
    pass,
    details: `target.alive=${target.alive} (expected true)`,
  };
}

function scenarioCupidIgnoredAfterNight1() {
  const game = mkGame([
    { name: "Cupid", roleId: "Cupid" },
    { name: "A", roleId: "Elf1" },
    { name: "B", roleId: "Elf2" },
  ]);
  const a = byName(game, "A"), b = byName(game, "B");
  game.nightNumber = 2;
  resolveNight(game, { cupidLink: [a.id, b.id] });
  const pass = a.loverOf === null && b.loverOf === null;
  return {
    id: "S21",
    title: "cupidLink is ignored on any night after night 1",
    manualRef: "Engine hardening (F5 resolved, Cupid half). Manual: Cupid links on night 1 only.",
    pass,
    details: `a.loverOf=${a.loverOf}, b.loverOf=${b.loverOf} (expected both null)`,
  };
}

function scenarioWetIgnoredAfterNight1() {
  const game = mkGame([
    { name: "Wet", roleId: "Wet" },
    { name: "Target", roleId: "Elf1" },
  ]);
  const wet = byName(game, "Wet");
  const target = byName(game, "Target");
  game.nightNumber = 2;
  resolveNight(game, { wetSteal: target.id });
  const pass = wet.roleId === "Wet" && target.roleId === "Elf1";
  return {
    id: "S22",
    title: "wetSteal is ignored on any night after night 1",
    manualRef: "Engine hardening (F5 resolved, Wet half). Manual: Wet Bandits steal on night 1 only.",
    pass,
    details: `wet.roleId=${wet.roleId}, target.roleId=${target.roleId} (expected unchanged)`,
  };
}

function scenarioElfCannotProtectSelf() {
  const game = mkGame([
    { name: "Shelf", roleId: "Shelf" },
    { name: "Grinch", roleId: "Grinch1" },
  ]);
  const shelf = byName(game, "Shelf");
  game.nightNumber = 1;
  resolveNight(game, { protect: shelf.id, grinchKill: shelf.id });
  const wastedEvent = (game.events || []).some(e => e.power === "Elf on the Shelf" && e.result === "protect wasted");
  const pass = shelf.alive === false && wastedEvent;
  return {
    id: "S23",
    title: "Elf on the Shelf protecting themselves is rejected -- the protection is wasted, the Grinch kill lands",
    manualRef: 'Manual: "never themselves." Engine hardening (F6 resolved, self half).',
    pass,
    details: `shelf.alive=${shelf.alive} (expected false), "protect wasted" logged=${wastedEvent}`,
  };
}

function scenarioElfCannotRepeatProtect() {
  const game = mkGame([
    { name: "Shelf", roleId: "Shelf" },
    { name: "Target", roleId: "Elf1" },
    { name: "Grinch", roleId: "Grinch1" },
  ]);
  const target = byName(game, "Target");
  game.nightNumber = 1;
  resolveNight(game, { protect: target.id }); // establish lastProtectedNight
  game.nightNumber = 2;
  resolveNight(game, { protect: target.id, grinchKill: target.id }); // same target again
  const wastedEvent = (game.events || []).some(e => e.power === "Elf on the Shelf" && e.result === "protect wasted" && e.night === 2);
  const pass = target.alive === false && wastedEvent;
  return {
    id: "S24",
    title: "Elf on the Shelf protecting the same player two nights running is rejected on the second night -- wasted, not applied",
    manualRef: 'Manual: "cannot protect the same player two nights in a row." Engine hardening (F6 resolved, repeat half).',
    pass,
    details: `target.alive=${target.alive} (expected false -- night 2 protection wasted, Grinch kill landed), "protect wasted" logged=${wastedEvent}`,
  };
}

function scenarioCalvinAttributedAfterSantaDies() {
  const game = mkGame([
    { name: "Santa", roleId: "Santa" },
    { name: "Calvin", roleId: "Calvin" },
    { name: "Target", roleId: "Elf1" },
    { name: "Grinch", roleId: "Grinch1" },
  ]);
  const santa = byName(game, "Santa");
  const target = byName(game, "Target");
  eliminate(game, santa.id, "test");
  game.nightNumber = 1;
  resolveNight(game, { santaInspect: target.id });
  const calvin = byName(game, "Calvin");
  const ev = (game.events || []).find(e => e.power === "Scott Calvin");
  const pass = !!ev && ev.actorId === calvin.id;
  return {
    id: "S25",
    title: 'Once Santa is dead, the naughty/nice check is attributed to Scott Calvin, not a null-actor "Santa Claus" entry',
    manualRef: "Manual: Calvin inherits Santa's nightly check. Engine hardening (F3 resolved).",
    pass,
    details: `logged event=${JSON.stringify(ev)}`,
  };
}

function scenarioMrsCannotSaveHerself() {
  const game = mkGame([
    { name: "Grinch", roleId: "Grinch1" },
    { name: "Mrs", roleId: "Mrs" },
  ]);
  const mrs = byName(game, "Mrs");
  game.nightNumber = 1;
  resolveNight(game, { grinchKill: mrs.id, mrsSave: true });
  const wastedEvent = (game.events || []).some(e => e.power === "Mrs. Claus" && e.result === "save wasted");
  const pass = mrs.alive === false && mrs.powers.mrsClausSave === false && wastedEvent;
  return {
    id: "S26",
    title: "Mrs. Claus cannot save herself -- the attempt is wasted (mirrors the Elf's own self-protect rule)",
    manualRef: "Engine bug fix, confirmed by Scott: the save block previously had no self-check at all.",
    pass,
    details: `mrs.alive=${mrs.alive} (expected false), save power remaining=${mrs.powers.mrsClausSave}, "save wasted" logged=${wastedEvent}`,
  };
}

export function runScenarios() {
  return [
    scenarioElfBlocksKrampus(),
    scenarioMrsSaveWasted(),
    scenarioYukonShieldTravelsWithCard(),
    scenarioOverkillAttribution(),
    scenarioLoversWinBeatsParity(),
    scenarioParityBlockedByBelsnickel(),
    scenarioSamNeverCountsAsPlayer(),
    scenarioMutualKillDraw(),
    scenarioMrsPowerCannotDoubleUse(),
    scenarioKrampusVsShieldedYukon(),
    scenarioBuddySwapMovesFateAndProtection(),
    scenarioGrinchCanKillTeammate(),
    scenarioTotalModeNoEarlyParityWin(),
    scenarioBelsnickelNoopWhenDead(),
    scenarioElfNoopWhenDead(),
    scenarioGrinchKillNoopWithNoGrinches(),
    scenarioCupidIgnoredAfterNight1(),
    scenarioWetIgnoredAfterNight1(),
    scenarioElfCannotProtectSelf(),
    scenarioElfCannotRepeatProtect(),
    scenarioCalvinAttributedAfterSantaDies(),
    scenarioMrsCannotSaveHerself(),
  ];
}

// ----------------------------------------------------------------- findings
// No pass/fail. Each demonstrates real gac-engine.js behavior for Scott to
// judge -- real bug vs. an accepted "the UI's job, not the engine's" gap.

// F1, F2, F4, F5, F6 (actor-alive-check gaps) and F7 (mrsSave doc mismatch +
// dead code) were resolved by the Group-1 engine hardening pass -- see S18-S25
// below, which prove the fixes. F3 (Calvin attribution) was also resolved --
// see S25.

function findingParityDelayNotInManual() {
  // No simulation needed -- this documents a gap between the printed manual
  // and gac-engine.js's checkWin(), proven behaviorally by scenarios S6 and
  // G1/G2/G8/G9/G10/G11 above.
  return {
    id: "F8",
    category: "ambiguous-rules",
    title: "The Grinch-win reachability rule is real, deliberate engine behavior, but none of it is written down anywhere a player would read it",
    codeRef: "gac-engine.js gacChristmasHasPathToVictory() and checkWin() step 3.",
    detail: 'The printed manual says the Grinches win "the moment they equal or outnumber" the table. The engine actually runs a considerably more precise rule (designed and confirmed with Scott, replacing an earlier simpler heuristic): a living cross-team lover pair or a living Jack Frost always continues the game; otherwise, an unused offensive tool (Mrs. Claus\'s poison, a living Belsnickel, or Buddy\'s unused swap) always continues it; otherwise, at an EXACT tie a single blocking resource (Elf\'s protect or Mrs\'s save, each needing a living target besides themselves, or Yukon\'s shield) continues it by holding the tie into the next vote; a strict Grinch lead can never be rescued by defense alone, however much of it exists. None of this nuance is in GAC_Manual.pdf. Worth deciding: should the manual describe it (at whatever level of detail makes sense for players), or is this meant to stay an implementation detail?',
  };
}

export function runFindings() {
  return [
    findingParityDelayNotInManual(),
  ];
}

// ------------------------------------------------ Grinch-win reachability
// Group 2 guardrail scenarios, written FIRST per plan, run against the
// CURRENT (unmodified) checkWin()/gacChristmasCanStillKill(). Some are
// expected to FAIL right now -- that's the point of this step. Once the new
// gacChristmasHasPathToVictory() solver replaces the old parity-delay check,
// these should all flip to PASS (confirmed in a later step, not this one).

function scenarioG1_YukonShieldIsDefensiveOnlyGrinchWins() {
  // Yukon's shield only lets him SURVIVE one attack -- it never kills a
  // Grinch, so it can never lower the living Grinch count. With no other
  // offensive tool on this board (no Shelf/Mrs/Belsnickel/Buddy/Krampus),
  // there is no sequence of moves that can ever reduce the count of 3 -- a
  // true dead end, so this is a GRINCH WIN, not a continue. (Corrected per
  // Scott: the search's success condition is "can the count ever drop below
  // its current value," not "can it reach zero" -- a purely defensive
  // resource can never do either.)
  const game = mkGame([
    { name: "G1", roleId: "Grinch1" }, { name: "G2", roleId: "Grinch2" }, { name: "G3", roleId: "Grinch3" },
    { name: "Yukon", roleId: "Yukon" }, { name: "Elf", roleId: "Elf1" },
  ]);
  const result = checkWin(game, { afterVote: true });
  return {
    id: "G1",
    title: "3 Grinch vs 2 Christmas, Yukon's shield intact but purely defensive (no kill tool) -> GRINCH WIN",
    manualRef: "Corrected per Scott: a defensive-only resource can never lower the Grinch count, so no path exists.",
    pass: result === "grinch",
    details: `checkWin=${result} (expected "grinch")`,
  };
}

function scenarioG2_MrsPoisonContinues() {
  const game = mkGame([
    { name: "G1", roleId: "Grinch1" }, { name: "G2", roleId: "Grinch2" }, { name: "G3", roleId: "Grinch3" },
    { name: "Mrs", roleId: "Mrs" }, { name: "Elf", roleId: "Elf1" },
  ]);
  const result = checkWin(game, { afterVote: true });
  return {
    id: "G2",
    title: "3 Grinch vs 2 Christmas, Mrs. Claus's poison unused -> CONTINUE",
    manualRef: "New Grinch-win design (not yet implemented): an unused poison is a still-open Christmas path.",
    pass: result === null,
    details: `checkWin=${result} (expected null)`,
  };
}

function scenarioG3_NoPowersGrinchWins() {
  const game = mkGame([
    { name: "G1", roleId: "Grinch1" }, { name: "G2", roleId: "Grinch2" }, { name: "G3", roleId: "Grinch3" },
    { name: "E1", roleId: "Elf1" }, { name: "E2", roleId: "Elf2" },
  ]);
  const result = checkWin(game, { afterVote: true });
  return {
    id: "G3",
    title: "3 Grinch vs 2 Christmas, no powers left, no lovers -> GRINCH WIN",
    manualRef: "New Grinch-win design: no simulable Christmas mechanism remains -> no path -> Grinch win.",
    pass: result === "grinch",
    details: `checkWin=${result} (expected "grinch")`,
  };
}

function scenarioG4_LoverPairShortCircuit() {
  // Tests the lover-pair SHORT-CIRCUIT (Scott's correction), not the
  // reachability search -- cross-team lovers have their own win condition
  // (last two alive), so their mere existence anywhere on the board means a
  // non-Grinch outcome is still possible and the game must continue. This is
  // NOT the literal final-two lovers case -- S5 already covers that (2 living
  // total, checkWin returns "lovers" via the live.length===2 branch, entirely
  // unrelated to the parity gate). This scenario is a lover pair embedded in
  // a LARGER board (4 living, not 2) at grinch/other parity -- today's
  // gacChristmasCanStillKill has no loverOf-awareness at all, so it falls
  // straight through to the plain parity math and (as shown below) currently
  // calls this a Grinch win despite the live entangled pair. Under the new
  // design this should short-circuit to CONTINUE before the search ever
  // runs -- the search itself never needs to reason about lovers at all,
  // since by the time it runs, no living cross-team pair can exist.
  const game = mkGame([
    { name: "G1", roleId: "Grinch1" }, { name: "G2", roleId: "Grinch2" },
    { name: "E1", roleId: "Elf1" }, { name: "E2", roleId: "Elf2" },
  ]);
  const g1 = byName(game, "G1"), e1 = byName(game, "E1");
  g1.loverOf = e1.id; e1.loverOf = g1.id;
  const result = checkWin(game, { afterVote: true });
  return {
    id: "G4",
    title: "Cross-team lovers alive anywhere on the board (4 living, not the final two) -> CONTINUE via short-circuit",
    manualRef: "Scott's correction: \"any cross-team lover pair still alive -> CONTINUE\" -- a simple short-circuit, ordered right after the existing final-two lovers-win check and alongside the Frost carve-out, before the reachability search.",
    pass: result === null,
    details: `checkWin=${result} (expected null) -- board: 2 Grinch, 2 Christmas (1 Grinch + 1 Christmas member cross-linked as lovers, NOT the only two alive)`,
  };
}

function scenarioG5_GeneralNoPathWins() {
  const game = mkGame([
    { name: "G1", roleId: "Grinch1" }, { name: "G2", roleId: "Grinch2" }, { name: "E1", roleId: "Elf1" },
  ]);
  const result = checkWin(game, { afterVote: true });
  return {
    id: "G5",
    title: "A second no-path board shape (2 Grinch vs 1 Elf, no powers) -> GRINCH WIN",
    manualRef: "New Grinch-win design: a differently-sized/shaped no-path board should resolve the same way as G3.",
    pass: result === "grinch",
    details: `checkWin=${result} (expected "grinch")`,
  };
}

function scenarioG6_ChristmasNeverWinsEarly() {
  const game = mkGame([
    { name: "G1", roleId: "Grinch1" }, { name: "E1", roleId: "Elf1" }, { name: "E2", roleId: "Elf2" }, { name: "E3", roleId: "Elf3" },
  ]);
  const result = checkWin(game, { afterVote: true });
  return {
    id: "G6",
    title: "Christmas never wins early -- 1 Grinch alive is still a live game, even heavily outnumbered",
    manualRef: "Scott: \"Christmas has NO early win -- Christmas only wins when zero Grinches remain.\"",
    pass: result === null,
    details: `checkWin=${result} (expected null)`,
  };
}

function scenarioG7_FrostCarveOut() {
  const game = mkGame([
    { name: "G1", roleId: "Grinch1" }, { name: "G2", roleId: "Grinch2" }, { name: "G3", roleId: "Grinch3" },
    { name: "Frost", roleId: "Frost" }, { name: "Elf", roleId: "Elf1" },
  ]);
  const result = checkWin(game, { afterVote: true });
  return {
    id: "G7",
    title: "3 Grinch vs 2 Christmas, no simulable powers, Frost alive -> CONTINUE (hardcoded carve-out, per Scott's decision)",
    manualRef: "Frost's revenge lives in index.html, not simulable via resolveNight() -- kept as a hardcoded 'path exists' carve-out.",
    pass: result === null,
    details: `checkWin=${result} (expected null)`,
  };
}

// G1-G7 never actually exercise an EXACT tie (grinches === others) -- every
// one of them is either strictly Grinch-ahead or handled by a short-circuit
// before the model ever runs. The tie is the one case where recurring/
// one-time defense actually matters (it can hold the tie into a vote that
// removes a Grinch), so it deserves its own direct coverage.

function scenarioG8_TieWithProtectContinues() {
  const game = mkGame([
    { name: "G1", roleId: "Grinch1" }, { name: "G2", roleId: "Grinch2" },
    { name: "Shelf", roleId: "Shelf" }, { name: "Elf", roleId: "Elf1" },
  ]);
  const result = checkWin(game, { afterVote: true });
  return {
    id: "G8",
    title: "Exact tie (2v2) with Elf's protect available -> CONTINUE (survives the one night, the tie-vote then removes a Grinch)",
    manualRef: "Scott's confirmed model: at an exact tie, any blocking resource preserves it into a vote that succeeds.",
    pass: result === null,
    details: `checkWin=${result} (expected null)`,
  };
}

function scenarioG9_TieWithNoPowersGrinchWins() {
  const game = mkGame([
    { name: "G1", roleId: "Grinch1" }, { name: "G2", roleId: "Grinch2" },
    { name: "E1", roleId: "Elf1" }, { name: "E2", roleId: "Elf2" },
  ]);
  const result = checkWin(game, { afterVote: true });
  return {
    id: "G9",
    title: "Exact tie (2v2), no powers at all -> GRINCH WIN (the night kill lands unblocked, breaking the tie before any vote)",
    manualRef: "Scott's confirmed model: without any blocking, the tie doesn't survive to the vote.",
    pass: result === "grinch",
    details: `checkWin=${result} (expected "grinch")`,
  };
}

function scenarioG10_TieShelfAloneCannotSelfProtect() {
  // 1v1 tie where the ONLY living Other IS the Shelf holder himself -- he
  // can't protect himself, so the tie does NOT survive, unlike G8's board
  // where a second living Other gives him someone to protect.
  const game = mkGame([
    { name: "G1", roleId: "Grinch1" },
    { name: "Shelf", roleId: "Shelf" },
  ]);
  const result = checkWin(game, { afterVote: true });
  return {
    id: "G10",
    title: "Exact tie (1v1) where Shelf is the ONLY living Other -> GRINCH WIN (can't protect himself, needs another target)",
    manualRef: "Scott's confirmed model: Elf's protect (like Mrs's save) requires a living Other besides the holder.",
    pass: result === "grinch",
    details: `checkWin=${result} (expected "grinch")`,
  };
}

function scenarioG11_TieWithMrsSaveAndAnotherTargetContinues() {
  const game = mkGame([
    { name: "G1", roleId: "Grinch1" }, { name: "G2", roleId: "Grinch2" },
    { name: "Mrs", roleId: "Mrs" }, { name: "Elf", roleId: "Elf1" },
  ]);
  const result = checkWin(game, { afterVote: true });
  return {
    id: "G11",
    title: "Exact tie (2v2) with Mrs. Claus's save available (and another living Other to save) -> CONTINUE",
    manualRef: "Scott's confirmed model, and confirms the self-save fix doesn't block the case where another target exists.",
    pass: result === null,
    details: `checkWin=${result} (expected null)`,
  };
}

export function runGrinchWinReachabilityScenarios() {
  return [
    scenarioG1_YukonShieldIsDefensiveOnlyGrinchWins(),
    scenarioG2_MrsPoisonContinues(),
    scenarioG3_NoPowersGrinchWins(),
    scenarioG4_LoverPairShortCircuit(),
    scenarioG5_GeneralNoPathWins(),
    scenarioG6_ChristmasNeverWinsEarly(),
    scenarioG7_FrostCarveOut(),
    scenarioG8_TieWithProtectContinues(),
    scenarioG9_TieWithNoPowersGrinchWins(),
    scenarioG10_TieShelfAloneCannotSelfProtect(),
    scenarioG11_TieWithMrsSaveAndAnotherTargetContinues(),
  ];
}
