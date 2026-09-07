// REFERENCE / HISTORICAL. This standalone script derived and validated the
// deterministic Grinch-win model across every board from 1v1 to 6v6 before
// it was confirmed and wired into gac-engine.js's exported
// gacChristmasHasPathToVictory() (a closed-form version of the same rule --
// no cycle simulation needed there, since the whole race reduces to a
// handful of comparisons once you know the answer only ever depends on
// whether an offensive tool exists, or an exact tie holds). Kept here as the
// derivation record; not imported by anything.
//
// Deterministic count-race model for the Grinch-win rule, per Scott's
// fully-pinned-down turn sequence:
//   [post-vote: evaluate] -> NIGHT (Grinch kill lands on Christmas unless
//   blocked/saved; Christmas night-powers fire) -> NEXT VOTE (a coordinated
//   Christmas bloc removes a Grinch as long as Others' count is still >= the
//   Grinch count -- Grinches vote worst-case for themselves, i.e. they split
//   rather than coordinate a defense, so a united Christmas bloc beats them
//   even at an exact tie) -> repeat.
//
// Assumptions (win-CALCULATION only, never a gameplay rule):
//   - Christmas plays optimally: night powers are used the instant they can
//     matter, and the grinch's attack (when unblocked) is assumed to kill a
//     "generic" Christmas member rather than a named power-holder, for as
//     long as a generic body remains -- the most generous outcome for
//     Christmas, matching the search's existential spirit.
//   - Grinches play worst-case for themselves (best case for Christmas)
//     except they never target/vote a teammate: their night kill always
//     targets a Christmas player, and can never be redirected onto "help"
//     from the Grinch side.
//   - Decisions within one night are simultaneous (matches the real engine):
//     a power-holder who dies to the same night's Grinch attack still gets
//     their own action off first, exactly like Belsnickel's kill still
//     landing the same night the Grinches killed him (proven in TEST_REPORT
//     scenario S4/S8-style traces earlier in this project).
//   - Success condition (per the earlier-agreed rule): a path exists the
//     moment the living Grinch count could drop BELOW its starting value --
//     not only if it can reach zero. "Christmas only WINS at zero Grinches"
//     is untouched and lives entirely in checkWin()'s own total-elimination
//     step, not here.
//
// Modeling simplifications, called out explicitly (neither changes the final
// verdict, only which cycle it's reached on):
//   - Elf on the Shelf's protection is treated as blocking indefinitely
//     while (a) Shelf is alive and (b) at least one OTHER living Christmas
//     member exists to protect (mirroring "never themselves"). The real
//     engine's "not the same target twice running" rule isn't modeled
//     per-target here -- it doesn't change whether protect-alone can ever
//     reduce the Grinch count (it can't either way), only exactly which
//     cycle the eventual depletion happens on, which this table doesn't
//     report.
//   - A generous cycle cap (2*(G+O)+4) catches the "frozen forever" case
//     (pure defense, enough bodies to alternate) and resolves it as GRINCH
//     WIN, consistent with "defense alone never reduces the Grinch count."

function simulateOneRun(G0, O0, power) {
  let G = G0;
  const hasNamedHolder = power !== "none";
  let genericOthers = hasNamedHolder ? O0 - 1 : O0;
  let holderAlive = hasNamedHolder;
  let oneTimeUsed = false;

  const maxCycles = 2 * (G0 + O0) + 4;

  for (let cycle = 0; cycle < maxCycles; cycle++) {
    const holderAliveAtStartOfNight = holderAlive;

    // ---- NIGHT ----
    let killBlocked = false;
    let killLandsOnGrinch = false;

    if (power === "protect" && holderAliveAtStartOfNight && genericOthers > 0) {
      killBlocked = true; // recurring; can't self-protect, needs another target
    } else if (power === "mrsSave" && holderAliveAtStartOfNight && !oneTimeUsed && genericOthers > 0) {
      killBlocked = true; oneTimeUsed = true; // one-time; CANNOT save herself (hard rule, mirrors Elf's self-protect), needs another target
    } else if (power === "yukonShield" && holderAliveAtStartOfNight && !oneTimeUsed) {
      killBlocked = true; oneTimeUsed = true; // one-time; the shield is his own
    } else if (power === "buddy" && holderAliveAtStartOfNight && !oneTimeUsed) {
      killLandsOnGrinch = true; oneTimeUsed = true; // one-time redirect, needs a living Grinch (always true here)
    }

    if (killLandsOnGrinch) {
      G -= 1;
    } else if (!killBlocked) {
      if (genericOthers > 0) genericOthers -= 1;
      else if (holderAlive) holderAlive = false;
      // (if neither, Others is already 0 -- caught below)
    }

    // Independent offense (not a redirect of the Grinch's own attack):
    if (power === "mrsPoison" && holderAliveAtStartOfNight && !oneTimeUsed) {
      G -= 1; oneTimeUsed = true;
    }
    if (power === "belsnickel" && holderAliveAtStartOfNight) {
      G -= 1; // recurring, mandatory every night while alive
    }

    if (G < G0) return "continue";

    const othersNow = genericOthers + (holderAlive ? 1 : 0);
    if (othersNow <= 0) return "grinch"; // Others wiped out, Grinch count never dropped

    // ---- VOTE ----
    // A coordinated Christmas bloc beats a "worst-case" split Grinch defense
    // even at a tie -- Grinches don't coordinate to protect one of their own
    // (that would itself be a form of the "help each other" behavior the
    // model excludes), so Christmas's united O votes outweigh any single
    // faction the split Grinch votes could produce, as long as O >= G.
    if (othersNow >= G) {
      G -= 1; // coordinated Christmas vote removes a Grinch
      if (G < G0) return "continue";
    }
    // else: Grinches still outnumber Christmas's whole bloc -- vote can't succeed
  }
  return "grinch"; // never reduced within the cycle budget -- treat as a dead end
}

const POWERS = [
  { key: "none", label: "baseline (no powers)" },
  { key: "protect", label: "+ Elf protect" },
  { key: "mrsSave", label: "+ Mrs. Claus save" },
  { key: "mrsPoison", label: "+ Mrs. Claus poison" },
  { key: "belsnickel", label: "+ Belsnickel" },
  { key: "buddy", label: "+ Buddy swap" },
  { key: "yukonShield", label: "+ Yukon shield" },
];

console.log("Deterministic Grinch-win model verification table (1v1 .. 6v6)");
console.log("G = living Grinches, O = living Others. '*' marks the cells checkWin's");
console.log("real parity gate would actually reach (G >= O); the rest are shown for");
console.log("completeness but never occur at the gate in real play.\n");

const header = ["G", "O", "real?", ...POWERS.map(p => p.label)];
console.log(header.join(" | "));

const results = [];
for (let G = 1; G <= 6; G++) {
  for (let O = 1; O <= 6; O++) {
    const row = { G, O, real: G >= O };
    for (const p of POWERS) {
      row[p.key] = simulateOneRun(G, O, p.key);
    }
    results.push(row);
    console.log(
      [G, O, G >= O ? "*" : "", ...POWERS.map(p => (row[p.key] === "grinch" ? "GRINCH" : "continue"))].join(" | ")
    );
  }
}

// Summarize: for each power, is the verdict uniform across every (G,O), or
// does it vary with board size?
console.log("\n--- Per-power uniformity check (does the verdict depend on board size at all?) ---");
for (const p of POWERS) {
  const verdicts = new Set(results.map(r => r[p.key]));
  console.log(`${p.label}: ${verdicts.size === 1 ? `UNIFORM -> always ${[...verdicts][0].toUpperCase()}` : "VARIES by board size"}`);
}
