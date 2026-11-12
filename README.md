# Who's the Better Roman?

A dice battle board game for two teams of Romans, made into a mobile game from
a hand-drawn cardboard original. Purple and Blue each have six dice-headed
Romans. Roll the dice, march across the brick roads and the garden pond, and
knock out the other team's Commander.

It runs in any phone or tablet browser, needs no install and no internet once
loaded, and has blocky pixel-art graphics drawn in code.

## Play it

- **2 Players**: pass the phone, or put it flat on the table and pick
  *Settings → Across a table* so the top player's panel faces them.
- **1 Player vs Computer**: pick your team (rule 1 on the sheet: "Pick a
  color") and an *Easy* or *Tricky* computer.

To play on a phone, host the folder on any static web server. With GitHub
Pages: *Settings → Pages → Deploy from a branch*, pick the branch and `/ (root)`,
then open the address GitHub shows. On the phone, use *Add to Home Screen* to
get an app icon; it then works offline.

To try it on a computer, run a local server from this folder (for example
`python3 -m http.server`) and open <http://localhost:8000>.

## Rules

From the original rules sheet:

1. Two players. Pick a color, purple or blue. That is your team.
2. Set up your team on your Start row and pick one Roman to be the
   **Commander**. You can place the Commander anywhere in your ranks.
3. Both players roll. The higher roll starts.
4. On your turn, roll the dice:
   - **1, 2 or 3**: move one Roman exactly that many squares left or right.
   - **4, 5 or 6**: move one Roman exactly that many squares forward.
5. The goal of the game is to defeat the other team's Commander.

The back of the sheet ("look on back!") wasn't available, so the game fills
the gaps with these house rules:

- **Bonk!** Land on an enemy Roman to knock it out. You can't land on your own
  Roman. Romans jump over anything in their way.
- **Romans can't swim.** You can't stop on the pond or on the black corner
  square, but you can jump over them.
- **Turn around.** If a march of 4 to 6 would go past the end of the board,
  the Roman stops on the last row and turns around, so "forward" is now the
  other way (a small arrow shows this). Without this rule Romans got stranded
  near the far edge and about a third of test games could never be won.
- **Dice duel** (optional, in Settings): when a Roman lands on an enemy, both
  teams roll and the higher roll wins the battle. A Commander that attacks and
  loses also loses the game.
- **Stuck games.** If no Roman can ever reach a Commander, or nobody battles for
  40 turns, the team with more Romans left wins (equal numbers is a draw).
- If none of your Romans can make the move you rolled, your turn is skipped.

All rules live in [`js/rules.js`](js/rules.js), so they are easy to change if
the back of the sheet says something different.

## How it's built

Plain HTML, CSS and JavaScript with no build step and no libraries.

| File | What it does |
| --- | --- |
| `index.html` | Page structure, menus and the rules screen |
| `css/style.css` | Layout and the pixel-art look, with a day sky in light mode and a night sky in dark mode |
| `js/rules.js` | The game rules, with no browser code |
| `js/ai.js` | The computer player (Easy and Tricky) |
| `js/art.js` | Draws every tile, Roman, die and icon pixel by pixel |
| `js/sound.js` | Chiptune sound effects made with Web Audio |
| `js/app.js` | Turns, taps, animations, saving and the menus |
| `sw.js`, `manifest.webmanifest`, `icons/` | Offline play and the home screen icon |

The board in `js/rules.js` is a copy of the cardboard one, square by square:
brick roads, two kinds of grass around a pond, orange bricks, a stone path and
the black square in the corner.

A game in progress is saved on the device, so closing the browser doesn't lose
it. Add `?seed=42` to the address for repeatable dice, or `?fast` to speed
up animations while testing.

## Tests

Requires Node.js 18 or newer:

```sh
npm test
```

The tests cover the movement rules, battles, duels, turning around, winning and
the computer player. They also play hundreds of computer-vs-computer games to
check that every game finishes.

## Credits

- Game design and original artwork: the hand-drawn *Who's the better roman?*
  board game.
- Fonts: [Pixelify Sans](https://github.com/eifetx/Pixelify-Sans) and
  [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P), both under
  the SIL Open Font License (see `fonts/`).
