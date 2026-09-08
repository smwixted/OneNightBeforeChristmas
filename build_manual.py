#!/usr/bin/env python3
"""Builds GAC_Manual.pdf from the content data below.

This is the recreated source for the manual -- the original build script was
lost (never committed to this repo), so this file's data section was built by
extracting the full text of the existing PDF (pdftotext -layout) and copying
every paragraph verbatim, except the Grinch-win wording (search GRINCH_WIN_LINE
below), which was intentionally updated to match the engine's new win
condition (see CLAUDE.md "Grinch win condition").

To rebuild after an edit:
    pip install reportlab
    python3 build_manual.py

Edit the DATA below for wording changes. The rendering code after it is
generic -- it shouldn't need to change for ordinary content edits.
"""

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    Image, PageBreak, HRFlowable, KeepTogether,
)

# ============================================================== COLORS/FONTS
# Reuses the game's own established brand palette (gac-print.html's :root
# vars) plus exact colors pixel-sampled from the ORIGINAL PDF (at 200dpi)
# for anything gac-print.html doesn't cover, so this matches the original's
# actual look rather than a guess.
COLOR_NAVY = colors.HexColor("#0f2c3d")        # section headings, subtitles, Teams-table row labels
COLOR_CHRISTMAS = colors.HexColor("#c0182a")   # Christmas Team badge; also "The Characters"/"Non-Waking Roles" titles
COLOR_GRINCH = colors.HexColor("#1f6f1f")      # Grinch Team badge
COLOR_MODERATOR = colors.HexColor("#1f5fa0")   # Moderator badge -- sampled from the original PDF (was wrongly orange)
COLOR_NEUTRAL = colors.HexColor("#e07b1a")     # divider rules only (NOT the Moderator badge -- see above)
COLOR_QUOTE_BG = colors.HexColor("#eaf1f6")    # "At night" callout background
COLOR_FLAVOR = colors.HexColor("#444444")

TEAM_COLORS = {
    "christmas": COLOR_CHRISTMAS,
    "grinch": COLOR_GRINCH,
    "moderator": COLOR_MODERATOR,
}
TEAM_LABELS = {
    "christmas": "Christmas Team",
    "grinch": "Grinch Team",
    "moderator": "Moderator",
}

# ==================================================================== DATA
# Every string here is verbatim from the current GAC_Manual.pdf (extracted
# with `pdftotext -layout`), EXCEPT the 3 spots using GRINCH_WIN_LINE, which
# carry the new wording confirmed with Scott in this session.

GRINCH_WIN_LINE = (
    "They win the moment they equal or outnumber everyone else at the table, "
    "unless the Christmas side still has a real way to fight back (an unused "
    "power that can eliminate a Grinch, or a living Cupid pairing). Once "
    "that's gone, the Grinches win."
)

TAGLINE = "A Christmas game of hidden Grinches, secret powers, and midnight mischief"

INTRO_PARAGRAPH = (
    "Somewhere between the last carol and the first light of Christmas morning, the Grinches have crept "
    "into the village. They look just like everyone else. Each night they strike; each day the village gathers "
    "to root them out. Trust no one, protect the ones who matter, and keep Christmas alive until dawn."
)

GOAL_PARAGRAPHS = [
    "Grinches Attack Christmas is a social game of hidden roles for a group. Every player is secretly dealt a "
    "character. Most belong to one of two teams — the Christmas Team or the Grinch Team — and your team "
    "decides how you win. The catch: you only know your own card. Everyone else is a mystery to be figured out "
    "through what they do and say.",
    "The game alternates between night, when characters secretly use their powers, and day, when the whole "
    "village debates and votes someone out. Play continues, night after night, until one side achieves its goal.",
]

TEAMS = [
    {
        "name": "Christmas Team",
        "body": (
            "The heroes of the season — Santa, his helpers, and a cast of holiday legends. "
            "They don't know who among them is a Grinch. They win by finding and eliminating "
            "every Grinch."
        ),
    },
    {
        "name": "Grinch Team",
        "body": (
            "The villains hiding in plain sight. They know each other and scheme together each "
            "night. " + GRINCH_WIN_LINE
        ),
    },
    {
        "name": "Moderator",
        "body": (
            "Sam the Snowman narrates the game and belongs to no team. If nobody is dealt "
            "Sam, the app can run the narration itself."
        ),
    },
]

SETUP_STEPS = [
    "1. Choose the characters. Pick which cards will be in play for your group. A typical mix is mostly Christmas "
    "characters with one to three Grinches hiding among them, plus any special roles you like. More Grinches "
    "make for a harder fight.",
    "2. Deal one card to each player. Each player secretly looks at their own card and keeps it hidden. Any "
    "leftover cards form the center — face down, out of play, but sometimes reachable by certain powers (like "
    "the Wet Bandits).",
    "3. Pick a narrator. Sam the Snowman runs the night. This can be a dedicated player holding the Sam card, "
    "or the app itself.",
    "4. Play through the first night, then your first day, and continue until one team wins.",
]

NIGHT_PARAGRAPHS = [
    "At night, everyone closes their eyes. The narrator wakes each character in a set order, one at a time, so "
    "they can secretly use their power — choosing a target, learning a secret, or striking in the dark. Nobody "
    "should ever see who else is awake. When the last role has acted, the night's results are worked out and "
    "morning comes.",
    "You don't need to memorise the order — the narrator (or the app) calls each role at the right moment. The "
    "full waking order and every power is detailed in the character section below.",
]

DAY_PARAGRAPHS = [
    "When day breaks, the narrator announces what happened overnight — usually who, if anyone, was lost. "
    "Then the whole village talks it out. Anyone may accuse, defend, question, or bluff. This debate is the heart "
    "of the game: the Christmas team is hunting for Grinches, and the Grinches are trying to look perfectly "
    "innocent.",
    "After the discussion, the village votes to eliminate one player (or, if you prefer, no one). The player voted "
    "out reveals nothing unless a rule says otherwise, and the game moves to the next night. A few characters "
    "care especially about the vote — Charlie Brown dies on an exact tie, and Bad Santa must have slipped up "
    "during the day's talk.",
]

WINNING_PARAGRAPHS = [
    "Christmas wins when every Grinch has been eliminated.",
    GRINCH_WIN_LINE + " (In a total-elimination game, they instead win only "
    "once the entire Christmas team is gone.)",
    "The lovers win in one special case: if Cupid linked two players from opposite teams and those two are the "
    "last players left alive, their love wins out over either team.",
    "A handful of characters bend these rules — Burgermeister only wins if the Grinches do, and Krampus can "
    "grow the Grinch team mid-game. Their entries below spell out the details.",
]

# Waking roles, in exact wake order (matches gac-roles.js / gac-script.js).
WAKING_ROLES = [
    {
        "name": "Sam the Snowman", "team": "moderator", "image": "Roles_Active/Sam.jpg",
        "how_it_plays": (
            "The narrator and referee. Sam is awake the entire game, reads the night aloud, wakes each "
            "role in turn, and keeps track of everything that happens. Sam never holds a card in play, "
            "casts no vote, and takes no night action of their own."
        ),
        "winning": "Sam has no team and cannot win or lose — they simply make sure the story is told correctly.",
        "at_night": (
            "Every winter tale needs a voice to tell it. Perched at the edge of the North Pole with a "
            "corncob pipe and a banjo, Sam the Snowman has seen every Christmas that ever was. He "
            "remembers who was naughty, who was nice, and exactly what happened on the longest nights "
            "of the year — and tonight, he'll narrate one more."
        ),
        "at_night_is_flavor_only": True,
    },
    {
        "name": "Cupid", "team": "christmas", "image": "Roles_Active/Cupid.jpg",
        "how_it_plays": (
            "On the first night, Cupid chooses two players and secretly links them as lovers. From then "
            "on, if either lover dies — by any means — the other immediately dies of a broken heart."
        ),
        "winning": (
            "Cupid wins with the Christmas team. But if the two lovers are on opposite teams and end up "
            "as the last two players alive, the lovers win together instead — love conquers all."
        ),
        "at_night": (
            "Night 1 only — “Cupid, wake up. Choose two players to meet under the Mistletoe and fall "
            "in love.” Then everyone checks their card to learn if they're in love, and the Christmas "
            "Lovers wake to find each other."
        ),
        "flavor": (
            "While the Grinches sharpen their schemes, a smaller mischief is loose in the snow. Cupid slips "
            "between the sleeping villagers and ties two hearts together with a ribbon nobody can see. It "
            "is a dangerous gift: bound souls share a single fate, and a love that crosses enemy lines can "
            "rewrite how the whole night ends."
        ),
    },
    {
        "name": "Scott Calvin", "team": "christmas", "image": "Roles_Active/Calvin.jpg",
        "how_it_plays": (
            "On the first night, Scott Calvin learns which player was dealt Santa. If the Wet Bandits are "
            "in the game (cards may have moved), he checks again on the second night to confirm who "
            "Santa is now. The moment Santa dies, Scott Calvin inherits Santa's nightly naughty-or-nice "
            "check for the rest of the game."
        ),
        "winning": "Wins with the Christmas team.",
        "at_night": (
            "Night 1 — “Scott Calvin, wake up. Santa Claus, stick out your thumb so Scott Calvin can "
            "see who you are.” If the Wet Bandits are in play, he's woken again on Night 2 to re-check "
            "who Santa is now. Once Santa dies, he is asked Santa's question instead (below)."
        ),
        "flavor": (
            "An ordinary father once put on a certain red coat and discovered the job came with it. Scott "
            "Calvin knows better than anyone that the role of Santa can pass to a new pair of shoulders "
            "overnight. He keeps a careful eye on who's wearing the suit — and if the sleigh ever needs a "
            "new driver, he's ready to take the reins."
        ),
    },
    {
        "name": "Wet Bandits", "team": "christmas", "image": "Roles_Active/Wet.jpg",
        "how_it_plays": (
            "On the first night only, the Wet Bandits may steal one card — either a face-down card from "
            "the center or another player's card — and look at it. The stolen card becomes their new role "
            "for the rest of the game. If they robbed a player, that player receives the Wet Bandits card "
            "(or a center card) and doesn't know their role has changed."
        ),
        "winning": (
            "Wins with whatever team the stolen card belongs to — so their loyalty is only decided the "
            "moment they strike."
        ),
        "at_night": (
            "Night 1 only — “Wet Bandits, wake up. You may steal the center card or another player's "
            "card and look at it. If you steal a card, put the Wet Bandit card in the center. If you stole "
            "another player's card, they will get the center card.”"
        ),
        "flavor": (
            "Two burglars who could never leave a house the way they found it. The Wet Bandits creep "
            "through the village on the first night, pockets open, and swap a card right out from under a "
            "sleeping neighbour. Whoever they rob wakes up someone entirely new — and the bandits "
            "themselves become whatever they managed to grab."
        ),
    },
    {
        "name": "Elf on the Shelf", "team": "christmas", "image": "Roles_Active/Shelf.jpg",
        "how_it_plays": (
            "Each night, the Elf on the Shelf secretly points to one player (never themselves) and "
            "protects them. That player cannot be killed that night. The Elf may not protect the same "
            "player two nights in a row."
        ),
        "winning": "Wins with the Christmas team.",
        "at_night": "Every night — “Elf on the Shelf, wake up. Who would you like to protect tonight?”",
        "flavor": (
            "It watches. That's the whole job — to sit very still on the shelf and see everything. But this "
            "elf does more than report back to the North Pole: each night it chooses one soul to keep "
            "safe, spreading its little arms over them so that whatever the darkness sends, it cannot land. "
            "It just can't guard the same friend twice running, or the Grinches would learn its pattern."
        ),
    },
    {
        "name": "Grinch", "team": "grinch", "image": "Roles_Active/Grinch.jpg",
        "how_it_plays": (
            "Each night, the Grinches wake together, silently agree on one player, and kill them. With "
            "three Grinch cards in the game there can be up to three of them plotting as a team."
        ),
        "winning": GRINCH_WIN_LINE + " (Or, in a total-elimination game, once the Christmas team is entirely gone.)",
        "at_night": "Every night — “Grinches, wake up. Who would you like to kill tonight?”",
        "flavor": (
            "Every Who in Whoville was singing, and the Grinch's heart was two sizes too small to bear it. "
            "Now he's brought friends. Each night they slink down from the mountain, put their green heads "
            "together, and choose a light to snuff out. They don't need to win every heart — just enough of "
            "them to make the singing stop."
        ),
    },
    {
        "name": "Krampus", "team": "grinch", "image": "Roles_Active/Krampus.jpg",
        "how_it_plays": (
            "Krampus wakes with the Grinches. Once per game, instead of letting the night's victim die, "
            "Krampus may drag them onto the Grinch team — they wake as a Grinch from then on, corrupted "
            "rather than killed."
        ),
        "winning": "Wins with the Grinch team.",
        "at_night": "One use per game — “Krampus, wake up. Would you like to turn this victim into a Grinch?”",
        "flavor": (
            "Saint Nicholas rewards the good; his shadow handles the rest. Krampus comes clattering with "
            "chains and a bundle of birch, and where the Grinches would simply end a life, he offers "
            "something worse — he hauls the wicked-hearted down into his own company and makes them "
            "one of the horde. Once a season, a victim doesn't die. They turn."
        ),
    },
    {
        "name": "Mrs. Claus", "team": "christmas", "image": "Roles_Active/Mrs.jpg",
        "how_it_plays": (
            "Each night, Mrs. Claus is shown who the Grinches attacked. She has two one-time powers: "
            "once per game she may save a player from death with a nice gingerbread cookie, and once per "
            "game she may poison a player with a bad one. Each can only be used a single time all game."
        ),
        "winning": "Wins with the Christmas team.",
        "at_night": (
            "Every night — “Mrs. Claus, wake up. Would you like to save this person with a nice "
            "gingerbread cookie?” and “Would you like to poison anyone with a not-so-nice "
            "gingerbread cookie?” (each is one use per game)."
        ),
        "flavor": (
            "Behind every Santa is someone who actually runs the North Pole. Mrs. Claus sees the night's "
            "cruelty before anyone else does, a tray of cookies cooling at her elbow. One is baked with "
            "love and can pull a soul back from the brink. One is baked with something far darker. She "
            "has exactly one of each, and a long memory for who deserves which."
        ),
    },
    {
        "name": "Santa Claus", "team": "christmas", "image": "Roles_Active/Santa.jpg",
        "how_it_plays": (
            "Each night, Santa secretly chooses one player and learns whether they are on the Grinch "
            "team or the Christmas team — naughty or nice. He gathers this knowledge quietly and must "
            "survive long enough to use it in the day's debate."
        ),
        "winning": "Wins with the Christmas team.",
        "at_night": (
            "Every night — “Santa Claus, wake up. Which player would you like to know if they are "
            "naughty or nice?”"
        ),
        "flavor": (
            "He knows if you've been bad or good. That was always the legend, and here it is the literal "
            "truth: each night Santa reads one name off his list and the answer comes back clear as sleigh "
            "bells — naughty or nice. His trouble is telling the village what he knows without painting a "
            "target on his own red coat."
        ),
    },
    {
        "name": "Belsnickel", "team": "christmas", "image": "Roles_Active/Belsnickel.jpg",
        "how_it_plays": (
            "Each and every night, Belsnickel chooses one player he believes is attacking Christmas and "
            "kills them. He is a weapon for the good side — but he acts on suspicion alone, and he can "
            "absolutely be wrong."
        ),
        "winning": "Wins with the Christmas team.",
        "at_night": (
            "Every night — “Belsnickel, wake up. Who do you believe is attacking Christmas and would "
            "like to kill?”"
        ),
        "flavor": (
            "Fur-clad and grumbling, Belsnickel arrives with a switch in one hand and treats in the other, "
            "convinced he can tell a rascal on sight. He's Christmas's own enforcer, prowling every night "
            "to strike down whoever he's decided is rotten. The danger is his certainty: an innocent "
            "villager looks a great deal like a Grinch when Belsnickel's temper is up."
        ),
    },
    {
        "name": "Buddy the Elf", "team": "christmas", "image": "Roles_Active/Buddy.jpg",
        "how_it_plays": (
            "Once per game, Buddy may secretly swap two players. Any fate aimed at one of them that "
            "night — a Grinch kill, a poison, anything — follows the swap and lands on the other instead."
        ),
        "winning": "Wins with the Christmas team.",
        "at_night": (
            "One use per game — “Buddy the Elf, wake up. Would you like to switch two players' seats "
            "tonight?”"
        ),
        "flavor": (
            "Raised by elves, powered by sugar and sincerity, Buddy doesn't fully understand the danger "
            "he's in — which is exactly what makes him miraculous. One time, at just the right moment, "
            "he'll cheerfully switch two people around in a burst of enthusiasm, and a blow meant for one "
            "lands harmlessly on someone else. He only gets to be that lucky once."
        ),
    },
]

# Non-waking roles (no "at_night" beat).
NONWAKING_ROLES = [
    {
        "name": "Elf", "team": "christmas", "image": "Roles_Active/Elf.jpg",
        "how_it_plays": (
            "A regular elf with no special night power. Elves are the backbone of the Christmas team: "
            "they listen, they argue, and they vote. Several Elf cards are usually in the game."
        ),
        "winning": "Wins with the Christmas team by helping vote the Grinches out.",
        "flavor": (
            "Not every hero has a magic trick. The workshop runs on ordinary elves — thousands of small "
            "hands doing honest work — and Christmas is defended the same way. An Elf has no gadget and "
            "no secret sight, only a sharp ear for a lie and a vote that counts exactly as much as "
            "anyone's. Together, they are the reason the Grinches can't simply win."
        ),
    },
    {
        "name": "Ebenezer Scrooge", "team": "christmas", "image": "Roles_Active/Scrooge.jpg",
        "how_it_plays": (
            "Scrooge is on the Christmas team but is bound by a curse of speech: he may only mumble or "
            "say the words \"BAH HUMBUG\" for the entire game. If he says anything else, he is eliminated "
            "on the spot."
        ),
        "winning": "Wins with the Christmas team — if he can help without ever breaking his silence.",
        "flavor": (
            "Before the ghosts got to him, Ebenezer Scrooge had exactly two words for the season, and he "
            "means to use them. He's on the side of good now, technically — but the old miser can't manage "
            "a civil sentence to save his life. Two words. That's all he's allowed. Everything he wants to "
            "warn the village about has to fit inside a grumbled \"bah, humbug.\""
        ),
    },
    {
        "name": "Cindy Lou Who", "team": "christmas", "image": "Roles_Active/Cindy.jpg",
        "how_it_plays": (
            "Cindy Lou Who may secretly peek during the night while the Grinches are awake, hoping to "
            "catch them in the act and identify them. But it's risky — if the Grinches notice her peeking, "
            "they will almost certainly kill her for it."
        ),
        "winning": "Wins with the Christmas team.",
        "flavor": (
            "No more than two, and small enough to believe in Santa still, Cindy Lou Who caught a Grinch "
            "red-handed once and asked him why. She's braver than she has any right to be. When the "
            "Grinches stir in the dark, she cracks one eye to see their faces — knowing that if they catch "
            "her looking, morning may never come for her."
        ),
    },
    {
        "name": "Jack Frost", "team": "christmas", "image": "Roles_Active/Frost.jpg",
        "how_it_plays": (
            "If Jack Frost is killed, he takes one player of his choosing down with him. His revenge is "
            "resolved at the start of the following day — so his killer never walks away clean."
        ),
        "winning": "Wins with the Christmas team.",
        "flavor": (
            "Cold, elegant, and not the forgiving sort. Jack Frost nips at noses for fun, and he does not "
            "intend to freeze alone. Strike him down and his final act is a curl of killing frost aimed at "
            "whoever he pleases — by the next morning, they've gone as still and white as he has. Killing "
            "Jack Frost is easy. Surviving it is the hard part."
        ),
    },
    {
        "name": "Burgermeister Meisterburger", "team": "christmas", "image": "Roles_Active/GAC_Burger.jpg",
        "how_it_plays": (
            "Burgermeister sits with the Christmas team and is counted as nice — but his heart isn't in "
            "it. He only wins if the Grinches win and Christmas is stolen. (For the Grinches' victory "
            "condition, he is not counted among their opposition.)"
        ),
        "winning": "Wins only when the Grinch team wins. A traitor in Christmas clothing.",
        "flavor": (
            "The man who outlawed toys. Burgermeister Meisterburger despises the noise, the mess, and "
            "the joy of the whole affair, and he'd like nothing better than to see it cancelled. He wears "
            "the Christmas colours and sits at the good table — but he's quietly rooting for the mountain "
            "to win, and he'll only truly celebrate when the last stocking comes down empty."
        ),
    },
    {
        "name": "Charlie Brown", "team": "christmas", "image": "Roles_Active/CharlieBrown.jpg",
        "how_it_plays": (
            "If the day's vote ends in an exact tie, Charlie Brown is the one who dies. When the village "
            "can't decide, his luck decides for them."
        ),
        "winning": "Wins with the Christmas team — if he can dodge the town's worst deadlocks.",
        "flavor": (
            "Good grief. Some people just can't catch a break, and Charlie Brown is their patron saint. He "
            "picked out the saddest little tree in the lot and loved it anyway. So of course, when the "
            "village splits down the middle and the vote comes up dead even, the universe shrugs and "
            "points at him. Poor Charlie Brown — tie goes to the unluckiest."
        ),
    },
    {
        "name": "Yukon Cornelius", "team": "christmas", "image": "Roles_Active/Yukon.jpg",
        "how_it_plays": (
            "Yukon Cornelius survives the very first night attack made against him — a Grinch strike "
            "simply bounces off. After that one save is spent, he's as vulnerable as anyone. (Note: this "
            "shields him from a night attack only. A daytime vote still eliminates him like anyone else.)"
        ),
        "winning": "Wins with the Christmas team.",
        "flavor": (
            "The greatest prospector in the North, or so he'll tell you, Yukon Cornelius fears nothing — "
            "not the cold, not the Bumble, not a mountain full of Grinches. He's tough enough to shrug off "
            "the first blow that comes for him in the dark and keep right on going. But even Yukon can't "
            "argue with a town that's made up its mind: when the village votes, his luck runs out like "
            "anyone's."
        ),
    },
    {
        "name": "Bad Santa", "team": "grinch", "image": "Roles_Active/BadSanta.jpg",
        "how_it_plays": (
            "Bad Santa is a Grinch with a tell: he must say the word \"Grinch\" out loud at least once "
            "during each day's discussion. If a whole day passes and he never said it, he is eliminated "
            "for breaking his own rule."
        ),
        "winning": "Wins with the Grinch team.",
        "flavor": (
            "A department-store Santa with a flask in his boot and no love for the season. He runs with "
            "the Grinches, but he can't keep his foul mouth shut — the word slips out of him every single "
            "day, whether he means it to or not. Clever villagers listen for it. Careless ones let him "
            "blend right in."
        ),
    },
]

CLOSING_LINE = "Merry Christmas, and good luck. Keep the lights on till morning."

# ================================================================= STYLES

STYLES = {
    "tagline": ParagraphStyle("tagline", fontName="Helvetica-Oblique", fontSize=11,
                               leading=14, alignment=TA_CENTER, textColor=COLOR_NAVY),
    "manual_title": ParagraphStyle("manual_title", fontName="Helvetica-Bold", fontSize=20,
                                    leading=24, alignment=TA_CENTER, textColor=COLOR_NAVY,
                                    spaceBefore=10, spaceAfter=8),
    "intro": ParagraphStyle("intro", fontName="Helvetica-Oblique", fontSize=10.5, leading=14,
                             alignment=TA_CENTER, textColor=colors.black, spaceAfter=14),
    "h1": ParagraphStyle("h1", fontName="Helvetica-Bold", fontSize=17, leading=20,
                          textColor=COLOR_NAVY, spaceBefore=6, spaceAfter=4),
    # "The Characters" / "Non-Waking Roles" titles are red in the original,
    # not navy like the other section headers -- pixel-confirmed (#c0182a).
    "h1_red": ParagraphStyle("h1_red", fontName="Helvetica-Bold", fontSize=17, leading=20,
                              textColor=COLOR_CHRISTMAS, spaceBefore=6, spaceAfter=4),
    "h1_sub": ParagraphStyle("h1_sub", fontName="Helvetica-Oblique", fontSize=10.5, leading=13,
                              textColor=COLOR_NAVY, spaceAfter=8),
    "body": ParagraphStyle("body", fontName="Helvetica", fontSize=10.5, leading=14.5,
                            spaceAfter=8),
    # Teams-table row labels ("Christmas Team" / "Grinch Team" / "Moderator")
    # are navy and NOT bold in the original -- pixel-confirmed (both were
    # wrong: this used to be black and bold).
    "team_name": ParagraphStyle("team_name", fontName="Helvetica", fontSize=11, leading=14,
                                 textColor=COLOR_NAVY),
    "char_name": ParagraphStyle("char_name", fontName="Helvetica-Bold", fontSize=15, leading=18,
                                 textColor=COLOR_NAVY),
    "char_body": ParagraphStyle("char_body", fontName="Helvetica", fontSize=9.5, leading=13,
                                 spaceAfter=6),
    "at_night": ParagraphStyle("at_night", fontName="Helvetica", fontSize=9.5, leading=13),
    "flavor": ParagraphStyle("flavor", fontName="Helvetica-Oblique", fontSize=9, leading=12.5,
                              textColor=COLOR_FLAVOR, spaceBefore=6),
    "footer": ParagraphStyle("footer", fontName="Helvetica-Oblique", fontSize=10.5, leading=14,
                              alignment=TA_CENTER, textColor=COLOR_NAVY, spaceBefore=16),
}

IMG_W = 1.15 * inch
IMG_H = IMG_W * 680.0 / 500.0
IMG_COL_W = IMG_W + 0.15 * inch
TEXT_COL_W = 5.4 * inch

# Title wordmark (GAC_Title.png, 1494x1211px). Width measured directly from
# the original PDF's rendered title art (4.49in wide on the 8.5in-wide page,
# via pixel bounding-box); height follows the file's own aspect ratio.
TITLE_IMG_W = 4.49 * inch
TITLE_IMG_H = TITLE_IMG_W * 1211.0 / 1494.0


def team_badge(team_key):
    """Small colored pill labelling a role's team."""
    label = TEAM_LABELS[team_key]
    color = TEAM_COLORS[team_key]
    t = Table([[label]], colWidths=[1.6 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), color),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("ROUNDEDCORNERS", [5, 5, 5, 5]),
    ]))
    return t


def section_header(title, subtitle=None, red=False):
    flow = [Paragraph(title, STYLES["h1_red"] if red else STYLES["h1"]),
            HRFlowable(width="100%", thickness=1.4, color=COLOR_NEUTRAL, spaceAfter=6)]
    if subtitle:
        flow.append(Paragraph(subtitle, STYLES["h1_sub"]))
    return flow


def quote_box(text, width):
    t = Table([[Paragraph("<b>At night:</b> " + text, STYLES["at_night"])]], colWidths=[width])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), COLOR_QUOTE_BG),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]))
    return t


def character_entry(role):
    """One character's block: portrait left, text right. Used for both
    waking and non-waking roles (identical layout; non-waking roles just
    have no 'at_night' key)."""
    img = Image(role["image"], width=IMG_W, height=IMG_H)

    text_flow = [
        Paragraph(role["name"], STYLES["char_name"]),
        Spacer(1, 2),
        team_badge(role["team"]),
        Spacer(1, 6),
    ]
    if not role.get("at_night_is_flavor_only"):
        text_flow.append(Paragraph("<b>How it plays:</b> " + role["how_it_plays"], STYLES["char_body"]))
        text_flow.append(Paragraph("<b>Winning:</b> " + role["winning"], STYLES["char_body"]))
        if "at_night" in role:
            text_flow.append(quote_box(role["at_night"], TEXT_COL_W))
            text_flow.append(Spacer(1, 4))
        if "flavor" in role:
            text_flow.append(Paragraph(role["flavor"], STYLES["flavor"]))
    else:
        # Sam: How it plays / Winning, then the flavor text stands in for the
        # (nonexistent) At Night line, matching the original layout.
        text_flow.append(Paragraph("<b>How it plays:</b> " + role["how_it_plays"], STYLES["char_body"]))
        text_flow.append(Paragraph("<b>Winning:</b> " + role["winning"], STYLES["char_body"]))
        text_flow.append(Paragraph(role["at_night"], STYLES["flavor"]))

    row = Table([[img, text_flow]], colWidths=[IMG_COL_W, TEXT_COL_W])
    row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return KeepTogether([row, Spacer(1, 10),
                          HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey), Spacer(1, 10)])


def build():
    doc = SimpleDocTemplate(
        "GAC_Manual.pdf", pagesize=LETTER,
        topMargin=0.6 * inch, bottomMargin=0.6 * inch,
        leftMargin=0.75 * inch, rightMargin=0.75 * inch,
        title="Grinches Attack Christmas — Game Manual",
    )

    story = []

    # ---- Title / intro ----
    title_img = Image("GAC_Title.png", width=TITLE_IMG_W, height=TITLE_IMG_H)
    title_img.hAlign = "CENTER"
    story.append(title_img)
    story.append(Spacer(1, 6))
    story.append(Paragraph(TAGLINE, STYLES["tagline"]))
    story.append(HRFlowable(width="100%", thickness=1.4, color=COLOR_NEUTRAL, spaceBefore=8, spaceAfter=8))
    story.append(Paragraph("Game Manual", STYLES["manual_title"]))
    story.append(Paragraph(INTRO_PARAGRAPH, STYLES["intro"]))

    story.extend(section_header("The Goal"))
    for p in GOAL_PARAGRAPHS:
        story.append(Paragraph(p, STYLES["body"]))

    story.extend(section_header("The Teams"))
    team_rows = [[Paragraph(t["name"], STYLES["team_name"]), Paragraph(t["body"], STYLES["body"])] for t in TEAMS]
    teams_table = Table(team_rows, colWidths=[1.3 * inch, 5.4 * inch])
    teams_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(teams_table)

    story.extend(section_header("Setting Up"))
    for p in SETUP_STEPS:
        story.append(Paragraph(p, STYLES["body"]))

    story.extend(section_header("The Night"))
    for p in NIGHT_PARAGRAPHS:
        story.append(Paragraph(p, STYLES["body"]))

    story.extend(section_header("The Day"))
    for p in DAY_PARAGRAPHS:
        story.append(Paragraph(p, STYLES["body"]))

    story.extend(section_header("Winning the Game"))
    for p in WINNING_PARAGRAPHS:
        story.append(Paragraph(p, STYLES["body"]))

    # ---- The Characters (waking roles) ----
    story.append(PageBreak())
    story.extend(section_header("The Characters", "Roles that wake at night, in the order they are called", red=True))
    story.append(Paragraph(
        "These characters are woken by the narrator during the night to use their powers. "
        "They are listed here in the exact order they wake.", STYLES["body"]))
    story.append(Spacer(1, 8))
    for role in WAKING_ROLES:
        story.append(character_entry(role))

    # ---- Non-Waking Roles ----
    story.append(PageBreak())
    story.extend(section_header("Non-Waking Roles", "Characters who never wake at night — but still shape the game", red=True))
    story.append(Paragraph(
        "These characters have no night action to perform, so the narrator never wakes them. Some are "
        "ordinary villagers; others carry a rule that triggers on its own — when they die, when the vote "
        "ties, or when they break their silence.", STYLES["body"]))
    story.append(Spacer(1, 8))
    for role in NONWAKING_ROLES:
        story.append(character_entry(role))

    story.append(Spacer(1, 10))
    story.append(Paragraph(CLOSING_LINE, STYLES["footer"]))

    doc.build(story)


if __name__ == "__main__":
    build()
    print("Wrote GAC_Manual.pdf")
