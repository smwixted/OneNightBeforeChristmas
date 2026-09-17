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

// ---- Single source of truth for what a CARD grants its holder ----
// Every place a player's identity is set OR changed to a given card reads
// from these three — the initial deal (makePlayer), a card changing hands
// mid-game via a Wet steal (gacReassignRole), and a player confirming which
// physical card they actually hold (index.html's gacApplyCardPicks, which
// imports these). A role's team/powers/shield rule only ever needs to be
// written once here; nothing else may hardcode this mapping.
export function gacCardTeam(roleId){
  const card = CARD_BY_ID[roleId] || {};
  return card.team === "grinch" ? "grinch" : "christmas";
}
export function gacCardPowers(roleId){
  return {
    krampusConvert:  roleId === "Krampus",
    mrsClausSave:    roleId === "Mrs",
    mrsClausPoison:  roleId === "Mrs",
    buddySwap:       roleId === "Buddy",
    wetBanditsSteal: roleId === "Wet",
  };
}
// The SHIELD belongs to the card, not the player — Yukon Cornelius survives
// his first attack, so whoever holds the Yukon card holds that shield, and
// whoever gives it up loses it. The spent state travels too: if the card
// has ALREADY absorbed an attack this game, a new holder doesn't get a
// fresh one — game.spentShields tracks that per card, not per player.
export function gacCardShield(game, roleId){
  if (!game.spentShields) game.spentShields = {};
  return game.spentShields[roleId] ? 0 : startingShield(roleId);
}

// Create a fresh Player from a name + the card they hold.
export function makePlayer(id, name, roleId){
  return {
    id, name,
    roleId,
    startRoleId: roleId,        // the card they were originally dealt (never changes)
    startTeam: gacCardTeam(roleId),
    team: gacCardTeam(roleId),   // moderator never a player
    alive: true,
    loverOf: null,
    protectedThisNight: false,
    lastProtectedNight: 0,
    shieldCount: startingShield(roleId),   // no game object yet at creation — a fresh deal can't have a spent shield
    powers: gacCardPowers(roleId),
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
    // Sam the Snowman is the MODERATOR, never a stealable center card. If nobody
    // holds Sam, that card simply isn't in play — otherwise the Wet Bandits could
    // steal it out of the center and "become" the narrator.
    if (id === "Sam") continue;
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
// Eliminate a player. If they have a lover, the lover dies of heartbreak too —
// this cascades for ANY cause of death (day vote, tie, Jack Frost, self-elim,
// host adjustment, night kill), so lovers always live and die together.
// Returns the list of everyone who died from this call: [{playerId, name, source}]
export function eliminate(game, playerId, source){
  const deaths = [];
  const kill = (id, src) => {
    const p = game.players.find(x => x.id === id);
    if (!p || !p.alive) return;
    p.alive = false;
    p.deathSource = src || "unknown";
    game.log.push({ night: game.nightNumber, type: "death", playerId: id, name: p.name, source: src });
    deaths.push({ playerId: id, name: p.name, source: src });
    // Heartbreak: drag the lover in (their own lover chain is handled by
    // recursing, and the alive-guard above makes it terminate).
    if (p.loverOf){
      const lover = game.players.find(x => x.id === p.loverOf);
      if (lover && lover.alive) kill(lover.id, "heartbreak");
    }
  };
  kill(playerId, source);
  return deaths;
}

// The moderator (Sam) is never counted as a living PLAYER — not for win
// conditions, not for in/out lists. They run the game; they aren't in it.
export function living(game){ return game.players.filter(p => p.alive && p.roleId !== "Sam"); }

// ---- Win check ----
// Two win modes (game.settings.gacWinMode):
//   "majority" (default, classic): the Grinches win once they reach parity with
//       the rest of the town, checked right after a day vote — BUT only if
//       Christmas has no possible path back (see gacChristmasHasPathToVictory).
//   "total":    play until a faction is COMPLETELY eliminated (or the lovers are
//       all that remain).
//
// Burgermeister note: he sits on the Christmas team but only wins if the
// GRINCHES win, so he is not "opposition" — a board of Grinches + Burgermeister
// has nobody left fighting them, and the Grinches have already won.
function gacOpposition(live){
  return live.filter(p => p.team !== "grinch" && p.roleId !== "Burger");
}

// Does Christmas have ANY possible path back to victory from here?
//
// This is a fully-determined count race, not a search -- both sides' turn
// sequence and behavior are pinned down exactly (win-CALCULATION assumptions
// only, never a gameplay rule imposed on the actual players):
//   [[evaluate here, right after a vote]] -> NIGHT (the Grinches' kill lands
//   on a Christmas player unless blocked/saved; Christmas's own night powers
//   fire) -> NEXT VOTE (a coordinated Christmas bloc removes one Grinch
//   whenever Others' living count is still >= the living Grinch count --
//   Grinches vote worst-case for themselves, i.e. they split rather than
//   coordinate a defense, so a united Christmas bloc beats them even at an
//   exact tie; Grinches never vote for or kill a teammate) -> repeat.
//
// SUCCESS CONDITION (unchanged from the earlier design): a path exists the
// moment the living Grinch count could drop BELOW its current value by any
// amount -- not only if it can reach zero. "Christmas only WINS at zero
// Grinches" is untouched and lives entirely in checkWin()'s own step 2
// total-elimination check; this function only governs when a GRINCH win is
// declared.
//
// Given that sequence, the race reduces to a closed-form check with no
// simulation needed at all:
//   - Any Christmas tool that can KILL or REDIRECT onto a Grinch (Mrs's
//     unused poison, a living Belsnickel, Buddy's unused swap) always lands
//     at least once -- even a one-time use fires on the very first night,
//     since there's always >= 1 living Grinch to target, and decisions
//     within a night are simultaneous (a power-holder who also dies that
//     same night still gets their action off first). This alone is always
//     enough to satisfy "any reduction," at every board size.
//   - Otherwise, with grinches > others already, no amount of PURELY
//     defensive blocking (Elf's protect, Mrs's save, Yukon's shield) can
//     ever change the outcome -- recurring or one-time, it can only ever
//     hold the current ratio steady (at best) or let it decay (at worst);
//     it can never IMPROVE it, and only an improved ratio lets a vote
//     succeed. A losing count stays a losing count no matter how long the
//     Grinches are held off. (Confirmed by hand-derivation and an exhaustive
//     verification table across every board from 1v1 to 6v6, run before
//     this replaced the earlier brute-force search -- see
//     test/gac-sim/verify-grinch-win-model.mjs.)
//   - The one case pure defense DOES matter: an EXACT tie (grinches ===
//     others). Surviving just that one night preserves the tie into the
//     very next vote, which then succeeds (>= threshold) and cascades from
//     there. Any single blocking resource suffices -- Elf's protect and
//     Mrs's save both require a living Other besides themselves to target
//     (neither can protect/save themselves); Yukon's shield is inherently
//     his own and needs no other target.
export function gacChristmasHasPathToVictory(game){
  const live = living(game);
  const G = live.filter(p => p.team === "grinch").length;
  const O = gacOpposition(live).length;

  const mrs = live.find(p => p.roleId === "Mrs");
  const belsnickel = live.find(p => p.roleId === "Belsnickel");
  const buddy = live.find(p => p.roleId === "Buddy");
  const shelf = live.find(p => p.roleId === "Shelf");
  const yukon = live.find(p => p.roleId === "Yukon");

  const hasOffense =
    (mrs && mrs.powers && mrs.powers.mrsClausPoison) ||
    !!belsnickel ||
    (buddy && buddy.powers && buddy.powers.buddySwap);
  if (hasOffense) return true;

  if (G > O) return false;   // Grinches strictly ahead -- defense alone can never rescue this

  // G === O: an exact tie -- any blocking resource that can actually fire
  // preserves it into a vote that removes a Grinch.
  return !!(
    (shelf && O >= 2) ||
    (mrs && mrs.powers && mrs.powers.mrsClausSave && O >= 2) ||
    (yukon && yukon.shieldCount > 0)
  );
}

export function checkWin(game, context){
  const afterVote = !!(context && context.afterVote);
  const mode = (game.settings && game.settings.gacWinMode) || "majority";
  const live = living(game);
  const grinches = live.filter(p => p.team === "grinch");
  const others   = gacOpposition(live);   // excludes Burgermeister

  // 0) Everyone is dead (e.g. a Grinch and Belsnickel kill each other on the
  //    final night) -> nobody wins. Without this the game hangs with 0 alive.
  if (live.length === 0) return "draw";

  // 1) Cross-team lovers as the final two -> lovers win (anytime, in any mode).
  if (live.length === 2){
    const [a, b] = live;
    if (a.loverOf === b.id && b.loverOf === a.id && a.team !== b.team){
      return "lovers";
    }
  }
  // 2) Total elimination of a faction ends the game whenever it happens.
  //    Note "others" excludes Burgermeister, so Grinches + Burgermeister = a
  //    Grinch win (he's rooting for them, and he wins alongside them).
  if (grinches.length === 0 && others.length > 0) return "christmas";
  if (others.length === 0 && grinches.length > 0) return "grinch";

  // 3) Numeric parity — "majority" mode only, and only right after a vote.
  //    Withheld while ANY of these still-open paths exist, checked in order:
  //      a) a living cross-team lover pair -- lovers have their OWN win
  //         condition (last two alive), so their mere existence means a
  //         non-Grinch outcome is still possible. This is a simple
  //         short-circuit; the reachability search below never needs to
  //         reason about lovers at all.
  //      b) Jack Frost alive -- his revenge kill lives in index.html, not
  //         simulable here, so this is a hardcoded carve-out rather than
  //         something the search can discover on its own.
  //      c) otherwise, ask the reachability search: does Christmas have any
  //         possible path left to zero out the Grinches?
  if (mode !== "total" && afterVote && grinches.length > 0 && grinches.length >= others.length){
    const anyCrossTeamLoverPairAlive = live.some(p => {
      if (!p.loverOf) return false;
      const partner = live.find(x => x.id === p.loverOf);
      return !!(partner && partner.team !== p.team);
    });
    const anyFrostAlive = live.some(p => p.roleId === "Frost");
    if (!anyCrossTeamLoverPairAlive && !anyFrostAlive && !gacChristmasHasPathToVictory(game)){
      return "grinch";
    }
  }

  // 4) Keep playing.
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
//     krampusConvert: true,           // Krampus: convert grinchKill's victim? (yes/no only -- not a separate target)
//     mrsSave:   true,                // Mrs. Claus: save grinchKill's victim? (yes/no only -- not a separate target)
//     mrsPoison: playerId,            // Mrs. Claus poison target (free choice)
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
  player.roleId = newRoleId;
  player.team = gacCardTeam(newRoleId);
  player.powers = gacCardPowers(newRoleId);   // once-per-game powers reset to the new role's
  player.shieldCount = gacCardShield(game, newRoleId);
}

// Apply the Wet Bandits' steal: the Wet player takes the target's card, the
// target receives a center card (One Night style), and the Wet card goes to the
// center. Idempotent — guarded by decisions._wetApplied so it runs exactly once
// whether triggered early (the "everyone check your card" beat) or at
// resolveNight. Logs to game.log / game.events directly.
export function applyWetSteal(game, decisions){
  decisions = decisions || {};
  // Night-1-only, same as Cupid -- a stale/late wetSteal decision on any
  // later night is ignored. index.html's own gacStartNight() always sets
  // game.nightNumber before either of its applyWetSteal() call sites fire,
  // so this is a no-op for real night-1 play and only rejects stale input.
  if (!decisions.wetSteal || decisions._wetApplied || game.nightNumber !== 1) return;
  decisions._wetApplied = true;
  if (!game.log) game.log = [];
  if (!game.events) game.events = [];
  const byId = id => game.players.find(p => p.id === id);
  const pushNote = (msg) => game.log.push({ night: game.nightNumber, type: "note", msg });
  const pushEvent = (power, actorId, targetId, result, roles) =>
    game.events.push({ night: game.nightNumber, power, actorId: actorId||null, targetId: targetId||null, result: result||null,
                       actorRole: (roles && roles.actorRole) || null, targetRole: (roles && roles.targetRole) || null });
  const wet = game.players.find(p => p.roleId === "Wet" && p.alive);
  const wetName = wet ? wet.name : "The Wet Bandits";
  if (decisions.wetSteal === "center"){
    // Swap with a center card: Wet takes a center role, Wet card goes to center.
    if (wet && game.centerCards && game.centerCards.length){
      // Which center card did they take? With 2+ center cards in a PHYSICAL deal
      // the app can't know, so Sam confirms it (decisions.wetCenterPick = index).
      let ci = 0;
      const pick = decisions.wetCenterPick;
      if (pick !== undefined && pick !== null && pick !== ""){
        const n = parseInt(pick, 10);
        if (!isNaN(n) && n >= 0 && n < game.centerCards.length) ci = n;
      }
      const taken = game.centerCards.splice(ci, 1)[0];
      game.centerCards.push("Wet");
      gacReassignRole(game, wet, taken);
      const takenName = (CARD_BY_ID[taken]||{}).name || taken;
      pushNote(`${wetName} (Wet Bandits) swapped with the center card — they are now ${takenName}, and the Wet Bandits card moves to the center.`);
    } else {
      pushNote(`${wetName} (Wet Bandits) swapped with the center card.`);
    }
    pushEvent("Wet Bandits", wet?wet.id:null, null, "stole:center", { actorRole: "Wet" });
  } else {
    const t = byId(decisions.wetSteal);
    if (t && wet){
      const stolenRole = t.roleId;        // the card Wet Bandits takes
      let givenRole = "Wet";
      if (game.centerCards && game.centerCards.length){
        // Which center card did the victim receive? In a physical deal with more
        // than one center card, Sam confirms it (decisions.wetCenterPick holds
        // the index). Otherwise there's only one sensible answer — take the first.
        let ci = 0;
        const pick = decisions.wetCenterPick;
        if (pick !== undefined && pick !== null && pick !== ""){
          const n = parseInt(pick, 10);
          if (!isNaN(n) && n >= 0 && n < game.centerCards.length) ci = n;
        }
        givenRole = game.centerCards.splice(ci, 1)[0];
        game.centerCards.push("Wet");     // the Wet Bandits card goes to the center
      }
      gacReassignRole(game, wet, stolenRole);   // Wet player becomes the stolen role
      gacReassignRole(game, t, givenRole);      // victim becomes a center card
      const givenName = (CARD_BY_ID[givenRole]||{}).name || givenRole;
      pushNote(`${wetName} stole ${t.name}'s card: ${wetName} is now ${(CARD_BY_ID[stolenRole]||{}).name||stolenRole}, and ${t.name} received a new card (${givenName}).`);
      // Roles as they were AT THE STEAL: the thief was the Wet Bandits, and the
      // victim held the card that was taken from them.
      pushEvent("Wet Bandits", wet.id, t.id, "stole", { actorRole: "Wet", targetRole: stolenRole });
    }
  }
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
    // Capture the roles AS THEY ARE RIGHT NOW. Roles change during a game (Wet
    // steals, Krampus conversions), so the log needs the role the player held at
    // the moment the power hit them — not their final role.
    const a = actorId ? byId(actorId) : null;
    const t = targetId ? byId(targetId) : null;
    game.events.push({ night: game.nightNumber, power, actorId: actorId||null, targetId: targetId||null, result: result||null,
                       actorRole: a ? a.roleId : null, targetRole: t ? t.roleId : null });
  };

  // Scratch: pending death markers for this night. We track by player id, with
  // a source, so the pipeline can cancel/move them before finalizing.
  // pending[id] = source string
  const pending = {};
  // Mark a player as dying tonight.
  //
  // PROTECTION TRUMPS EVERY KILL. The Elf on the Shelf's protection blocks any
  // attack — the Grinches, Belsnickel, and Mrs. Claus's poison alike. Putting the
  // guard HERE (rather than at each call site) means protection covers every kill
  // vector by construction, including any role added later.
  //
  // The ONE exception is "lover" (heartbreak): if your lover dies, you die with
  // them. That isn't an attack, so no shield or protection can stop it — it's the
  // price of Cupid's link. Pass source "lover" to bypass the guard.
  // Mark a player as dying tonight.
  //
  // NOTE ON ORDERING: this only RECORDS the attack. Protection is NOT applied here
  // — it's applied later (step 6b), AFTER Buddy has had his chance to swap seats.
  // Buddy swaps SEATS, so both the incoming attack and the Elf's protection travel
  // with the seat; resolving protection up front would block an attack before it
  // could be moved, and the swap would do nothing.
  //
  // Heartbreak ("lover") is not an attack and is never blockable — it's applied
  // after protection resolves, so it isn't affected either way.
  const markKill = (id, source) => {
    if (!id) return false;
    pending[id] = source;
    return true;
  };
  const cancelKill = (id) => { delete pending[id]; };
  // Is this player's death currently blocked by the Elf's protection?
  const isProtected = (id) => { const p = byId(id); return !!(p && p.protectedThisNight); };

  // 0) CUPID LINK (night 1 ONLY) — bind two players as lovers before anything
  //    else. Ignored on any later night (Cupid only ever wakes night 1).
  if (decisions.cupidLink && decisions.cupidLink.length === 2 && game.nightNumber === 1){
    const [aId, bId] = decisions.cupidLink;
    const a = byId(aId), b = byId(bId);
    if (a && b && a.id !== b.id){
      a.loverOf = b.id; b.loverOf = a.id;
      note(`Cupid links ${a.name} and ${b.name} as lovers.`);
      event("Cupid", gacFindHolder(game,"Cupid"), a.id, "linked:"+b.id);
    }
  }

  // WET BANDITS (night 1) — physical card steal; recorded for the log only.
  // The actual card reassignment is done by applyWetSteal(), which may already
  // have run earlier in the night (so players see their new role during the
  // "everyone check your card" beat). Calling it here is a no-op if so.
  if (decisions.wetSteal){
    applyWetSteal(game, decisions);
  }

  // 1) PROTECT (Elf on the Shelf) — requires a living Shelf. Two illegal
  //    targets are rejected rather than applied: protecting themselves, and
  //    protecting the same player two nights running (manual). A rejected
  //    target wastes the night's protection entirely (like a wasted Mrs.
  //    Claus cookie) -- the Elf does NOT fall back to a different player.
  let protectedId = decisions.protect || null;
  if (protectedId){
    const shelf = game.players.find(p => p.roleId === "Shelf" && p.alive);
    const p = byId(protectedId);
    if (shelf && p){
      const isSelf = p.id === shelf.id;
      // lastProtectedNight defaults to 0 ("never protected"), which would
      // otherwise collide with night 1's "previous night" (also 0) and wrongly
      // flag every night-1 protection as a repeat -- guard with nightNumber > 1.
      const isRepeat = game.nightNumber > 1 && p.lastProtectedNight === game.nightNumber - 1;
      if (!isSelf && !isRepeat){
        p.protectedThisNight = true; p.lastProtectedNight = game.nightNumber;
        note(`Elf on the Shelf protects ${p.name}.`);
        event("Elf on the Shelf", shelf.id, p.id, "protected");
      } else {
        const why = isSelf ? "themselves" : "the same player two nights running";
        note(`Elf on the Shelf's protection is wasted -- tried to protect ${why}.`);
        event("Elf on the Shelf", shelf.id, p.id, "protect wasted");
      }
    }
  }

  // 2) GRINCH KILL — requires at least one living Grinch-team member; a stale
  //    decision after they're all gone is silently ignored. Whether the kill
  //    LANDS is decided at step 6b, after Buddy has had his chance to swap seats.
  if (decisions.grinchKill){
    const anyGrinchAlive = game.players.some(p => p.team === "grinch" && p.alive);
    const target = anyGrinchAlive ? byId(decisions.grinchKill) : null;
    if (target){
      markKill(target.id, "grinch");
      note(`Grinches choose to kill ${target.name}.`);
      event("Grinches", null, target.id, "attacked");
    }
  }

  // 3) KRAMPUS CONVERT — yes/no on the Grinches' victim.
  //
  //    Krampus can only take someone who would OTHERWISE DIE tonight. He fails if
  //    the victim is rescued by any means:
  //      - the Elf on the Shelf protected them (the attack never landed), or
  //      - Mrs. Claus saves them with a cookie, or
  //      - they're holding the Yukon card and their shield absorbs the attack.
  //
  //    A failed conversion STILL SPENDS the power — Krampus can be baited into
  //    wasting his once-per-game convert on a protected target. That's the risk
  //    he takes. (He resolves BEFORE Mrs. Claus's save and the shield step, so he
  //    has to look ahead at those rescues rather than just check `pending`.)
  if (decisions.krampusConvert){
    const victimId = decisions.grinchKill;
    const victim = victimId ? byId(victimId) : null;
    const krampus = game.players.find(p => p.roleId === "Krampus" && p.alive);
    if (victim && krampus && krampus.powers.krampusConvert){
      // Will Mrs. Claus save this same victim tonight?
      const mrsNow = game.players.find(p => p.roleId === "Mrs" && p.alive);
      const willBeSaved = !!(decisions.mrsSave && mrsNow && mrsNow.powers.mrsClausSave &&
                             decisions.grinchKill === victim.id);
      // Will their own shield (Yukon) absorb the attack?
      const willBeShielded = victim.shieldCount > 0;
      // Is the Elf protecting them? (Attacks are now RECORDED up front and only
      // blocked at step 6b, so check the protection flag directly — a pending
      // death no longer means the attack will actually land.)
      const wasProtected = isProtected(victim.id);

      krampus.powers.krampusConvert = false;   // the power is USED either way

      if (wasProtected || willBeSaved || willBeShielded){
        const why = wasProtected  ? "they were protected"
                  : willBeSaved   ? "Mrs. Claus got to them first"
                  :                 "they shrugged off the attack";
        note(`Krampus reached for ${victim.name}, but ${why} — the conversion fails.`);
        event("Krampus", krampus.id, victim.id, "convert failed");
      } else {
        cancelKill(victim.id);
        victim.team = "grinch";
        victim.converted = true;            // joined the Grinch team via Krampus
        note(`Krampus converts ${victim.name} to the Grinch team instead of letting them die.`);
        event("Krampus", krampus.id, victim.id, "converted");
      }
    }
  }

  // 4) MRS. CLAUS — save first (yes/no on the Grinches' victim), then poison.
  //    Her save is once-per-game and, like Krampus, it is SPENT when used even if
  //    it turns out the victim was never in danger (already protected by the Elf).
  //    She CANNOT save herself (mirrors the Elf's own self-protect rule) --
  //    a self-save attempt wastes the cookie same as an "never in danger" one.
  if (decisions.mrsSave){
    const mrs = game.players.find(p => p.roleId === "Mrs" && p.alive);
    const victimId = decisions.grinchKill;
    const tgt = victimId ? byId(victimId) : null;
    if (mrs && tgt && mrs.powers.mrsClausSave){
      mrs.powers.mrsClausSave = false;   // the cookie is USED either way
      const isSelf = tgt.id === mrs.id;
      // "Never in danger" = no attack on them at all, OR the Elf already has them
      // covered. (Attacks are recorded up front now, so a pending mark alone
      // doesn't mean the attack will actually land.)
      const neverInDanger = !pending[tgt.id] || isProtected(tgt.id);
      if (isSelf){
        note(`Mrs. Claus cannot save herself -- the cookie is wasted.`);
        event("Mrs. Claus", mrs.id, tgt.id, "save wasted");
      } else if (neverInDanger){
        note(`Mrs. Claus offered ${tgt.name} a cookie, but they were never in danger — the cookie is wasted.`);
        event("Mrs. Claus", mrs.id, tgt.id, "save wasted");
      } else {
        cancelKill(tgt.id);
        note(`Mrs. Claus saves ${tgt.name} with a nice cookie.`);
        event("Mrs. Claus", mrs.id, tgt.id, "saved");
      }
    }
  }
  if (decisions.mrsPoison){
    const mrs = game.players.find(p => p.roleId === "Mrs" && p.alive);
    const tgt = byId(decisions.mrsPoison);
    if (mrs && tgt && mrs.powers.mrsClausPoison){
      markKill(tgt.id, "poison");          // whether it lands is decided at step 6b
      mrs.powers.mrsClausPoison = false;   // the poison is USED either way
      note(`Mrs. Claus poisons ${tgt.name}.`);
      event("Mrs. Claus", mrs.id, tgt.id, "poisoned");
    }
  }

  // SANTA INSPECT — information only (no state change); recorded for the log and
  // for mobile play where the result is shown privately to Santa. Once Santa
  // dies, Scott Calvin inherits this nightly check (manual) -- attribute the
  // log entry to whichever of them is actually alive to perform it.
  if (decisions.santaInspect){
    const tgt = byId(decisions.santaInspect);
    if (tgt){
      const actor = game.players.find(p => p.roleId === "Santa" && p.alive)
                 || game.players.find(p => p.roleId === "Calvin" && p.alive);
      const actorLabel = actor && actor.roleId === "Calvin" ? "Scott Calvin" : "Santa Claus";
      note(`${actorLabel} checks ${tgt.name}: ${tgt.team === "grinch" ? "naughty (Grinch)" : "nice (Christmas)"}.`);
      event(actorLabel, actor ? actor.id : null, tgt.id, tgt.team==="grinch"?"checked:naughty":"checked:nice");
    }
  }

  // 5) BELSNICKEL KILL — requires a living Belsnickel; a stale decision naming
  //    one after he's dead is silently ignored (nobody performed it).
  if (decisions.belsnickelKill){
    const bels = game.players.find(p => p.roleId === "Belsnickel" && p.alive);
    const target = bels ? byId(decisions.belsnickelKill) : null;
    if (target){
      markKill(target.id, "belsnickel");
      note(`Belsnickel kills ${target.name}.`);
      event("Belsnickel", bels.id, target.id, "attacked");
    }
  }

  // 6) BUDDY SWAP — Buddy swaps the two players' SEATS.
  //
  //    Everything aimed at a SEAT travels with it. The night's attacks and the
  //    Elf's protection were aimed at where someone was SITTING, so after the swap
  //    they apply to whoever is sitting there now:
  //      - a pending death moves to the other player
  //      - the Elf's protection moves to the other player
  //    So a player swapped INTO a protected seat gains that protection, and one
  //    swapped OUT of it loses it. (Yukon's shield is NOT seat-based — it's the
  //    person's own card, so it stays with them and still resolves at step 7.)
  if (decisions.buddySwap && decisions.buddySwap.length === 2){
    const buddy = game.players.find(p => p.roleId === "Buddy" && p.alive);
    if (buddy && buddy.powers.buddySwap){
      const [aId, bId] = decisions.buddySwap;
      const a = byId(aId), b = byId(bId);
      if (a && b){
        // Snapshot both seats, then hand each seat's contents to the other player.
        const aDeath = pending[aId], bDeath = pending[bId];
        const aProt  = a.protectedThisNight, bProt = b.protectedThisNight;
        // Deaths follow the seat.
        if (bDeath) pending[aId] = bDeath; else delete pending[aId];
        if (aDeath) pending[bId] = aDeath; else delete pending[bId];
        // Protection follows the seat too.
        a.protectedThisNight = bProt;
        b.protectedThisNight = aProt;
        buddy.powers.buddySwap = false;
        note(`Buddy the Elf swaps ${a.name} and ${b.name} — everything aimed at their seats swaps with them.`);
        event("Buddy the Elf", buddy.id, aId, "swapped:"+bId);
        report.swaps.push({ a: a.name, b: b.name });
      }
    }
  }

  // 6b) PROTECTION RESOLVES — now that seats are final (Buddy has swapped, if he
  //     did), the Elf's protection defends whoever is actually sitting there.
  //     Protection trumps every attack: the Grinches, Belsnickel, and the poison.
  //     (Heartbreak is applied later, at step 8, and is never blockable.)
  for (const id of Object.keys(pending)){
    if (isProtected(id)){
      const p = byId(id);
      const src = pending[id];
      cancelKill(id);
      note(`${p.name} was attacked, but they were protected — it fails.`);
      event("Elf on the Shelf", gacFindHolder(game,"Shelf"), id, "blocked:"+src);
    }
  }

  // 7) SHIELDS (Yukon) — absorb the first attack; cancel that death.
  for (const id in pending){
    const p = byId(id);
    if (p && p.shieldCount > 0){
      p.shieldCount -= 1;
      // Remember the CARD's shield is now spent — if this card later changes hands
      // (Wet Bandits steal), the new holder doesn't get a fresh shield.
      if (!game.spentShields) game.spentShields = {};
      game.spentShields[p.roleId] = true;
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
