import { evaluate, type AngleMode, type Value } from './engine/evaluate';
import { formatValue } from './engine/format';
import { CalcError, parse } from './engine/parser';
import type { Modifier } from './keys';

// The TI-92 HOME screen: an entry line, a history of entry/result pairs, and
// the key handling that edits and evaluates the entry. It has no DOM
// dependencies; lcd.ts renders `state`.

export interface HistoryItem {
  /** The entry as the pieces it was typed in, so it can be recalled for editing. */
  entry: string[];
  result: string;
  value: Value;
}

export interface HomeState {
  /** Entry line as inserted pieces: "sin(" is one piece, so ← deletes it whole. */
  entry: string[];
  /** Cursor position, as an index into `entry`. */
  cursor: number;
  history: HistoryItem[];
  angle: AngleMode;
  overwrite: boolean;
  caps: boolean;
  /** Message for the error dialog; ESC or ENTER dismisses it. */
  error: string | null;
  off: boolean;
}

export const HISTORY_LIMIT = 30;

/** What each key inserts, unmodified and with 2nd. Keys absent here (or a missing 2nd entry) insert nothing. */
const INSERTS: Record<string, { base?: string; second?: string }> = {
  '0': { base: '0', second: '<' },
  '1': { base: '1', second: 'ᴇ' },
  '2': { base: '2' },
  '3': { base: '3' },
  '4': { base: '4', second: 'Σ(' },
  '5': { base: '5' },
  '6': { base: '6' },
  '7': { base: '7', second: '∫(' },
  '8': { base: '8', second: 'd(' },
  '9': { base: '9', second: '^⁻1' },
  dot: { base: '.', second: '>' },
  negate: { base: '⁻', second: 'ans(1)' },
  plus: { base: '+' },
  minus: { base: '-' },
  times: { base: '*', second: '√(' },
  divide: { base: '/', second: ']' },
  power: { base: '^', second: 'π' },
  lparen: { base: '(', second: '{' },
  rparen: { base: ')', second: '}' },
  comma: { base: ',', second: '[' },
  sin: { base: 'sin(', second: 'sin⁻¹(' },
  cos: { base: 'cos(', second: 'cos⁻¹(' },
  tan: { base: 'tan(', second: 'tan⁻¹(' },
  ln: { base: 'ln(', second: 'ℯ^(' },
  equals: { base: '=', second: '\\' },
  theta: { base: 'θ', second: ':' },
  sto: { base: '→' },
  space: { base: ' ' },
  i: { second: 'ⅈ' },
  j: { second: '∞' },
  k: { second: '|' },
  l: { second: '"' },
  m: { second: ';' },
};

/** Inserting one of these into an empty entry line starts it with ans(1), as on the TI-92. */
const CONTINUES_ANSWER = /^[-+*/^→]/;

const ENTER_KEYS = new Set(['enter', 'enter-top', 'enter-qwerty']);

export class Home {
  state: HomeState = {
    entry: [],
    cursor: 0,
    history: [],
    angle: 'rad',
    overwrite: false,
    caps: false,
    error: null,
    off: false,
  };

  private vars = new Map<string, Value>();
  /** How far back ↑ / 2nd ENTRY has reached into the history; -1 when not browsing. */
  private recall = -1;

  press(id: string, modifier: Modifier | null) {
    const s = this.state;
    if (s.off) {
      if (id === 'on' && modifier !== 'second') s.off = false;
      return;
    }
    if (id === 'on' && modifier === 'second') {
      s.off = true;
      return;
    }
    if (s.error) {
      if (ENTER_KEYS.has(id) || id === 'esc') s.error = null;
      return;
    }

    if (/^[a-z]$/.test(id)) return this.letter(id, modifier);

    const insert = INSERTS[id];
    if (insert) {
      const text = modifier === 'second' ? insert.second : modifier === null ? insert.base : undefined;
      if (text) this.insert(text);
      return;
    }

    switch (id) {
      case 'enter':
      case 'enter-qwerty':
        if (modifier === 'second') return this.browse(1);
        return this.enter();
      case 'enter-top':
        return this.enter();
      case 'backspace':
        if (modifier === 'second') s.overwrite = !s.overwrite;
        else if (modifier === 'diamond') s.entry.splice(s.cursor, 1);
        else if (s.cursor > 0) s.entry.splice(--s.cursor, 1);
        return;
      case 'clear':
        if (s.entry.length) this.setEntry([]);
        else s.history = [];
        return;
      case 'esc':
        return this.setEntry([]);
      case 'left':
        s.cursor = modifier === 'second' ? 0 : Math.max(0, s.cursor - 1);
        return;
      case 'right':
        s.cursor = modifier === 'second' ? s.entry.length : Math.min(s.entry.length, s.cursor + 1);
        return;
      case 'up':
        return this.browse(1);
      case 'down':
        return this.browse(-1);
      case 'mode':
        s.angle = s.angle === 'rad' ? 'deg' : 'rad';
        return;
      case 'f6':
        // "Clear a-z": delete every single-letter variable.
        for (const name of [...this.vars.keys()]) if (/^[a-z]$/.test(name)) this.vars.delete(name);
        return;
    }
    // Remaining keys open menus or other apps (graphing, CATALOG, VAR-LINK, …), which this calculator doesn't have.
  }

  private letter(id: string, modifier: Modifier | null) {
    if (modifier === 'second') {
      const text = INSERTS[id]?.second;
      if (id === 'z') this.state.caps = !this.state.caps;
      else if (text) this.insert(text);
      return;
    }
    if (modifier === 'diamond') return; // ◆ letters switch to other apps (HOME, Y=, GRAPH, …)
    const upper = (modifier === 'shift') !== this.state.caps;
    this.insert(upper ? id.toUpperCase() : id);
  }

  private insert(text: string) {
    const s = this.state;
    if (s.entry.length === 0 && s.history.length && CONTINUES_ANSWER.test(text)) {
      s.entry.push('ans(1)');
      s.cursor = 1;
    }
    s.entry.splice(s.cursor, s.overwrite ? 1 : 0, text);
    s.cursor++;
  }

  private setEntry(entry: string[]) {
    this.state.entry = entry;
    this.state.cursor = entry.length;
    this.recall = -1;
  }

  /** Step back (1) or forward (-1) through previous entries. */
  private browse(step: 1 | -1) {
    const { history } = this.state;
    const next = Math.min(this.recall + step, history.length - 1);
    if (next < 0) return this.setEntry([]);
    const entry = [...history[history.length - 1 - next].entry];
    this.setEntry(entry);
    this.recall = next;
  }

  private enter() {
    const s = this.state;
    // ENTER on an empty line re-evaluates the last entry.
    const entry = s.entry.length ? s.entry : s.history.at(-1)?.entry;
    if (!entry) return;
    const text = entry.join('');

    let value: Value;
    try {
      value = evaluate(parse(text), {
        angle: s.angle,
        vars: this.vars,
        ans: (n) => s.history.at(-n)?.value,
      });
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      s.error = e.kind;
      s.entry = [...entry];
      s.cursor = e.pos === undefined ? entry.length : pieceAt(entry, e.pos);
      return;
    }

    s.history.push({ entry: [...entry], result: formatValue(value), value });
    if (s.history.length > HISTORY_LIMIT) s.history.shift();
    this.setEntry([]);
  }
}

/** Index of the piece containing character offset `pos` of `entry.join('')`. */
function pieceAt(entry: string[], pos: number) {
  let offset = 0;
  for (let i = 0; i < entry.length; i++) {
    offset += entry[i].length;
    if (offset > pos) return i;
  }
  return entry.length;
}
