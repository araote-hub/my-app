import { CURSOR_PAD, KEYS, type GridPlacement, type KeyDef, type Modifier } from './keys';
import { createLcd } from './lcd';

export interface CalcKeyDetail {
  id: string;
  /** Modifier that was latched when the key was pressed. */
  modifier: Modifier | null;
  /** What the key produces under that modifier; falls back to the key's own label. */
  value: string;
}

declare global {
  interface HTMLElementEventMap {
    calckey: CustomEvent<CalcKeyDetail>;
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function place(node: HTMLElement, p: GridPlacement) {
  node.style.gridColumn = `${p.col} / span ${p.colSpan ?? 1}`;
  node.style.gridRow = `${p.row} / span ${p.rowSpan ?? 1}`;
}

function button(className: string, id: string, ariaLabel: string): HTMLButtonElement {
  const b = el('button', className);
  b.type = 'button';
  b.tabIndex = -1; // input comes from pointer + the physical-keyboard mapping
  b.dataset.id = id;
  b.setAttribute('aria-label', ariaLabel);
  return b;
}

function renderKey(def: KeyDef): HTMLElement {
  const cell = el('div', 'cell');
  place(cell, def);
  if ((def.rowSpan ?? 1) > 1) cell.classList.add('cell--tall');
  if (def.area === 'fkeys' && def.col === 2) cell.classList.add('cell--raised');

  const legend = el('div', 'legend');
  for (const [cls, text] of [['legend-second', def.second], ['legend-diamond', def.diamond]] as const) {
    if (!text) continue;
    const span = el('span', cls);
    span.textContent = text;
    legend.append(span);
  }

  const key = button(`key key--${def.style}`, def.id, def.label || def.id);
  key.textContent = def.label;
  cell.append(legend, key);
  return cell;
}

function renderPad(): HTMLElement {
  const cell = el('div', 'cell cell--pad');
  place(cell, CURSOR_PAD);
  const pad = el('div', 'pad');
  const disc = el('div', 'pad-disc');
  for (const k of CURSOR_PAD.keys) disc.append(button(`pad-btn pad-btn--${k.id}`, k.id, k.label));
  pad.append(disc);
  cell.append(pad);
  return cell;
}

export function mountCalculator(root: HTMLElement) {
  const lcd = createLcd();

  const calc = el('div', 'calc');
  const bezel = el('div', 'bezel');
  const fkeys = el('div', 'fkeys');
  const speaker = el('div', 'speaker');
  place(speaker, { col: 1, row: 1 });
  fkeys.append(speaker);

  const screen = el('div', 'screen');
  const brand = el('div', 'brand');
  brand.innerHTML = '<span class="brand-ti">Texas Instruments</span><span class="brand-model">TI-92</span>';
  const frame = el('div', 'lcd-frame');
  frame.append(lcd.el);
  screen.append(brand, frame);
  bezel.append(fkeys, screen);

  const control = el('div', 'control');
  control.append(el('div', 'control-panel'));
  const qwerty = el('div', 'qwerty');

  const areas = { fkeys, control, qwerty };
  for (const def of KEYS) areas[def.area].append(renderKey(def));
  control.append(renderPad());
  calc.append(bezel, control, qwerty);

  const wrap = el('div', 'calc-wrap');
  wrap.append(calc);
  root.append(wrap);

  // --- input ---

  const defs = new Map<string, Pick<KeyDef, 'label' | 'second' | 'diamond' | 'modifier'>>();
  const byKbd = new Map<string, string>();
  for (const k of [...KEYS, ...CURSOR_PAD.keys]) {
    defs.set(k.id, k);
    for (const key of k.kbd ?? []) byKbd.set(key, k.id);
  }

  const buttons = new Map<string, HTMLElement>();
  for (const b of calc.querySelectorAll<HTMLElement>('[data-id]')) buttons.set(b.dataset.id!, b);

  let modifier: Modifier | null = null;

  function setModifier(next: Modifier | null) {
    modifier = next;
    lcd.setModifier(next);
    for (const [id, b] of buttons) b.classList.toggle('latched', !!next && defs.get(id)?.modifier === next);
  }

  function press(id: string) {
    const def = defs.get(id);
    if (!def) return;
    if (def.modifier) {
      setModifier(modifier === def.modifier ? null : def.modifier);
      return;
    }
    const legend = modifier === 'second' ? def.second : modifier === 'diamond' ? def.diamond : undefined;
    let value = legend ?? def.label;
    if (/^[a-z]$/.test(id)) value = modifier === 'shift' ? id.toUpperCase() : id;
    if (id === 'space') value = ' ';
    calc.dispatchEvent(new CustomEvent('calckey', { detail: { id, modifier, value }, bubbles: true }));
    setModifier(null);
  }

  function setPressed(id: string, on: boolean) {
    buttons.get(id)?.classList.toggle('pressed', on);
  }

  let pointerKey: string | null = null;
  calc.addEventListener('pointerdown', (e) => {
    const id = (e.target as Element).closest<HTMLElement>('[data-id]')?.dataset.id;
    if (!id) return;
    e.preventDefault();
    pointerKey = id;
    setPressed(id, true);
    press(id);
  });
  const releasePointer = () => {
    if (pointerKey) setPressed(pointerKey, false);
    pointerKey = null;
  };
  window.addEventListener('pointerup', releasePointer);
  window.addEventListener('pointercancel', releasePointer);

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const id = byKbd.get(e.key);
    if (!id) return;
    e.preventDefault();
    setPressed(id, true);
    if (e.repeat && defs.get(id)?.modifier) return;
    if (/^[A-Z]$/.test(e.key)) setModifier('shift');
    press(id);
  });
  window.addEventListener('keyup', (e) => {
    const id = byKbd.get(e.key) ?? byKbd.get(e.key.toLowerCase());
    if (id) setPressed(id, false);
  });

  return calc;
}
