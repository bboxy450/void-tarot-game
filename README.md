# Void Tarot Game

A single-player story game played with the 78-card Void Tarot deck. This is MVP 1: the chapter loop,
with four different ways of using the same cards.

## Play

Open `index.html` in a browser. No server, no build, no network.

Each chapter is one card. Before a chapter lets you go you must be read by the psychic, live its
encounter, uncover its phrase or symbol, cast the spell as a three-card row, and find its hidden card.
Encounters rotate through the nobles' trick-taking game, exact-sum arithmetic, elements that leave
residue, and a card standing as a character.

`index.html?auto=20&enter=1` jumps ahead 20 chapters with the scripted player and opens the encounter.
`?fresh=1` ignores the saved journey.

## Files

| Path | Holds |
|---|---|
| `index.html` | the page and its styles |
| `src/cards.js` | the 78 cards (generated) |
| `src/machines.js` | the rules, one machine per Den model |
| `src/game.js` | the chapter loop and content generation; no screen code |
| `src/ui.js` | the screen |
| `assets/cards/` | card art, 480 px high |
| `tools/build-cards.py` | regenerates `src/cards.js` and `assets/cards/` from `~/mydev/void-tarot` |
| `tools/playthrough.js` | plays all 78 chapters without a screen and records each machine's trace |
| `tools/verify.sh` | playthrough, then checks every trace against its Den model |
| `tools/drive-chrome.js` | plays chapters in headless Chrome by clicking the page |

## Check

```sh
DEN=/path/to/bboxy450-den tools/verify.sh     # rules conform to the design models
node tools/drive-chrome.js 5                  # the page plays, by clicks, with no errors
```

The design and the rule models live in the private knowledge base (`.bboxy/`, not committed):
`specs/game-design`, `specs/mvp-1-web`, and the Den models in `.bboxy/specs/design/`.
