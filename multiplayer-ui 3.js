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
         startSession, endSession, getHostSession, broadcastRoles, renameHost, broadcastGameSwitch,
         gacSendPrompt, gacBroadcastWait, gacSendInfo, gacBroadcastClear, onGacChoice,
         gacSendCardPick, onGacCardPick, gacStartWheel, gacUpdateWheel, onGacWheelInput,
         gacSendNudge, onGacNudgeReply, onGacPeek }
  from "./multiplayer.js?v=77";

export { configured, startSession, endSession, getHostSession, broadcastRoles, renameHost, broadcastGameSwitch,
         gacSendPrompt, gacBroadcastWait, gacSendInfo, gacBroadcastClear, onGacChoice,
         gacSendCardPick, onGacCardPick, gacStartWheel, gacUpdateWheel, onGacWheelInput,
         gacSendNudge, onGacNudgeReply, onGacPeek };

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
  .mpNudgeBanner{position:fixed;left:0;right:0;bottom:0;z-index:9500;display:none;
    background:#b3261e;color:#fff;padding:14px 18px;text-align:center;
    font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;font-size:16px;
    box-shadow:0 -4px 16px rgba(0,0,0,.5);align-items:center;justify-content:center;gap:12px;flex-wrap:wrap}
  .mpNudgeBanner.show{display:flex}
  .mpNudgeBanner .mpBtn{margin:0;min-width:0;padding:8px 16px;font-size:16px}
  .mpCode{font-family:"GingerbreadFont",cursive;font-size:48px;letter-spacing:6px;font-weight:normal;color:#f3c969;margin:6px 0}
  .mpTimer{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;font-size:64px;font-weight:normal;color:#f3c969;line-height:1}
  .mpH{font-family:"GingerbreadFont",cursive;font-size:26px;letter-spacing:1.5px;margin:14px 0 6px;color:var(--frost,#cfe0ea)}
  .mpSub{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;font-size:17px;opacity:.9;margin:4px 0 16px}
  .mpBtn{font-family:"GingerbreadFont",cursive;font-size:20px;letter-spacing:1px;padding:12px 22px;border:none;border-radius:8px;
    background:rgba(255,255,255,.92);color:#1f6f1f;font-weight:normal;cursor:pointer;margin:6px;min-width:120px}
  .mpBtn.alt{background:#cfe0ea}
  .mpGacBtns{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:10px 0}
  .mpBtn.gac{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;font-size:19px;min-width:90px;margin:0;
    padding:14px 18px;background:#fff;color:#0f2c3d;border:2px solid rgba(255,255,255,.6);box-shadow:0 2px 6px rgba(0,0,0,.3)}
  .mpBtn.gac.full{flex:1 1 100%;width:100%}
  .mpGacBreak{flex:1 1 100%;height:8px}
  .mpBtn.gac.sel{background:#1f7a1f;color:#fff;border-color:#bfffbf;box-shadow:0 0 14px rgba(150,255,150,.6)}
  .mpBtn.gac.dis{opacity:.32;pointer-events:none}
  .mpBtn.gacConfirm{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;font-size:20px;background:darkgreen;color:#fff;
    margin-top:14px;padding:14px 30px}
  .mpGacResult{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;font-size:22px;margin:16px 0;padding:14px;
    border-radius:12px;background:rgba(0,50,0,.5);border:1px solid rgba(255,255,255,.3);color:#eafff0}
  .mpCardGrid{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin:12px 0;max-height:54vh;overflow-y:auto}
  .mpViewCard{width:200px;max-width:70vw;margin:16px auto;aspect-ratio:5/7;position:relative;user-select:none;-webkit-user-select:none;touch-action:none}
  .mpCardBack{position:absolute;inset:0;border-radius:16px;cursor:pointer;overflow:hidden;
    background:linear-gradient(145deg,#0b5a24,#083d18) center/cover no-repeat;border:3px solid #ffd24d;
    display:flex;align-items:flex-end;justify-content:center;box-shadow:0 6px 18px rgba(0,0,0,.5)}
  .mpCardBackInner{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;color:#fff;text-align:center;font-size:16px;line-height:1.4;
    width:100%;padding:8px 4px;background:rgba(0,0,0,.55)}
  .mpCardBackInner small{font-size:12px;opacity:.85}
  .mpCardFace{position:absolute;inset:0;border-radius:16px;overflow:hidden;border:3px solid #ffd24d;box-shadow:0 6px 18px rgba(0,0,0,.5);background:#000}
  .mpCardFace img{width:100%;height:100%;object-fit:cover;display:block}
  .mpCardFaceName{position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.7);color:#fff;
    font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;font-size:18px;text-align:center;padding:6px}
  .mpCard{width:88px;border-radius:10px;overflow:hidden;border:3px solid transparent;background:rgba(0,0,0,.3);cursor:pointer}
  .mpCard img{width:100%;display:block}
  .mpCard.sel{border-color:#bfffbf;box-shadow:0 0 14px rgba(150,255,150,.7)}
  .mpCardCap{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;font-size:13px;color:#fff;text-align:center;padding:4px 2px}
  .mpWheelHolder{margin:10px auto;width:min(86vw,300px)}
  #mpWheelSvg{width:100%;touch-action:none;cursor:grab}
  .mpWheelStatus{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;font-size:18px;color:#fff;margin:8px 0;line-height:1.5}
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

  // A "still here?" nudge banner, appended as a SIBLING of wrap (not inside
  // it) so it survives wrap.innerHTML resets — it can show up over whatever
  // screen the player's currently looking at without disturbing it, and
  // disappears again once they tap it or the host moves on.
  const nudgeBanner = el("div", { className: "mpNudgeBanner" });
  layer.append(nudgeBanner);
  function showNudge(){
    nudgeBanner.innerHTML = "";
    nudgeBanner.append(el("span", { textContent: "🌙 Still there? The night's waiting on you." }));
    const btn = el("button", { className: "mpBtn gac", textContent: "I'm here!" });
    btn.onclick = () => {
      try { if (room) room.send("gac_nudge_reply", { from: myName }); } catch(_){}
      hideNudge();
    };
    nudgeBanner.append(btn);
    nudgeBanner.classList.add("show");
  }
  function hideNudge(){ nudgeBanner.classList.remove("show"); }

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

  // ===================== GAC per-phone decisions =====================
  // The host sends a {key, label, kind, options, yes/no} prompt to the player
  // who holds that role. The player taps, and we send back {key, value}.
  // kind: "single" (pick one option), "yesno", "twopick" (two distinct options),
  //       "info" (no input; e.g. Santa's confirm-then-reveal).
  let gacPromptState = null;
  function gacSend(value){
    if (room) room.send("gac_choice", {
      key: gacPromptState ? gacPromptState.key : null,
      value,
      from: myName,
      grinchWheel: !!(gacPromptState && gacPromptState._grinchWheel),
    });
  }
  function renderGacPrompt(p){
    onWaitingScreen = false;
    gacPromptState = p;
    cancelAnimationFrame(timerRaf);
    wrap.innerHTML = "";
    wrap.append(el("div", { className: "mpH", textContent: p.title || "Your turn" }));
    if (p.label) wrap.append(el("div", { className: "mpSub", innerHTML: p.label }));

    const chosen = { v: (p.kind === "twopick") ? ["",""] : "" };

    if (p.kind === "yesno"){
      const row = el("div", { className: "mpGacBtns" });
      [["", p.noText || "No"], ["yes", p.yesText || "Yes"]].forEach(([val, txt]) => {
        const btn = el("button", { className: "mpBtn gac", textContent: txt });
        if (val === "yes" && p.yesDisabled) { btn.disabled = true; btn.classList.add("dis"); }
        btn.onclick = () => { if (btn.disabled) return; gacSelectSingle(row, btn); chosen.v = val; };
        row.append(btn);
      });
      wrap.append(row);
      addConfirm(() => gacSend(chosen.v));
    } else if (p.kind === "single"){
      const row = el("div", { className: "mpGacBtns" });
      (p.options || []).forEach(o => {
        if (o.section){ row.append(el("div", { className:"mpGacBreak" })); return; }
        const btn = el("button", { className: "mpBtn gac" + (o.full ? " full" : ""), textContent: o.text });
        btn.onclick = () => { gacSelectSingle(row, btn); chosen.v = o.value; };
        row.append(btn);
      });
      wrap.append(row);
      addConfirm(() => gacSend(chosen.v));
    } else if (p.kind === "twopick"){
      wrap.append(el("div", { className: "mpSub", textContent: "Pick two different players." }));
      const rowA = el("div", { className: "mpGacBtns" });
      const rowB = el("div", { className: "mpGacBtns" });
      const paint = () => {
        [...rowA.children].forEach(b => b.classList.toggle("dis", b.dataset.v && b.dataset.v === chosen.v[1]));
        [...rowB.children].forEach(b => b.classList.toggle("dis", b.dataset.v && b.dataset.v === chosen.v[0]));
        [...rowA.children].forEach(b => b.classList.toggle("sel", b.dataset.v === chosen.v[0]));
        [...rowB.children].forEach(b => b.classList.toggle("sel", b.dataset.v === chosen.v[1]));
      };
      (p.options || []).forEach(o => {
        const a = el("button", { className:"mpBtn gac", textContent:o.text }); a.dataset.v = o.value;
        a.onclick = () => { if (a.classList.contains("dis")) return; chosen.v[0] = (chosen.v[0]===o.value?"":o.value); paint(); };
        rowA.append(a);
        const b = el("button", { className:"mpBtn gac", textContent:o.text }); b.dataset.v = o.value;
        b.onclick = () => { if (b.classList.contains("dis")) return; chosen.v[1] = (chosen.v[1]===o.value?"":o.value); paint(); };
        rowB.append(b);
      });
      wrap.append(el("div",{className:"mpSub",style:"margin:6px 0 2px",textContent:"First:"}));
      wrap.append(rowA);
      wrap.append(el("div",{className:"mpSub",style:"margin:6px 0 2px",textContent:"Second:"}));
      wrap.append(rowB);
      paint();
      addConfirm(() => gacSend((chosen.v[0] && chosen.v[1] && chosen.v[0]!==chosen.v[1]) ? chosen.v : ""));
    } else if (p.kind === "info"){
      // Santa-style: confirm to reveal. We send the choice, host replies gac_info.
      addConfirm(() => gacSend(p.value || ""));
    }
  }
  function gacSelectSingle(row, btn){
    [...row.querySelectorAll(".mpBtn")].forEach(b => b.classList.remove("sel"));
    btn.classList.add("sel");
  }
  function addConfirm(fn){
    const c = el("button", { className: "mpBtn gacConfirm", textContent: "Confirm ▶" });
    c.onclick = () => {
      c.disabled = true; c.textContent = "Sent ✓";
      // Lock the whole prompt so they can't change it after submitting.
      [...wrap.querySelectorAll(".mpBtn.gac")].forEach(b => { b.disabled = true; b.classList.add("dis"); });
      gacPromptState = null;
      fn();
    };
    wrap.append(c);
  }
  let onResultScreen = false;   // true while showing an unread private result (e.g. Santa's check)
  function gacWait(msg){
    if (onResultScreen) return;   // don't clobber an unread result with a filler "waiting" screen
    onWaitingScreen = false;
    wrap.innerHTML = "";
    wrap.append(el("div", { className: "mpH", textContent: `Hi ${myName}!` }));
    wrap.append(el("div", { className: "mpSub", textContent: msg || "Waiting for the host…" }));
  }
  let myCard = null;   // {name, image, desc} — the player's current role card
  function gacInfo(p){
    // A dealt-card assignment (virtual deal) — store it and show the waiting
    // screen with a persistent "View My Card" peek button.
    if (p && p.yourCard){
      myCard = { name: p.name, image: p.image, desc: p.desc || "" };
      gacPeekReported = false;   // fresh card → they haven't peeked at this one yet
      waiting("You've been dealt your card. Hold/hover to view your role.");
      return;
    }
    // A private result for this player (e.g. Santa's naughty/nice). Stays on
    // screen until they tap "Got it" — later filler updates (the host moving
    // on to the next beat) won't be allowed to clobber it first.
    onResultScreen = true;
    wrap.innerHTML = "";
    wrap.append(el("div", { className: "mpH", textContent: p.title || "Result" }));
    wrap.append(el("div", { className: "mpGacResult", innerHTML: p.html || p.text || "" }));
    const ok = el("button", { className: "mpBtn gac", textContent: "Got it" });
    ok.onclick = () => { onResultScreen = false; gacWait("Waiting for the host…"); };
    wrap.append(ok);
  }
  // Build the press-and-hold "View My Card" control (card-back reveals on hold).
  let gacPeekReported = false;
  function gacReportPeek(){
    if (gacPeekReported) return;
    gacPeekReported = true;
    try { if (room) room.send("gac_peek", { from: myName }); } catch(_){}
  }
  function gacViewCardControl(){
    if (!myCard) return null;
    const holder = el("div", { className: "mpViewCard" });
    const back = el("div", { className: "mpCardBack", style: "background-image:url('CardBacks/GAC_Back.png')" });
    back.innerHTML = ``;
    const face = el("div", { className: "mpCardFace" });
    face.innerHTML = `<img src="${myCard.image}" alt="${myCard.name}"><div class="mpCardFaceName">${myCard.name}</div>`;
    face.style.display = "none";
    holder.append(back, face);
    const show = (e) => { face.style.display = "block"; back.style.display = "none"; gacReportPeek(); if(e&&e.preventDefault)e.preventDefault(); };
    const hide = () => { face.style.display = "none"; back.style.display = "block"; };
    back.addEventListener("mousedown", show); back.addEventListener("touchstart", show, {passive:false});
    window.addEventListener("mouseup", hide); window.addEventListener("touchend", hide);
    face.addEventListener("mouseup", hide); face.addEventListener("touchend", hide);
    // Desktop hover to reveal (releases on leave).
    back.addEventListener("mouseenter", show); face.addEventListener("mouseleave", hide);
    return holder;
  }

  // ---- Card selection at game start ----
  // payload.cards = [{id, name, image}]; player taps the card they were dealt.
  function gacCardPickSend(cardId){ if (room) room.send("gac_cardpick", { from: myName, cardId }); }
  function renderGacCardPick(p){
    onWaitingScreen = false;
    wrap.innerHTML = "";
    if (p.redo){
      wrap.append(el("div", { className: "mpH", textContent: "Re-check your card!" }));
      wrap.append(el("div", { className: "mpSub", innerHTML: `<span style="color:#ffd6d6">${p.reason || "The cards didn't match — please confirm again."}</span>` }));
    } else {
      wrap.append(el("div", { className: "mpH", textContent: "Which card were you dealt?" }));
      wrap.append(el("div", { className: "mpSub", textContent: "Tap your character to confirm." }));
    }
    const grid = el("div", { className: "mpCardGrid" });
    let chosen = null;
    (p.cards || []).forEach(c => {
      const card = el("div", { className: "mpCard" });
      const img = el("img"); img.src = c.image; img.alt = c.name;
      const cap = el("div", { className: "mpCardCap", textContent: c.name });
      card.append(img, cap);
      card.onclick = () => {
        chosen = c.id;
        [...grid.querySelectorAll(".mpCard")].forEach(x => x.classList.remove("sel"));
        card.classList.add("sel");
        confirmBtn.disabled = false; confirmBtn.classList.remove("dis");
      };
      grid.append(card);
    });
    wrap.append(grid);
    const confirmBtn = el("button", { className: "mpBtn gacConfirm dis", textContent: "Confirm Card" });
    confirmBtn.disabled = true;
    confirmBtn.onclick = () => {
      if (!chosen) return;
      confirmBtn.disabled = true; confirmBtn.textContent = "Locked in ✓";
      [...grid.querySelectorAll(".mpCard")].forEach(x => x.style.pointerEvents = "none");
      gacCardPickSend(chosen);
    };
    wrap.append(confirmBtn);
  }

  // ---- Grinch wheel (shared spinner, Wavelength-style) ----
  // payload: {players:[grinchNames], targets:[{id,name}], angle, ready:{name:bool}}
  let gacWheelData = null;
  function gacWheelSend(type, extra){ if (room) room.send(type, { from: myName, ...(extra||{}) }); }
  function renderGacWheel(p){
    onWaitingScreen = false;
    gacWheelData = p;
    wrap.innerHTML = "";
    wrap.append(el("div", { className: "mpH", textContent: "Grinches, choose your victim" }));
    wrap.append(el("div", { className: "mpSub", textContent: "Drag the pointer together. Everyone taps Ready to lock it in." }));
    const holder = el("div", { className: "mpWheelHolder" });
    holder.id = "mpWheelHolder";
    holder.innerHTML = gacWheelSVG(p);
    wrap.append(holder);
    const status = el("div", { className: "mpWheelStatus" }); status.id = "mpWheelStatus";
    wrap.append(status);
    const ready = el("button", { className: "mpBtn gacConfirm", textContent: "Ready" });
    ready.id = "mpWheelReady";
    ready.onclick = () => {
      const me = (p.ready && p.ready[myName]);
      gacWheelSend("gac_wheel_ready", { ready: !me });
    };
    wrap.append(ready);
    gacWheelAttachDrag(holder);
    updateGacWheel(p);
  }
  function gacWheelSVG(p){
    const n = p.targets.length;
    const cx=130, cy=130, r=120;
    let wedges = "";
    for (let i=0;i<n;i++){
      const a0 = (i/n)*2*Math.PI - Math.PI/2, a1 = ((i+1)/n)*2*Math.PI - Math.PI/2;
      const x0=cx+r*Math.cos(a0), y0=cy+r*Math.sin(a0), x1=cx+r*Math.cos(a1), y1=cy+r*Math.sin(a1);
      const mid=(a0+a1)/2, lx=cx+(r*0.62)*Math.cos(mid), ly=cy+(r*0.62)*Math.sin(mid);
      // Candy-cane: alternating red and white wedges.
      const isRed = (i%2===0);
      const fill = isRed ? "#c0211a" : "#ffffff";
      const textColor = isRed ? "#ffffff" : "#7a0d0a";
      wedges += `<path d="M${cx},${cy} L${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1} Z" fill="${fill}" stroke="rgba(0,0,0,.25)" stroke-width="1.5"/>`;
      const nm = (p.targets[i].name||"").slice(0,8);
      wedges += `<text x="${lx}" y="${ly}" fill="${textColor}" font-size="13" font-weight="bold" text-anchor="middle" dominant-baseline="middle" font-family="Trebuchet MS,Arial" transform="rotate(${(mid*180/Math.PI)+90},${lx},${ly})">${nm}</text>`;
    }
    return `<svg viewBox="0 0 260 260" id="mpWheelSvg">
      ${wedges}
      <circle cx="130" cy="130" r="${r}" fill="none" stroke="rgba(0,0,0,.3)" stroke-width="2"/>
      <g id="mpWheelPointer">
        <line x1="130" y1="130" x2="130" y2="18" stroke="#1f9e3a" stroke-width="7" stroke-linecap="round"/>
        <polygon points="130,10 122,26 138,26" fill="#1f9e3a"/>
        <circle cx="130" cy="130" r="15" fill="#1f9e3a" stroke="#fff" stroke-width="2"/>
      </g></svg>`;
  }
  function gacWheelAttachDrag(holder){
    const svg = holder.querySelector("#mpWheelSvg");
    const center = () => { const rc = svg.getBoundingClientRect(); return { x: rc.left+rc.width/2, y: rc.top+rc.height/2 }; };
    let dragging = false;
    let lastSend = 0, pendingAngle = null, sendTimer = null;
    const angleFrom = (clientX, clientY) => {
      const c = center();
      let a = Math.atan2(clientY - c.y, clientX - c.x) * 180/Math.PI + 90;
      return ((a % 360) + 360) % 360;   // normalize 0..360
    };
    // Throttle to ~15/sec so fast spinning can't flood the realtime channel.
    const flush = () => {
      sendTimer = null;
      if (pendingAngle == null) return;
      lastSend = Date.now();
      gacWheelSend("gac_wheel_drag", { angle: pendingAngle });
      pendingAngle = null;
    };
    const move = (clientX, clientY) => {
      if (gacWheelData && gacWheelData.locked) return;
      pendingAngle = angleFrom(clientX, clientY);
      const dt = Date.now() - lastSend;
      if (dt >= 66){ flush(); }
      else if (!sendTimer){ sendTimer = setTimeout(flush, 66 - dt); }
    };
    const down = (e) => { dragging = true; const t=e.touches?e.touches[0]:e; move(t.clientX,t.clientY); e.preventDefault(); };
    const mv   = (e) => { if(!dragging) return; const t=e.touches?e.touches[0]:e; move(t.clientX,t.clientY); e.preventDefault(); };
    const up   = () => { dragging = false; flush(); };   // ensure final position is sent
    svg.addEventListener("mousedown", down); svg.addEventListener("touchstart", down, {passive:false});
    window.addEventListener("mousemove", mv); window.addEventListener("touchmove", mv, {passive:false});
    window.addEventListener("mouseup", up); window.addEventListener("touchend", up);
  }
  function updateGacWheel(p){
    if (p) gacWheelData = Object.assign(gacWheelData||{}, p);
    const d = gacWheelData; if (!d) return;
    const ptr = document.getElementById("mpWheelPointer");
    if (ptr) ptr.setAttribute("transform", `rotate(${d.angle||0},130,130)`);
    const status = document.getElementById("mpWheelStatus");
    if (status){
      const names = d.players||[];
      const readyCount = names.filter(n => d.ready && d.ready[n]).length;
      const tgt = gacWheelTargetName(d);
      status.innerHTML = `Pointing at: <b>${tgt||"…"}</b><br>${readyCount}/${names.length} ready`;
    }
    const rb = document.getElementById("mpWheelReady");
    if (rb){
      const me = d.ready && d.ready[myName];
      rb.textContent = me ? "Ready ✓ (tap to undo)" : "Ready";
      rb.classList.toggle("sel", !!me);
    }
    if (d.locked){
      const rb2 = document.getElementById("mpWheelReady");
      if (rb2){ rb2.disabled = true; rb2.textContent = "Locked in ✓"; }
    }
  }
  function gacWheelTargetName(d){
    if (!d || !d.targets || !d.targets.length) return "";
    let a = ((d.angle||0) % 360 + 360) % 360;
    const n = d.targets.length;
    const idx = Math.floor((a / 360) * n) % n;
    return d.targets[idx] ? d.targets[idx].name : "";
  }

  let waitingMsg = "Waiting for the host to start voting…";
  function waiting(msg) {
    if (onResultScreen) return;   // don't clobber an unread result
    if (msg) waitingMsg = msg;
    onWaitingScreen = true;
    if (cheat) cheat.showBtn();
    cancelAnimationFrame(timerRaf);
    wrap.innerHTML = "";
    wrap.append(el("div", { className: "mpH", textContent: `Hi ${myName}!` }));
    wrap.append(el("div", { className: "mpSub", textContent: waitingMsg }));

    // Persistent "View My Card" peek (virtual deal) — hold to reveal.
    const vc = gacViewCardControl();
    if (vc) wrap.append(vc);

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
          if (type === "game_switch") {
            // Host moved between ONBC and GAC — follow them.
            if (window.__showGame) window.__showGame(payload.game, { fromHost: true });
          }
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
          // ----- GAC (Grinches Attack Christmas) per-phone decisions -----
          if (type === "gac_prompt"){
            hideNudge();
            if (!payload._to || payload._to === myName) renderGacPrompt(payload);
            else gacWait("Night in progress…");
          }
          if (type === "gac_wait")   { hideNudge(); gacWait(payload && payload.msg); }
          if (type === "gac_info"){
            if (!payload._to || payload._to === myName) { hideNudge(); gacInfo(payload); }
          }
          if (type === "gac_clear")  { hideNudge(); waiting(); }
          // "Are you still there?" — a light banner over whatever's on screen.
          if (type === "gac_nudge"){
            if (!payload._to || payload._to === myName) showNudge();
          }
          // Card-selection at game start.
          if (type === "gac_pickcard") { hideNudge(); renderGacCardPick(payload); }
          // Grinch wheel (shared spinner).
          if (type === "gac_wheel"){
            if (payload.players && payload.players.some(n => n === myName)) { hideNudge(); renderGacWheel(payload); }
            else gacWait("Night in progress…");
          }
          if (type === "gac_wheel_state") updateGacWheel(payload);
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
