// ============================================================
// One Night Before Christmas — MULTIPLAYER
// Ephemeral room + mobile voting over Supabase Realtime.
//
// Design (see the diagrams we built):
//   - The HOST device is the source of truth. It owns game state,
//     the vote tally, and the authoritative countdown clock.
//   - PLAYER devices are remotes: they join by code, render a vote
//     screen + synced timer, and broadcast their pick back to the host.
//   - The room is just a Realtime CHANNEL named after the room code.
//     No database tables, no logins. When phones stop listening,
//     the room ceases to exist. Nothing to clean up.
//
// This whole file is self-contained so the static single-player game
// keeps working untouched. Nothing here runs unless multiplayer is on.
// ============================================================

// ----- STEP 1: connect to Supabase -----
// We load the Supabase JS client from a CDN as an ES module.
// Fill these two in from your Supabase project (Settings -> API):
//   SUPABASE_URL  = your project URL, e.g. https://abcd1234.supabase.co
//   SUPABASE_ANON = the *public* "anon" key.
//
// The anon key is SAFE to ship in this static site. Supabase has two keys:
// a secret service_role key (never expose) and this public anon key, which
// is designed to live in client code. With no database tables in play, it
// can only join realtime channels and pass messages — that's the whole
// reason this works with no backend server of our own.
//
// The import is wrapped so that if the CDN is unreachable, the app can show
// a clear message instead of a blank screen. We try a primary CDN, then a
// fallback, before giving up.
let createClient = null;
let loadError = null;
async function loadSupabase() {
  if (createClient) return createClient;
  const sources = [
    "https://esm.sh/@supabase/supabase-js@2",
    "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm",
  ];
  for (const src of sources) {
    try {
      const mod = await import(/* @vite-ignore */ src);
      createClient = mod.createClient;
      if (createClient) return createClient;
    } catch (e) { loadError = e; }
  }
  throw loadError || new Error("Could not load the realtime library.");
}

const SUPABASE_URL  = "https://wdgorqlaaxdzlgikrkrh.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkZ29ycWxhYXhkemxnaWtya3JoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzOTU3MTgsImV4cCI6MjA5Njk3MTcxOH0.oXozcmdp4J0NHVaYjLROEfEXNt0Mb79WuAuMrkJD688";

// `configured` lets the rest of the app detect whether multiplayer is wired
// up yet. Before you paste your keys, the menu item can show a friendly
// "not set up yet" note instead of throwing errors.
export const configured =
  SUPABASE_URL.startsWith("http") && SUPABASE_ANON.length > 20;

// One shared client for the whole app (created lazily so an unconfigured
// build never even constructs it).
let supabase = null;
async function client() {
  if (!supabase) {
    const create = await loadSupabase();
    supabase = create(SUPABASE_URL, SUPABASE_ANON);
  }
  return supabase;
}

// ----- STEP 2: the room layer -----

// A short, unambiguous room code. We skip easily-confused characters
// (0/O, 1/I) so nobody mistypes the code their kid is reading aloud.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeCode(len = 4) {
  let c = "";
  for (let i = 0; i < len; i++)
    c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return c;
}

// localStorage is the ONE bit of per-phone memory: it remembers "this phone
// is player <name> in room <code>" so a screen-lock or accidental refresh
// rejoins as the same player instead of a stranger. It is per-device only —
// it never holds live game state, just a reconnect note.
const LS_KEY = "onbc_mp_session";
export function saveSession(s){ try{ localStorage.setItem(LS_KEY, JSON.stringify(s)); }catch(_){} }
export function loadSession(){ try{ return JSON.parse(localStorage.getItem(LS_KEY)||"null"); }catch(_){ return null; } }
export function clearSession(){ try{ localStorage.removeItem(LS_KEY); }catch(_){} }

// A "room" is a thin wrapper around one Realtime channel. Both host and
// players use the same join function; they differ only in the role they
// pass and the messages they send. The channel name is literally the code.
//
//   onPresence(list)  -> called whenever the set of people in the room changes
//   onMessage(type, payload, fromHost) -> called for every broadcast
//
// Returns an object with { send, leave, code }.
export async function joinRoom({ code, role, name, onPresence, onMessage }) {
  const sb = await client();
  const ch = sb.channel(`room:${code}`, {
    config: {
      // presence keyed by a stable id so reconnects replace, not duplicate
      presence: { key: `${role}:${name}` },
      broadcast: { self: false }, // don't echo our own messages back to us
    },
  });

  // Broadcast: every game message rides on a single event name "msg",
  // with a {type, payload} body. One event keeps the protocol simple;
  // we switch on `type` in the handler.
  ch.on("broadcast", { event: "msg" }, ({ payload }) => {
    if (onMessage) onMessage(payload.type, payload.payload, payload.fromHost);
  });

  // Presence: Supabase tracks who is currently subscribed. We flatten its
  // state into a simple list of { role, name } for the caller.
  ch.on("presence", { event: "sync" }, () => {
    const state = ch.presenceState();
    const list = [];
    for (const key in state)
      for (const entry of state[key]) list.push(entry);
    if (onPresence) onPresence(list);
  });

  ch.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      // Announce ourselves to the room.
      await ch.track({ role, name, at: Date.now() });
    }
  });

  return {
    code,
    // send a typed message to everyone in the room
    send(type, payload, fromHost = false) {
      ch.send({ type: "broadcast", event: "msg", payload: { type, payload, fromHost } });
    },
    async leave() {
      try { await ch.untrack(); } catch(_) {}
      try { const sb = await client(); await sb.removeChannel(ch); } catch(_) {}
    },
  };
}

// Host helper: spin up a brand-new room with a fresh code.
export async function createRoom({ name, onPresence, onMessage }) {
  const code = makeCode();
  const room = await joinRoom({ code, role: "host", name, onPresence, onMessage });
  return room;
}

// ============================================================
// STEP 3: the HOST state machine
// States (from the diagram): idle -> open -> locked -> tally -> resolved -> idle
//
// Only the host runs this. Players never compute anything; they render
// what the host broadcasts and send taps back.
// ============================================================

export function createVoteSession({ room, hostName, hostIsPlayer, showVotesCast, allowCheat, votingEnabled, getPresentPlayers, audioEl, onState, onCallout }) {
  const voting = votingEnabled !== false;   // default true for back-compat
  let firedMinute = false, firedThirty = false;
  // The single most important data structure: votes as a KEYED MAP.
  //   { "Kyle": "Sam", "Pat": "Sam", "Sam": "Pat" }
  // One entry per voter. A re-tap overwrites the same key, which is how
  // "change your vote until lock" works with zero extra logic. Tallying is
  // just counting the values.
  let votes = {};
  let state = "idle";
  let endsAt = null;     // authoritative epoch-ms when the timer expires
  let timerId = null;
  let endTimeout = null;

  function setState(s, extra = {}) {
    state = s;
    if (onState) onState(s, { votes: { ...votes }, endsAt, ...extra });
    // Broadcast running progress so every phone can show the count.
    if (s === "open" || s === "countdown") {
      room.send("vote_progress", { voted: Object.keys(votes).length, total: openCandidates.length }, true);
    }
  }

  // Have all expected voters voted? (drives early-reveal)
  // Checks against the candidate list locked in at open(), NOT live presence,
  // so a name mismatch or a late join can't stall the lock.
  let openCandidates = [];
  function everyoneVoted() {
    return openCandidates.length > 0 && openCandidates.every(n => votes[n] != null);
  }

  // ----- OPEN: start collecting -----
  function open(durationMs, candidateList) {
    votes = {};
    firedMinute = false; firedThirty = false;
    openCandidates = [...new Set((candidateList || []).map(s => (s||"").trim()).filter(Boolean))];
    endsAt = Date.now() + durationMs;
    // If the whole vote is 60s or less, the "1 minute" cue is irrelevant.
    if (durationMs <= 60000) firedMinute = true;
    room.send("vote_open", { candidates: openCandidates, endsAt, allowCheat: !!allowCheat, voting }, true);
    setState("open", { candidates: openCandidates });

    clearInterval(timerId);
    timerId = setInterval(tick, 250);
    clearTimeout(endTimeout);
    // Hard backstop in case intervals are throttled while backgrounded.
    endTimeout = setTimeout(() => { if (state === "open") beginCountdown(); }, durationMs + 400);
  }

  function tick() {
    if (state !== "open") return;
    const remain = endsAt - Date.now();
    // Countdown audio reminders (fire on the host; broadcast so all phones hear).
    if (!firedMinute && remain <= 60000){ firedMinute = true; doCallout("950_Minute.mp3"); }
    if (!firedThirty && remain <= 30000){ firedThirty = true; doCallout("951_30Seconds.mp3"); }
    if (Date.now() >= endsAt) return beginCountdown();   // timer ended
    if (everyoneVoted()) return beginCountdown();         // everyone voted early
  }

  function doCallout(file){
    if (onCallout) onCallout(file);
    room.send("vote_callout", { file }, true);   // players play it too
  }

  // A vote arrived (player broadcast or host's own tap). Votes remain editable
  // during BOTH the open phase and the 3-2-1 countdown phase (your rule: people
  // can change their vote until the audio ends).
  function recordVote(voter, choice) {
    if (state !== "open" && state !== "countdown") return;
    voter = (voter||"").trim();
    votes[voter] = choice;                   // overwrite per voter
    setState(state, { candidates: openCandidates });
  }

  // Clear a voter's vote (player tapped their pick again to deselect).
  function clearVote(voter) {
    if (state !== "open" && state !== "countdown") return;
    voter = (voter||"").trim();
    delete votes[voter];
    setState(state, { candidates: openCandidates });
  }

  // ----- COUNTDOWN: play the 3-2-1 vote audio. Votes stay editable. When the
  // audio finishes (or a hard fallback), we lock and tally. -----
  function beginCountdown() {
    if (state !== "open") return;            // guard against double-fire
    clearInterval(timerId);
    clearTimeout(endTimeout);
    setState("countdown", { candidates: openCandidates });
    room.send("vote_countdown", { candidates: openCandidates, votes, allowCheat: !!allowCheat, voting }, true);

    let done = false;
    const fire = () => {
      if (done) return; done = true; cleanup();
      // With mobile voting OFF, there's no tally or results screen — the vote
      // happened out loud. Just end the round back to idle.
      if (!voting) { room.send("vote_aborted", {}, true); setState("idle"); return; }
      tally();
    };
    const onEnded = () => fire();
    function cleanup(){ if (audioEl) audioEl.removeEventListener("ended", onEnded); clearTimeout(fallback); }
    let fallback = setTimeout(fire, 9000);   // hard cap regardless of audio state
    if (audioEl) {
      audioEl.addEventListener("ended", onEnded);
      try { audioEl.currentTime = 0; } catch(_){}
      const pr = audioEl.play();
      if (pr && pr.catch) pr.catch(() => {/* fallback still fires */});
    }
  }

  // ----- TALLY: count, find the top -----
  // No tie logic by design: we reveal everyone at the max vote count, whether
  // that's one name or several. The game's rules decide what that means.
  function tally() {
    const counts = {};
    for (const voter in votes) {
      const c = votes[voter];
      counts[c] = (counts[c] || 0) + 1;
    }
    let max = 0;
    for (const name in counts) if (counts[name] > max) max = counts[name];
    const top = Object.keys(counts).filter(n => counts[n] === max);

    const results = {
      counts,                                   // { Sam: 2, Pat: 1 }
      top,                                      // ["Sam"] or ["Sam","Pat"]
      max,
      // who-voted-for-whom only travels if the host enabled it
      ballots: showVotesCast ? { ...votes } : null,
    };
    room.send("vote_results", results, true);
    setState("resolved", { results });
  }

  // Back to idle for the next round.
  function reset() {
    clearInterval(timerId);
    votes = {}; endsAt = null;
    setState("idle");
  }

  // Abort: host cancels the round. Tell players, go idle, no results.
  function abort() {
    clearInterval(timerId); clearTimeout(endTimeout);
    votes = {}; endsAt = null;
    room.send("vote_aborted", {}, true);
    setState("idle");
  }

  // Pause/resume the countdown. Freezes the timer (stops the clock and the
  // auto-lock) and tells players to show a paused state. Resume restores the
  // remaining time.
  let pausedRemaining = null;
  function pause() {
    if (state !== "open" || pausedRemaining != null) return;
    pausedRemaining = Math.max(0, endsAt - Date.now());
    clearInterval(timerId); clearTimeout(endTimeout);
    room.send("vote_paused", {}, true);
    setState("open", { candidates: openCandidates, paused: true });
  }
  function resume() {
    if (state !== "open" || pausedRemaining == null) return;
    endsAt = Date.now() + pausedRemaining;
    pausedRemaining = null;
    room.send("vote_open", { candidates: openCandidates, endsAt, allowCheat: !!allowCheat, voting }, true);
    setState("open", { candidates: openCandidates });
    clearInterval(timerId); timerId = setInterval(tick, 250);
    clearTimeout(endTimeout);
    endTimeout = setTimeout(() => { if (state === "open") beginCountdown(); }, (endsAt - Date.now()) + 400);
  }
  const isPaused = () => pausedRemaining != null;

  // Jump straight to the 3-2-1 countdown now (host pressed "Vote Now").
  function forceCountdown() {
    if (state !== "open") return;
    if (pausedRemaining != null) pausedRemaining = null;   // unpause if paused
    beginCountdown();
  }

  return {
    open,
    recordVote,
    clearVote,
    reset,
    abort,
    pause,
    resume,
    isPaused,
    forceCountdown,
    get state(){ return state; },
    get votes(){ return { ...votes }; },
  };
}

// ============================================================
// STEP 5: SESSION MANAGER (persistent room across many games)
//
// Earlier, a room was created at the vote step and destroyed at results.
// A SESSION keeps one room alive: the host opens it once ("Host a Session"),
// players join once, and the same room is reused for every game's vote until
// the host ends the session. Between games the room just sits idle.
//
// This module-level singleton holds the active host session so the menu, the
// vote step, and the UI all share one room.
// ============================================================

let hostSession = null;   // { room, code, players, voteSession, onUpdate, ... }

export function getHostSession(){ return hostSession; }

// Open a persistent session. Called by the "Host a Session" menu button.
export async function startSession({ hostName, onPlayersChanged, onVoteFromPlayer }) {
  if (hostSession) return hostSession;          // already hosting
  let players = [];
  const room = await createRoom({
    hostName,
    name: hostName,
    onPresence: (list) => {
      players = list;
      if (onPlayersChanged) onPlayersChanged(uniquePlayers(players));
    },
    onMessage: (type, payload) => {
      // A player's vote during an active round routes to the live vote session.
      if (type === "vote_cast" && hostSession && hostSession.voteSession)
        hostSession.voteSession.recordVote(payload.voter, payload.choice);
      if (type === "vote_clear" && hostSession && hostSession.voteSession)
        hostSession.voteSession.clearVote(payload.voter);
      if (type === "want_host" && onVoteFromPlayer) { /* reserved for future host-handoff */ }
      // A player's GAC decision comes back here; route to whoever's waiting.
      if (type === "gac_choice" && hostSession && hostSession.onGacChoice)
        hostSession.onGacChoice(payload);
      if (type === "gac_cardpick" && hostSession && hostSession.onGacCardPick)
        hostSession.onGacCardPick(payload);
      if ((type === "gac_wheel_drag" || type === "gac_wheel_ready") && hostSession && hostSession.onGacWheelInput)
        hostSession.onGacWheelInput(type, payload);
      if (type === "gac_nudge_reply" && hostSession && hostSession.onGacNudgeReply)
        hostSession.onGacNudgeReply(payload);
      if (type === "gac_peek" && hostSession && hostSession.onGacPeek)
        hostSession.onGacPeek(payload);
    },
  });
  // Players present, deduped by name (presence can list a reconnecting phone
  // more than once). First occurrence wins.
  function uniquePlayers(list){
    const seen = new Set(); const out = [];
    for (const p of list) {
      if (p.role !== "player") continue;
      if (seen.has(p.name)) continue;
      seen.add(p.name); out.push(p);
    }
    return out;
  }
  hostSession = {
    room,
    code: room.code,
    get players(){ return uniquePlayers(players); },
    voteSession: null,
    hostName,
    _handlers: { onPlayersChanged, onVoteFromPlayer },
  };
  return hostSession;
}

// Change the host's display name during an active session. Presence is keyed by
// name, so we rejoin the SAME room code under the new name and re-broadcast.
export async function renameHost(newName, cheat) {
  if (!hostSession) return;
  const code = hostSession.code;
  const { onPlayersChanged, onVoteFromPlayer } = hostSession._handlers;
  newName = (newName || "").trim().slice(0, 16);
  if (!newName || newName === hostSession.hostName) return;
  try { await hostSession.room.leave(); } catch(_){}
  let players = [];
  const room = await joinRoom({
    code, role: "host", name: newName,
    onPresence: (list) => { players = list; if (onPlayersChanged) onPlayersChanged(uniq(list)); },
    onMessage: (type, payload) => {
      if (type === "vote_cast" && hostSession && hostSession.voteSession)
        hostSession.voteSession.recordVote(payload.voter, payload.choice);
      if (type === "vote_clear" && hostSession && hostSession.voteSession)
        hostSession.voteSession.clearVote(payload.voter);
    },
  });
  function uniq(list){ const s=new Set(),o=[]; for(const p of list){ if(p.role!=="player")continue; if(s.has(p.name))continue; s.add(p.name); o.push(p);} return o; }
  hostSession.room = room;
  hostSession.hostName = newName;
  if (cheat) room.send("roles", { cheat }, true);
  return hostSession;
}

// End the session: tear down the room. Players will get a "session ended" signal.
export async function endSession() {
  if (!hostSession) return;
  try { hostSession.room.send("session_ended", {}, true); } catch(_){}
  try { await hostSession.room.leave(); } catch(_){}
  hostSession = null;
}

// Broadcast the current cheat-sheet data (wake order, non-waking, tokens) so
// joined phones can show/refresh the cheat sheet — call whenever the host
// changes the character selection.
export function broadcastRoles(cheat, hostIsPlayer) {
  if (hostSession) hostSession.room.send("roles",
    { cheat, hostName: hostSession.hostName, hostIsPlayer: !!hostIsPlayer }, true);
}

// The host moved between games (ONBC <-> GAC). Tell joined players so their
// phones follow into the same game. The live session/room is unchanged — only
// which game screen everyone is looking at changes.
export function broadcastGameSwitch(game) {
  if (hostSession) hostSession.room.send("game_switch", { game }, true);
}

// ============================================================
// GAC per-phone decision routing
// ============================================================

// Send a decision prompt to ONE player (by name). Returns nothing; the player's
// reply arrives via the onGacChoice handler registered with onGacChoice().
export function gacSendPrompt(playerName, prompt) {
  if (hostSession) hostSession.room.send("gac_prompt", { ...prompt, _to: playerName }, true);
}
// Send a waiting message to everyone (e.g. "night in progress").
export function gacBroadcastWait(msg) {
  if (hostSession) hostSession.room.send("gac_wait", { msg }, true);
}
// Send a private info result to one player (e.g. Santa's naughty/nice reveal).
export function gacSendInfo(playerName, info) {
  if (hostSession) hostSession.room.send("gac_info", { ...info, _to: playerName }, true);
}
// Clear GAC prompts (back to waiting screen) for everyone.
export function gacBroadcastClear() {
  if (hostSession) hostSession.room.send("gac_clear", {}, true);
}
// "Are you still there?" nudge for a player who's been waiting a while on a
// decision — shown as a non-intrusive banner on their phone that doesn't
// disturb whatever screen they're already looking at.
export function gacSendNudge(playerName) {
  if (hostSession) hostSession.room.send("gac_nudge", { _to: playerName }, true);
}
// Register the host's handler for a player tapping "I'm here" in reply.
export function onGacNudgeReply(fn) {
  if (hostSession) hostSession.onGacNudgeReply = fn;
}
// Register the host's handler for a player peeking at their dealt card.
export function onGacPeek(fn) {
  if (hostSession) hostSession.onGacPeek = fn;
}
// Register the host's handler for player choices coming back.
export function onGacChoice(fn) {
  if (hostSession) hostSession.onGacChoice = fn;
}

// ---- Card selection at game start ----
export function gacSendCardPick(prompt) {
  if (hostSession) hostSession.room.send("gac_pickcard", prompt, true);
}
export function onGacCardPick(fn) {
  if (hostSession) hostSession.onGacCardPick = fn;
}

// ---- Grinch wheel ----
export function gacStartWheel(payload) {
  if (hostSession) hostSession.room.send("gac_wheel", payload, true);
}
export function gacUpdateWheel(payload) {
  if (hostSession) hostSession.room.send("gac_wheel_state", payload, true);
}
export function onGacWheelInput(fn) {
  if (hostSession) hostSession.onGacWheelInput = fn;
}
