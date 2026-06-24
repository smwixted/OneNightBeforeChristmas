// ============================================================
// One Night Before Christmas — MULTIPLAYER UI (v51)
// Persistent sessions + on-theme host vote screen + picture cheat sheet
// + collapsible "who voted for whom".
//
//   HOST side: uses the game's OWN themed vote screen (Nitemare-font timer,
//              VoteNow graphic). We only overlay a small vote-progress strip
//              and (if host is a player) the host's vote buttons. We never
//              cover the themed screen with a plain panel.
//   PLAYER side: a clean themed panel (join -> name -> vote -> results),
//              with a picture cheat sheet button bottom-right.
//
// Sessions: the host opens a room once via the menu ("Host a Session"); the
// same room is reused for every game's vote. Players stay joined across games.
// ============================================================

import { configured, joinRoom, createVoteSession,
         saveSession, loadSession, clearSession,
         startSession, endSession, getHostSession, broadcastRoles, renameHost }
  from "./multiplayer.js?v=72";

export { configured, startSession, endSession, getHostSession, broadcastRoles, renameHost };

// ---- tiny DOM helpers ----
const el = (tag, props = {}, kids = []) => {
  const n = document.createElement(tag);
  Object.assign(n, props);
  if (props.style) n.setAttribute("style", props.style);
  for (const k of [].concat(kids)) if (k != null) n.append(k);
  return n;
};
const fmtTime = (msLeft) => {
  const t = Math.max(0, Math.ceil(msLeft / 1000));
  const m = Math.floor(t / 60), s = t % 60;
  return m > 0 ? `${m}:${s < 10 ? "0" : ""}${s}` : `${s}`;
};

function makeLayer(id) {
  let layer = document.getElementById(id);
  if (!layer) { layer = el("div", { id, className: "mpLayer" }); document.body.append(layer); }
  return layer;
}

function ensureStyles() {
  if (document.getElementById("mpStyles")) return;
  const css = `
  .mpLayer{position:fixed;inset:0;z-index:9000;display:none;
    background:url("Blue.jpg") repeat;color:#fff;font-family:Arial,Helvetica,sans-serif;
    overflow-y:auto;padding:20px;box-sizing:border-box}
  .mpLayer.show{display:block}
  .mpWrap{max-width:520px;margin:0 auto;text-align:center}
  .mpCode{font-family:"GingerbreadFont",cursive;font-size:48px;letter-spacing:6px;font-weight:normal;color:#f3c969;margin:6px 0}
  .mpTimer{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;font-size:64px;font-weight:normal;color:#f3c969;line-height:1}
  .mpH{font-family:"GingerbreadFont",cursive;font-size:26px;letter-spacing:1.5px;margin:14px 0 6px;color:var(--frost,#cfe0ea)}
  .mpSub{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;font-size:17px;opacity:.9;margin:4px 0 16px}
  .mpBtn{font-family:"GingerbreadFont",cursive;font-size:20px;letter-spacing:1px;padding:12px 22px;border:none;border-radius:8px;
    background:rgba(255,255,255,.92);color:#1f6f1f;font-weight:normal;cursor:pointer;margin:6px;min-width:120px}
  .mpBtn.alt{background:#cfe0ea}
  .mpInput{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;font-size:24px;padding:12px;border-radius:10px;border:2px solid #cfe0ea;
    width:80%;max-width:300px;text-align:center}
  .mpList{list-style:none;padding:0;margin:14px 0;text-align:left}
  .mpList li{background:rgba(255,255,255,.08);border-radius:10px;padding:10px 14px;
    margin:6px 0;font-size:18px;font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif}
  .mpBallotToggle,.mpBallotList{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif}
  .mpRowFlex{display:flex;justify-content:space-between;align-items:center}
  .mpVote{display:block;width:100%;font-size:20px;padding:16px;margin:8px 0;
    border:2px solid #cfe0ea;border-radius:12px;background:transparent;color:#fff;
    cursor:pointer;font-weight:bold}
  .mpVote.picked{background:#f3c969;color:#0f2c3d;border-color:#f3c969}
  .mpVoted{font-size:13px;color:#9fd}
  .mpHostCtrls{display:flex;gap:18px;justify-content:center;align-items:center;margin-top:18px}
  .mpCtrlBtn{width:62px;height:62px;object-fit:contain;cursor:pointer;transition:transform .12s;
    filter:drop-shadow(0 2px 5px rgba(0,0,0,.5))}
  .mpCtrlBtn:hover{transform:scale(1.08)}
  .mpCtrlBtn.votenow{width:260px;height:auto;max-height:none}

  /* Host overlay strip — sits at the bottom of the themed vote screen,
     does NOT cover it. */
  .mpHostStrip{position:fixed;left:0;right:0;bottom:0;z-index:9000;
    background:rgba(15,44,61,.94);color:#fff;padding:10px 14px;display:none;
    font-family:Arial,Helvetica,sans-serif;text-align:center;
    box-shadow:0 -2px 12px rgba(0,0,0,.4)}
  .mpHostStrip.show{display:block}
  .mpHostStrip .prog{font-size:15px;color:#9fd;margin-bottom:6px}
  .mpHostStrip .hv{display:inline-block;font-size:16px;padding:8px 14px;margin:3px;
    border:2px solid #cfe0ea;border-radius:10px;background:transparent;color:#fff;cursor:pointer}
  .mpHostStrip .hv.picked{background:#f3c969;color:#0f2c3d;border-color:#f3c969}

  /* Cheat sheet with pictures */
  .mpCheatBtn{position:fixed;bottom:16px;right:16px;z-index:9100;
    background:#cfe0ea;color:#0f2c3d;border:none;border-radius:24px;
    padding:12px 18px;font-weight:bold;font-size:15px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4)}
  .mpCheat{position:fixed;inset:0;z-index:9200;background:url("Blue.jpg") repeat;
    display:none;box-sizing:border-box}
  .mpCheat.show{display:block}
  .mpCheatScroll{position:absolute;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:18px 18px 40px}
  .mpCheatX{position:fixed;top:12px;left:12px;z-index:9300;
    background:rgba(255,255,255,.92);color:#1f6f1f;border:none;border-radius:8px;
    width:44px;height:44px;font-size:22px;cursor:pointer;font-family:"GingerbreadFont",cursive;
    box-shadow:0 2px 8px rgba(0,0,0,.4)}
  .mpCheatSec{font-family:"GingerbreadFont",cursive;color:#f3c969;text-align:center;
    font-size:24px;letter-spacing:1.5px;margin:18px 0 8px;border-bottom:1px solid rgba(255,255,255,.25);padding-bottom:6px}
  .mpCheatGrid{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;max-width:600px;margin:0 auto}
  .mpCheatCard{background:rgba(8,20,28,.55);border-radius:12px;padding:8px;width:150px;text-align:center}
  .mpCheatCard img{width:100%;border-radius:8px;display:block;aspect-ratio:3/4;object-fit:cover}
  .mpCheatCard .cn{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;color:#f3c969;font-size:15px;margin-top:6px}
  .mpCheatCard .cd{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;font-size:13px;line-height:1.3;margin-top:3px;color:#fff}
  /* Token cards: round images, contained (not cropped), a touch smaller so they
     never get cut off. */
  .mpCheatCard.tok{width:135px}
  .mpCheatCard.tok img{aspect-ratio:1/1;object-fit:contain;background:transparent;border-radius:0}
  .mpCheatSub{display:flex;align-items:center;justify-content:center;gap:10px;max-width:600px;margin:14px auto 4px}
  .mpCheatSub img{width:46px;height:46px;object-fit:contain}
  .mpCheatSub span{font-family:"GingerbreadFont",cursive;color:#f3c969;font-size:20px;letter-spacing:1px}
  .mpCheatClose{display:block;margin:14px auto 24px}

  /* collapsible ballots */
  .mpBallotToggle{cursor:pointer;color:#9fd;font-size:13px;margin-top:4px}
  .mpBallotList{margin:6px 0 0;padding-left:6px;font-size:14px;color:#cfe;display:none}
  .mpBallotList.show{display:block}
  `;
  document.head.append(el("style", { id: "mpStyles", textContent: css }));
}

// ============================================================
// CHEAT SHEET — sectioned, with character pictures and a fixed close X.
// getData() -> { wakeOrder:[{name,desc,image}], nonWaking:[...], tokens:[...] }
// Back-compat: if getData() returns an array, treat it as one flat group.
// ============================================================
// Shared cheat-sheet card grid + section builder, used by both the pop-over
// panel and the inline (timer-only mode) display.
function cheatCardGrid(items, isToken){
  const grid = el("div", { className: "mpCheatGrid" });
  for (const r of items) {
    const card = el("div", { className: "mpCheatCard" + (isToken ? " tok" : "") });
    if (r.image) card.append(el("img", { src: r.image, alt: r.name, loading: "lazy" }));
    card.append(el("div", { className: "cn", textContent: r.name }));
    card.append(el("div", { className: "cd", textContent: r.desc || "" }));
    grid.append(card);
  }
  return grid;
}
function buildCheatSections(container, data){
  if (Array.isArray(data)) data = { wakeOrder: data, nonWaking: [], standaloneTokens: [], presentTokens: [] };
  const { wakeOrder = [], nonWaking = [], standaloneTokens = [], presentTokens = [] } = (data || {});
  if (wakeOrder.length){
    container.append(el("h3", { className: "mpCheatSec", textContent: "Wake Order" }));
    container.append(cheatCardGrid(wakeOrder));
  }
  if (nonWaking.length){
    container.append(el("h3", { className: "mpCheatSec", textContent: "Non-Waking Roles" }));
    container.append(cheatCardGrid(nonWaking));
  }
  if (standaloneTokens.length || presentTokens.length){
    container.append(el("h3", { className: "mpCheatSec", textContent: "Tokens" }));
    if (standaloneTokens.length) container.append(cheatCardGrid(standaloneTokens, true));
    if (presentTokens.length){
      const sub = el("div", { className: "mpCheatSub" });
      sub.append(el("img", { className: "mpCheatSubImg", src: "Tokens/Present.png", alt: "Christmas Present Token" }));
      sub.append(el("span", { textContent: "Christmas Present Tokens" }));
      container.append(sub);
      container.append(cheatCardGrid(presentTokens, true));
    }
  }
  const empty = !wakeOrder.length && !nonWaking.length && !standaloneTokens.length && !presentTokens.length;
  if (empty) container.append(el("div", { className: "mpSub", textContent: "No roles selected yet." }));
}

// Append the cheat sheet inline (used in timer-only mode under the timer).
function appendInlineCheat(wrap, data){
  const box = el("div", { style:"margin-top:14px" });
  buildCheatSections(box, data);
  wrap.append(box);
}

function mountCheatSheet(getData) {
  ensureStyles();
  let panel = document.getElementById("mpCheatPanel");
  if (panel) panel.remove();
  panel = el("div", { id: "mpCheatPanel", className: "mpCheat" });
  document.body.append(panel);

  // Fixed close X — top-left, stays put no matter how far you scroll.
  const closeX = el("button", { className: "mpCheatX", textContent: "✕", title: "Close" });
  closeX.onclick = () => panel.classList.remove("show");
  panel.append(closeX);

  const scroll = el("div", { className: "mpCheatScroll" });
  panel.append(scroll);

  function render() {
    scroll.innerHTML = "";
    const wrap = el("div", { className: "mpWrap" });
    buildCheatSections(wrap, getData() || {});
    scroll.append(wrap);
  }

  let btn = document.getElementById("mpCheatBtn");
  if (btn) btn.remove();
  btn = el("button", { id: "mpCheatBtn", className: "mpCheatBtn", textContent: "📋 Cheat Sheet" });
  document.body.append(btn);
  btn.style.display = "none";
  btn.onclick = () => { render(); panel.classList.add("show"); scroll.scrollTop = 0; };
  return {
    showBtn(){ btn.style.display = "block"; },
    hideBtn(){ btn.style.display = "none"; panel.classList.remove("show"); },
    refresh(){ if (panel.classList.contains("show")) render(); },
  };
}

// Shared results renderer with collapsible ballots.
// Totals descending; tap a name that received votes to expand its voters.
function renderResultsInto(wrap, r) {
  wrap.append(el("div", { className: "mpH",
    textContent: r.top && r.top.length > 1 ? "It's a tie!" : "Most votes:" }));
  wrap.append(el("div", { className: "mpCode", style: "font-size:30px;letter-spacing:2px",
    textContent: (r.top && r.top.join(", ")) || "No votes" }));

  // Invert ballots -> who voted for each candidate (only if host shared them).
  const votersFor = {};
  if (r.ballots) for (const voter in r.ballots) {
    const choice = r.ballots[voter];
    (votersFor[choice] = votersFor[choice] || []).push(voter);
  }

  const counts = r.counts || {};
  const ul = el("ul", { className: "mpList" });
  Object.keys(counts).sort((a, b) => counts[b] - counts[a]).forEach(name => {
    const li = el("li", {});
    const row = el("div", { className: "mpRowFlex" }, [
      el("span", { textContent: name }),
      el("span", { textContent: `${counts[name]} vote${counts[name] === 1 ? "" : "s"}` }),
    ]);
    li.append(row);
    if (votersFor[name] && votersFor[name].length) {
      const toggle = el("div", { className: "mpBallotToggle", textContent: "▸ who voted for them" });
      const list = el("div", { className: "mpBallotList" });
      votersFor[name].forEach(v => list.append(el("div", { textContent: "• " + v })));
      toggle.onclick = () => {
        const open = list.classList.toggle("show");
        toggle.textContent = (open ? "▾" : "▸") + " who voted for them";
      };
      li.append(toggle); li.append(list);
    }
    ul.append(li);
  });
  wrap.append(ul);
}

// ============================================================
// HOST VOTING — drives one round on the PERSISTENT session.
// Uses the game's themed vote screen; overlays only a bottom strip.
// hooks: { showThemedVote, hideThemedVote, setTimerText }
// ============================================================
export function startHostVoting({ settings, votingEnabled, getCheatData, voteAudioEl, durationMs, onFinished, hooks }) {
  ensureStyles();
  const sess = getHostSession();
  if (!sess) {
    alert("Start a session first (menu → Host a Session) so players can join.");
    if (onFinished) onFinished();
    return;
  }
  const voting = !!votingEnabled;          // interactive vote buttons vs timer-only
  const room = sess.room;
  const hostName = sess.hostName;
  const getPresentPlayers = () => sess.players;

  const cheat = mountCheatSheet(getCheatData);
  // The host's cheat sheet button only appears if they're also a player AND
  // cheat sheets are allowed during the vote — otherwise the host is just the
  // narrator and gets the plain timer screen.
  const hostGetsCheat = !!settings.mpHostPlayer && !!settings.mpCheat;
  if (hostGetsCheat) cheat.showBtn();

  // The host now uses the SAME full-screen vote layout as players (blue panel,
  // Nitemare timer, big vote buttons), plus a host-only control row. We hide the
  // game's themed stage while this layer is up.
  if (hooks && hooks.hideThemedVote) hooks.hideThemedVote();
  const layer = makeLayer("mpHostLayer");
  layer.classList.add("show");
  let wrap = el("div", { className: "mpWrap" });
  layer.innerHTML = ""; layer.append(wrap);

  // State vars MUST be declared before session.open() runs, because open()
  // synchronously triggers renderState which reads them.
  let timerRaf = null;
  let lastEndsAt = null;
  let myPick = null;

  const session = createVoteSession({
    room, hostName,
    hostIsPlayer: !!settings.mpHostPlayer,
    showVotesCast: !!settings.mpShowVotes,
    allowCheat: !!settings.mpCheat,
    votingEnabled: voting,
    getPresentPlayers,
    audioEl: voteAudioEl,
    onState: (state, data) => renderState(state, data),
    onCallout: (file) => { if (hooks && hooks.playCallout) hooks.playCallout(file); },
  });
  sess.voteSession = session;

  // Start collecting immediately — players already joined via the session.
  session.open(durationMs, buildCandidates());

  function buildCandidates(){
    const names = getPresentPlayers().map(p => p.name);
    if (settings.mpHostPlayer) names.push(hostName);
    return [...new Set(names.filter(Boolean))];
  }

  function renderState(state, data) {
    if (data && data.endsAt) lastEndsAt = data.endsAt;
    if (state === "idle") return hostExit();        // aborted
    if (state === "open") return renderOpen(data, false);
    if (state === "countdown") return renderOpen(data, true);
    if (state === "locked") return renderLocked();
    if (state === "resolved") return renderResolved(data);
  }

  function hostExit(){
    cancelAnimationFrame(timerRaf);
    layer.classList.remove("show");
    cheat.hideBtn();
    if (hooks && hooks.hideThemedVote) hooks.hideThemedVote();
    sess.voteSession = null;
    if (onFinished) onFinished();
  }

  function renderOpen(data, countdown) {
    const candidates = data.candidates || [];
    if (hostGetsCheat) cheat.showBtn(); else cheat.hideBtn();
    const paused = !!data.paused;
    wrap.innerHTML = "";

    // Top: timer (or Vote.png graphic during the 3-2-1 countdown).
    if (countdown){
      const img = el("img", { src: "Vote.png", alt: "Vote Now",
        style: "max-width:60%;max-height:32vh;display:block;margin:0 auto 6px" });
      wrap.append(img);
      if (voting && settings.mpHostPlayer)
        wrap.append(el("div", { className: "mpH", textContent: "Last chance to change your vote!" }));
    } else {
      const timer = el("div", { className: "mpTimer", textContent: fmtTime((lastEndsAt||Date.now()) - Date.now()) });
      wrap.append(timer);
      wrap.append(el("div", { className: "mpH",
        textContent: paused ? "Paused"
                   : voting && settings.mpHostPlayer ? "Who do you vote for?"
                   : voting ? "Players are voting…"
                   : "Discuss and vote out loud" }));
      cancelAnimationFrame(timerRaf);
      if (!paused){
        const tick = () => {
          timer.textContent = fmtTime((lastEndsAt||Date.now()) - Date.now());
          if (Date.now() < (lastEndsAt||0)) timerRaf = requestAnimationFrame(tick);
        };
        timerRaf = requestAnimationFrame(tick);
      }
    }

    // Vote buttons — only when mobile voting is ON and the host is a player.
    if (voting && settings.mpHostPlayer) {
      myPick = data.votes[hostName] || null;
      const box = el("div", {});
      for (const name of candidates) {
        if (name === hostName) continue;
        const b = el("button", { className: "mpVote" + (myPick === name ? " picked" : ""), textContent: name });
        b.onclick = () => {
          if (myPick === name) { myPick = null; b.classList.remove("picked"); session.clearVote(hostName); }
          else {
            myPick = name;
            [...box.children].forEach(c => c.classList.toggle("picked", c.textContent === name));
            session.recordVote(hostName, name);
          }
        };
        box.append(b);
      }
      wrap.append(box);
    }

    // Live count — only meaningful when mobile voting is on.
    if (voting){
      const voted = Object.keys(data.votes).length;
      wrap.append(el("div", { className: "mpVoted", textContent: `${voted} / ${candidates.length} voted` }));
    }

    // Host controls: Vote Now (big, on its own row up top) jumps to the 3-2-1;
    // below it the Pause/Play and Stop buttons.
    if (!countdown){
      const topRow = el("div", { className: "mpHostCtrls", style:"margin-top:18px" });
      const voteNow = el("img", { className: "mpCtrlBtn votenow", alt: "Vote Now", src: "VoteNow.png", title: "Vote Now" });
      voteNow.onclick = () => { session.forceCountdown(); };
      topRow.append(voteNow);
      wrap.append(topRow);
    }
    const ctrl = el("div", { className: "mpHostCtrls" });
    if (!countdown){
      const pauseBtn = el("img", { className: "mpCtrlBtn", alt: paused ? "Resume" : "Pause",
        src: paused ? "Play.png" : "Pause.png", title: paused ? "Resume" : "Pause" });
      pauseBtn.onclick = () => { if (session.isPaused()) session.resume(); else session.pause(); };
      ctrl.append(pauseBtn);
    }
    const stop = el("img", { className: "mpCtrlBtn", alt: "Stop", src: "Stop.png", title: "End vote" });
    stop.onclick = () => { session.abort(); };
    ctrl.append(stop);
    wrap.append(ctrl);
  }

  function renderLocked() {
    cancelAnimationFrame(timerRaf);
    wrap.innerHTML = "";
    wrap.append(el("div", { className: "mpH", textContent: "Counting votes…" }));
  }

  function renderResolved(data) {
    cancelAnimationFrame(timerRaf);
    cheat.showBtn();   // cheat sheet always available on the results screen
    layer.classList.add("show");
    wrap.innerHTML = "";
    renderResultsInto(wrap, data.results);

    const btnRow = el("div", { style:"margin-top:12px" });
    // Repeat Game — run another FULL GAME (night narrative) with the same characters.
    const repeat = el("button", { className: "mpBtn", textContent: "🔁 Repeat Game" });
    repeat.onclick = () => {
      layer.classList.remove("show");
      cheat.hideBtn();
      sess.voteSession = null;
      if (typeof window.__onbcRepeatGame === "function") window.__onbcRepeatGame();
    };
    // Change Characters — back to selection (session stays open).
    const change = el("button", { className: "mpBtn alt", textContent: "🎭 Change Characters" });
    change.onclick = () => {
      layer.classList.remove("show");
      cheat.hideBtn();
      sess.voteSession = null;
      if (onFinished) onFinished();   // returns host to home; SESSION STAYS OPEN
    };
    btnRow.append(repeat); btnRow.append(change);
    wrap.append(btnRow);
  }
}

// ============================================================
// PLAYER CLIENT — joins a persistent session, survives across games.
// ============================================================
export function startPlayerClient(code) {
  ensureStyles();
  const layer = makeLayer("mpPlayerLayer");
  layer.classList.add("show");
  let wrap = el("div", { className: "mpWrap" });
  layer.innerHTML = ""; layer.append(wrap);

  let room = null, myName = null, cheatData = { wakeOrder:[], nonWaking:[], standaloneTokens:[], presentTokens:[] }, cheat = null, timerRaf = null, lastVoteMsg = null;
  let presentList = [], onWaitingScreen = false, hostIsPlayer = true, hostDisplayName = null;

  const prior = loadSession();
  if (prior && prior.code === code && prior.name) { myName = prior.name; connect(); }
  else renderNameEntry();

  function renderNameEntry() {
    wrap.innerHTML = "";
    wrap.append(el("div", { className: "mpH", textContent: "Join the game" }));
    wrap.append(el("div", { className: "mpSub", textContent: `Room ${code}` }));
    const input = el("input", { className: "mpInput", placeholder: "Your name", maxLength: 16 });
    wrap.append(input); wrap.append(el("div"));
    const btn = el("button", { className: "mpBtn", textContent: "Join" });
    btn.onclick = () => {
      const n = (input.value || "").trim();
      if (!n) { input.focus(); return; }
      myName = n; saveSession({ code, name: myName }); connect();
    };
    wrap.append(btn);
  }

  let waitingMsg = "Waiting for the host to start voting…";
  function waiting(msg) {
    if (msg) waitingMsg = msg;
    onWaitingScreen = true;
    if (cheat) cheat.showBtn();
    cancelAnimationFrame(timerRaf);
    wrap.innerHTML = "";
    wrap.append(el("div", { className: "mpH", textContent: `Hi ${myName}!` }));
    wrap.append(el("div", { className: "mpSub", textContent: waitingMsg }));

    // List of everyone in the room. The host only appears if they're playing.
    const shown = presentList.filter(p => p.role !== "host" || hostIsPlayer);
    if (shown.length){
      wrap.append(el("div", { className: "mpSub", style:"margin-bottom:4px",
        textContent: `In room ${code} (${shown.length}):` }));
      const ul = el("ul", { className: "mpList" });
      shown.forEach(p => {
        const label = p.name + (p.role === "host" ? " (host)" : "") + (p.name === myName ? " — you" : "");
        ul.append(el("li", {}, el("span", { textContent: label })));
      });
      wrap.append(ul);
    }

    const row = el("div", { style:"margin-top:8px" });
    const rename = el("button", { className: "mpBtn alt", textContent: "Change name" });
    rename.onclick = () => promptRename();
    const leave = el("button", { className: "mpBtn alt", textContent: "Leave game" });
    leave.onclick = () => { try { window.__onbcWakeLock && window.__onbcWakeLock.release(); } catch(_){} clearSession(); if (room) room.leave(); location.href = location.origin + location.pathname; };
    row.append(rename); row.append(leave);
    wrap.append(row);
  }

  // Let a joined player change their display name. Rejoins the room under the
  // new name (presence is keyed by name, so we re-track).
  async function promptRename() {
    const ask = window.__onbcPrompt || ((t,d)=>Promise.resolve(window.prompt(t,d)));
    const next = (await ask("Enter your name", myName) || "").trim();
    if (!next || next === myName) return;
    const old = myName;
    myName = next.slice(0, 16);
    saveSession({ code, name: myName });
    try { if (room) await room.leave(); } catch(_){}
    await connect();   // reconnect under the new name
  }

  async function connect() {
    wrap.innerHTML = "";
    wrap.append(el("div", { className: "mpH", textContent: `Hi ${myName}!` }));
    wrap.append(el("div", { className: "mpSub", textContent: "Connecting…" }));
    // Keep the player's phone awake while they're in a game.
    try { window.__onbcWakeLock && window.__onbcWakeLock.acquire(); } catch(_){}
    try {
      room = await joinRoom({
        code, role: "player", name: myName,
        onPresence: (list) => {
          // Dedup by name; keep host flag. Refresh the waiting screen live.
          const seen = new Set(); presentList = [];
          for (const p of list){ if (seen.has(p.name)) continue; seen.add(p.name); presentList.push(p); }
          if (onWaitingScreen) waiting();
        },
        onMessage: (type, payload) => {
          if (type === "roles") {
            cheatData = payload.cheat || payload.roles || cheatData;
            if (payload.hostIsPlayer !== undefined) hostIsPlayer = !!payload.hostIsPlayer;
            if (payload.hostName) hostDisplayName = payload.hostName;
            if (cheat) cheat.refresh(); else setupCheat();
            if (onWaitingScreen) waiting();   // refresh list with updated host status
          }
          if (type === "vote_open") { lastVoteMsg = payload; renderVote(payload, false); }
          if (type === "vote_countdown") { lastVoteMsg = payload; renderVote(payload, true); }
          if (type === "vote_paused") { if (lastVoteMsg) renderVote({ ...lastVoteMsg, paused: true }, false); }
          if (type === "vote_progress") updateProgress(payload);
          if (type === "vote_callout") { try { new Audio("Audio/Gameplay/" + payload.file).play().catch(()=>{}); } catch(_){} }
          if (type === "vote_locked") waiting("Counting votes…");
          if (type === "vote_aborted") waiting("The host cancelled the vote. Waiting for the next game…");
          if (type === "vote_results") renderResults(payload);
          if (type === "session_ended") sessionEnded();
        },
      });
      setupCheat();
      waiting("Waiting for the host to start voting…");
    } catch (e) {
      wrap.innerHTML = "";
      wrap.append(el("div", { className: "mpH", textContent: "Couldn't connect" }));
      wrap.append(el("div", { className: "mpSub", textContent: "Check the internet connection and reload." }));
      const retry = el("button", { className: "mpBtn", textContent: "Reload" });
      retry.onclick = () => location.reload();
      wrap.append(retry);
    }
  }

  function setupCheat() {
    if (!cheat) cheat = mountCheatSheet(() => cheatData);
    const any = cheatData && (cheatData.wakeOrder?.length || cheatData.nonWaking?.length
      || cheatData.standaloneTokens?.length || cheatData.presentTokens?.length);
    if (any) cheat.showBtn();
  }

  let myPick = null;
  let lastVoting = true;
  function renderVote({ candidates, endsAt, allowCheat, voting, paused }, countdown) {
    onWaitingScreen = false;
    if (voting === undefined) voting = true;
    lastVoting = voting;
    if (!countdown) myPick = null;
    wrap.innerHTML = "";

    // ---- TIMER-ONLY MODE (mobile voting OFF) ----
    // No vote buttons. Locked timer at top; if cheat sheet is allowed, show it
    // FULL below the timer. At the 3-2-1 audio, show "VOTE" in the timer's place.
    if (!voting){
      if (cheat) cheat.hideBtn();   // no floating button in this mode
      if (countdown){
        wrap.append(el("div", { className: "mpTimer", style:"font-size:54px", textContent: "VOTE" }));
      } else {
        const timer = el("div", { className: "mpTimer", textContent: paused ? "Paused" : fmtTime(endsAt - Date.now()) });
        wrap.append(timer);
        wrap.append(el("div", { className: "mpH", textContent: paused ? "Paused" : "Discuss and Vote Out Loud" }));
        cancelAnimationFrame(timerRaf);
        if (!paused){
          const tick = () => {
            timer.textContent = fmtTime(endsAt - Date.now());
            if (Date.now() < endsAt) timerRaf = requestAnimationFrame(tick);
          };
          timerRaf = requestAnimationFrame(tick);
        }
      }
      if (allowCheat){
        // Render the cheat sheet inline, full, beneath the timer.
        const cd = cheatData || {};
        appendInlineCheat(wrap, cd);
      }
      return;
    }

    // ---- INTERACTIVE VOTING MODE (mobile voting ON) ----
    if (cheat) { if (allowCheat) cheat.showBtn(); else cheat.hideBtn(); }
    if (countdown){
      const img = el("img", { src: "Vote.png", alt: "Vote Now",
        style: "max-width:60%;max-height:32vh;display:block;margin:0 auto 6px" });
      wrap.append(img);
      wrap.append(el("div", { className: "mpH", textContent: "Last chance to change your vote!" }));
    } else {
      const timer = el("div", { className: "mpTimer", textContent: paused ? "Paused" : fmtTime(endsAt - Date.now()) });
      wrap.append(timer);
      wrap.append(el("div", { className: "mpH", textContent: paused ? "Host paused the vote" : "Who do you vote for?" }));
      cancelAnimationFrame(timerRaf);
      if (!paused){
        const tick = () => {
          timer.textContent = fmtTime(endsAt - Date.now());
          if (Date.now() < endsAt) timerRaf = requestAnimationFrame(tick);
        };
        timerRaf = requestAnimationFrame(tick);
      }
    }
    const box = el("div", {});
    for (const name of candidates) {
      if (name === myName) continue;
      const b = el("button", { className: "mpVote" + (myPick === name ? " picked" : ""), textContent: name });
      b.onclick = () => {
        if (myPick === name) {
          myPick = null;
          b.classList.remove("picked");
          room.send("vote_clear", { voter: myName });
        } else {
          myPick = name;
          [...box.children].forEach(c => c.classList.toggle("picked", c.textContent === name));
          room.send("vote_cast", { voter: myName, choice: name });
        }
      };
      box.append(b);
    }
    wrap.append(box);
    const prog = el("div", { className: "mpVoted", id: "mpPlayerProg", textContent: "" });
    wrap.append(prog);
    wrap.append(el("div", { className: "mpVoted",
      textContent: countdown ? "Tap your pick again to clear it. Editable until the count ends."
                             : "Tap a name to vote. Tap it again to clear. Change until time's up." }));
  }

  function updateProgress({ voted, total }) {
    const p = document.getElementById("mpPlayerProg");
    if (p) p.textContent = `${voted} / ${total} voted`;
  }

  function renderResults(r) {
    if (cheat) cheat.showBtn();
    cancelAnimationFrame(timerRaf);
    wrap.innerHTML = "";
    renderResultsInto(wrap, r);
    wrap.append(el("div", { className: "mpSub", textContent: "Waiting for the next game… (cheat sheet stays available)" }));
  }

  function sessionEnded() {
    if (cheat) cheat.hideBtn();
    clearSession();
    wrap.innerHTML = "";
    wrap.append(el("div", { className: "mpH", textContent: "Session ended" }));
    wrap.append(el("div", { className: "mpSub", textContent: "The host closed the game. Rejoin with a new code when they start again." }));
    const again = el("button", { className: "mpBtn", textContent: "Join another game" });
    again.onclick = () => location.href = location.origin + location.pathname;
    wrap.append(again);
  }
}

// In-menu "Join a Game": a code-entry prompt (no URL needed).
export function openJoinPrompt() {
  ensureStyles();
  const layer = makeLayer("mpPlayerLayer");
  layer.classList.add("show");
  const wrap = el("div", { className: "mpWrap" });
  layer.innerHTML = ""; layer.append(wrap);
  wrap.append(el("div", { className: "mpH", textContent: "Join a game" }));
  wrap.append(el("div", { className: "mpSub", textContent: "Enter the room code from the host's screen." }));
  const input = el("input", { className: "mpInput", placeholder: "CODE", maxLength: 6,
    style: "text-transform:uppercase;letter-spacing:4px;font-weight:bold" });
  wrap.append(input); wrap.append(el("div"));
  const go = el("button", { className: "mpBtn", textContent: "Continue" });
  go.onclick = () => {
    const code = (input.value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length < 3) { input.focus(); return; }
    startPlayerClient(code);
  };
  wrap.append(go);
  const cancel = el("button", { className: "mpBtn alt", textContent: "Cancel" });
  cancel.onclick = () => { layer.classList.remove("show"); };
  wrap.append(cancel);
  input.focus();
}

export function joinCodeFromUrl() {
  const m = new URLSearchParams(location.search).get("join");
  return m ? m.toUpperCase().replace(/[^A-Z0-9]/g, "") : null;
}

// Tear down every host-side multiplayer overlay so nothing is left covering the
// menu/settings after a game ends or is stopped. Safe to call anytime.
export function teardownHostVoteUI() {
  // Fully REMOVE the cheat panel/button so a stale closure can't linger and show
  // "No roles selected yet" on the next game.
  ["mpCheatPanel", "mpCheatBtn"].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); });
  ["mpHostLayer", "mpHostStrip"].forEach(id => {
    const e = document.getElementById(id);
    if (e) { e.classList.remove("show"); e.className = e.className.replace("show","").trim(); }
  });
  // Cancel any active vote session on the host so a new game starts clean.
  const sess = getHostSession();
  if (sess && sess.voteSession) { try { sess.voteSession.abort(); } catch(_){} sess.voteSession = null; }
}
