// ============================================================
// One Night Before Christmas — NIGHT ENGINE
// Walks the flat TIMELINE in exact order. Each step's `when`
// conditions are tested against the active gameplay tokens.
// ============================================================

const AUDIO_DIR = "Audio/Gameplay/";

// Pausable wait: counts down only while not paused, and bails out if stopped.
// Polls every 100ms so the Pause button takes effect during player-action delays.
function wait(ms, state) {
  return new Promise(resolve => {
    if (!state) { setTimeout(resolve, ms); return; }
    let remaining = ms;
    const step = 100;
    const id = setInterval(() => {
      if (state.stopped) { clearInterval(id); resolve(); return; }
      if (state.paused) return;            // frozen while paused
      remaining -= step;
      if (remaining <= 0) { clearInterval(id); resolve(); }
    }, step);
  });
}

// Map selected roster ids -> set of active gameplay tokens.
// Duplicates (Grinch1/2/3, Elf1..6, Misers1/2, Tiny/Tiny2) collapse to their group.
export function activeTokens(roster, selectedIds) {
  const tokens = new Set();
  const byId = Object.fromEntries(roster.map(r => [r.id, r]));
  for (const id of selectedIds) {
    const r = byId[id];
    if (!r) continue;
    tokens.add(r.group || r.id);
  }
  return tokens;
}

// Compute the RudolphOr target the original engine used: the LAST-listed
// selected role among Rudolph's "view another player" options, only if 2+.
const RUDOLPH_ORDER = ["Frosty","Hinkle","Hocus","Krampus","BadSanta","Santa",
  "Calvin","Belsnickel","Wet","Mrs","Kevin","Buddy","Shelf","Cupid","Max"];
function rudolphOr(tokens) {
  if (!tokens.has("Rudolph")) return { target:"", count:0 };
  let count = 0, target = "";
  for (const r of RUDOLPH_ORDER) {
    if (tokens.has(r)) { count++; if (r !== "Frosty") target = r; }
  }
  return { target: count < 2 ? "" : target, count };
}

// Evaluate one structured condition object against tokens + rudolph state.
function condMet(cond, tokens, rud) {
  if (cond.has !== undefined)  return tokens.has(cond.has);
  if (cond.not !== undefined)  return !tokens.has(cond.not);
  if (cond.anyOf)              return cond.anyOf.some(t => tokens.has(t));
  if (cond.allOf)              return cond.allOf.every(t => tokens.has(t));
  if (cond.anyOfRaw)           return cond.anyOfRaw.some(c => condMet(c, tokens, rud));
  if (cond.allOf_struct)       return cond.allOf_struct.every(c => condMet(c, tokens, rud));
  if (cond.negate)             return !condMet(cond.negate, tokens, rud);
  if (cond.rudolphOr !== undefined)  return rud.target === cond.rudolphOr;
  if (cond.rudolphCount)       return rud.count > 0;
  if (cond.rudolphCountLt2)    return rud.count < 2;
  // Miser Brothers only meaningfully wake if both are in play, OR Rudolph is present
  // (Rudolph could have become a Miser and needs the cue).
  if (cond.misersActive)       return (rud.misersCount >= 2) || tokens.has("Rudolph");
  if (cond.raw !== undefined)  return true; // unknown legacy guard: don't block
  return true;
}
function stepApplies(step, tokens, rud) {
  if (!step.when || step.when.length === 0) return true;
  return step.when.every(c => condMet(c, tokens, rud));
}

function pauseMs(token, settings) {
  if (!token) return 0;
  if (/^\d+$/.test(token)) return parseInt(token, 10);
  const base = token.includes("Vote") ? settings.voteTimer : settings.roleTimer;
  const mult = (token.match(/\*\s*(\d+)/) || [, 1])[1];
  return base * parseInt(mult, 10);
}

// ui callbacks: showEyes, clearEyes, render(step), play(src),
//               markPause(ms), clearPause, startVote(ms), nightComplete
export async function runNight(TIMELINE, roster, selectedIds, settings, ui, state) {
  const tokens = activeTokens(roster, selectedIds);
  const rud = rudolphOr(tokens);
  // Count how many distinct Miser Brother cards are actually selected (they collapse
  // to one token, so we count raw ids). Needed to skip the lone-Miser-no-Rudolph case.
  const byId = Object.fromEntries(roster.map(r => [r.id, r]));
  rud.misersCount = selectedIds.filter(id => (byId[id]?.group || byId[id]?.id) === "Misers").length;

  ui.showEyes();
  await ui.play(AUDIO_DIR + "001_Eyes.mp3");
  await wait(settings.introMs ?? 1500, state);
  ui.clearEyes();
  ui.render({ subtitle: "" });

  for (const step of TIMELINE) {
    if (state.stopped) break;
    if (!stepApplies(step, tokens, rud)) continue;

    // The final wake step: show the Wake graphic, play wake audio, then run the vote.
    if (step.wake) {
      ui.wake();
      await ui.play(AUDIO_DIR + step.audio);
      if (!state.stopped) ui.startVote(settings.voteTimer);
      continue;
    }

    // pauseBefore: hold on the PRIOR screen (the instruction) so players can act,
    // then reveal this step and play its audio.
    const pb = pauseMs(step.pauseBefore, settings);
    if (pb) {
      const showBar = /Timer/.test(step.pauseBefore);   // only player-action pauses get the candy-cane bar
      if (showBar) ui.markPause(pb);
      await wait(pb, state);
      if (showBar) ui.clearPause();
    }

    if (step.subtitle !== undefined || step.subtitle2 || step.center || step.left || step.right || step.token)
      ui.render(step);
    if (step.audio) await ui.play(AUDIO_DIR + step.audio);

    const p = pauseMs(step.pause, settings);
    if (p) {
      const showBar = /Timer/.test(step.pause);
      if (showBar) ui.markPause(p);
      await wait(p, state);
      if (showBar) ui.clearPause();
    }
  }
}
