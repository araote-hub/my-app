import type { HomeState } from './home';
import { HISTORY_LIMIT } from './home';
import type { Modifier } from './keys';

// Draws the TI-92 HOME screen: toolbar, history, entry line, status line,
// plus the error dialog and the powered-off state.

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
  render(state: HomeState): void;
}

export function createLcd(): Lcd {
  const el = document.createElement('div');
  el.className = 'lcd';
  el.innerHTML = `
    <div class="lcd-toolbar">
      ${TABS.map(([fkey, name], i) => `<div class="lcd-tab${i === 0 ? ' lcd-tab--active' : ''}"><small>${fkey}</small>${name}</div>`).join('')}
    </div>
    <div class="lcd-history"></div>
    <div class="lcd-entry"></div>
    <div class="lcd-status">
      <span><span class="lcd-mod"></span>MAIN</span>
      <span class="lcd-mode"></span>
      <span class="lcd-count"></span>
    </div>
    <div class="lcd-error" hidden>
      <div class="lcd-error-title">ERROR</div>
      <div class="lcd-error-message"></div>
      <div class="lcd-error-hint">ENTER or ESC=OK</div>
    </div>`;

  const q = (sel: string) => el.querySelector<HTMLElement>(sel)!;
  const mod = q('.lcd-mod');
  const history = q('.lcd-history');
  const entry = q('.lcd-entry');
  const mode = q('.lcd-mode');
  const count = q('.lcd-count');
  const errorBox = q('.lcd-error');
  const errorMessage = q('.lcd-error-message');

  return {
    el,
    setModifier(modifier) {
      mod.textContent = modifier ? MODIFIER_LABEL[modifier] : '';
    },
    render(state) {
      el.classList.toggle('lcd--off', state.off);

      history.replaceChildren(
        ...state.history.map((item) => {
          const row = document.createElement('div');
          row.className = 'lcd-row';
          const input = document.createElement('span');
          input.className = 'lcd-row-entry';
          input.textContent = '■' + item.entry.join('');
          const result = document.createElement('span');
          result.className = 'lcd-row-result';
          result.textContent = item.result;
          row.append(input, result);
          return row;
        }),
      );

      const before = document.createTextNode(state.entry.slice(0, state.cursor).join(''));
      const cursor = document.createElement('span');
      cursor.className = state.overwrite ? 'lcd-cursor lcd-cursor--overwrite' : 'lcd-cursor';
      const after = document.createTextNode(state.entry.slice(state.cursor).join(''));
      if (state.overwrite && state.cursor < state.entry.length) {
        cursor.textContent = state.entry[state.cursor];
        after.textContent = state.entry.slice(state.cursor + 1).join('');
      }
      entry.replaceChildren(before, cursor, after);
      // Keep the cursor in view on long entries.
      entry.scrollLeft = Math.max(0, cursor.offsetLeft - entry.clientWidth + 2 * cursor.offsetWidth + 4);

      mode.textContent = `${state.angle.toUpperCase()} APPROX${state.caps ? ' CAPS' : ''}`;
      count.textContent = `FUNC ${state.history.length}/${HISTORY_LIMIT}`;

      errorBox.hidden = !state.error;
      errorMessage.textContent = state.error ?? '';
    },
  };
}
