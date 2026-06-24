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

  // Player count: must not exceed the number of selected cards, and at least one
  // card should remain in the center.
  const sel = selectedCardIds.length;
  if (players.length){
    if (players.length > sel){
      problems.push(`${players.length} players, but only ${sel} cards are selected.`);
    } else if (players.length === sel){
      problems.push(`${players.length} players claim all ${sel} cards — at least one card should stay in the center.`);
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
