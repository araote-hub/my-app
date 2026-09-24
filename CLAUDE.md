# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A web-based scientific calculator whose interface reproduces the Texas Instruments **TI-92** (landscape body, large LCD, QWERTY keyboard, round cursor pad, numeric keypad). The user originally asked for a "TI-93". No such model could be found, so they chose the TI-92 as the reference. Use a TI-92 photo when checking layout (for example, the image on the Wikipedia "TI-92 series" page).

So far only the UI exists: keys produce events, but there is no calculation engine yet.

## Commands

- `npm run dev`: start the Vite dev server
- `npm run build`: type-check (`tsc`) and build to `dist/`
- `npm run preview`: serve the production build

No test runner is set up yet.

To check the layout visually, take screenshots with headless Chrome against `npm run preview` (http://localhost:4173/). Headless Chrome won't make a viewport narrower than 500px, so a `--window-size` below that produces a cropped image that looks like overflow even when the page fits.

## Architecture

Vite + TypeScript with no framework. All UI is built as DOM in code, and `index.html` only contains `#app`.

- `src/keys.ts` is the **single source of truth for the keyboard**. Each key is a `KeyDef` with its label, its 2nd legend (yellow) and ◆ legend (green), the area it belongs to (`fkeys` | `control` | `qwerty`), its CSS grid position, its style, an optional `modifier`, and its physical-keyboard mappings (`kbd`). The cursor pad is described separately as `CURSOR_PAD`. To add, move or relabel a key, edit this file and nothing else.
  - The `qwerty` area uses 20 half-key columns, so alternate rows can be staggered by half a key (every letter key has `colSpan: 2`).
  - The `control` area has 10 rows at the same pitch as the QWERTY rows, so the numeric keypad lines up with the keyboard.
- `src/calculator.ts` renders every area from `keys.ts` and owns input. It handles pointer events and physical-keyboard events, latches the modifiers (2nd / ◆ / shift) and dispatches a bubbling `calckey` CustomEvent with the payload `{ id, modifier, value }`. `value` is the legend the key produces under the active modifier. A future calculation engine should listen for `calckey` rather than reading the DOM.
- `src/lcd.ts` holds the LCD HOME-screen mock-up (toolbar, history, entry line, status line) and exposes `setModifier` for the status-line indicator.
- Input details in `calculator.ts` that are easy to miss:
  - The keyboard listeners are attached to `window` and call `preventDefault` for every mapped key (Backspace, space, the arrow keys and others). Any text field added to the page later won't receive those keys unless the handler first checks what has focus.
  - Modifier keys never dispatch `calckey`. They only latch the modifier, and it is attached to the next key's event and then cleared. Letter keys send lowercase unless shift is latched, and typing an uppercase letter on a physical keyboard latches shift automatically.
  - F1–F8 deliberately have no `kbd` mapping, because browsers reserve those keys (for example, F5 reloads the page).
  - The on-screen keys have `tabIndex = -1`, so they can't be reached with Tab. Input comes only from pointer events and the physical-keyboard mapping, which matters for any accessibility work.
- `src/style.css` sizes everything in `cqw` units relative to `.calc-wrap` (a `container-type: inline-size` element), so the whole calculator scales as one piece. One grid row equals `--row`. Colors are custom properties on `:root`.
