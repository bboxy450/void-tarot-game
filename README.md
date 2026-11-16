# Void Tarot — The Fool's Journey

A single-player deck-building card game played with the 78 cards of the Void Tarot.
You begin as a ten-year-old in a castle where nobles play tarot for tricks, and walk a
road of 78 chapters, one per card, growing older as you go.

Open `index.html` in Chrome. No server, no build step, no network. Sound starts on your
first click; `M` mutes.

## How to play

Each chapter you face the **Shade** of that chapter's card.

1. You draw 5 cards. Lay up to 3 of them into the spread (Past · Present · Future), left to right.
2. Cast. The cards resolve in order, then the Shade does what its red eye announced.
3. Unused cards are discarded and you draw again. Win, take a card, walk on.

Click a card to lay it, click it again to take it back. Keys: `1`–`9` lay or take back a
card, `Enter`/`Space` cast, `Esc` clears the spread, `Backspace` takes back the last card,
`D` shows your deck, `H` the rules. Hover anything to read what it will do right now.

## The rules on one screen

**Numbered cards** cast their suit's element at their number.

| Suit | Element | Effect | Ground |
|---|---|---|---|
| Wands | Fire n | deal n | on **oil: Explosion** (2n + bonus), ground clears; dries wet ground |
| Cups | Water n | deal n/2, heal n/2 | leaves the ground **wet** |
| Swords | Air n | deal ¾n | wet ground becomes **charged**; on **charged: Zap** (bonus damage, the Shade's next blow is halved), ground clears |
| Pentacles | Earth n | gain n ward (blocks the next blow) | leaves **oil** |

**The Seal.** Each turn the Shade shows a number that some two or three numbered cards in
your hand add up to. If the numbered cards you cast total it exactly, the whole cast is
doubled and the Shade is stunned (it cannot be stunned two turns running). This is why a
Three is often the right card and a Nine the wrong one.

**Court cards** bend the next card: it takes the court's element and is multiplied
(Page ×1.5, Knight ×2, Queen ×2 and a small heal, King ×3). Modifiers add up when chained.
Laid last, a court is a weak cast of its own element. Nothing is changed permanently.

**Trumps** are 22 different spells with Latin names: the Magician casts the next card twice,
the Tower detonates whatever lies on the ground, Death executes a Shade at a quarter of its
life, the Moon repeats the card before it, the Hierophant breaks the Seal outright, and so on.
**The Fool** is the Excuse of the old game: it strikes lightly and returns to your hand.

**Shades** show their next action: strike, heavy blow (telegraphed, every few turns), brace,
and from the suits on: sear (burns the ground away, and you with it if it is oil), mend,
flurry, bulwark, hex. A hex shuffles a **reversed card** (a curse, a dead draw) into your
deck for the fight; lay it in the spread to purge it. Shades of the four suits have a trait:
Fireborn and Stormborn halve Fire and Air, Tideborn mends on wet ground, Stoneskin wards
itself every turn.

**Between chapters** you rest a little, choose 1 of 3 cards (the chapter's own card is always
offered), and every third chapter you may burn one card from your deck at the altar. From
chapter 23 the spread has four positions and you draw six. Falling in a fight costs nothing
but a scar: rise again or return to the road. Progress is saved in `localStorage`; "Start
over" on the title screen wipes it.

## Files

| File | What it is |
|---|---|
| `index.html` | the page: canvases, stage, script tags |
| `src/style.css` | all layout and CSS animation; the stage is a fixed 1440×900 board scaled to the window |
| `src/cards.js` | generated card data (names, suits, keywords) |
| `src/core.js` | the rules, no DOM: decks, spreads, elements, Seal, trumps, Shades, campaign. Returns events |
| `src/fight.js` | the encounter screen: lays out the table and plays core events back as motion and sound |
| `src/journey.js` | title, the road map, reward, altar, ending |
| `src/game.js` | shell: stage scaling, screen changes, card objects, tooltips, floating text, save, keys |
| `src/fx.js` | canvas: starfield and nebula, the ground pool, particles, lightning, shockwaves, shake |
| `src/audio.js` | every sound, synthesized with WebAudio, plus the ambient drone |
| `assets/` | card art downsized from the Void Tarot source (`cards/` 800px, `thumbs/` 260px) |
| `tools/build-cards.py` | regenerates `assets/` and `src/cards.js` from `~/mydev/void-tarot` (uses `sips`) |
| `tools/sim.js` | balance check: two bots play whole campaigns |
| `tools/drive.js` | plays the real page in headless Chrome with real clicks and keys |

## Checks

```
node tools/sim.js            # balance curve; exit 0 when the targets hold (a few seconds; longer on a busy machine)
node tools/drive.js          # 3 chapters by real clicks; exit 0 on zero script errors and zero non-local requests
node tools/drive.js --shots=/tmp/void-tarot-shots   # same at normal speed, saving screenshots
```

Debug URL parameters: `?chapter=N` (throwaway run starting at chapter N, not saved),
`&screen=map|reward|end`, `&seed=N`, `&hp=N`, `&fast=0.3` (play all motion at 30% duration).
