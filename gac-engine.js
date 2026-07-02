// The Grinches Attack Christmas — GAME STATE ENGINE
// Stage 2 foundation: the Game/Player objects from GAC_STATE_MODEL.md, plus
// life/death tracking and the win-check. Role *resolvers* (Stage 3) and the
// effect pipeline come later; this module owns the truth of who's in the game,
// who's alive, and whether anyone has won.
//
// Pure logic — no DOM. The UI (index.html) drives it and renders from it.

import { GAC_ROSTER } from "./gac-roles.js";

// Quick lookup from a roster card id -> its definition.
const CARD_BY_ID = Object.fromEntries(GAC_ROSTER.map(r => [r.id, r]));

// Yukon starts with a shield; everyone else starts with none.
function startingShield(roleId){ return roleId === "Yukon" ? 1 : 0; }

// Create a fresh Player from a name + the card they hold.
export function makePlayer(id, name, roleId){
  const card = CARD_BY_ID[roleId] || {};
  return {
    id, name,
    roleId,
    startRoleId: roleId,        // the card they were originally dealt (never changes)
    startTeam: card.team === "grinch" ? "grinch" : "christmas",
    team: card.team === "grinch" ? "grinch" : "christmas",   // moderator never a player
    alive: true,
    loverOf: null,
    protectedThisNight: false,
    lastProtectedNight: 0,
    shieldCount: startingShield(roleId),
    powers: {
      krampusConvert: roleId === "Krampus",
      mrsClausSave:   roleId === "Mrs",
      mrsClausPoison: roleId === "Mrs",
      buddySwap:      roleId === "Buddy",
      wetBanditsSteal: roleId === "Wet",
    },
    knownInfo: [],
    pendingDeath: false,
    deathSource: null,
  };
}

// Create a fresh Game from a set of selected card ids + a list of player
// {name, roleId} claims. centerCards = selected cards not claimed by a player.
export function makeGame({ selectedCardIds = [], players = [], settings = {} } = {}){
  const playerObjs = players.map((p, i) => makePlayer("p" + i, p.name, p.roleId));
  // Center = selected cards minus the ones players are holding. (Exactly one in
  // a normal deal, but we compute generally.)
  const claimed = players.map(p => p.roleId);
  const center = [];
  const claimedCounts = {};
  claimed.forEach(id => claimedCounts[id] = (claimedCounts[id] || 0) + 1);
  const selCounts = {};
  selectedCardIds.forEach(id => selCounts[id] = (selCounts[id] || 0) + 1);
  for (const id in selCounts){
    const leftover = selCounts[id] - (claimedCounts[id] || 0);
    for (let k = 0; k < leftover; k++) center.push(id);
  }
  return {
    gameId: "g" + Date.now(),
    phase: "lobby",
    nightNumber: 0,
    players: playerObjs,
    centerCards: center,
    pendingEffects: [],
    log: [],
    winner: null,
    settings,
  };
}

// ---- Validation: do the claimed cards match the selected roster? ----
// Counts by card NAME (the role concept), so duplicate cards like Grinch and
// Elf are tallied correctly regardless of their internal id suffixes.
// Multiple center cards are allowed (players < selected cards); we just warn on
// genuine mismatches.
export function validateClaims(selectedCardIds, players){
  const problems = [];
  const nameOf = id => (CARD_BY_ID[id] || {}).name || id;

  // Tally selection and claims by card NAME.
  const selByName = {};
  selectedCardIds.forEach(id => { const n = nameOf(id); selByName[n] = (selByName[n]||0)+1; });
  const claimByName = {};
  players.forEach(p => { const n = nameOf(p.roleId); claimByName[n] = (claimByName[n]||0)+1; });

  for (const name in claimByName){
    const claimed = claimByName[name];
    const available = selByName[name] || 0;
    if (available === 0){
      problems.push(`${claimed} player(s) claimed "${name}", which isn't in tonight's selection.`);
    } else if (claimed > available){
      problems.push(`${claimed} players claimed "${name}", but only ${available} ${available===1?"is":"are"} in the game.`);
    }
  }

  // Player count: must not exceed the number of selected cards. A leftover
  // center card is only *required* when Wet Bandits are in play (they need a
  // center card to potentially steal); otherwise all cards may be dealt out.
  const sel = selectedCardIds.length;
  const wetInGame = selectedCardIds.some(id => (CARD_BY_ID[id]||{}).id === "Wet" || id === "Wet");
  if (players.length){
    if (players.length > sel){
      problems.push(`${players.length} players, but only ${sel} cards are selected.`);
    } else if (players.length === sel && wetInGame){
      problems.push(`${players.length} players claim all ${sel} cards, but the Wet Bandits need a card in the center to steal — leave at least one card out.`);
    }
  }
  return { ok: problems.length === 0, problems };
}

// Guarantee at least one Grinch can be dealt: Grinch-team cards must outnumber
// the center cards, so a Grinch can't all end up in the center. Soft warning.
export function grinchSafetyWarning(selectedCardIds, playerCount){
  const grinchTeam = selectedCardIds.filter(id => {
    const c = CARD_BY_ID[id]; return c && c.team === "grinch";
  }).length;
  const centerCount = playerCount ? (selectedCardIds.length - playerCount) : 1;
  if (grinchTeam === 0) return "No Grinch-team cards are selected — the Christmas team can't lose.";
  if (centerCount >= grinchTeam) return `There are ${grinchTeam} Grinch-team card(s) but ${centerCount} center card(s) — all Grinches could end up in the center, leaving no Grinch in play.`;
  return null;
}

// ---- Life / death ----
export function eliminate(game, playerId, source){
  const p = game.players.find(x => x.id === playerId);
  if (!p || !p.alive) return;
  p.alive = false;
  p.deathSource = source || "unknown";
  game.log.push({ night: game.nightNumber, type: "death", playerId, name: p.name, source });
}

export function living(game){ return game.players.filter(p => p.alive); }

// ---- Win check (timing handled by caller: only after the day vote) ----
// Mirrors GAC_SPEC §6: normal team wins include surviving lovers; the lovers'
// couple-win only fires for a cross-team pair left as the final two.
export function checkWin(game){
  const live = living(game);
  const grinches = live.filter(p => p.team === "grinch");
  const others   = live.filter(p => p.team !== "grinch");

  // 1) Cross-team lovers as the final two -> lovers win.
  if (live.length === 2){
    const [a, b] = live;
    if (a.loverOf === b.id && b.loverOf === a.id && a.team !== b.team){
      return "lovers";
    }
  }
  // 2) Normal team wins (surviving lovers count with their own team).
  if (grinches.length === 0) return "christmas";
  if (grinches.length >= others.length) return "grinch";

  // 3) Keep playing.
  return null;
}

// ============================================================================
// NIGHT RESOLUTION (Stage 3)
// Takes the decisions Sam entered for one night and applies them to the game in
// the FIXED order from GAC_SPEC §4c / state model §2. Roles declare effects;
// this single resolver applies them in order. Roles never read each other.
//
// `decisions` shape (any key may be absent if that role isn't in play / no
// choice made):
//   {
//     protect:   playerId,            // Elf on the Shelf
//     grinchKill: playerId,           // Grinches' agreed target
//     krampusConvert: playerId,       // Krampus (the victim) or null
//     mrsSave:   playerId,            // Mrs. Claus save target
//     mrsPoison: playerId,            // Mrs. Claus poison target
//     belsnickelKill: playerId,       // Belsnickel
//     buddySwap: [playerIdA, playerIdB], // Buddy swaps two players' fates
//   }
//
// Returns a per-night report: { deaths:[{playerId,name,source}], log:[...] }.
// Mutates game state (alive, team, powers, shields, flags).
// ============================================================================
// Find the living holder id of a role (for event actor tagging).
function gacFindHolder(game, roleId){
  const p = game.players.find(x => x.roleId === roleId && x.alive);
  return p ? p.id : null;
}

// Reassign a player's *current* identity to a given card (role), updating team,
// shield, and powers to match — while preserving startRoleId. Used by Wet
// Bandits (steal) and Krampus (convert).
function gacReassignRole(game, player, newRoleId){
  const CARD = (typeof CARD_BY_ID !== "undefined") ? CARD_BY_ID : null;
  const card = CARD ? (CARD[newRoleId] || {}) : {};
  player.roleId = newRoleId;
  player.team = card.team === "grinch" ? "grinch" : "christmas";
  // Powers reflect the NEW card. (Once-per-game powers reset to the new role's.)
  player.powers = {
    krampusConvert:  newRoleId === "Krampus",
    mrsClausSave:    newRoleId === "Mrs",
    mrsClausPoison:  newRoleId === "Mrs",
    buddySwap:       newRoleId === "Buddy",
    wetBanditsSteal: newRoleId === "Wet",
  };
}

export function resolveNight(game, decisions){
  decisions = decisions || {};
  const byId = id => game.players.find(p => p.id === id);
  const report = { deaths: [], log: [], swaps: [] };
  const note = (msg) => report.log.push(msg);
  // Structured events power the table views. Each: {night, power, actorId,
  // targetId, result}. Stored on game.events (persists across nights).
  if (!game.events) game.events = [];
  const event = (power, actorId, targetId, result) => {
    game.events.push({ night: game.nightNumber, power, actorId: actorId||null, targetId: targetId||null, result: result||null });
  };

  // Scratch: pending death markers for this night. We track by player id, with
  // a source, so the pipeline can cancel/move them before finalizing.
  // pending[id] = source string
  const pending = {};
  const markKill = (id, source) => { if (id) pending[id] = source; };
  const cancelKill = (id) => { delete pending[id]; };

  // 0) CUPID LINK (night 1) — bind two players as lovers before anything else.
  if (decisions.cupidLink && decisions.cupidLink.length === 2){
    const [aId, bId] = decisions.cupidLink;
    const a = byId(aId), b = byId(bId);
    if (a && b && a.id !== b.id){
      a.loverOf = b.id; b.loverOf = a.id;
      note(`Cupid links ${a.name} and ${b.name} as lovers.`);
      event("Cupid", gacFindHolder(game,"Cupid"), a.id, "linked:"+b.id);
    }
  }

  // WET BANDITS (night 1) — physical card steal; recorded for the log only.
  if (decisions.wetSteal){
    const wet = game.players.find(p => p.roleId === "Wet" && p.alive);
    const wetName = wet ? wet.name : "The Wet Bandits";
    if (decisions.wetSteal === "center"){
      note(`${wetName} (Wet Bandits) swapped with the center card — they take the center role, and the Wet Bandits card moves to the center.`);
      event("Wet Bandits", wet?wet.id:null, null, "stole:center");
    } else {
      const t = byId(decisions.wetSteal);
      if (t && wet){
        const stolenRole = t.roleId;        // the card Wet Bandits takes
        gacReassignRole(game, wet, stolenRole);   // Wet player becomes that role
        gacReassignRole(game, t, "Wet");          // stolen player becomes Wet Bandits
        note(`${wetName} stole ${t.name}'s card: ${wetName} is now ${(CARD_BY_ID[stolenRole]||{}).name||stolenRole}, and ${t.name} now holds the Wet Bandits card.`);
        event("Wet Bandits", wet.id, t.id, "stole");
      }
    }
  }

  // 1) PROTECT (Elf on the Shelf)
  let protectedId = decisions.protect || null;
  if (protectedId){
    const p = byId(protectedId);
    if (p){ p.protectedThisNight = true; p.lastProtectedNight = game.nightNumber; note(`Elf on the Shelf protects ${p.name}.`); event("Elf on the Shelf", gacFindHolder(game,"Shelf"), p.id, "protected"); }
  }

  // 2) GRINCH KILL
  if (decisions.grinchKill){
    const target = byId(decisions.grinchKill);
    if (target){
      if (target.protectedThisNight){ note(`Grinches attacked ${target.name}, but they were protected.`); event("Grinches", null, target.id, "blocked"); }
      else { markKill(target.id, "grinch"); note(`Grinches choose to kill ${target.name}.`); event("Grinches", null, target.id, "attacked"); }
    }
  }

  // 3) KRAMPUS CONVERT — yes/no on the Grinches' victim. On yes, cancel that
  //    death and flip the victim to the Grinch team (once per game).
  if (decisions.krampusConvert){
    // The victim is whoever the Grinches targeted this night.
    const victimId = decisions.grinchKill;
    const victim = victimId ? byId(victimId) : null;
    const krampus = game.players.find(p => p.roleId === "Krampus" && p.alive);
    if (victim && krampus && krampus.powers.krampusConvert){
      cancelKill(victim.id);
      victim.team = "grinch";
      victim.converted = true;            // joined the Grinch team via Krampus
      krampus.powers.krampusConvert = false;
      note(`Krampus converts ${victim.name} to the Grinch team instead of letting them die.`);
      event("Krampus", krampus.id, victim.id, "converted");
    }
  }

  // 4) MRS. CLAUS — save first (yes/no on the Grinches' victim), then poison.
  if (decisions.mrsSave){
    const mrs = game.players.find(p => p.roleId === "Mrs" && p.alive);
    const victimId = decisions.grinchKill;
    const tgt = victimId ? byId(victimId) : null;
    if (mrs && tgt && mrs.powers.mrsClausSave){
      cancelKill(tgt.id);
      mrs.powers.mrsClausSave = false;
      note(`Mrs. Claus saves ${tgt.name} with a nice cookie.`);
      event("Mrs. Claus", mrs.id, tgt.id, "saved");
    }
  }
  if (decisions.mrsPoison){
    const mrs = game.players.find(p => p.roleId === "Mrs" && p.alive);
    const tgt = byId(decisions.mrsPoison);
    if (mrs && tgt && mrs.powers.mrsClausPoison){
      markKill(tgt.id, "poison");
      mrs.powers.mrsClausPoison = false;
      note(`Mrs. Claus poisons ${tgt.name}.`);
      event("Mrs. Claus", mrs.id, tgt.id, "poisoned");
    }
  }

  // SANTA INSPECT — information only (no state change); recorded for the log and
  // for mobile play where the result is shown privately to Santa.
  if (decisions.santaInspect){
    const tgt = byId(decisions.santaInspect);
    if (tgt){ note(`Santa checks ${tgt.name}: ${tgt.team === "grinch" ? "naughty (Grinch)" : "nice (Christmas)"}.`); event("Santa Claus", gacFindHolder(game,"Santa"), tgt.id, tgt.team==="grinch"?"checked:naughty":"checked:nice"); }
  }

  // 5) BELSNICKEL KILL
  if (decisions.belsnickelKill){
    const target = byId(decisions.belsnickelKill);
    if (target){
      if (target.protectedThisNight){ note(`Belsnickel attacked ${target.name}, but they were protected.`); event("Belsnickel", gacFindHolder(game,"Belsnickel"), target.id, "blocked"); }
      else { markKill(target.id, "belsnickel"); note(`Belsnickel kills ${target.name}.`); event("Belsnickel", gacFindHolder(game,"Belsnickel"), target.id, "attacked"); }
    }
  }

  // 6) BUDDY SWAP — swap two players' pending fates (and the swap of identities
  //    is a name swap; here we move any pending death between the two).
  if (decisions.buddySwap && decisions.buddySwap.length === 2){
    const buddy = game.players.find(p => p.roleId === "Buddy" && p.alive);
    if (buddy && buddy.powers.buddySwap){
      const [aId, bId] = decisions.buddySwap;
      const aP = pending[aId], bP = pending[bId];
      // swap pending marks
      if (aP) pending[bId] = aP; else delete pending[bId];
      if (bP) pending[aId] = bP; else delete pending[aId];
      buddy.powers.buddySwap = false;
      const a = byId(aId), b = byId(bId);
      note(`Buddy the Elf swaps ${a ? a.name : aId} and ${b ? b.name : bId}.`);
      event("Buddy the Elf", buddy.id, aId, "swapped:"+bId);
      report.swaps.push({ a: a ? a.name : aId, b: b ? b.name : bId });
    }
  }

  // 7) SHIELDS (Yukon) — absorb the first attack; cancel that death.
  for (const id in pending){
    const p = byId(id);
    if (p && p.shieldCount > 0){
      p.shieldCount -= 1;
      cancelKill(id);
      note(`${p.name} survives the attack (shield).`);
    }
  }

  // 8) LOVER CHAINS — anyone still pending who has a lover drags the lover in.
  //    Iterate until stable (a chain of two).
  let added = true;
  while (added){
    added = false;
    for (const id in {...pending}){
      const p = byId(id);
      if (p && p.loverOf && !pending[p.loverOf]){
        const lover = byId(p.loverOf);
        if (lover && lover.alive){ markKill(lover.id, "lover"); added = true;
          note(`${lover.name} dies of heartbreak (lover of ${p.name}).`); }
      }
    }
  }

  // 9) FINALIZE — apply deaths, clear nightly scratch flags.
  for (const id in pending){
    const p = byId(id);
    if (p && p.alive){
      p.alive = false; p.deathSource = pending[id];
      report.deaths.push({ playerId: id, name: p.name, source: pending[id] });
      game.log.push({ night: game.nightNumber, type: "death", playerId: id, name: p.name, source: pending[id] });
      event("Death", null, id, pending[id]);
    }
  }
  // clear protection flags for next night
  game.players.forEach(p => { p.protectedThisNight = false; });

  report.log.forEach(m => game.log.push({ night: game.nightNumber, type: "note", msg: m }));
  return report;
}
