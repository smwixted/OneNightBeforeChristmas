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
         gacSendPrompt, gacBroadcastWait, gacBroadcastWaitExcept, gacSendInfo, gacBroadcastClear, onGacChoice,
         gacSendCardPick, onGacCardPick, gacStartWheel, gacUpdateWheel, onGacWheelInput,
         gacSendNudge, onGacNudgeReply, onGacPeek, onGacAck, onGacSelfElim, onGacShareResults, onGacSamNav, onGacSamDay, gacBroadcastSummary, gacBroadcastPeekCount, gacBroadcastSleep, gacBroadcastLoveReveal, onGacLoveConfirm }
  from "./multiplayer.js?v=94";

export { configured, startSession, endSession, getHostSession, broadcastRoles, renameHost, broadcastGameSwitch,
         gacSendPrompt, gacBroadcastWait, gacBroadcastWaitExcept, gacSendInfo, gacBroadcastClear, onGacChoice,
         gacSendCardPick, onGacCardPick, gacStartWheel, gacUpdateWheel, onGacWheelInput,
         gacSendNudge, onGacNudgeReply, onGacPeek, onGacAck, onGacSelfElim, onGacShareResults, onGacSamNav, onGacSamDay, gacBroadcastSummary, gacBroadcastPeekCount, gacBroadcastSleep, gacBroadcastLoveReveal, onGacLoveConfirm,
         gacMountHostCheat };

// Give the GAC host the SAME cheat sheet the players get — same bottom-right
// button, same slide-up panel, same content — instead of a bespoke dialog.
// getData returns the cheat data ({wakeOrder, nonWaking, ...}). Returns the
// cheat controller ({showBtn, hideBtn, refresh}).
let gacHostCheat = null;
function gacMountHostCheat(getData){
  if (!gacHostCheat) gacHostCheat = mountCheatSheet(getData);
  return gacHostCheat;
}

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
  .pausebar{height:16px;width:70vw;max-width:320px;border-radius:9px;
    background:rgba(255,255,255,.15);overflow:hidden;visibility:hidden;border:1px solid rgba(255,255,255,.3)}
  .pausebar i{display:block;height:100%;width:0;border-radius:9px;
    background:repeating-linear-gradient(45deg,#d2323a 0 14px,#fff 14px 28px)}
  .mpNudgeBar{flex-basis:100%;margin:6px auto 0}
  @keyframes grow{from{width:0}to{width:100%}}
  .mpCode{font-family:"GingerbreadFont",cursive;font-size:48px;letter-spacing:6px;font-weight:normal;color:#f3c969;margin:6px 0}
  .mpTimer{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;font-size:64px;font-weight:normal;color:#f3c969;line-height:1}
  .mpH{font-family:"GingerbreadFont",cursive;font-size:26px;letter-spacing:1.5px;margin:14px 0 6px;color:var(--frost,#cfe0ea)}
  .mpSub{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;font-size:17px;opacity:.9;margin:4px 0 16px}
  .mpGacNarr{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;font-size:18px;line-height:1.4;
    text-align:center;color:#eaf6ff;margin:8px 0 12px;text-shadow:0 1px 5px rgba(0,0,0,.6)}
  .mpOnceBadge{display:inline-block;font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;font-size:13px;
    background:#ffd24d;color:#0f2c3d;border-radius:20px;padding:4px 12px;margin:4px 0 8px}
  .mpPeekCount{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;text-align:center;font-size:15px;
    color:#fff;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.3);border-radius:10px;
    padding:7px 12px;margin:8px auto;max-width:320px}
  .mpPeekCount.allSeen{background:rgba(30,110,30,.55);border-color:#bfffbf;color:#eaffea}
  .mpSummaryBox{margin:14px auto 0;max-width:340px;text-align:left;background:rgba(0,0,0,.3);
    border:1px solid rgba(255,255,255,.25);border-radius:12px;padding:12px 16px}
  .mpSummaryHdr{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;color:#ffd24d;font-size:15px;
    margin:8px 0 4px;letter-spacing:.5px}
  .mpSummaryIn{color:#d6ffd6;font-size:16px;padding:2px 0}
  .mpSummaryOut{color:#ffc9c9;font-size:16px;padding:2px 0;text-decoration:line-through;opacity:.8}
  /* End-of-game log — mirrors the host's 3-tab log exactly */
  .mpLogTabs{display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:center;margin:12px 0 8px}
  .mpLogTab{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;font-size:15px;padding:8px 12px;
    border-radius:10px;border:2px solid rgba(255,255,255,.55);background:rgba(0,40,0,.78);color:#fff;cursor:pointer;
    box-shadow:0 2px 6px rgba(0,0,0,.4)}
  .mpLogTab.sel{background:#1f7a1f;border-color:#bfffbf;box-shadow:0 0 12px rgba(150,255,150,.5)}
  .mpLogSort{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;font-size:14px;
    padding:8px 12px;border-radius:10px;border:2px solid rgba(255,255,255,.4);background:rgba(255,255,255,.92);color:#0f2c3d;cursor:pointer}
  .mpLogBody{text-align:left;margin:0 auto;max-width:520px}
  .mpLogNight{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;color:#fff;font-size:19px;
    margin:14px 0 6px;border-bottom:2px solid rgba(255,255,255,.4);padding-bottom:4px}
  .mpLogEntry{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;color:#eafff0;font-size:15px;
    padding:6px 10px;margin:4px 0;background:rgba(0,0,0,.3);border-radius:8px;border:1px solid rgba(255,255,255,.18)}
  .mpLogEntry.death{background:rgba(80,0,0,.45);border-color:#ffb3b3;color:#ffe1e1}
  .mpTableWrap{overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:8px}
  table.mpGrid{border-collapse:collapse;width:100%;min-width:300px;font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif}
  table.mpGrid th, table.mpGrid td{border:1px solid rgba(255,255,255,.25);padding:7px 9px;text-align:center;font-size:13px;color:#eafff0}
  table.mpGrid thead th{background:rgba(0,60,0,.7);color:#fff;font-size:14px;position:sticky;top:0}
  table.mpGrid tbody th{background:rgba(0,50,0,.6);color:#fff;text-align:left;white-space:nowrap;position:sticky;left:0}
  table.mpGrid td.hit{background:rgba(0,90,0,.45)}
  table.mpGrid td.dead{background:rgba(90,0,0,.5);color:#ffd6d6}
  table.mpGrid td.empty{opacity:.35}
  .mpCellSub{display:block;font-size:11px;opacity:.8}
  .mpCellRole{font-size:11px;opacity:.75;font-style:italic}
  .mpCellSub.mpNow{color:#ffdf7e;opacity:1;font-weight:bold}
  .mpWinBadge{display:block;font-size:11px;margin-top:3px;padding:2px 6px;border-radius:6px;font-weight:bold}
  .mpWinBadge.win{background:#1f7a1f;color:#eaffea}
  .mpWinBadge.lose{background:#7a1f1f;color:#ffdede}
  .mpPersonalWin{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;font-size:26px;font-weight:bold;
    text-align:center;padding:12px;border-radius:12px;margin:6px 0 10px}
  .mpPersonalWin.win{background:#1f7a1f;color:#eaffea;box-shadow:0 3px 12px rgba(31,122,31,.5)}
  .mpPersonalWin.lose{background:#7a1f1f;color:#ffdede;box-shadow:0 3px 12px rgba(122,31,31,.5)}
  .mpBtn{font-family:"GingerbreadFont",cursive;font-size:20px;letter-spacing:1px;padding:12px 22px;border:none;border-radius:8px;
    background:rgba(255,255,255,.92);color:#1f6f1f;font-weight:normal;cursor:pointer;margin:6px;min-width:120px}
  .mpBtn.alt{background:#cfe0ea}
  .mpGacBtns{display:flex;flex-wrap:wrap;gap:7px;justify-content:center;margin:8px 0}
  .mpBtn.gac{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;font-size:17px;min-width:78px;margin:0;
    padding:11px 14px;background:#fff;color:#0f2c3d;border:2px solid rgba(255,255,255,.6);box-shadow:0 2px 6px rgba(0,0,0,.3)}
  .mpGacBtns.compact .mpBtn.gac{font-size:15px;padding:8px 10px;min-width:64px}
  .mpBtn.gac.full{flex:1 1 100%;width:100%}
  .mpGacBreak{flex:1 1 100%;height:8px}
  .mpBtn.gac.sel{background:#1f7a1f;color:#fff;border-color:#bfffbf;box-shadow:0 0 14px rgba(150,255,150,.6)}
  .mpBtn.gac.dis{opacity:.32;pointer-events:none}
  .mpBtn.gacConfirm{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;font-size:20px;background:darkgreen;color:#fff;
    margin-top:14px;padding:14px 30px}
  .mpGacResult{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;font-size:22px;margin:16px 0;padding:14px;
    border-radius:12px;background:rgba(10,30,45,.6);border:1px solid rgba(255,255,255,.3);color:#eafff0}
  /* Sam's narration line — matches the host's narration screen: plain centered
     text, no box or background. */
  /* Sam's narration — mirrors the host's #gacNarrBody/#gacNarrLine/#gacNarrControls
     so the two screens match apart from the header. */
  .gacSamNarrBody{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
    gap:12px;min-height:40vh;padding:8px 4px}
  .gacSamNarrPortrait{display:block;margin:0 auto;max-height:34vh;max-width:60%;object-fit:contain;
    border-radius:16px;box-shadow:0 6px 20px rgba(0,0,0,.55);border:3px solid rgba(255,255,255,.35)}
  .gacSamNarrLine{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;color:#fff;
    font-size:clamp(19px,3.9vw,30px);line-height:1.28;text-align:center;max-width:760px;
    text-shadow:0 2px 10px rgba(0,0,0,.85);padding:6px 12px}
  .gacSamNarrProg{text-align:center;color:#cffccf;font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;
    font-size:15px;opacity:.85;margin-top:8px}
  /* Sam's Back/Next — match the host's narration controls. */
  .gacSamNavRow{display:flex;gap:16px;justify-content:center;margin-top:8px;padding:8px 18px}
  .gacSamNavBtn{font-family:"GingerbreadFont",cursive;border:none;border-radius:12px;
    padding:12px 28px;font-size:22px;cursor:pointer;letter-spacing:2px;box-shadow:0 3px 10px rgba(0,0,0,.5)}
  .gacSamNext{background:darkgreen;color:#fff}
  .gacSamBack{background:#cfd8dc;color:#0f2c3d}
  .mpCardGrid{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin:12px 0;max-height:54vh;overflow-y:auto}
  .mpViewCard{width:200px;max-width:70vw;margin:16px auto;aspect-ratio:5/7;position:relative;user-select:none;-webkit-user-select:none;touch-action:none}
  .mpCardBack{position:absolute;inset:0;border-radius:16px;cursor:pointer;overflow:hidden;
    background:#0f2c3d center/cover no-repeat;border:3px solid #ffd24d;
    display:flex;align-items:flex-end;justify-content:center;box-shadow:0 6px 18px rgba(0,0,0,.5)}
  .mpCardBackInner{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;color:#fff;text-align:center;font-size:16px;line-height:1.4;
    width:100%;padding:8px 4px;background:rgba(0,0,0,.55)}
  .mpCardBackInner small{font-size:12px;opacity:.85}
  .mpCardFace{position:absolute;inset:0;border-radius:16px;overflow:hidden;border:3px solid #ffd24d;box-shadow:0 6px 18px rgba(0,0,0,.5);background:#000}
  .mpCardFace img{width:100%;height:100%;object-fit:cover;display:block}
  .mpCardFaceName{position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,.7);color:#fff;
    font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;font-size:18px;text-align:center;padding:6px}
  .mpCardDesc{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;color:#eaf4ff;text-align:center;
    font-size:14px;line-height:1.4;max-width:300px;margin:8px auto 0;opacity:.92;min-height:1px}
  .mpLoveBack{background:radial-gradient(circle at 50% 35%, #4a7d2c, #24451a);display:flex;align-items:center;justify-content:center;border:3px solid #bfe6a0}
  .mpLoveBackInner{font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;color:#fff;text-align:center;font-size:20px;line-height:1.5;text-shadow:0 2px 6px rgba(0,0,0,.7)}
  .mpLoveFace{background:radial-gradient(circle at 50% 35%, #7d1f3a, #3a0d1c);border-color:#ffb3c7;display:flex;align-items:center;justify-content:center}
  .mpLoveInner{text-align:center;padding:12px;font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;color:#fff}
  .mpLoveBig{font-size:56px;line-height:1}
  .mpLoveTxt{font-size:20px;margin-top:8px;line-height:1.3}
  .mpLoveSub{font-size:14px;margin-top:8px;opacity:.9}
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
  /* Standing "eliminated" banner — pinned to the top for the rest of the game. */
  /* Krampus conversion — the card art is unchanged, so stamp the face. */
  .mpGrinchStamp{position:absolute;top:8px;left:50%;transform:translateX(-50%);
    background:linear-gradient(180deg,#1f7a1f,#0d3d0d);color:#eaffea;
    font-family:"GingerbreadFont",cursive;font-size:15px;letter-spacing:1px;
    padding:4px 12px;border-radius:8px;border:2px solid #8fdf8f;white-space:nowrap;
    box-shadow:0 2px 8px rgba(0,0,0,.6);z-index:3}
  .mpConvertCard{background:radial-gradient(circle at 50% 35%, #7a2a1f, #3a0d0d) !important;
    border-color:#ff9a6a !important}
  .mpConvertCard.revealed{background:radial-gradient(circle at 50% 35%, #1f7a1f, #0d3d0d) !important;
    border-color:#8fdf8f !important}
  .mpDeadBanner{position:fixed;top:0;left:0;right:0;z-index:9400;display:none;
    background:linear-gradient(180deg,#7a1f1f,#4a1010);color:#ffdede;
    font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;font-size:15px;
    text-align:center;padding:10px 14px;border-bottom:2px solid #ff9a9a;
    box-shadow:0 3px 12px rgba(0,0,0,.5)}
  .mpDeadBanner.show{display:block}
  .mpDeadSkull{font-size:18px;margin-right:4px}
  /* Push the page down so the banner never covers the screen content. */
  body.mpHasDeadBanner .mpLayer{padding-top:46px;box-sizing:border-box}
  .mpCheatBtn{position:fixed;bottom:16px;right:16px;z-index:9100;
    background:#cfe0ea;color:#0f2c3d;border:none;border-radius:22px;
    padding:11px 22px;font-family:"GingerbreadFont",cursive;font-size:18px;letter-spacing:1px;
    cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4)}
  .mpGameLogBtn{position:fixed;bottom:16px;left:16px;z-index:9100;display:none;
    background:#cfe0ea;color:#0f2c3d;border:none;border-radius:22px;
    padding:11px 22px;font-family:"GingerbreadFont",cursive;font-size:18px;letter-spacing:1px;
    cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.4)}
  /* Sam's Next Night — centered in the bottom bar, between Game Log & Cheat Sheet. */
  .mpSamNextNight{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:9100;
    background:darkgreen;color:#fff;border:none;border-radius:22px;
    padding:11px 22px;font-family:"GingerbreadFont",cursive;font-size:18px;letter-spacing:1px;
    cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.45);white-space:nowrap}
  .mpSamNextNight:disabled{opacity:.6;cursor:default}
  .mpCheat{position:fixed;inset:0;z-index:9200;background:url("Blue.jpg") repeat;
    display:none;box-sizing:border-box}
  .mpCheat.show{display:block}
  /* Game log overlay — sits ON TOP of whatever screen the player is on (results,
     waiting, etc.) so closing it returns them exactly where they were. */
  /* ---- Animated team coin (draw tiebreaker) — matches the host ---- */
  .gacCoinWrap{background:rgba(10,30,45,.6);border:2px solid #ffd24d;border-radius:12px;padding:16px 12px;
    margin:10px 0;text-align:center;font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;color:#ffe9a8}
  .gacCoinStage{perspective:800px;width:160px;height:160px;margin:4px auto 10px}
  .gacCoin3d{position:relative;width:160px;height:160px;transform-style:preserve-3d;transform:rotateY(0deg)}
  .gacCoinSide{position:absolute;inset:0;width:160px;height:160px;border-radius:50%;
    backface-visibility:hidden;background-size:cover;background-position:center;
    box-shadow:0 6px 18px rgba(0,0,0,.55), inset 0 0 0 3px rgba(255,255,255,.12)}
  .gacCoinSide.christmas{background-image:url('Coins/ChristmasCoin.png?v=2')}
  .gacCoinSide.grinch{background-image:url('Coins/GrinchCoin.png?v=2');transform:rotateY(180deg)}
  .gacCoinEdge{position:absolute;top:50%;left:50%;width:156px;height:13px;
    transform:translate(-50%,-50%) rotateX(88deg);border-radius:50%;
    background:radial-gradient(ellipse at center,#e8b84a,#8a6d1f);opacity:.9}
  .gacCoinSpinning{animation:gacCoinTumble var(--spin-dur,4s) cubic-bezier(.15,.62,.28,1) forwards}
  @keyframes gacCoinTumble{0%{transform:rotateY(0deg)}100%{transform:rotateY(var(--spin-end,1980deg))}}
  .gacCoinHop{animation:gacCoinHop var(--spin-dur,4s) cubic-bezier(.2,.7,.3,1) forwards}
  @keyframes gacCoinHop{0%{transform:translateY(-60px) scale(.7)}18%{transform:translateY(0) scale(1)}
    26%{transform:translateY(-14px) scale(1.02)}36%{transform:translateY(0) scale(1)}100%{transform:translateY(0) scale(1)}}
  .gacCoinLegend{margin:6px auto 10px;font-family:"NitemareFont","Trebuchet MS",Arial,sans-serif;
    color:#eaf6ff;font-size:14px;line-height:1.7;text-align:left;display:inline-block}
  .gacCoinLegRow{display:flex;align-items:center;gap:8px}
  .gacCoinChip{width:16px;height:16px;border-radius:50%;display:inline-block;flex:0 0 auto;
    background-size:cover;background-position:center;box-shadow:0 1px 3px rgba(0,0,0,.5)}
  .gacCoinChip.xmas{background-image:url('Coins/ChristmasCoin.png?v=2')}
  .gacCoinChip.grinch{background-image:url('Coins/GrinchCoin.png?v=2')}
  .gacCoinTxt{font-size:17px;margin-top:8px;min-height:22px}
  .gacCoinTxt.reveal{font-family:"GingerbreadFont",cursive;font-size:22px;letter-spacing:1px}
  .mpLogOverlay{position:fixed;inset:0;z-index:9200;background:url("Blue.jpg") repeat;
    display:none;box-sizing:border-box}
  .mpLogOverlay.show{display:block}
  .mpLogOverlayScroll{position:absolute;inset:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:60px 18px 40px}
  .mpLogOverlayX{position:fixed;top:12px;left:12px;z-index:9500;
    background:rgba(255,255,255,.92);color:#1f6f1f;border:none;border-radius:8px;
    width:44px;height:44px;font-size:22px;cursor:pointer;font-family:"GingerbreadFont",cursive;
    box-shadow:0 2px 8px rgba(0,0,0,.4)}
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
export function startHostVoting({ settings, votingEnabled, getCheatData, voteAudioEl, durationMs, onFinished, hooks, candidates: customCandidates, mode }) {
  const isGac = (mode === "gac");
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
    // In GAC, only living players (the candidate list) may vote.
    eligibleVoters: (isGac && customCandidates) ? customCandidates : null,
    onState: (state, data) => renderState(state, data),
    onCallout: (file) => { if (hooks && hooks.playCallout) hooks.playCallout(file); },
  });
  sess.voteSession = session;

  // Start collecting immediately — players already joined via the session.
  session.open(durationMs, buildCandidates());

  function buildCandidates(){
    // GAC passes an explicit living-players list; ONBC derives from presence.
    if (customCandidates && customCandidates.length){
      const names = [...customCandidates];
      return [...new Set(names.map(s => (s||"").trim()).filter(Boolean))];
    }
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
      const noTimer = !!data.noTimer;
      if (noTimer){
        wrap.append(el("div", { className: "mpH",
          textContent: paused ? "Paused"
                     : voting && settings.mpHostPlayer ? "Who do you vote for?"
                     : voting ? "Players are voting…"
                     : "Discuss and vote out loud" }));
        wrap.append(el("div", { className: "mpSub", textContent: "No timer — tap Vote Now when ready." }));
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
    }

    // Vote buttons — only when mobile voting is ON and the host is a player AND
    // the host is still an eligible voter (not eliminated).
    const hostEligible = !Array.isArray(data.eligible) || data.eligible.includes(hostName);
    if (voting && settings.mpHostPlayer && !hostEligible){
      wrap.append(el("div", { className: "mpSub", style:"margin-top:10px",
        textContent: "You've been eliminated — you can't vote, but you can run the vote below." }));
    } else if (voting && settings.mpHostPlayer) {
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
      const total = (data.voterTotal != null) ? data.voterTotal : candidates.length;
      wrap.append(el("div", { className: "mpVoted", textContent: `${voted} / ${total} voted` }));
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
    if (!countdown && !data.noTimer){
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

    if (isGac){
      // GAC: a single clear top vote = elimination; a tie = no elimination
      // (host can re-vote or handle it at the table). Report back and close.
      const top = (data.results && data.results.top) || [];
      const eliminated = (top.length === 1 && data.results.max > 0) ? top[0] : null;
      const isTie = top.length > 1;
      const btnRow = el("div", { style:"margin-top:12px" });
      if (isTie){
        wrap.append(el("div", { className: "mpSub", textContent: "It's a tie — no one is eliminated by vote. You can re-vote or settle it at the table." }));
      }
      const done = el("button", { className: "mpBtn gac", textContent: eliminated ? `Eliminate ${eliminated} ▶` : "Done ▶" });
      done.onclick = () => {
        layer.classList.remove("show");
        cheat.hideBtn();
        sess.voteSession = null;
        if (onFinished) onFinished({ eliminated, tie: isTie, top });
      };
      btnRow.append(done);
      wrap.append(btnRow);
      return;
    }

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
    // Candy-cane grace bar so the player can see the response window ticking.
    const bar = el("div", { className: "pausebar mpNudgeBar" });
    bar.innerHTML = "<i></i>";
    nudgeBanner.append(bar);
    nudgeBanner.classList.add("show");
    // Animate the fill over the ~25s grace window (matches the host's grace timer).
    const fill = bar.querySelector("i");
    if (fill){
      bar.style.visibility = "visible";
      fill.style.animation = "none"; void fill.offsetWidth;
      fill.style.animation = "grow 25000ms linear forwards";
    }
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
  function gacSend(value, explicitKey){
    const key = explicitKey || (gacPromptState ? gacPromptState.key : null);
    if (room) room.send("gac_choice", {
      key,
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
    if (p.once) wrap.append(el("div", { className: "mpOnceBadge", textContent: "⏱️ once per game" }));
    if (p.img) wrap.append(el("img", { className:"gacSamNarrPortrait", src: p.img, style:"max-height:26vh;margin:6px auto 10px" }));
    if (p.narr) wrap.append(el("div", { className: "mpGacNarr", innerHTML: p.narr }));
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
      addConfirm(() => gacSend(chosen.v, p.key));
    } else if (p.kind === "single"){
      const row = el("div", { className: "mpGacBtns" });
      (p.options || []).forEach(o => {
        if (o.section){ row.append(el("div", { className:"mpGacBreak" })); return; }
        const btn = el("button", { className: "mpBtn gac" + (o.full ? " full" : ""), textContent: o.text });
        btn.onclick = () => { gacSelectSingle(row, btn); chosen.v = o.value; };
        row.append(btn);
      });
      wrap.append(row);
      addConfirm(() => gacSend(chosen.v, p.key));
    } else if (p.kind === "twopick"){
      wrap.append(el("div", { className: "mpSub", textContent: "Pick two different players." }));
      const rowA = el("div", { className: "mpGacBtns compact" });
      const rowB = el("div", { className: "mpGacBtns compact" });
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
      if (p.allowNone){
        const noneBtn = el("button", { className:"mpBtn gac", textContent: p.noneText || "None" });
        noneBtn.onclick = () => { chosen.v = ["",""]; paint(); [...rowA.children,...rowB.children].forEach(b=>b.classList.remove("sel")); noneBtn.classList.add("sel"); };
        wrap.append(noneBtn);
      }
      addConfirm(() => gacSend((chosen.v[0] && chosen.v[1] && chosen.v[0]!==chosen.v[1]) ? chosen.v : "", p.key));
    } else if (p.kind === "info"){
      // Santa-style: confirm to reveal. We send the choice, host replies gac_info.
      addConfirm(() => gacSend(p.value || "", p.key));
    }
  }
  function gacSelectSingle(row, btn){
    [...row.querySelectorAll(".mpBtn")].forEach(b => b.classList.remove("sel"));
    btn.classList.add("sel");
  }
  function addConfirm(fn){
    if (gacPromptState && gacPromptState.note){
      wrap.append(el("div", { className: "mpSub", style:"opacity:.8;margin-top:8px;font-size:13px", textContent: gacPromptState.note }));
    }
    const c = el("button", { className: "mpBtn gacConfirm", textContent: "Confirm ▶" });
    c.onclick = () => {
      c.disabled = true; c.textContent = "Sent ✓";
      // Lock the whole prompt so they can't change it after submitting.
      [...wrap.querySelectorAll(".mpBtn.gac")].forEach(b => { b.disabled = true; b.classList.add("dis"); });
      // IMPORTANT: send FIRST (while gacPromptState still holds the key), THEN
      // clear it. Clearing before fn() would make gacSend read a null key and
      // the host would ignore the answer — leaving the night to time out.
      fn();
      gacPromptState = null;
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
  // Shared "Everyone, go to sleep" screen shown to all phones at night start,
  // mirroring the narrator's opening beat, before the "night in progress" wait.
  function gacSleepScreen(p){
    onResultScreen = false;
    onWaitingScreen = false;
    samRunningBeat = false;   // not on a beat yet
    samSetupState = null;   // leaving any Sam card-assignment screen
    samDayControls = null; samDayResults = null;   // leaving any Sam day screen
    if (typeof mpHideSamNextNight === "function") mpHideSamNextNight();
    if (typeof mpHideGameLogBtn === "function") mpHideGameLogBtn();
    // Close any game-log overlay left open from a previous game's shared results,
    // and reset the shared-log latch so it doesn't re-trap the player.
    try { mpCloseLogOverlay(); } catch(_){}
    mpFullLogUnlocked = false;
    // Night 1 of a fresh game: clear last game's standing state. In physical-deal
    // games there's no per-player "yourCard" message to reset this, so do it here
    // (harmless on later nights — you can't un-eliminate mid-game because a dead
    // player's phone doesn't receive a new sleep screen as "alive").
    if (p && p.night === 1){
      mpSetEliminated(false);
      myConverted = false;
      myLove = null;
      mpCoinPlayed = false;
    }
    wrap.innerHTML = "";
    wrap.append(el("div", { className: "mpH", textContent: "🌙 Everyone, go to sleep" }));
    wrap.append(el("div", { className: "mpSub", textContent: "Close your eyes — the night is beginning." }));
  }
  let myCard = null;   // {name, image, desc} — the player's current role card
  let myLove = null;   // {inLove, partner} — Cupid love status (hold-to-reveal card)
  let myConverted = false;   // Krampus turned this player into a Grinch (same card, new team)

  // ---- Krampus conversion reveal ----
  // The player KEEPS their card — only their team flips — so nothing about their
  // role art changes. This screen is the only thing that tells them, so it's a
  // hold-to-reveal (nobody can shoulder-surf it) and it must be acknowledged.
  function showGrinchConversion(p){
    onResultScreen = true;   // don't let a filler "waiting" update clobber this
    onWaitingScreen = false;
    wrap.innerHTML = "";
    wrap.append(el("div", { className: "mpH", textContent: "Something happened…" }));
    wrap.append(el("div", { className: "mpSub",
      textContent: "Hold the card to see it. Keep your face still — everyone is watching." }));
    const card = el("div", { className: "mpLoveCard mpConvertCard" });
    const face = () => { card.innerHTML =
      `<div class="mpLoveInner"><div class="mpLoveBig">🔥</div><div class="mpLoveTxt">Krampus</div>
       <span class="mpLoveHint">hold to reveal</span></div>`; };
    const reveal = () => { card.innerHTML =
      `<div class="mpLoveInner"><div class="mpLoveBig">😈</div>
       <div class="mpLoveTxt">You are now<br>a GRINCH</div></div>`;
      card.classList.add("revealed"); };
    const unreveal = () => { face(); card.classList.remove("revealed"); };
    face();
    card.addEventListener("mousedown", reveal);
    card.addEventListener("touchstart", (e)=>{ e.preventDefault(); reveal(); }, { passive:false });
    window.addEventListener("mouseup", unreveal);
    window.addEventListener("touchend", unreveal);
    card.addEventListener("mouseenter", reveal);
    card.addEventListener("mouseleave", unreveal);
    wrap.append(card);
    wrap.append(el("div", { className:"mpSub", style:"margin-top:10px",
      innerHTML:`You keep <b>${(myCard&&myCard.name)||"your card"}</b> and all of its powers — but you now win with the <b>Grinches</b>. Tell no one.` }));
    const done = el("button", { className:"mpBtn gac full", style:"margin-top:12px", textContent:"I understand ▶" });
    done.onclick = () => { onResultScreen = false; waiting("You're back in the game. Act natural."); };
    wrap.append(done);
  }
  // Sam's card-assignment screen (hosted physical-deal game). Sam records which
  // character each player was physically dealt, then taps Begin to start the night.
  let samSetupState = null;
  let samRunningBeat = false;   // true while Sam is on a night-narration beat
  let samDayControls = null;    // Sam's day-phase controls (vote timer, living, etc.)
  let samDayResults = null;     // the day-summary payload (results + in/out) for Sam
  function showSamSetup(p){
    hideNudge();
    onWaitingScreen = false;
    samSetupState = {
      players: (p.players || []).slice(),
      cards: (p.cards || []).slice(),   // [{id,name,team}] each physical card once
      picks: {},                        // playerName -> roleId
    };
    renderSamSetup();
  }
  function samCardOptions(currentVal, forPlayer){
    // Count how many of each card are taken by OTHER players.
    const taken = {};
    for (const nm in samSetupState.picks){
      if (nm === forPlayer) continue;
      const rid = samSetupState.picks[nm];
      if (rid) taken[rid] = (taken[rid] || 0) + 1;
    }
    // Group cards by name so duplicates number cleanly (Elf 1, Elf 2…).
    const byName = new Map();
    samSetupState.cards.forEach(c => {
      if (!byName.has(c.name)) byName.set(c.name, []);
      byName.get(c.name).push(c.id);
    });
    // Tally how many of each id exist and how many are already placed elsewhere.
    const totalById = {};
    samSetupState.cards.forEach(c => { totalById[c.id] = (totalById[c.id] || 0) + 1; });
    let html = `<option value="">— Select Character —</option>`;
    for (const [name, ids] of byName){
      ids.forEach((id, n) => {
        const usedElsewhere = taken[id] || 0;
        const disabled = usedElsewhere >= (totalById[id] || 1) && currentVal !== id;
        const label = ids.length > 1 ? `${name} ${n + 1}` : name;
        const sel = currentVal === id ? " selected" : "";
        const dis = disabled ? " disabled" : "";
        const mark = disabled ? " ✓ assigned" : "";
        html += `<option value="${id}"${sel}${dis}>${label}${mark}</option>`;
      });
    }
    return html;
  }
  function renderSamSetup(){
    wrap.innerHTML = "";
    wrap.append(el("div", { className:"mpH", textContent:"🎴 Assign the cards" }));
    wrap.append(el("div", { className:"mpSub", style:"opacity:.85;margin-top:-6px;text-align:center",
      textContent:"You're Sam. Set which character each player was physically dealt, then tap Begin." }));
    const list = el("div", { style:"margin:14px 0;display:flex;flex-direction:column;gap:8px" });
    samSetupState.players.forEach(name => {
      const row = el("div", { style:"display:flex;align-items:center;gap:8px" });
      row.append(el("div", { style:"flex:0 0 40%;font-family:'NitemareFont','Trebuchet MS',Arial,sans-serif;font-weight:bold;overflow:hidden;text-overflow:ellipsis", textContent:name }));
      const sel = el("select", { className:"mpInput", style:"flex:1 1 auto" });
      sel.innerHTML = samCardOptions(samSetupState.picks[name] || "", name);
      sel.onchange = () => {
        if (sel.value) samSetupState.picks[name] = sel.value;
        else delete samSetupState.picks[name];
        renderSamSetup();   // re-render so "assigned" greying updates across rows
      };
      row.append(sel);
      list.append(row);
    });
    wrap.append(list);
    // Progress + Begin. Assigning every player is optional (a player may be a
    // no-power role the app still tracks), but warn if none are assigned.
    const assigned = Object.keys(samSetupState.picks).length;
    wrap.append(el("div", { className:"mpSub", style:"text-align:center;opacity:.7",
      textContent:`${assigned} of ${samSetupState.players.length} assigned` }));
    const begin = el("button", { className:"mpBtn gac full", style:"margin-top:12px", textContent:"▶ Begin Night 1" });
    begin.onclick = () => {
      begin.disabled = true; begin.textContent = "Starting…";
      try { if (room) room.send("gac_choice", { key:"gac_sam_setup", value: samSetupState.picks, from: myName }); } catch(_){}
    };
    wrap.append(begin);
  }
  // Sam Settings on Sam's phone: pace / input / choices. Sam picks and taps Begin,
  // which replies to the host to apply the settings and start the night.
  let samSettingsState = null;
  function showSamSettings(p){
    hideNudge();
    onWaitingScreen = false;
    samSettingsState = {
      pace: p.pace || "narrator",
      narr: p.narr || "player",         // narration audio: player (silent) | game (read aloud)
      input: p.input || null,           // null when virtual (no input question)
      virtual: !!p.virtual,
      choices: !!p.choices,
      allJoined: !!p.allJoined,
    };
    renderSamSettings();
  }
  function renderSamSettings(){
    const s = samSettingsState;
    wrap.innerHTML = "";
    wrap.append(el("div", { className:"mpH", textContent:"Sam Settings" }));
    wrap.append(el("div", { className:"mpSub", style:"text-align:center;opacity:.85;margin-top:-4px",
      textContent:"Set up the night, then begin." }));

    // Pace.
    wrap.append(el("div", { className:"mpSummaryHdr", style:"margin-top:14px", textContent:"Pace" }));
    const paceWrap = el("div", { style:"display:flex;gap:6px" });
    [["narrator","👆 Manual Tap"],["auto","🕹️ Auto-Advance"]].forEach(([val,label]) => {
      const b = el("button", { className:"mpBtn gac" + (s.pace===val?" sel":""), style:"flex:1", textContent:label });
      b.onclick = () => { s.pace = val; renderSamSettings(); };
      paceWrap.append(b);
    });
    wrap.append(paceWrap);

    // Narration audio.
    wrap.append(el("div", { className:"mpSummaryHdr", style:"margin-top:14px", textContent:"Narration Audio" }));
    const narrWrap = el("div", { style:"display:flex;gap:6px" });
    [["player","🗣️ Player Narrates"],["game","🔊 Game Narrates"]].forEach(([val,label]) => {
      const b = el("button", { className:"mpBtn gac" + (s.narr===val?" sel":""), style:"flex:1", textContent:label });
      b.onclick = () => { s.narr = val; renderSamSettings(); };
      narrWrap.append(b);
    });
    wrap.append(narrWrap);

    // Input method (physical only).
    if (!s.virtual){
      wrap.append(el("div", { className:"mpSummaryHdr", style:"margin-top:14px", textContent:"How are characters input?" }));
      const inWrap = el("div", { style:"display:flex;flex-direction:column;gap:6px" });
      [["players","Players Input"],["sam","Sam the Snowman Inputs"],["none","Do Not Track Players"]].forEach(([val,label]) => {
        const b = el("button", { className:"mpBtn gac full" + (s.input===val?" sel":""), textContent:label });
        b.onclick = () => { s.input = val; renderSamSettings(); };
        inWrap.append(b);
      });
      wrap.append(inWrap);
    }

    // Players make own choices (greyed unless all joined).
    const choiceBtn = el("button", {
      className:"mpBtn gac full" + (s.choices?" sel":""),
      style:"margin-top:14px" + (s.allJoined?"":";opacity:.45"),
      textContent:(s.choices?"☑":"☐") + " Players make their own night choices" });
    choiceBtn.onclick = () => { if (!s.allJoined) return; s.choices = !s.choices; renderSamSettings(); };
    wrap.append(choiceBtn);
    if (!s.allJoined){
      wrap.append(el("div", { className:"mpSub", style:"opacity:.7;margin-top:4px;text-align:center",
        textContent:"Available once every player has joined on a device." }));
    }

    const begin = el("button", { className:"mpBtn gac full", style:"margin-top:18px", textContent:"Continue ▶" });
    begin.onclick = () => {
      begin.disabled = true; begin.textContent = "Continuing…";
      try { if (room) room.send("gac_choice", { key:"gac_sam_settings", from: myName,
        value: { pace: s.pace, narr: s.narr, input: s.virtual ? null : s.input, choices: !!s.choices } }); } catch(_){}
    };
    wrap.append(begin);
  }
  function showSamDay(p){
    hideNudge();
    samRunningBeat = false;   // night's over — allow waits again
    samSetupState = null;
    samDayControls = { living:(p.living||[]).slice(), hasCharlie:!!p.hasCharlie,
                       voteTimerMs: p.voteTimerMs||0, voteHeld:!!p.voteHeld, night:p.night||"",
                       mobileVoting: !!p.mobileVoting,
                       logPlayers: (p.samLogPlayers||[]).slice() };
    // The samDay info payload also carries the full log data — wire the log button.
    if (p.samLogPlayers || p.samLogEvents){
      const logSrc = Object.assign({}, p, { resultsHidden:false });
      lastGameLog = logSrc;
      mpShowGameLogBtn(logSrc);
    }
    renderSamDay();
  }
  function renderSamDay(){
    onWaitingScreen = false;
    const c = samDayControls || { living:[], hasCharlie:false, voteTimerMs:0, voteHeld:false, night:"" };
    const s = samDayResults;   // the day-summary payload (results + in/out), if arrived
    wrap.innerHTML = "";
    wrap.append(el("div", { className:"mpH", textContent:`☀️ Day ${(s&&s.night)||c.night||""} — you are Sam` }));
    wrap.append(el("div", { className:"mpSub", style:"opacity:.8;margin-top:-6px;text-align:center",
      textContent:"Run the discussion, then record the vote." }));

    // Overnight results — rendered with the SAME helper players use, so it looks
    // identical. Sam narrated the night, so they always see them (ungated).
    if (s){
      const resultsBox = el("div");
      appendResultLines(resultsBox, s);
      wrap.append(resultsBox);
      // Share with everyone (optional): for overnight results (pre-vote) OR at
      // game end (the narrator reveals the final win/loss to the table).
      const _gameEnd = !!(s.win && s.win !== "coinpending");
      if ((!s.afterVote || _gameEnd) && !s.resultsShared){
        const shareBtn = el("button", { className:"mpBtn gac full", style:"margin-top:8px",
          textContent:"📣 Share these results with everyone" });
        shareBtn.onclick = () => {
          try { if (room) room.send("gac_share_results", { from: myName }); } catch(_){}
          shareBtn.disabled = true; shareBtn.textContent = "✓ Shared with everyone";
        };
        wrap.append(shareBtn);
      }
      // In/out list — Sam is the moderator, so show each player's CHARACTER too.
      const roleByName = {};
      const convByName = {};
      const lp = (samDayControls && samDayControls.logPlayers) || (s && s.samLogPlayers) || [];
      lp.forEach(p => { if (p && p.name){ roleByName[p.name] = p.role || ""; convByName[p.name] = !!p.converted; } });
      const withRole = (n) => {
        const r = roleByName[n];
        if (!r) return n;
        return `${n} — ${r}${convByName[n] ? " → 😈 Grinch" : ""}`;
      };
      const box = el("div", { className:"mpSummaryBox" });
      box.append(el("div", { className:"mpSummaryHdr", textContent:`Still in (${(s.living||[]).length})` }));
      (s.living||[]).forEach(n => box.append(el("div", { className:"mpSummaryIn", textContent:`✅ ${withRole(n)}` })));
      if ((s.out||[]).length){
        box.append(el("div", { className:"mpSummaryHdr", textContent:`Out (${s.out.length})` }));
        (s.out||[]).forEach(n => box.append(el("div", { className:"mpSummaryOut", textContent:`❌ ${withRole(n)}` })));
      }
      wrap.append(box);
    }

    // If the game is over, no vote/next-night controls — just the results above.
    const gameOver = !!(s && s.win && s.win !== "coinpending");
    if (!gameOver){
      // Mobile voting: hand the vote to every player's phone. The host runs it.
      if (c && c.mobileVoting){
        const mvBtn = el("button", { className:"mpBtn gacConfirm full", style:"margin-top:14px",
          textContent:"🗳️ Start Mobile Vote" });
        mvBtn.onclick = () => {
          mvBtn.disabled = true; mvBtn.textContent = "Starting vote…";
          try { if (room) room.send("gac_sam_day", { action:"startVote", from: myName }); } catch(_){}
        };
        wrap.append(mvBtn);
        wrap.append(el("div", { className:"mpSub", style:"opacity:.7;margin-top:4px;text-align:center;font-size:13px",
          textContent:"Sends vote buttons to everyone's phone. Or pick the result by hand below." }));
      }
      // Vote timer (optional).
      const timerBtn = el("button", { className:"mpBtn gac full", style:"margin-top:14px",
        textContent:"⏱️ Start vote timer (optional)" });
      const timerBox = el("div", { style:"text-align:center;margin:8px 0" });
      timerBtn.onclick = () => runSamVoteTimer(timerBox, timerBtn);
      wrap.append(timerBtn);
      wrap.append(timerBox);

      // Who was voted out?
      wrap.append(el("div", { className:"mpSub", style:"margin-top:16px;text-align:center;font-weight:bold",
        textContent:"Who was voted out?" }));
      const voteWrap = el("div", { style:"display:flex;flex-direction:column;gap:6px;margin-top:6px" });
      (c.living||[]).forEach(name => {
        const b = el("button", { className:"mpBtn gac full gacNameBtn", textContent:`❌ ${name}` });
        b.onclick = () => sendSamVote({ eliminated: name }, b);
        voteWrap.append(b);
      });
      const noneBtn = el("button", { className:"mpBtn gac full", style:"opacity:.85", textContent:"🕊️ No Elimination this Day" });
      noneBtn.onclick = () => sendSamVote({}, noneBtn);
      voteWrap.append(noneBtn);
      if (c.hasCharlie){
        const tieBtn = el("button", { className:"mpBtn gac full", style:"opacity:.85", textContent:"⚖️ Tie vote (Charlie Brown out)" });
        tieBtn.onclick = () => sendSamVote({ tie:true }, tieBtn);
        voteWrap.append(tieBtn);
      }
      wrap.append(voteWrap);

      // Spacer so the last options clear the fixed bottom bar (Next Night / Game
      // Log / Cheat Sheet) and stay scrollable into view.
      wrap.append(el("div", { style:"height:96px" }));

      // Next Night lives in the BOTTOM BAR (centered, between Game Log & Cheat
      // Sheet) — not a wide button in the flow.
      mpShowSamNextNight();
    } else {
      mpHideSamNextNight();
    }
  }
  function sendSamVote(result, btn){
    try { if (room) room.send("gac_sam_day", { action:"vote",
      eliminated: result.eliminated||null, tie: !!result.tie, from: myName }); } catch(_){}
    if (btn){ btn.disabled = true; btn.textContent = "✓ " + btn.textContent.replace(/^✓ /,""); }
  }
  // A centered "Next Night" button pinned to the bottom bar, between the Game Log
  // and Cheat Sheet buttons.
  let samNextNightBtn = null;
  function mpShowSamNextNight(){
    if (!samNextNightBtn){
      samNextNightBtn = el("button", { className:"mpSamNextNight", textContent:"🌙 Next Night ▶" });
      samNextNightBtn.onclick = () => {
        samNextNightBtn.disabled = true; samNextNightBtn.textContent = "Starting…";
        try { if (room) room.send("gac_sam_day", { action:"nextNight", from: myName }); } catch(_){}
      };
      document.body.appendChild(samNextNightBtn);
    }
    samNextNightBtn.disabled = false;
    samNextNightBtn.textContent = "🌙 Next Night ▶";
    samNextNightBtn.style.display = "block";
  }
  function mpHideSamNextNight(){ if (samNextNightBtn) samNextNightBtn.style.display = "none"; }
  function runSamVoteTimer(box, btn){
    const ms = (samDayControls && samDayControls.voteTimerMs) || 0;
    btn.disabled = true;
    box.innerHTML = "";
    const clock = el("div", { style:"font-family:'NitemareFont','Trebuchet MS',Arial,sans-serif;font-size:40px;margin:6px 0" });
    box.append(clock);
    if (!ms){ clock.textContent = "—"; box.append(el("div", { className:"mpSub", textContent:"No timer set." })); btn.disabled=false; return; }
    let endsAt = Date.now() + ms; let iv = null;
    const paint = () => {
      const left = Math.max(0, endsAt - Date.now());
      const m = Math.floor(left/60000), s = Math.floor((left%60000)/1000);
      clock.textContent = `${m}:${String(s).padStart(2,"0")}`;
      if (left<=0){ if (iv) clearInterval(iv); clock.textContent = "Time's up"; btn.disabled=false; btn.textContent="⏱️ Restart timer"; }
    };
    paint(); iv = setInterval(paint, 250);
  }
  function showSamNarration(p){
    hideNudge();
    samRunningBeat = true;   // Sam is on a beat — ignore table 'wait' broadcasts
    samSetupState = null;   // leaving any setup screen
    samDayControls = null; samDayResults = null;
    if (typeof mpHideSamNextNight === "function") mpHideSamNextNight();
    wrap.innerHTML = "";
    // Header (stays at top) — the one bit that differs from the host by design.
    wrap.append(el("div", { className: "mpH", style:"margin-bottom:0", textContent: `🌙 Night ${p.night||""} — you are Sam` }));
    wrap.append(el("div", { className:"mpSub", style:"opacity:.8;margin-top:-2px;text-align:center",
      textContent: "Read each line aloud to the room." }));
    // Body — portrait + line, VERTICALLY CENTERED like the host's #gacNarrBody.
    const body = el("div", { className:"gacSamNarrBody" });
    if (p.img){
      body.append(el("img", { className:"gacSamNarrPortrait", src: p.img }));
    }
    body.append(el("div", { className:"gacSamNarrLine", textContent: p.text || "" }));
    // Reason there's no input (dead / spent / card in center) — clear to Sam.
    if (p.note){
      body.append(el("div", { className:"mpSub", style:"margin-top:12px;opacity:.85;color:#cfe0ea;font-size:16px",
        textContent: p.note }));
    }
    wrap.append(body);
    // Controls — pinned at the bottom, matching #gacNarrControls + #gacNarrProgress.
    if (p.showNext){
      const navRow = el("div", { className:"gacSamNavRow" });
      if (p.canBack){
        const back = el("button", { className:"gacSamNavBtn gacSamBack", textContent:"◀ Back" });
        back.onclick = () => { try { if (room) room.send("gac_sam_nav", { dir:"back", from: myName }); } catch(_){} };
        navRow.append(back);
      }
      const next = el("button", { className:"gacSamNavBtn gacSamNext", textContent: p.nextLabel || "Next ▶" });
      next.onclick = () => { try { if (room) room.send("gac_sam_nav", { dir:"next", from: myName }); } catch(_){} };
      navRow.append(next);
      wrap.append(navRow);
    } else {
      wrap.append(el("div", { className:"mpSub", style:"text-align:center;opacity:.6;margin-top:12px",
        textContent: "The app is pacing the night automatically." }));
    }
    wrap.append(el("div", { className:"gacSamNarrProg", textContent: p.progress || "" }));
  }
  function gacInfo(p){
    // A non-host SAM is running the night — this beat is streamed from the host
    // so Sam can read/run it from their own phone.
    if (p && p.samNarr){ showSamNarration(p); return; }
    // Non-host Sam runs the DAY too: vote timer, who-was-voted-out, next night.
    if (p && p.samDay){ showSamDay(p); return; }
    // Host handed Sam the card-assignment task (hosted physical-deal game where a
    // non-host player is Sam). Sam records each player's dealt card, then Begins.
    if (p && p.samSetup){ showSamSetup(p); return; }
    // Host handed Sam the night-settings task (pace/input/choices). Sam picks and
    // taps Begin, replying back so the host applies them and starts.
    if (p && p.samSettings){ showSamSettings(p); return; }
    // Host cancelled the card-assignment hand-off — leave the setup screen.
    if (p && p.samSetupCancel){
      samSetupState = null;
      waiting("Waiting for the host…");
      return;
    }
    // A dealt-card assignment (virtual deal) — store it and show the waiting
    // screen with a persistent "View My Card" peek button.
    if (p && p.yourCard){
      myCard = { name: p.name, image: p.image, desc: p.desc || "", roleId: p.roleId || null, selfElim: !!p.selfElim };
      gacPeekReported = false;   // fresh card → they haven't peeked at this one yet
      if (!p.changedNote){
        myLove = null;           // fresh deal (new game) → clear old love status
        mpSetEliminated(false);  // ...and they're alive again
        myConverted = false;     // ...and not a converted Grinch
        mpCoinPlayed = false;    // ...and a new game's coin flip can animate again
        mpFullLogUnlocked = false; // ...and the log goes back to spoiler-free
        lastGameLog = null;      // ...and the old game's log is gone
        // CRITICAL: the end-of-game Summary opens as a full-screen overlay. If we
        // don't close it, it stays pinned on top of the new game — the player sees
        // the old summary, never sees their new card, and looks "stuck in the
        // previous game" even though the new one is running underneath.
        try { mpCloseLogOverlay(); } catch(_){}
      }
      // Krampus turned them. Their CARD ART DOESN'T CHANGE (they keep the same
      // role), so a one-off note is far too easy to miss — remember it and stamp
      // it on the card itself every time they look at it.
      if (p.convertedToGrinch) myConverted = true;
      // If the card CHANGED overnight (Krampus convert / Wet steal), tell them
      // clearly so they hold to view their new role.
      if (p.convertedToGrinch) showGrinchConversion(p);
      else waiting(p.changedNote || "You've been dealt your card. Hold/hover to view your role.");
      return;
    }
    // Cupid love reveal — show the mistletoe hold-card. Holding reveals ONLY
    // whether you're in love (never with whom). A Confirm button reports back so
    // the host can count everyone in; a live count shows while we wait.
    if (p && p.loveReveal){
      myLove = { inLove: !!p.inLove };
      gacLoveConfirmed = false;
      showLoveReveal();
      return;
    }
    // Wet Bandits card check — everyone holds to view their CURRENT card (which
    // may have changed) and confirms. Same confirm-count gate as the love reveal.
    if (p && p.cardCheck){
      myCard = {
        name: p.name || (myCard ? myCard.name : ""),
        image: p.image || (myCard ? myCard.image : ""),
        // Preserve the existing description if none was sent, so holding the card
        // during the check always shows the role text (same as any other view).
        desc: p.desc || (myCard ? myCard.desc : "") || "",
        roleId: myCard ? myCard.roleId : null,
        selfElim: myCard ? myCard.selfElim : false
      };
      gacLoveConfirmed = false;
      showCardCheck();
      return;
    }
    // Krampus conversion note (physical / Sam-inputs games, where no fresh card
    // is pushed). Remember the conversion so the card peek shows the Grinch stamp.
    if (p && p.convertNote){ myConverted = true; }
    // A private result for this player (e.g. Santa's naughty/nice). Stays on
    // screen until they tap "Done" — later filler updates (the host moving
    // on to the next beat) won't be allowed to clobber it first. If the result
    // needs acknowledgment, the host is holding the night open until we reply.
    onResultScreen = true;
    wrap.innerHTML = "";
    wrap.append(el("div", { className: "mpH", textContent: p.title || "Result" }));
    wrap.append(el("div", { className: "mpGacResult", innerHTML: p.html || p.text || "" }));
    const ok = el("button", { className: "mpBtn gac", textContent: p.needsAck ? "Done ▶" : "Got it" });
    ok.onclick = () => {
      onResultScreen = false;
      if (p.ackTimer){ clearTimeout(p.ackTimer); p.ackTimer = null; }
      if (p.needsAck){ try { if (room) room.send("gac_ack", { from: myName, key: p.ackKey || "santaInspect" }); } catch(_){} }
      gacWait("Waiting for the host…");
    };
    wrap.append(ok);
  }
  // Day-phase summary shown to every player: overnight deaths + who's in/out.
  // Animated team coin for the draw tiebreaker. Players WATCH — the host flips.
  // While pending (revealed=false) it shows a two-sided preview + waiting note.
  // Once revealed, the first render animates the spin; later re-renders show it settled.
  let mpCoinPlayed = false;
  function mpBuildCoinFlip(winner, revealed){
    const wrap = el("div", { className:"gacCoinWrap" });
    const stage = el("div", { className:"gacCoinStage" });
    const coin = el("div", { className:"gacCoin3d" });
    coin.innerHTML =
      `<div class="gacCoinSide christmas"></div>` +
      `<div class="gacCoinEdge"></div>` +
      `<div class="gacCoinSide grinch"></div>`;
    stage.appendChild(coin);
    const txt = el("div", { className:"gacCoinTxt" });
    const settle = (w) => {
      coin.className = "gacCoin3d"; coin.style.animation = "none";
      coin.style.transform = `rotateY(${w==="grinch"?180:0}deg)`;
      txt.className = "gacCoinTxt reveal";
      txt.textContent = w==="grinch" ? "😈 The Grinches take it!" : "🎄 Christmas takes it!";
    };
    if (!revealed){
      // Not flipped yet — two-sided preview + waiting note (matches the host).
      const legend = el("div", { className:"gacCoinLegend" });
      legend.innerHTML =
        `<div class="gacCoinLegRow"><span class="gacCoinChip xmas"></span> Christmas side → 🎄 Christmas wins</div>` +
        `<div class="gacCoinLegRow"><span class="gacCoinChip grinch"></span> Grinch side → 😈 Grinches win</div>`;
      txt.textContent = "It's a draw — the host is flipping…";
      wrap.append(stage, legend, txt);
      return wrap;
    }
    const w = (winner === "grinch") ? "grinch" : "christmas";
    if (mpCoinPlayed){
      settle(w);                    // already watched it — show the result
    } else {
      mpCoinPlayed = true;
      const turns = 4 + Math.floor(Math.random()*4);   // 4..7
      const dur = 3.2 + Math.random()*2.0;             // 3.2..5.2s
      const endDeg = turns*360 + (w==="grinch"?180:0);
      txt.textContent = "The coin is in the air…";
      coin.style.setProperty("--spin-dur", dur+"s");
      coin.style.setProperty("--spin-end", endDeg+"deg");
      stage.style.setProperty("--spin-dur", dur+"s");
      void coin.offsetWidth;
      coin.classList.add("gacCoinSpinning");
      stage.classList.add("gacCoinHop");
      setTimeout(() => settle(w), dur*1000);
    }
    wrap.append(stage, txt);
    return wrap;
  }

  function gacDaySummary(s){
    // A non-host Sam running the game gets the SAME day layout as players
    // (results + in/out via the shared renderers), plus their day controls.
    // Sam narrated the night, so they always see results immediately (ungated).
    if (s && s.samName && s.samName === myName){
      const sForSam = Object.assign({}, s, { resultsHidden:false, resultsRecipient:null });
      lastGameLog = sForSam;
      if (typeof mpShowGameLogBtn === "function") mpShowGameLogBtn(sForSam);
      samDayResults = sForSam;
      renderSamDay();
      return;
    }
    onResultScreen = false;
    onWaitingScreen = false;
    // Only raise the standing "eliminated" banner once results are actually
    // revealed. While they're gated to Sam, the payload still lists the eliminated
    // player in `out`, but nobody should see their own elimination before Sam
    // reveals it.
    const _resultsHidden = !!(s.resultsHidden && s.resultsRecipient && s.resultsRecipient !== myName);
    if (!_resultsHidden) mpSyncEliminatedFrom(s);
    if (cheat) cheat.showBtn();
    wrap.innerHTML = "";
    wrap.append(el("div", { className: "mpH", textContent: `Day ${s.night||""} — Results` }));

    // The overnight RESULTS (win/deaths/vote/frost/coin) can be GATED by the
    // night-results distribution setting. amRecipient = this phone is the chosen
    // viewer; others wait until the recipient shares. A local reveal lets the
    // recipient dramatize before sharing.
    const amRecipient = s.resultsHidden && s.resultsRecipient === myName;
    const resultsBox = el("div");
    const renderResults = () => {
      resultsBox.innerHTML = "";
      appendResultLines(resultsBox, s);
    };
    if (!s.resultsHidden){
      renderResults();                       // everyone sees results (normal)
      wrap.append(resultsBox);
    } else if (amRecipient){
      // Recipient: hidden until they tap Reveal, then a Share button appears.
      const revealBtn = el("button", { className:"mpBtn gac full", style:"margin:6px 0",
        textContent:"🎬 Reveal the results (only you)" });
      revealBtn.onclick = () => {
        renderResults();
        revealBtn.remove();
        const shareBtn = el("button", { className:"mpBtn gac full", style:"margin:10px 0 4px",
          textContent:"📣 Share these results with everyone" });
        shareBtn.onclick = () => {
          try { if (room) room.send("gac_share_results", { from: myName }); } catch(_){}
          shareBtn.disabled = true; shareBtn.textContent = "✓ Shared with everyone";
        };
        resultsBox.append(shareBtn);
        resultsBox.append(el("div", { className:"mpSub", style:"margin-top:6px;opacity:.75",
          textContent:"Only you can see these right now. Sharing is optional." }));
      };
      wrap.append(revealBtn);
      wrap.append(resultsBox);
    } else {
      // Everyone else: a placeholder where the results will appear once shared.
      const who = s.resultsRecipient ? s.resultsRecipient : "someone";
      resultsBox.append(el("div", { className:"mpSub", style:"margin:10px 0;text-align:center;opacity:.8",
        innerHTML:`🌙 The night's results are with <b>${who}</b>.<br>Waiting for them to be revealed…` }));
      wrap.append(resultsBox);
    }

    // ---- Everything below is ALWAYS shown, gated or not ----
    // Card near the TOP so players don't have to scroll to reach it.
    const card = gacViewCardControl();
    if (card){
      wrap.append(el("div", { className:"mpSub", style:"margin-top:14px", textContent:"Your card — hold to view:" }));
      wrap.append(card);
    }
    // Self-eliminate button sits just below the card (shows for everyone living
    // when a gimmick role is in play, so it doesn't reveal who holds it). The rule
    // it enforces (Bad Santa must say "Grinch" each day; Scrooge may only say
    // "BAH HUMBUG") applies through the WHOLE day — before the reveal (while a
    // player who died overnight still thinks they're alive) AND after it, during
    // discussion and voting. So gate on: gimmick in play, the player still
    // believes they're alive, and the game isn't revealed-over to them.
    //   • Use mpAmEliminated (not s.living): while results are gated to Sam,
    //     s.living is withheld from other phones — but a player always knows if
    //     they themselves have been revealed out.
    //   • A game-over win is only set here when it's been revealed to this phone
    //     (gated phones get s.win = null), so this never hides the button early.
    const amAlive = !mpAmEliminated;
    const gameEndedForMe = !!(s.win && s.win !== "coinpending");
    if (s.gimmickInPlay && amAlive && !gameEndedForMe){
      const seBtn = el("button", { className:"mpBtn gac", style:"margin-top:12px;background:#b3261e;color:#fff",
        textContent:"💀 I broke my rule — eliminate me" });
      seBtn.onclick = () => {
        if (seBtn.dataset.confirm === "1"){
          try { if (room) room.send("gac_self_elim", { from: myName }); } catch(_){}
          seBtn.disabled = true; seBtn.textContent = "Sent ✓";
        } else {
          seBtn.dataset.confirm = "1";
          seBtn.textContent = "Tap again to confirm — this eliminates you";
        }
      };
      wrap.append(seBtn);
    }
    // In/out list below the card. While results are GATED to a recipient, a
    // non-recipient must NOT see the updated in/out list — it reveals who died
    // before the results are shared. Show a placeholder until the reveal.
    const resultsGatedFromMe = s.resultsHidden && s.resultsRecipient !== myName;
    const box = el("div", { className:"mpSummaryBox" });
    if (resultsGatedFromMe){
      box.append(el("div", { className:"mpSummaryHdr", textContent:"Who's in & out" }));
      box.append(el("div", { className:"mpSub", style:"opacity:.7;padding:6px 2px",
        textContent:"Hidden until the results are revealed." }));
    } else {
      box.append(el("div", { className:"mpSummaryHdr", textContent:`Still in (${(s.living||[]).length})` }));
      (s.living||[]).forEach(n => box.append(el("div", { className:"mpSummaryIn", textContent:`✅ ${n}` })));
      if ((s.out||[]).length){
        box.append(el("div", { className:"mpSummaryHdr", textContent:`Out (${s.out.length})` }));
        (s.out||[]).forEach(n => box.append(el("div", { className:"mpSummaryOut", textContent:`❌ ${n}` })));
      }
    }
    wrap.append(box);
    // Every player always has a Game Log button, pinned bottom-left.
    lastGameLog = s;
    mpShowGameLogBtn(s);
  }
  // Render the overnight result lines (win, swaps, vote/deaths, frost, coin) into
  // a container. Split out so it can be shown immediately or gated behind a reveal.
  function appendResultLines(wrap, s){
    if (s.win && s.win !== "coinpending"){
      // Sam is the moderator — no personal win/loss. Everyone else gets theirs.
      const amSam = !!(s.samName && s.samName === myName);
      const me = (s.players || []).find(p => p.name === myName);
      if (!amSam && me && typeof me.won === "boolean"){
        wrap.append(el("div", { className: me.won ? "mpPersonalWin win" : "mpPersonalWin lose",
          innerHTML: me.won ? "🏆 You win!" : "💔 You lose" }));
      }
      const labels = { christmas:"🎄 Christmas team wins!", grinch:"😈 The Grinches win!", lovers:"💘 The lovers win!", draw:"☠️ Nobody survived — no winner." };
      wrap.append(el("div", { className: "mpGacResult", innerHTML: `<b>${labels[s.win]||"Game over"}</b>` }));
    }
    if (s.swaps && s.swaps.length){
      s.swaps.forEach(sw => wrap.append(el("div", { className:"mpSub", innerHTML:`🔄 <b>${sw.a}</b> and <b>${sw.b}</b> were swapped — switch seats!` })));
    }
    if (s.afterVote){
      if (s.votedOut){
        wrap.append(el("div", { className:"mpGacResult", innerHTML:`🗳️ <b>${s.votedOut}</b> was voted out.` }));
      } else if (s.tieEliminated){
        wrap.append(el("div", { className:"mpGacResult", innerHTML:`⚖️ Tie vote — <b>${s.tieEliminated}</b> was eliminated.` }));
      } else {
        wrap.append(el("div", { className:"mpSub", textContent:"🗳️ The vote ended with no elimination." }));
      }
      if (s.heartbreak && s.heartbreak.length){
        wrap.append(el("div", { className:"mpGacResult",
          innerHTML:`💔 <b>${s.heartbreak.join(", ")}</b> died of heartbreak.` }));
      }
    } else if (s.deaths && s.deaths.length){
      wrap.append(el("div", { className:"mpGacResult", innerHTML:`🌙 Overnight: <b>${s.deaths.join(", ")}</b> ${s.deaths.length===1?"was":"were"} lost.` }));
    } else if (!s.frostPending && !s.frostTookDown) {
      wrap.append(el("div", { className:"mpSub", textContent:"🌙 A quiet night — everyone survived." }));
    }
    if (s.frostPending){
      wrap.append(el("div", { className:"mpGacResult", innerHTML:`❄️ Waiting on a decision from <b>Jack Frost</b>…` }));
    }
    if (s.frostTookDown){
      wrap.append(el("div", { className:"mpGacResult", innerHTML:`❄️ Jack Frost took <b>${s.frostTookDown}</b> down with him.` }));
    }
    if (s.coinPending || s.coinRevealed){
      wrap.append(mpBuildCoinFlip(s.coinFlip || null, !!s.coinRevealed));
    }
  }
  // Fixed bottom-left Game Log button (created once, updated as state changes).
  // ---- Standing "eliminated" banner ----
  // Once this player is out, a banner stays pinned at the top of their screen for
  // the rest of the game, on every screen — not just the vote screen.
  let mpDeadBannerEl = null;
  let mpAmEliminated = false;
  function mpSetEliminated(dead){
    mpAmEliminated = !!dead;
    if (!mpDeadBannerEl){
      mpDeadBannerEl = el("div", { className: "mpDeadBanner",
        innerHTML: `<span class="mpDeadSkull">💀</span> You have been eliminated — you're out for the rest of the game.` });
      document.body.appendChild(mpDeadBannerEl);
    }
    mpDeadBannerEl.classList.toggle("show", mpAmEliminated);
    document.body.classList.toggle("mpHasDeadBanner", mpAmEliminated);
  }
  // Read the day-summary's "out" list to keep the banner in sync.
  function mpSyncEliminatedFrom(s){
    if (!s || !Array.isArray(s.out)) return;
    if (s.out.includes(myName)) mpSetEliminated(true);
  }

  let mpGameLogBtnEl = null;
  // The full log renderer wants { players, events }. Once results are shared the
  // payload carries those directly; before then, only SAM receives the data (as
  // samLogPlayers/samLogEvents). Normalize so one renderer serves both.
  function mpLogSourceFor(s){
    if (!s) return lastGameLog || s;
    if (s.players && s.players.length && s.events) return s;
    if (s.samLogPlayers){
      return Object.assign({}, s, { players: s.samLogPlayers, events: s.samLogEvents || [], log: s.samLog || s.log || [] });
    }
    return lastGameLog || s;
  }
  function mpShowGameLogBtn(s){
    if (!mpGameLogBtnEl){
      mpGameLogBtnEl = el("button", { className:"mpGameLogBtn", textContent:"📜 Game Log" });
      document.body.appendChild(mpGameLogBtnEl);
    }
    mpGameLogBtnEl.style.display = "block";
    // Sam is the moderator and sees the whole game, so their phone gets the FULL
    // log at any point. Everyone else gets the spoiler-free log until results
    // are shared at the end.
    const amSam = !!(s && s.samName && s.samName === myName);
    mpGameLogBtnEl.onclick = () => ((mpFullLogUnlocked || s.resultsShared || amSam)
      ? showGameLog(mpLogSourceFor(s))
      : showSimpleLog(s));
  }
  function mpHideGameLogBtn(){ if (mpGameLogBtnEl) mpGameLogBtnEl.style.display = "none"; }
  // Spoiler-free running log (no roles) — available to players during play.
  // ---- Game log overlay ----
  // The log opens ON TOP of the player's current screen (results, waiting, a
  // prompt) and closes back to it — it never re-renders/replaces what's beneath.
  let mpLogOverlayEl = null, mpLogOverlayBody = null;
  function mpEnsureLogOverlay(){
    if (mpLogOverlayEl) return mpLogOverlayEl;
    mpLogOverlayEl = el("div", { className: "mpLogOverlay" });
    const x = el("button", { className: "mpLogOverlayX", textContent: "✕" });
    x.onclick = () => mpCloseLogOverlay();
    mpLogOverlayBody = el("div", { className: "mpLogOverlayScroll" });
    mpLogOverlayEl.append(x, mpLogOverlayBody);
    document.body.appendChild(mpLogOverlayEl);
    return mpLogOverlayEl;
  }
  function mpOpenLogOverlay(){
    mpEnsureLogOverlay().classList.add("show");
    // Hide the floating buttons while the overlay is open so they don't overlap.
    if (mpGameLogBtnEl) mpGameLogBtnEl.style.visibility = "hidden";
    if (cheat) cheat.hideBtn();
    // Hide the standing "eliminated" banner too — it's pinned to the very top and
    // would cover the ✕ close button, trapping eliminated players in the log.
    if (mpDeadBannerEl) mpDeadBannerEl.style.visibility = "hidden";
  }
  function mpCloseLogOverlay(){
    if (mpLogOverlayEl) mpLogOverlayEl.classList.remove("show");
    if (mpGameLogBtnEl) mpGameLogBtnEl.style.visibility = "";
    if (cheat) cheat.showBtn();
    if (mpDeadBannerEl) mpDeadBannerEl.style.visibility = "";
    // NOTE: we deliberately do NOT re-render the screen underneath — it's still
    // there exactly as the player left it.
  }
  function showSimpleLog(s){
    const body = (mpEnsureLogOverlay(), mpLogOverlayBody);
    body.innerHTML = "";
    body.append(el("div", { className: "mpH", textContent: "📜 Game Log" }));
    const rows = (s.simpleLog || []);
    if (!rows.length){
      body.append(el("div", { className:"mpSub", textContent:"Nothing has happened yet." }));
    } else {
      const byNight = {};
      rows.forEach(e => { (byNight[e.night] = byNight[e.night] || []).push(e); });
      Object.keys(byNight).map(Number).sort((a,b)=>a-b).forEach(n => {
        body.append(el("div", { className:"mpSummaryHdr", textContent: n === 0 ? "Setup" : "Night " + n }));
        byNight[n].forEach(e => body.append(el("div", { className:"mpSub", style:"margin:2px 0", textContent: e.text })));
      });
    }
    mpOpenLogOverlay();
  }
  // Full end-of-game log + role reveal, shown on the player's own phone.
  let lastGameLog = null;
  let mpFullLogUnlocked = false;  // latches true once final results are shared; the
                                  // full log then stays available until a new game
  let mpLogView = "log";     // which tab is active
  let mpLogDesc = false;     // newest-first toggle for the log tab
  function showGameLog(s){
    lastGameLog = s;
    const body = (mpEnsureLogOverlay(), mpLogOverlayBody);
    body.innerHTML = "";
    // Title + win banner.
    body.append(el("div", { className: "mpH", textContent: "Game Summary" }));
    if (s.win){
      const amSam = !!(s.samName && s.samName === myName);
      const me = (s.players || []).find(p => p.name === myName);
      if (!amSam && me && typeof me.won === "boolean"){
        body.append(el("div", { className: me.won ? "mpPersonalWin win" : "mpPersonalWin lose",
          innerHTML: me.won ? "🏆 You win!" : "💔 You lose" }));
      }
      const labels = { christmas:"🎄 Christmas team wins!", grinch:"😈 The Grinches win!", lovers:"💘 The lovers win!", draw:"☠️ Nobody survived — no winner." };
      body.append(el("div", { className: "mpGacResult", innerHTML: `<b>${labels[s.win]||"Game over"}</b>` }));
    }
    // Three tabs — identical to the host: 📜 Log · 👥 Players · ✨ Powers.
    const tabs = el("div", { className:"mpLogTabs" });
    const mkTab = (view, label) => {
      const b = el("button", { className:"mpLogTab" + (mpLogView===view?" sel":""), textContent: label });
      b.onclick = () => { mpLogView = view; showGameLog(s); };
      return b;
    };
    tabs.append(mkTab("log","📜 Log"), mkTab("chars","👥 Players"), mkTab("powers","✨ Powers"));
    if (mpLogView === "log"){
      const sortBtn = el("button", { className:"mpLogSort", textContent: mpLogDesc ? "⬆ Oldest" : "⬇ Newest" });
      sortBtn.onclick = () => { mpLogDesc = !mpLogDesc; showGameLog(s); };
      tabs.append(sortBtn);
    }
    body.append(tabs);
    const logBody = el("div", { className:"mpLogBody" });
    body.append(logBody);
    if (mpLogView === "log") mpRenderLogView(logBody, s);
    else if (mpLogView === "chars") mpRenderCharsTable(logBody, s);
    else mpRenderPowersTable(logBody, s);
    mpOpenLogOverlay();
  }
  // Helpers shared by the phone log tables.
  function mpNightsList(s){
    const ns = new Set();
    (s.log||[]).forEach(e => ns.add(e.night));
    (s.events||[]).forEach(e => ns.add(e.night));
    return [...ns].filter(n => n > 0).sort((a,b)=>a-b);
  }
  function mpNameOf(s, id){ const p = (s.players||[]).find(x => x.id === id); return p ? p.name : id; }
  function mpResultWord(r){
    if (!r) return "";
    if (r.startsWith("checked:")) return r.split(":")[1];
    if (r.startsWith("linked")) return "linked";
    if (r.startsWith("swapped")) return "swapped";
    return r;
  }
  function mpEventShort(s, e){
    const map = { protected:"🛡️ protected", attacked:"🗡️ attacked", blocked:"🛡️ blocked",
      saved:"🍪 saved", poisoned:"☠️ poisoned", converted:"🔥 converted", swapped:"🔄 swapped",
      stolen:"🦝 robbed", linked:"💘 linked" };
    let r = e.result || "";
    if (r.startsWith("checked:")) return `🎅 ${r.split(":")[1]}`;
    if (r.startsWith("linked")) return `💘 linked`;
    if (r.startsWith("swapped")) return `🔄 swapped`;
    if (r.startsWith("stole")) return `🦝 robbed`;
    return map[r] || (e.power + (r?` (${r})`:""));
  }
  // Tab 1 — prose log grouped by night, newest/oldest sortable.
  function mpRenderLogView(body, s){
    const byNight = {};
    (s.log||[]).forEach(e => { (byNight[e.night] = byNight[e.night] || []).push(e); });
    let nights = Object.keys(byNight).map(Number).sort((a,b)=>a-b);
    if (mpLogDesc) nights = nights.reverse();
    if (!nights.length){ body.append(el("div", { className:"mpSub", textContent:"Nothing happened." })); return; }
    nights.forEach(n => {
      body.append(el("div", { className:"mpLogNight", textContent: n === 0 ? "Setup" : "Night " + n }));
      byNight[n].forEach(e => {
        let txt = e.msg || "";
        if (e.type === "death") txt = `💀 ${e.name} was lost (${e.source||"?"}).`;
        body.append(el("div", { className:"mpLogEntry" + (e.type==="death"?" death":""), textContent: txt }));
      });
    });
  }
  // Tab 2 — Players × Nights grid (what happened to each player).
  function mpRenderCharsTable(body, s){
    const nights = mpNightsList(s);
    const players = s.players || [];
    let html = `<div class="mpTableWrap"><table class="mpGrid"><thead><tr><th>Player</th>`;
    nights.forEach(n => html += `<th>N${n}</th>`);
    html += `</tr></thead><tbody>`;
    players.forEach(p => {
      const startName = p.startRole || p.role || "";
      const curName = p.role || "";
      const teamTag = p.converted ? " (Grinch)" : "";
      let ident;
      if (curName !== startName || p.converted){
        ident = `<span class="mpCellSub">Started: ${startName}</span><span class="mpCellSub mpNow">Now: ${curName}${teamTag}</span>`;
      } else {
        ident = `<span class="mpCellSub">${startName}</span>`;
      }
      // Winner / Loser badge (per-player, handles Burgermeister etc.).
      if (p.won === true) ident += `<span class="mpWinBadge win">🏆 Winner</span>`;
      else if (p.won === false) ident += `<span class="mpWinBadge lose">Loser</span>`;
      html += `<tr><th>${p.name}${ident}</th>`;
      nights.forEach(n => {
        const evs = (s.events||[]).filter(e => e.night === n && (
          e.targetId === p.id ||
          (((e.result||"").startsWith("linked:") || (e.result||"").startsWith("swapped:")) && (e.result||"").split(":")[1] === p.id)
        ));
        const died = evs.find(e => e.power === "Death");
        const acts = evs.filter(e => e.power !== "Death");
        let cls = "empty", txt = "·";
        if (acts.length){ cls = "hit"; txt = acts.map(e => mpEventShort(s, e)).join("<br>"); }
        if (died){ cls = "dead"; txt = (txt==="·"?"":txt+"<br>") + `💀 ${died.result}`; }
        html += `<td class="${cls}">${txt}</td>`;
      });
      html += `</tr>`;
    });
    html += `</tbody></table></div>`;
    body.innerHTML = html;
  }
  // Tab 3 — Powers × Nights grid (who each power hit each night).
  function mpRenderPowersTable(body, s){
    const nights = mpNightsList(s);
    const powers = [...new Set((s.events||[]).filter(e=>e.power!=="Death").map(e=>e.power))];
    if (!powers.length){ body.innerHTML = `<p class="mpSub">No powers were used.</p>`; return; }
    let html = `<div class="mpTableWrap"><table class="mpGrid"><thead><tr><th>Power</th>`;
    nights.forEach(n => html += `<th>N${n}</th>`);
    html += `</tr></thead><tbody>`;
    powers.forEach(pw => {
      html += `<tr><th>${pw}</th>`;
      nights.forEach(n => {
        const evs = (s.events||[]).filter(e => e.night === n && e.power === pw);
        if (!evs.length){ html += `<td class="empty">·</td>`; return; }
        const txt = evs.map(e => {
          // Name plus the role they held AT THE TIME, e.g. "Amy (Belsnickel)".
          const nm = e.targetId ? mpNameOf(s, e.targetId) : "";
          const tgt = nm + (e.targetRole ? ` <span class="mpCellRole">(${e.targetRole})</span>` : "");
          const r = e.result || "";
          if (r.startsWith("linked:") || r.startsWith("swapped:")){
            const verb = r.startsWith("linked") ? "💘 linked" : "🔄 swapped";
            const partner = mpNameOf(s, r.split(":")[1]);
            return `${tgt} ↔ ${partner}<span class="mpCellSub">${verb}</span>`;
          }
          return `${tgt}${r && !r.startsWith(nm)?` <span class="mpCellSub">${mpResultWord(r)}</span>`:""}`;
        }).join("<br>");
        html += `<td class="hit">${txt}</td>`;
      });
      html += `</tr>`;
    });
    html += `</tbody></table></div>`;
    body.innerHTML = html;
  }
  // Build the press-and-hold "View My Card" control (card-back reveals on hold).
  let gacPeekReported = false;
  let gacPeekInfo = null;   // { seen, total } from the host
  // Build the "N/N have viewed their card" element (or null if no data yet).
  function buildPeekCountEl(){
    if (!gacPeekInfo || !gacPeekInfo.total) return null;
    const all = gacPeekInfo.seen >= gacPeekInfo.total;
    return el("div", { className: "mpPeekCount" + (all ? " allSeen" : ""),
      textContent: `👁️ ${gacPeekInfo.seen}/${gacPeekInfo.total} have viewed their card` });
  }
  // Re-render whichever screen is showing so the count updates live.
  function renderPeekCount(){
    if (onWaitingScreen) waiting();
  }
  function gacReportPeek(){
    if (gacPeekReported) return;
    gacPeekReported = true;
    try { if (room) room.send("gac_peek", { from: myName }); } catch(_){}
  }
  function gacViewCardControl(){
    if (!myCard) return null;
    const outer = el("div", { className: "mpViewCardOuter" });
    const holder = el("div", { className: "mpViewCard" });
    const back = el("div", { className: "mpCardBack", style: "background-image:url('CardBacks/GAC_Back.png')" });
    back.innerHTML = ``;
    const face = el("div", { className: "mpCardFace" });
    // If Krampus converted them, their card ART IS UNCHANGED — so stamp the face
    // with a permanent GRINCH banner. Without it, every peek at their card would
    // just show their old (Christmas) role and they'd forget they switched sides.
    const grinchStamp = myConverted
      ? `<div class="mpGrinchStamp">😈 GRINCH</div>` : "";
    face.innerHTML = `<img src="${myCard.image}" alt="${myCard.name}">${grinchStamp}` +
      `<div class="mpCardFaceName">${myCard.name}</div>`;
    face.style.display = "none";
    holder.append(back, face);
    // Role description shown BELOW the card (sibling of the card box, not inside
    // it — the card box is a fixed 5:7 aspect ratio and would overlap otherwise).
    const desc = el("div", { className: "mpCardDesc", textContent: "" });
    outer.append(holder, desc);
    const show = (e) => {
      face.style.display = "block"; back.style.display = "none";
      desc.textContent = myCard.desc || "";
      if (myConverted) desc.innerHTML = `<b>You are a GRINCH.</b> You keep this card's powers, but you win with the Grinches.<br>${myCard.desc || ""}`;
      gacReportPeek(); if(e&&e.preventDefault)e.preventDefault();
    };
    const hide = () => { face.style.display = "none"; back.style.display = "block"; desc.textContent = ""; };
    back.addEventListener("mousedown", show); back.addEventListener("touchstart", show, {passive:false});
    window.addEventListener("mouseup", hide); window.addEventListener("touchend", hide);
    face.addEventListener("mouseup", hide); face.addEventListener("touchend", hide);
    back.addEventListener("mouseenter", show); face.addEventListener("mouseleave", hide);
    return outer;
  }

  // Cupid night reveal: a mistletoe card you hold to reveal ONLY whether you're
  // in love ("In Love" 💘 vs "Better Luck Next Time" 😢 — never a name), plus a
  // Confirm button and a live count of how many players have confirmed.
  let gacLoveConfirmed = false;
  let gacLoveCount = null;   // { count, total } from the host
  function showLoveReveal(){
    onWaitingScreen = false; onResultScreen = false;
    wrap.innerHTML = "";
    wrap.append(el("div", { className: "mpH", textContent: "🌿 Under the Mistletoe" }));
    wrap.append(el("div", { className: "mpSub", textContent: "Hold the card to see if you're in love." }));
    // The mistletoe hold-card (card-width, matches the role card).
    const outer = el("div", { className: "mpViewCardOuter" });
    const holder = el("div", { className: "mpViewCard mpLoveCard" });
    const back = el("div", { className: "mpCardBack mpLoveBack" });
    back.innerHTML = `<div class="mpLoveBackInner">🌿<br>Mistletoe<br><span style="font-size:13px;opacity:.85">hold to reveal</span></div>`;
    const face = el("div", { className: "mpCardFace mpLoveFace" });
    face.innerHTML = myLove && myLove.inLove
      ? `<div class="mpLoveInner"><div class="mpLoveBig">💘</div><div class="mpLoveTxt">In Love</div></div>`
      : `<div class="mpLoveInner"><div class="mpLoveBig">😢</div><div class="mpLoveTxt">Better Luck<br>Next Time</div></div>`;
    face.style.display = "none";
    holder.append(back, face);
    outer.append(holder);
    const show = (e) => { face.style.display = "flex"; back.style.display = "none"; if(e&&e.preventDefault)e.preventDefault(); };
    const hide = () => { face.style.display = "none"; back.style.display = "flex"; };
    back.addEventListener("mousedown", show); back.addEventListener("touchstart", show, {passive:false});
    window.addEventListener("mouseup", hide); window.addEventListener("touchend", hide);
    face.addEventListener("mouseup", hide); face.addEventListener("touchend", hide);
    back.addEventListener("mouseenter", show); face.addEventListener("mouseleave", hide);
    wrap.append(outer);
    // Confirm button + live count.
    const confirmBtn = el("button", { className: "mpBtn gac", style:"margin-top:14px",
      textContent: gacLoveConfirmed ? "✓ Confirmed" : "I've seen my card ▶" });
    confirmBtn.disabled = gacLoveConfirmed;
    confirmBtn.onclick = () => {
      gacLoveConfirmed = true;
      confirmBtn.disabled = true; confirmBtn.textContent = "✓ Confirmed";
      try { if (room) room.send("gac_love_confirm", { from: myName }); } catch(_){}
    };
    wrap.append(confirmBtn);
    const countEl = el("div", { className: "mpPeekCount", id: "mpLoveCount", style:"margin-top:10px" });
    countEl.textContent = gacLoveCount ? `💘 ${gacLoveCount.count}/${gacLoveCount.total} confirmed` : "";
    wrap.append(countEl);
  }

  // Wet Bandits card check: hold to view your CURRENT card (may have changed),
  // then confirm. Reuses the same confirm reporting as the love reveal.
  function showCardCheck(){
    onWaitingScreen = false; onResultScreen = false;
    wrap.innerHTML = "";
    wrap.append(el("div", { className: "mpH", textContent: "🎴 Check your card" }));
    wrap.append(el("div", { className: "mpSub", textContent: "Hold your card to view it. If it changed, you're now that role." }));
    const card = gacViewCardControl();
    if (card) wrap.append(card);
    const confirmBtn = el("button", { className: "mpBtn gac", style:"margin-top:14px",
      textContent: gacLoveConfirmed ? "✓ Confirmed" : "I've seen my card ▶" });
    confirmBtn.disabled = gacLoveConfirmed;
    confirmBtn.onclick = () => {
      gacLoveConfirmed = true;
      confirmBtn.disabled = true; confirmBtn.textContent = "✓ Confirmed";
      try { if (room) room.send("gac_love_confirm", { from: myName }); } catch(_){}
    };
    wrap.append(confirmBtn);
    const countEl = el("div", { className: "mpPeekCount", id: "mpLoveCount", style:"margin-top:10px" });
    countEl.textContent = gacLoveCount ? `🎴 ${gacLoveCount.count}/${gacLoveCount.total} confirmed` : "";
    wrap.append(countEl);
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
  // ---- Wheel name fitting ----
  // The player's wheel is larger than the host's (r=120), so it gets a bigger
  // base font and width budget. Names are never truncated — the font shrinks to
  // fit, and glyphs squeeze as a last resort.
  const MP_WHEEL_MAX_TEXT = 100;
  function mpWheelFontSize(name){
    const len = (name || "").length;
    if (len <= 8)  return 13;
    if (len <= 10) return 12;
    if (len <= 13) return 11;
    if (len <= 16) return 10;
    return 9;
  }
  function mpWheelTextLen(name){
    const len = (name || "").length;
    const approx = len * mpWheelFontSize(name) * 0.56;
    return Math.min(approx, MP_WHEEL_MAX_TEXT).toFixed(1);
  }
  function mpEscape(s){
    return String(s == null ? "" : s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
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
      // Show the WHOLE name — never truncate. Shrink the font to fit the wedge,
      // and squeeze the glyphs as a last resort for very long names.
      const nm = mpEscape(p.targets[i].name || "");
      wedges += `<text x="${lx}" y="${ly}" fill="${textColor}" font-size="${mpWheelFontSize(nm)}" font-weight="bold"
        text-anchor="middle" dominant-baseline="middle" font-family="Trebuchet MS,Arial"
        textLength="${mpWheelTextLen(nm)}" lengthAdjust="spacingAndGlyphs"
        transform="rotate(${(mid*180/Math.PI)+90},${lx},${ly})">${nm}</text>`;
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

  let waitingMsg = "Waiting for the host to start the game…";
  function waiting(msg) {
    if (onResultScreen) return;   // don't clobber an unread result
    if (msg) waitingMsg = msg;
    onWaitingScreen = true;
    if (cheat) cheat.showBtn();
    cancelAnimationFrame(timerRaf);
    wrap.innerHTML = "";
    wrap.append(el("div", { className: "mpH", textContent: `Hi ${myName}!` }));
    wrap.append(el("div", { className: "mpSub", textContent: waitingMsg }));

    // "N/N have viewed their card" — shown right above the card, same as the host.
    const pc = buildPeekCountEl();
    if (pc) wrap.append(pc);

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
          // Sam runs the vote from their day screen — they're not a voter, so
          // ignore the vote ballot/countdown broadcasts and stay on the day screen.
          const _amSamNarrator = !!samDayControls;
          if (type === "vote_open") { if (_amSamNarrator) return; lastVoteMsg = payload; renderVote(payload, false); }
          if (type === "vote_countdown") { if (_amSamNarrator) return; lastVoteMsg = { ...(lastVoteMsg||{}), ...payload }; renderVote(lastVoteMsg, true); }
          if (type === "vote_paused") { if (_amSamNarrator) return; if (lastVoteMsg) renderVote({ ...lastVoteMsg, paused: true }, false); }
          if (type === "vote_progress") { if (_amSamNarrator) return; updateProgress(payload); }
          if (type === "vote_callout") { try { new Audio("Audio/Gameplay/" + payload.file).play().catch(()=>{}); } catch(_){} }
          if (type === "vote_locked") { if (_amSamNarrator) return; waiting("Counting votes…"); }
          if (type === "vote_aborted") { if (_amSamNarrator) return; waiting("The host cancelled the vote. Waiting for the next game…"); }
          if (type === "vote_results") { if (_amSamNarrator) return; renderResults(payload); }
          if (type === "session_ended") sessionEnded();
          // ----- GAC (Grinches Attack Christmas) per-phone decisions -----
          if (type === "gac_prompt"){
            hideNudge();
            if (!payload._to || payload._to === myName) renderGacPrompt(payload);
            else gacWait("Night in progress…");
          }
          if (type === "gac_wait")   {
            // A non-host Sam running the night must NOT be knocked back to "Night
            // in progress" by a broadcast wait meant for the table — they're mid-
            // beat on their own screen. Ignore waits while Sam is running a beat.
            if (samRunningBeat && (!payload || !payload._to)) { /* ignore for Sam */ }
            else if (!payload || payload._except !== myName){ hideNudge(); gacWait(payload && payload.msg); }
          }
          if (type === "gac_info"){
            if (!payload._to || payload._to === myName) { hideNudge(); gacInfo(payload); }
          }
          if (type === "gac_clear")  { hideNudge(); try { mpCloseLogOverlay(); } catch(_){} waiting(); }
          // "Are you still there?" — a light banner over whatever's on screen.
          if (type === "gac_nudge"){
            if (!payload._to || payload._to === myName) showNudge();
          }
          // Card-selection at game start.
          if (type === "gac_pickcard") {
            hideNudge();
            // Sam is the narrator — no card to pick. Skip the screen and wait.
            if (payload && payload.samName && payload.samName === myName){
              waiting("You're Sam — waiting for players to pick their cards…");
            } else {
              renderGacCardPick(payload);
            }
          }
          // Grinch wheel (shared spinner).
          if (type === "gac_wheel"){
            if (payload.players && payload.players.some(n => n === myName)) { hideNudge(); renderGacWheel(payload); }
            else gacWait("Night in progress…");
          }
          if (type === "gac_wheel_state") updateGacWheel(payload);
          // Peek count ("N/N have viewed their card") — shown above the card.
          if (type === "gac_peekcount"){ gacPeekInfo = payload; renderPeekCount(); }
          // Day-phase summary: overnight deaths + who's in/out. Everyone sees it.
          if (type === "gac_summary"){
            hideNudge();
            // On FINAL results share, unlock the full smart log and show the
            // results screen (win + in/out) with the Game Log button available —
            // players tap in for detail rather than being force-jumped there.
            if (payload && payload.resultsShared){
              mpFullLogUnlocked = true; lastGameLog = payload;
              gacDaySummary(payload);
            }
            // Otherwise everyone renders the day summary. The overnight RESULTS
            // portion may be gated (night-results distribution setting) via
            // resultsHidden/resultsRecipient, handled inside gacDaySummary.
            else { gacDaySummary(payload); }
          }
          // Night start: everyone sees the shared "go to sleep" screen first.
          if (type === "gac_sleep"){ hideNudge(); gacSleepScreen(payload); }
          // Cupid love-reveal running count.
          if (type === "gac_love"){
            gacLoveCount = payload;
            const c = document.getElementById("mpLoveCount");
            if (c && payload) c.textContent = `💘 ${payload.count}/${payload.total} confirmed`;
          }
        },
      });
      setupCheat();
      waiting("Waiting for the host to start the game…");
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
  function renderVote({ candidates, endsAt, allowCheat, voting, paused, noTimer, eligible }, countdown) {
    onWaitingScreen = false;
    if (voting === undefined) voting = true;
    lastVoting = voting;
    if (!countdown) myPick = null;
    wrap.innerHTML = "";

    // If an eligible-voter list was sent and this player isn't on it, they've
    // been eliminated — show a spectator screen, not a ballot.
    const amEliminated = Array.isArray(eligible) && !eligible.includes(myName);
    if (amEliminated){
      mpSetEliminated(true);   // raise the standing banner for the rest of the game
      if (cheat) cheat.hideBtn();
      wrap.append(el("div", { className: "mpH", textContent: "You've been eliminated" }));
      wrap.append(el("div", { className: "mpSub", textContent: countdown ? "The vote is closing…" : "Sit tight and watch the vote play out." }));
      return;
    }

    // ---- TIMER-ONLY MODE (mobile voting OFF) ----
    // No vote buttons. Locked timer at top; if cheat sheet is allowed, show it
    // FULL below the timer. At the 3-2-1 audio, show "VOTE" in the timer's place.
    if (!voting){
      if (cheat) cheat.hideBtn();   // no floating button in this mode
      if (countdown){
        wrap.append(el("div", { className: "mpTimer", style:"font-size:54px", textContent: "VOTE" }));
      } else if (noTimer){
        wrap.append(el("div", { className: "mpH", textContent: "Discuss and Vote Out Loud" }));
        wrap.append(el("div", { className: "mpSub", textContent: "Waiting for the host…" }));
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
    } else if (noTimer){
      wrap.append(el("div", { className: "mpH", textContent: paused ? "Host paused the vote" : "Who do you vote for?" }));
      wrap.append(el("div", { className: "mpSub", textContent: "No timer — vote when ready." }));
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
  // Prefill from a ?join=CODE share link, if present.
  const urlCode = joinCodeFromUrl();
  if (urlCode) input.value = urlCode;
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
