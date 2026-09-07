// Builds one random-but-legal GAC game config: how many players, which
// cards are in play, who holds what, and how many cards sit in the center.
// "Legal" here means the kind of setup a real table could actually play --
// e.g. Wet Bandits always get a center card to steal -- not that it's a
// GOOD or balanced setup. Balance isn't what this harness is checking.
import { GAC_ROSTER } from "../../gac-roles.js";
import { pick, pickN, chance } from "./rng.mjs";

const ALL_NON_SAM = GAC_ROSTER.filter(r => r.id !== "Sam");
const ALL_NON_SAM_IDS = ALL_NON_SAM.map(r => r.id);

// The three "plain" Grinch cards -- BadSanta and Krampus are also grinch-team
// but are handled separately below since each changes how the night plays out.
const BASIC_GRINCH_IDS = ["Grinch1", "Grinch2", "Grinch3"];

// Waking Christmas roles with a night decision in resolveNight(). (Calvin
// wakes narratively but has no decision key of his own -- see TEST_REPORT.md.)
const CHRISTMAS_WAKING = ["Cupid", "Calvin", "Wet", "Shelf", "Mrs", "Santa", "Belsnickel", "Buddy"];

// Non-waking Christmas roles whose rules live outside gac-engine.js (day
// vote / silence / revenge) -- included anyway so the engine is exercised
// with them on the roster, even though their special behavior isn't driven.
const CHRISTMAS_SPECIAL = ["Yukon", "Burger", "CharlieBrown", "Frost", "Cindy", "Scrooge"];

const PLAIN_ELVES = ["Elf1", "Elf2", "Elf3", "Elf4", "Elf5", "Elf6"];

export const PLAYER_COUNTS = [5, 6, 7, 8, 10, 12, 16, 20];

// Generates one game config. `opts` lets scenario/matrix code pin down
// specific fields while leaving the rest random.
export function generateGame(rng, opts = {}) {
  const winMode = opts.winMode || pick(rng, ["majority", "total"]);

  const grinchBasicCount = opts.grinchBasicCount ?? (1 + Math.floor(rng() * 3)); // 1..3
  const grinchIds = BASIC_GRINCH_IDS.slice(0, grinchBasicCount);
  const includeBadSanta = opts.includeBadSanta ?? chance(rng, 0.4);
  const includeKrampus = opts.includeKrampus ?? chance(rng, 0.5);
  if (includeBadSanta) grinchIds.push("BadSanta");
  if (includeKrampus) grinchIds.push("Krampus");

  const waking = opts.waking || CHRISTMAS_WAKING.filter(() => chance(rng, 0.55));
  const special = opts.special || CHRISTMAS_SPECIAL.filter(() => chance(rng, 0.3));

  let cardPool = [...grinchIds, ...waking, ...special];

  const targetPlayerCount = opts.playerCount || pick(rng, PLAYER_COUNTS);
  const neededExtra = Math.max(0, targetPlayerCount - cardPool.length);
  cardPool = [...cardPool, ...PLAIN_ELVES.slice(0, neededExtra)];

  // Hard ceiling: only 25 non-Sam cards exist at all. If the requested
  // player count can't be filled (small role mix, big target count), shrink
  // to what's actually available and let the caller see the real count.
  const playerCount = Math.min(targetPlayerCount, cardPool.length);

  const shuffledRoles = pickN(rng, cardPool, cardPool.length);
  const playerCardIds = shuffledRoles.slice(0, playerCount);
  const selectedCardIds = [...playerCardIds];

  // Wet Bandits need a center card to steal (the engine itself refuses this
  // combo in validateClaims); other games get a leftover card sometimes too,
  // to exercise the "not everyone has a card" path in makeGame's center calc.
  const wetInPlay = playerCardIds.includes("Wet");
  const unusedIds = ALL_NON_SAM_IDS.filter(id => !cardPool.includes(id));
  if ((wetInPlay || chance(rng, 0.3)) && unusedIds.length) {
    selectedCardIds.push(pick(rng, unusedIds));
  }

  const players = playerCardIds.map((roleId, i) => ({ name: `P${i + 1}`, roleId }));

  return {
    playerCount,
    winMode,
    selectedCardIds,
    players,
    settings: { gacWinMode: winMode },
  };
}
