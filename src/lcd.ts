import type { Modifier } from './keys';

// Static mock-up of the TI-92 HOME screen: toolbar, history, entry line, status line.

const TABS: [fkey: string, name: string][] = [
  ['F1▾', '✎'],
  ['F2▾', 'Algebra'],
  ['F3▾', 'Calc'],
  ['F4▾', 'Other'],
  ['F5', 'PrgmIO'],
  ['F6▾', 'Clear a-z'],
];

const MODIFIER_LABEL: Record<Modifier, string> = {
  second: '2ND',
  diamond: '◆',
  shift: '⇧',
};

export interface Lcd {
  el: HTMLElement;
  setModifier(modifier: Modifier | null): void;
}

export function createLcd(): Lcd {
  const el = document.createElement('div');
  el.className = 'lcd';
  el.innerHTML = `
    <div class="lcd-toolbar">
      ${TABS.map(([fkey, name], i) => `<div class="lcd-tab${i === 0 ? ' lcd-tab--active' : ''}"><small>${fkey}</small>${name}</div>`).join('')}
    </div>
    <div class="lcd-history"></div>
    <div class="lcd-entry"><span class="lcd-cursor"></span></div>
    <div class="lcd-status">
      <span><span class="lcd-mod"></span>MAIN</span>
      <span>RAD EXACT</span>
      <span>FUNC 0/30</span>
    </div>`;

  const mod = el.querySelector<HTMLElement>('.lcd-mod')!;
  return {
    el,
    setModifier(modifier) {
      mod.textContent = modifier ? MODIFIER_LABEL[modifier] : '';
    },
  };
}
