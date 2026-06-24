// The Grinches Attack Christmas — NIGHT NARRATION SCRIPT
// Scott's original spoken narration, broken into discrete beats.
// Each beat: { role, lines }. `role` ties the beat to a card id (or null for
// universal beats that always play). The narrator skips beats whose role isn't
// in tonight's selected game — except null-role beats, which always play.
//
// `role` uses the GAC_ROSTER ids. For multi-card roles we use the base concept:
//   "Grinch"  -> any of Grinch1/2/3 selected
//   "Wet"     -> Wet Bandits
//   "Calvin"  -> Scott Calvin
// The narrator's role-presence check (in index.html) maps these to selection.

// ---- NIGHT 1 (full sequence) ----
export const GAC_NIGHT1 = [
  { role: null,     lines: ["EVERYONE, go to sleep."] },

  { role: "Cupid",  lines: [
    "CUPID, wake up. Choose two players to meet under the Mistletoe and fall in love.",
    "CUPID, go to sleep.",
    "If I tap your shoulder, wake up, and look for the other player with their eyes open.",
    "You two are now in love, so if one of you die, so does the other.",
    "CHRISTMAS LOVERS, go to sleep." ] },

  { role: "Calvin", lines: [
    "SCOTT CALVIN, wake up. Santa Claus, stick out your thumb so Scott Calvin can see who you are.",
    "SANTA CLAUS, put your thumb away. SCOTT CALVIN, go to sleep." ] },

  { role: "Wet",    lines: [
    "WET BANDITS, wake up. You may steal the center card or another player's card and look at it.",
    "If you steal a card, put the Wet Bandit card in the center.",
    "If you stole another player's card, give them the center card.",
    "WET BANDITS, go to sleep." ] },

  // Universal card-check beat (only meaningful if Wet Bandits are in play; the
  // narrator includes it whenever Wet Bandits are selected — see index.html).
  { role: "Wet",    lines: [
    "EVERYONE, wake up and quietly check your card, then go back to sleep." ] },

  { role: "Shelf",  lines: [
    "ELF ON THE SHELF, wake up. Who would you like to protect tonight?",
    "ELF ON THE SHELF, go to sleep." ] },

  { role: "Grinch", lines: [
    "GRINCHES, wake up. Who would you like to kill tonight?",
    "GRINCHES, go to sleep." ] },

  { role: "Krampus", lines: [
    "KRAMPUS, wake up. Would you like to turn this victim into a Grinch?",
    "KRAMPUS, go to sleep." ] },

  { role: "Mrs",    lines: [
    "MRS. CLAUS, wake up. Would you like to save this person with a nice gingerbread cookie?",
    "Would you like to poison anyone with a not-so-nice gingerbread cookie?",
    "MRS. CLAUS, go to sleep." ] },

  { role: "Santa",  lines: [
    "SANTA CLAUS, wake up. Which player would you like to know if they are naughty or nice?",
    "SANTA CLAUS, go to sleep." ] },

  { role: "Belsnickel", lines: [
    "BELSNICKEL, wake up. Who do you believe is attacking Christmas and would like to kill?",
    "BELSNICKEL, go to sleep." ] },

  { role: "Buddy",  lines: [
    "BUDDY THE ELF, wake up. Would you like to switch two players' seats tonight?",
    "BUDDY THE ELF, go to sleep." ] },

  { role: null,     lines: ["EVERYONE, wake up.", "Has anyone won yet?"] },
];

// ---- SUBSEQUENT NIGHTS (repeating loop) ----
// Cupid, Scott Calvin intro, and Wet Bandits drop out. Scott Calvin gets a
// one-time night-2 re-check if Wet Bandits were in the game (handled in code).
export const GAC_NIGHTN = [
  { role: null,     lines: ["EVERYONE, go to sleep."] },

  { role: "Shelf",  lines: [
    "ELF ON THE SHELF, wake up. Who would you like to protect tonight?",
    "ELF ON THE SHELF, go to sleep." ] },

  { role: "Grinch", lines: [
    "GRINCHES, wake up. Who would you like to kill tonight?",
    "GRINCHES, go to sleep." ] },

  { role: "Krampus", lines: [
    "KRAMPUS, wake up. Would you like to turn this victim into a Grinch?",
    "KRAMPUS, go to sleep." ] },

  { role: "Mrs",    lines: [
    "MRS. CLAUS, wake up. Would you like to save this person with a nice gingerbread cookie?",
    "Would you like to poison anyone with a not-so-nice gingerbread cookie?",
    "MRS. CLAUS, go to sleep." ] },

  { role: "Santa",  lines: [
    "SANTA CLAUS, wake up. Which player would you like to know if they are naughty or nice?",
    "SANTA CLAUS, go to sleep." ] },

  { role: "Belsnickel", lines: [
    "BELSNICKEL, wake up. Who do you believe is attacking Christmas and would like to kill?",
    "BELSNICKEL, go to sleep." ] },

  { role: "Buddy",  lines: [
    "BUDDY THE ELF, wake up. Would you like to switch two players' seats tonight?",
    "BUDDY THE ELF, go to sleep." ] },

  { role: null,     lines: ["EVERYONE, wake up."] },
];
