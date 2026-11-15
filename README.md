# Void Tarot Game

A single-player story game played with the 78-card Void Tarot deck. This is MVP 2: the chapter loop,
four different ways of using the same cards, and a deck that is yours to build.

## Play

Open `index.html` in a browser. No server, no build, no network.

Each chapter is one card. Before a chapter lets you go you must be read by the psychic, live its
encounter, uncover its phrase or symbol, cast the spell as a three-card row, and find its hidden card.
Encounters rotate through the nobles' trick-taking game, exact-sum arithmetic, elements that leave
residue, and a card standing as a character.

Hands are dealt from your own deck. It starts as eight low cards kept from the nobles' game; every
finished chapter adds its card and lets you change one thing: copy a card, remove one, or enchant one
with more or less power. From chapter 1 you know Water to Wine, which turns a card to another element
for one elemental encounter.

`index.html?auto=20&enter=1` jumps ahead 20 chapters with the scripted player and opens the encounter.
`?fresh=1` ignores the saved journey.

## Files

| Path | Holds |
|---|---|
| `index.html` | the page and its styles |
| `src/cards.js` | the 78 cards (generated) |
| `src/machines.js` | the rules, as small state machines |
| `src/game.js` | the chapter loop, the deck and content generation; no screen code |
| `src/ui.js` | the screen |
| `assets/cards/` | card art, 480 px high |
| `tools/build-cards.py` | regenerates `src/cards.js` and `assets/cards/` from `~/mydev/void-tarot` |
| `tools/playthrough.js` | plays all 78 chapters without a screen, for any number of seeds |
| `tools/drive-chrome.js` | plays chapters in headless Chrome by clicking the page |

## Check

```sh
node tools/playthrough.js 1 2 3 4 5    # the campaign can be finished, with every edit and the incantation used
node tools/drive-chrome.js 12          # the page plays by clicks, with no errors, and survives a reload
```

The design lives in the private knowledge base (`.bboxy/`, not committed): `specs/game-design`,
`specs/mvp-1-web`, `specs/mvp-2-your-deck`.
