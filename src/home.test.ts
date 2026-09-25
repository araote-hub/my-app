import { describe, expect, it } from 'vitest';
import { Home } from './home';
import type { Modifier } from './keys';

/** Presses keys by id; "2nd:x", "dia:x" and "shift:x" apply a modifier. */
function press(home: Home, ...keys: string[]) {
  for (const key of keys) {
    const [prefix, id] = key.includes(':') ? key.split(':') : [null, key];
    const modifier = ({ '2nd': 'second', dia: 'diamond', shift: 'shift' } as Record<string, Modifier>)[prefix ?? ''] ?? null;
    home.press(id, modifier);
  }
  return home.state;
}

const results = (home: Home) => home.state.history.map((h) => h.result);
const entry = (home: Home) => home.state.entry.join('');

describe('Home', () => {
  it('evaluates the entry line on ENTER', () => {
    const home = new Home();
    press(home, '2', 'plus', '3', 'times', '4', 'enter');
    expect(results(home)).toEqual(['14']);
    expect(home.state.history[0].entry.join('')).toBe('2+3*4');
    expect(entry(home)).toBe('');
  });

  it('works from every ENTER key, including ◆ENTER', () => {
    const home = new Home();
    press(home, '1', 'enter-top', '2', 'enter-qwerty', '3', 'dia:enter');
    expect(results(home)).toEqual(['1', '2', '3']);
  });

  it('inserts functions as single pieces that ← deletes whole', () => {
    const home = new Home();
    press(home, 'sin', '2nd:power', 'rparen');
    expect(entry(home)).toBe('sin(π)');
    press(home, 'backspace', 'backspace');
    expect(entry(home)).toBe('sin(');
    press(home, 'backspace');
    expect(entry(home)).toBe('');
  });

  it('starts with ans(1) when an operator begins the entry', () => {
    const home = new Home();
    press(home, '5', 'enter', 'times', '2', 'enter');
    expect(entry(home)).toBe('');
    expect(results(home)).toEqual(['5', '10']);
    expect(home.state.history[1].entry.join('')).toBe('ans(1)*2');
  });

  it('re-evaluates the last entry on ENTER with an empty line', () => {
    const home = new Home();
    press(home, '5', 'enter', 'plus', '1', 'enter', 'enter');
    expect(results(home)).toEqual(['5', '6', '7']);
  });

  it('toggles degrees with MODE', () => {
    const home = new Home();
    press(home, 'mode', 'sin', '3', '0', 'enter');
    expect(results(home)).toEqual(['0.5']);
    expect(home.state.angle).toBe('deg');
  });

  it('stores and recalls variables typed with letter keys', () => {
    const home = new Home();
    press(home, '4', 'sto', 'x', 'enter', 'x', 'power', '2', 'enter');
    expect(results(home)).toEqual(['4', '16']);
    press(home, 'f6', '1', 'x', 'enter'); // F6 1: Clear a–z
    expect(home.state.dialog?.message).toBe('Undefined variable');
  });

  it('uppercases letters with shift or caps lock', () => {
    const home = new Home();
    press(home, 'shift:a', 'b', '2nd:z', 'c', 'shift:d');
    expect(entry(home)).toBe('AbCd');
  });

  it('shows an error until ESC or ENTER, keeping the entry and pointing at the problem', () => {
    const home = new Home();
    press(home, '1', 'plus', 'rparen', '2', 'enter');
    expect(home.state.dialog?.message).toBe('Syntax');
    expect(home.state.cursor).toBe(2);
    press(home, '7');
    expect(entry(home)).toBe('1+)2');
    press(home, 'esc');
    expect(home.state.dialog).toBeNull();
    expect(entry(home)).toBe('1+)2');
  });

  it('moves the cursor and edits in the middle', () => {
    const home = new Home();
    press(home, '1', '3', 'left', '2');
    expect(entry(home)).toBe('123');
    press(home, '2nd:left', '9', '2nd:right', 'dia:backspace', 'left', 'dia:backspace');
    expect(entry(home)).toBe('912');
  });

  it('overwrites in INS-off mode (2nd ←)', () => {
    const home = new Home();
    press(home, '1', '2', '3', '2nd:left', '2nd:backspace', '9');
    expect(entry(home)).toBe('923');
  });

  it('browses previous entries with ↑/↓ and 2nd ENTRY', () => {
    const home = new Home();
    press(home, '1', 'enter', '2', 'enter');
    press(home, 'up');
    expect(entry(home)).toBe('2');
    press(home, 'up');
    expect(entry(home)).toBe('1');
    press(home, 'down', 'down');
    expect(entry(home)).toBe('');
    press(home, '2nd:enter');
    expect(entry(home)).toBe('2');
  });

  it('clears the entry, then the history, with CLEAR', () => {
    const home = new Home();
    press(home, '1', 'enter', '2');
    press(home, 'clear');
    expect(entry(home)).toBe('');
    expect(results(home)).toEqual(['1']);
    press(home, 'clear');
    expect(results(home)).toEqual([]);
  });

  it('turns off with 2nd ON and ignores keys until ON', () => {
    const home = new Home();
    press(home, '2nd:on', '1');
    expect(home.state.off).toBe(true);
    expect(entry(home)).toBe('');
    press(home, 'on', '1');
    expect(home.state.off).toBe(false);
    expect(entry(home)).toBe('1');
  });

  it('keeps at most 30 history entries', () => {
    const home = new Home();
    for (let i = 0; i < 35; i++) press(home, '1', 'enter');
    expect(home.state.history).toHaveLength(30);
  });
});

describe('toolbar menus', () => {
  it('opens a menu with its F-key and inserts the chosen item with ENTER', () => {
    const home = new Home();
    press(home, 'f2');
    expect(home.state.menu).toEqual({ tab: 1, index: 0 });
    press(home, 'down', 'enter');
    expect(home.state.menu).toBeNull();
    expect(entry(home)).toBe('zeros(');
  });

  it('selects items by number', () => {
    const home = new Home();
    press(home, 'f3', '4');
    expect(entry(home)).toBe('Π(');
  });

  it('wraps up and down, and moves between menus with left and right, skipping F5', () => {
    const home = new Home();
    press(home, 'f4', 'up');
    expect(home.state.menu).toEqual({ tab: 3, index: 1 });
    press(home, 'right');
    expect(home.state.menu).toEqual({ tab: 5, index: 0 });
    press(home, 'right');
    expect(home.state.menu).toEqual({ tab: 0, index: 0 });
    press(home, 'left');
    expect(home.state.menu?.tab).toBe(5);
  });

  it('closes with ESC or the same F-key, and ignores other keys while open', () => {
    const home = new Home();
    press(home, 'f1', 'esc');
    expect(home.state.menu).toBeNull();
    press(home, 'f1', 'x', 'plus');
    expect(entry(home)).toBe('');
    press(home, 'f1');
    expect(home.state.menu).toBeNull();
  });

  it('does nothing for F7 and F8, as on the TI-92 HOME screen', () => {
    const home = new Home();
    press(home, 'f7', 'f8');
    expect(home.state.menu).toBeNull();
    expect(home.state.screen).toBe('home');
  });

  it('solves an equation typed through the menus', () => {
    const home = new Home();
    press(home, 'f2', '1', 'x', 'power', '2', 'equals', '9', 'comma', 'x', 'rparen', 'enter');
    expect(results(home)).toEqual(['x=⁻3 or x=3']);
  });

  it('defines a function with F4 Define and calls it', () => {
    const home = new Home();
    press(home, 'f4', '1', 'f', 'lparen', 'x', 'rparen', 'equals', '2', 'x', 'enter');
    press(home, 'f', 'lparen', '2', '1', 'rparen', 'enter');
    expect(results(home)).toEqual(['Done', '42']);
  });

  it('cuts, copies and pastes the entry line with F1', () => {
    const home = new Home();
    press(home, '1', 'plus', '2', 'f1', '2'); // Copy
    expect(entry(home)).toBe('1+2');
    press(home, 'f1', '1'); // Cut
    expect(entry(home)).toBe('');
    press(home, 'f1', '3', 'times', 'f1', '3'); // Paste twice around "*"
    expect(entry(home)).toBe('1+2*1+2');
  });

  it('clears the history with F1 Clear Home and shows About', () => {
    const home = new Home();
    press(home, '1', 'enter', 'f1', '4');
    expect(results(home)).toEqual([]);
    press(home, 'f1', '5');
    expect(home.state.dialog?.title).toBe('ABOUT');
    press(home, 'enter');
    expect(home.state.dialog).toBeNull();
  });

  it('starts over with F6 NewProb', () => {
    const home = new Home();
    press(home, '5', 'sto', 'a', 'enter', '7', 'f6', '2');
    expect(results(home)).toEqual([]);
    expect(entry(home)).toBe('');
    press(home, 'a', 'enter');
    expect(home.state.dialog?.message).toBe('Undefined variable');
  });

  it('shows the Program I/O screen with F5 until ESC or F5', () => {
    const home = new Home();
    press(home, 'f5');
    expect(home.state.screen).toBe('prgmio');
    press(home, '1');
    expect(entry(home)).toBe('');
    press(home, 'esc');
    expect(home.state.screen).toBe('home');
    press(home, 'f5', 'f5');
    expect(home.state.screen).toBe('home');
    press(home, 'f5', 'f2');
    expect(home.state.screen).toBe('home');
    expect(home.state.menu?.tab).toBe(1);
  });
});

describe('hand key and LOCK', () => {
  it('toggles the drag lock with 2nd ✋ and releases it with ✋', () => {
    const home = new Home();
    press(home, '2nd:hand');
    expect(home.state.dragLock).toBe(true);
    press(home, '2nd:hand');
    expect(home.state.dragLock).toBe(false);
    press(home, '2nd:hand', 'hand');
    expect(home.state.dragLock).toBe(false);
  });

  it('changes nothing else on the HOME screen, as on the TI-92', () => {
    const home = new Home();
    press(home, '1', '2', '2nd:hand', 'left', '9', 'hand', 'enter');
    expect(results(home)).toEqual(['192']);
  });
});
