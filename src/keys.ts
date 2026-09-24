// Key layout of the TI-92, as data. Rendering (calculator.ts) and any future
// calculation engine both read from here, so a key is defined exactly once.
//
// Positions are 1-based CSS grid coordinates inside the key's area:
// - fkeys:   2 columns x 5 rows, left of the screen (row 1 holds the speaker and the hand key)
// - control: 4 columns x 10 rows, the right-hand panel (top controls + numeric keypad)
// - qwerty:  20 half-key columns x 4 rows, so alternate rows can be staggered by half a key

export type Area = 'fkeys' | 'control' | 'qwerty';
export type KeyStyle = 'dark' | 'light' | 'blue' | 'fn' | 'second' | 'diamond';
export type Modifier = 'second' | 'diamond' | 'shift';

export interface GridPlacement {
  col: number;
  row: number;
  colSpan?: number;
  rowSpan?: number;
}

export interface KeyDef extends GridPlacement {
  id: string;
  label: string;
  /** Yellow legend printed above the key, produced when 2nd is active. */
  second?: string;
  /** Green legend printed above the key, produced when ◆ is active. */
  diamond?: string;
  area: Area;
  style: KeyStyle;
  /** Pressing this key latches a modifier instead of producing a value. */
  modifier?: Modifier;
  /** `KeyboardEvent.key` values on a physical keyboard that trigger this key. */
  kbd?: string[];
}

export interface PadKey {
  id: string;
  label: string;
  kbd: string[];
}

const LETTER_LEGENDS: Partial<Record<string, Pick<KeyDef, 'second' | 'diamond'>>> = {
  q: { diamond: 'HOME' },
  w: { diamond: 'Y=' },
  e: { diamond: 'WINDOW' },
  r: { diamond: 'GRAPH' },
  t: { diamond: 'TblSet' },
  y: { diamond: 'TABLE' },
  i: { second: 'i' },
  j: { second: '∞' },
  k: { second: '|' },
  l: { second: '"' },
  z: { second: 'CAPS' },
  m: { second: ';' },
};

function letterRow(letters: string, row: number, firstCol: number): KeyDef[] {
  return [...letters].map((ch, i) => ({
    id: ch,
    label: ch.toUpperCase(),
    area: 'qwerty',
    style: 'dark',
    row,
    col: firstCol + i * 2,
    colSpan: 2,
    kbd: [ch, ch.toUpperCase()],
    ...LETTER_LEGENDS[ch],
  }));
}

const FKEYS: KeyDef[] = [
  { id: 'hand', label: '✋︎', second: 'LOCK', area: 'fkeys', style: 'fn', col: 2, row: 1 },
  ...[1, 2, 3, 4].map((n): KeyDef => ({ id: `f${n}`, label: `F${n}`, area: 'fkeys', style: 'fn', col: 1, row: n + 1 })),
  ...[5, 6, 7, 8].map((n): KeyDef => ({ id: `f${n}`, label: `F${n}`, area: 'fkeys', style: 'fn', col: 2, row: n - 3 })),
];

const CONTROL: KeyDef[] = [
  { id: '2nd', label: '2nd', area: 'control', style: 'second', modifier: 'second', col: 1, row: 1 },
  { id: 'mode', label: 'MODE', area: 'control', style: 'dark', col: 1, row: 2 },
  { id: 'clear', label: 'CLEAR', area: 'control', style: 'dark', col: 1, row: 3, kbd: ['Delete'] },
  { id: 'ln', label: 'LN', second: 'eˣ', area: 'control', style: 'dark', col: 1, row: 4 },
  { id: 'esc', label: 'ESC', second: 'QUIT', area: 'control', style: 'blue', col: 2, row: 1, rowSpan: 2, kbd: ['Escape'] },
  { id: 'apps', label: 'APPS', second: 'SWITCH', area: 'control', style: 'blue', col: 2, row: 3, rowSpan: 2 },
  { id: 'enter-top', label: 'ENTER', area: 'control', style: 'blue', col: 3, row: 4, colSpan: 2 },

  { id: 'sin', label: 'SIN', second: 'SIN⁻¹', area: 'control', style: 'dark', col: 1, row: 5 },
  { id: 'cos', label: 'COS', second: 'COS⁻¹', area: 'control', style: 'dark', col: 2, row: 5 },
  { id: 'tan', label: 'TAN', second: 'TAN⁻¹', area: 'control', style: 'dark', col: 3, row: 5 },
  { id: 'power', label: '^', second: 'π', area: 'control', style: 'dark', col: 4, row: 5, kbd: ['^'] },

  { id: 'lparen', label: '(', second: '{', area: 'control', style: 'dark', col: 1, row: 6, kbd: ['('] },
  { id: 'rparen', label: ')', second: '}', area: 'control', style: 'dark', col: 2, row: 6, kbd: [')'] },
  { id: 'comma', label: ',', second: '[', area: 'control', style: 'dark', col: 3, row: 6, kbd: [','] },
  { id: 'divide', label: '÷', second: ']', area: 'control', style: 'dark', col: 4, row: 6, kbd: ['/'] },

  { id: '7', label: '7', second: '∫', area: 'control', style: 'light', col: 1, row: 7, kbd: ['7'] },
  { id: '8', label: '8', second: 'd', area: 'control', style: 'light', col: 2, row: 7, kbd: ['8'] },
  { id: '9', label: '9', second: 'x⁻¹', area: 'control', style: 'light', col: 3, row: 7, kbd: ['9'] },
  { id: 'times', label: '×', second: '√', area: 'control', style: 'dark', col: 4, row: 7, kbd: ['*'] },

  { id: '4', label: '4', second: 'Σ', area: 'control', style: 'light', col: 1, row: 8, kbd: ['4'] },
  { id: '5', label: '5', second: 'MATH', area: 'control', style: 'light', col: 2, row: 8, kbd: ['5'] },
  { id: '6', label: '6', second: 'MEM', area: 'control', style: 'light', col: 3, row: 8, kbd: ['6'] },
  { id: 'minus', label: '−', second: 'VAR-LINK', area: 'control', style: 'dark', col: 4, row: 8, kbd: ['-'] },

  { id: '1', label: '1', second: 'EE', area: 'control', style: 'light', col: 1, row: 9, kbd: ['1'] },
  { id: '2', label: '2', second: 'CATALOG', area: 'control', style: 'light', col: 2, row: 9, kbd: ['2'] },
  { id: '3', label: '3', second: 'CUSTOM', area: 'control', style: 'light', col: 3, row: 9, kbd: ['3'] },
  { id: 'plus', label: '+', second: 'CHAR', diamond: '◐', area: 'control', style: 'dark', col: 4, row: 9, kbd: ['+'] },

  { id: '0', label: '0', second: '<', area: 'control', style: 'light', col: 1, row: 10, kbd: ['0'] },
  { id: 'dot', label: '.', second: '>', area: 'control', style: 'light', col: 2, row: 10, kbd: ['.'] },
  { id: 'negate', label: '(−)', second: 'ANS', area: 'control', style: 'light', col: 3, row: 10 },
  { id: 'enter', label: 'ENTER', second: 'ENTRY', area: 'control', style: 'blue', col: 4, row: 10, kbd: ['Enter'] },
];

const QWERTY: KeyDef[] = [
  ...letterRow('qwertyuiop', 1, 1),
  ...letterRow('asdfghjkl', 2, 2),
  { id: 'shift', label: '⇧', area: 'qwerty', style: 'dark', modifier: 'shift', col: 1, row: 3, colSpan: 2 },
  ...letterRow('zxcvbnm', 3, 3),
  { id: 'theta', label: 'θ', second: ':', area: 'qwerty', style: 'dark', col: 17, row: 3, colSpan: 2 },
  { id: 'enter-qwerty', label: 'ENTER', second: 'ENTRY', diamond: '≈', area: 'qwerty', style: 'blue', col: 19, row: 3, colSpan: 2, rowSpan: 2 },
  { id: 'on', label: 'ON', second: 'OFF', area: 'qwerty', style: 'dark', col: 1, row: 4, colSpan: 2 },
  { id: 'diamond', label: '◆', area: 'qwerty', style: 'diamond', modifier: 'diamond', col: 3, row: 4, colSpan: 2 },
  { id: '2nd-qwerty', label: '2nd', area: 'qwerty', style: 'second', modifier: 'second', col: 5, row: 4, colSpan: 2 },
  { id: 'sto', label: 'STO▸', second: 'RCL', area: 'qwerty', style: 'dark', col: 7, row: 4, colSpan: 2 },
  { id: 'space', label: '', area: 'qwerty', style: 'dark', col: 9, row: 4, colSpan: 6, kbd: [' '] },
  { id: 'equals', label: '=', second: '\\', area: 'qwerty', style: 'dark', col: 15, row: 4, colSpan: 2, kbd: ['='] },
  { id: 'backspace', label: '←', second: 'INS', diamond: 'DEL', area: 'qwerty', style: 'dark', col: 17, row: 4, colSpan: 2, kbd: ['Backspace'] },
];

export const KEYS: KeyDef[] = [...FKEYS, ...CONTROL, ...QWERTY];

/** The round four-way cursor pad in the control area. */
export const CURSOR_PAD: GridPlacement & { keys: PadKey[] } = {
  col: 3,
  row: 1,
  colSpan: 2,
  rowSpan: 3,
  keys: [
    { id: 'up', label: 'Up', kbd: ['ArrowUp'] },
    { id: 'right', label: 'Right', kbd: ['ArrowRight'] },
    { id: 'down', label: 'Down', kbd: ['ArrowDown'] },
    { id: 'left', label: 'Left', kbd: ['ArrowLeft'] },
  ],
};
