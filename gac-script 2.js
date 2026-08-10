// The Grinches Attack Christmas — NIGHT NARRATION SCRIPT
// Each beat: { role, lines }. A line is either a plain string, or an object
// { text, decision } where `decision` is the key of an inline choice shown AFTER
// that line (i.e. after the prompt, before "go to sleep"). `role` ties the beat
// to a card concept; null = universal beat. The narrator skips beats whose role
// isn't in the selected game.

export const GAC_NIGHT1 = [
  { role: null,     lines: ["EVERYONE, go to sleep."] },

  { role: "Cupid",  lines: [
    { text:"CUPID, wake up. Choose two players to meet under the Mistletoe and fall in love.", decision:"cupidLink" },
    "CUPID, go to sleep.",
    "If I tap your shoulder, wake up, and look for the other player with their eyes open.",
    "You two are now in love, so if one of you die, so does the other.",
    "CHRISTMAS LOVERS, go to sleep." ] },

  { role: "Calvin", lines: [
    "SCOTT CALVIN, wake up. Santa Claus, stick out your thumb so Scott Calvin can see who you are.",
    "SANTA CLAUS, put your thumb away. SCOTT CALVIN, go to sleep." ] },

  { role: "Wet",    lines: [
    { text:"WET BANDITS, wake up. You may steal the center card or another player's card and look at it.", decision:"wetSteal" },
    "If you steal a card, put the Wet Bandit card in the center.",
    "If you stole another player's card, give them the center card.",
    "WET BANDITS, go to sleep." ] },

  { role: "Wet",    lines: [
    "EVERYONE, wake up and quietly check your card, then go back to sleep. If your card has changed, you are now that new role." ] },

  { role: "Shelf",  lines: [
    { text:"ELF ON THE SHELF, wake up. Who would you like to protect tonight?", decision:"protect" },
    "ELF ON THE SHELF, go to sleep." ] },

  { role: "Grinch", lines: [
    { text:"GRINCHES, wake up. Who would you like to kill tonight?", decision:"grinchKill" },
    "GRINCHES, go to sleep." ] },

  { role: "Krampus", lines: [
    { text:"KRAMPUS, wake up. Would you like to turn this victim into a Grinch?", decision:"krampusConvert" },
    "KRAMPUS, go to sleep." ] },

  { role: "Mrs",    lines: [
    { text:"MRS. CLAUS, wake up. Would you like to save this person with a nice gingerbread cookie?", decision:"mrsSave" },
    { text:"Would you like to poison anyone with a not-so-nice gingerbread cookie?", decision:"mrsPoison" },
    "MRS. CLAUS, go to sleep." ] },

  { role: "Santa",  lines: [
    { text:"SANTA CLAUS, wake up. Which player would you like to know if they are naughty or nice?", decision:"santaInspect" },
    "SANTA CLAUS, go to sleep." ] },

  { role: "Belsnickel", lines: [
    { text:"BELSNICKEL, wake up. Who do you believe is attacking Christmas and would like to kill?", decision:"belsnickelKill" },
    "BELSNICKEL, go to sleep." ] },

  { role: "Buddy",  lines: [
    { text:"BUDDY THE ELF, wake up. Would you like to switch two players' seats tonight?", decision:"buddySwap" },
    "BUDDY THE ELF, go to sleep." ] },

  { role: null,     lines: ["EVERYONE, wake up."] },
];

export const GAC_NIGHTN = [
  { role: null,     lines: ["EVERYONE, go to sleep."] },

  { role: "Shelf",  lines: [
    { text:"ELF ON THE SHELF, wake up. Who would you like to protect tonight?", decision:"protect" },
    "ELF ON THE SHELF, go to sleep." ] },

  { role: "Grinch", lines: [
    { text:"GRINCHES, wake up. Who would you like to kill tonight?", decision:"grinchKill" },
    "GRINCHES, go to sleep." ] },

  { role: "Krampus", lines: [
    { text:"KRAMPUS, wake up. Would you like to turn this victim into a Grinch?", decision:"krampusConvert" },
    "KRAMPUS, go to sleep." ] },

  { role: "Mrs",    lines: [
    { text:"MRS. CLAUS, wake up. Would you like to save this person with a nice gingerbread cookie?", decision:"mrsSave" },
    { text:"Would you like to poison anyone with a not-so-nice gingerbread cookie?", decision:"mrsPoison" },
    "MRS. CLAUS, go to sleep." ] },

  { role: "Santa",  lines: [
    { text:"SANTA CLAUS, wake up. Which player would you like to know if they are naughty or nice?", decision:"santaInspect" },
    "SANTA CLAUS, go to sleep." ] },

  { role: "Belsnickel", lines: [
    { text:"BELSNICKEL, wake up. Who do you believe is attacking Christmas and would like to kill?", decision:"belsnickelKill" },
    "BELSNICKEL, go to sleep." ] },

  { role: "Buddy",  lines: [
    { text:"BUDDY THE ELF, wake up. Would you like to switch two players' seats tonight?", decision:"buddySwap" },
    "BUDDY THE ELF, go to sleep." ] },

  { role: null,     lines: ["EVERYONE, wake up."] },
];
