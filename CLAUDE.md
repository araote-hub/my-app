# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A web-based scientific calculator whose interface reproduces the Texas Instruments **TI-92** (landscape body, large LCD, QWERTY keyboard, round cursor pad, numeric keypad). The user originally asked for a "TI-93". No such model could be found, so they chose the TI-92 as the reference. Use a TI-92 photo when checking layout (for example, the image on the Wikipedia "TI-92 series" page).

The site is public, so the page must not present itself as a Texas Instruments product. The case shows "Scientific Calculator / TI-92 Style" instead of the TI wordmark, and `index.html` carries an "unofficial, not affiliated" disclaimer. Keep both if you change the branding.

It is a numeric (non-CAS) calculator working on the HOME screen. Graphing, menus (F1–F5, MATH, CATALOG, VAR-LINK, CHAR…) and other apps are not implemented, and those keys do nothing.

## Commands

- `npm run dev`: start the Vite dev server
- `npm run build`: type-check (`tsc`) and build to `dist/`
- `npm run preview`: serve the production build
- `npm test`: run all Vitest tests once
- `npx vitest run src/home.test.ts -t "MODE"`: run a single test file or a test by name
- `npx vitest`: watch mode

To check the layout visually, take screenshots with headless Chrome against `npm run preview` (http://localhost:4173/). Headless Chrome won't make a viewport narrower than 500px, so a `--window-size` below that produces a cropped image that looks like overflow even when the page fits.

## Architecture

Vite + TypeScript with no framework, deployed as a static site (no backend). All UI is built as DOM in code; `index.html` holds only `#app` and the disclaimer. `vite.config.ts` sets `base: './'` so the build works at a domain root and under a sub-path such as GitHub Pages' `/my-app/`. Static files such as `favicon.svg` live in `public/`, and pages must reference them with relative paths (no leading `/`).

- `src/keys.ts` is the **single source of truth for the keyboard**. Each key is a `KeyDef` with its label, its 2nd legend (yellow) and ◆ legend (green), the area it belongs to (`fkeys` | `control` | `qwerty`), its CSS grid position, its style, an optional `modifier`, and its physical-keyboard mappings (`kbd`). The cursor pad is described separately as `CURSOR_PAD`. To add, move or relabel a key, edit this file and nothing else.
  - The `qwerty` area uses 20 half-key columns, so alternate rows can be staggered by half a key (every letter key has `colSpan: 2`).
  - The `control` area has 10 rows at the same pitch as the QWERTY rows, so the numeric keypad lines up with the keyboard.
- `src/calculator.ts` renders every area from `keys.ts` and owns input. It handles pointer events and physical-keyboard events, latches the modifiers (2nd / ◆ / shift) and dispatches a bubbling `calckey` CustomEvent with the payload `{ id, modifier, value }`. `value` is the legend the key produces under the active modifier.
- `src/home.ts` (`Home`) is the HOME-screen state machine and has no DOM dependencies. `main.ts` passes each `calckey` event's `id` and `modifier` to `home.press()` (it ignores `value`), then calls `lcd.render(home.state)`. The `INSERTS` table maps each key id to the text it inserts, unmodified and with 2nd. Commands (ENTER, ←, CLEAR, arrows, MODE, …) are handled in the `switch` that follows it. The entry line is an array of **pieces** (`"sin("` is one piece), and the cursor indexes pieces, so ← deletes a whole function name as on the TI-92.
- `src/engine/` is the pure math engine: `parser.ts` (tokenizer plus a recursive-descent parser producing a `Node` AST), `evaluate.ts` (real-mode evaluation against a `Context` of angle mode, variables and `ans(n)`) and `format.ts` (12 significant digits). Failures throw `CalcError`, whose `kind` is the TI-style message shown in the LCD error dialog and whose optional `pos` places the cursor at the error.
  - Entry text uses TI characters, not ASCII: `⁻` for negation (distinct from binary `-`), `ᴇ` for EE, `→` for store, `ℯ` for the constant e (a plain `e` is a variable), `π`, `∞`, `√(`, `∫(`, `Σ(`. Results display negatives with `⁻` and exponents with `ᴇ`.
  - TI semantics that differ from typical calculators: implicit multiplication has the same precedence as `*` (`1/2x` = `(1/2)·x`); adjacent letters form one variable name (`xy` is a variable, not `x·y`); variable names are case-insensitive; unclosed parentheses are closed at the end of the entry; an operator typed on an empty entry line inserts `ans(1)` first; ENTER on an empty line repeats the last entry.
  - There is no CAS. `∫(f,x,a,b)` and `Σ(f,k,a,b)` are computed numerically, and `d(f,x)` is a numeric derivative at the variable's current value (use it with `|`, as in `d(x^2,x)|x=3`).
- `src/lcd.ts` renders `HomeState` (history, entry line with the cursor, status line, error dialog, off state), and exposes `setModifier` for the status-line modifier indicator.
- Input details in `calculator.ts` that are easy to miss:
  - The keyboard listeners are attached to `window` and call `preventDefault` for every mapped key (Backspace, space, the arrow keys and others). Any text field added to the page later won't receive those keys unless the handler first checks what has focus.
  - Modifier keys never dispatch `calckey`. They only latch the modifier, and it is attached to the next key's event and then cleared. Letter keys send lowercase unless shift is latched, and typing an uppercase letter on a physical keyboard latches shift automatically.
  - F1–F8 deliberately have no `kbd` mapping, because browsers reserve those keys (for example, F5 reloads the page).
  - The on-screen keys have `tabIndex = -1`, so they can't be reached with Tab. Input comes only from pointer events and the physical-keyboard mapping, which matters for any accessibility work.
- `src/style.css` sizes everything in `cqw` units relative to `.calc-wrap` (a `container-type: inline-size` element), so the whole calculator scales as one piece. One grid row equals `--row`. Colors are custom properties on `:root`.
