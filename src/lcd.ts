import type { HomeState } from './home';
import { HISTORY_LIMIT } from './home';
import type { Modifier } from './keys';
import { TOOLBAR } from './menus';

// Draws the TI-92 HOME screen: toolbar and its drop-down menus, history,
// entry line, status line, plus dialogs, the Program I/O screen and the
// powered-off state.

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
      ${TOOLBAR.map((t) => `<div class="lcd-tab"><small>${t.caption}</small>${t.name}</div>`).join('')}
    </div>
    <div class="lcd-history"></div>
    <div class="lcd-entry"></div>
    <div class="lcd-status">
      <span><span class="lcd-mod"></span><span class="lcd-lock" title="Drag lock (2nd ✋)"></span>MAIN</span>
      <span class="lcd-mode"></span>
      <span class="lcd-count"></span>
    </div>
    <ol class="lcd-menu" hidden></ol>
    <div class="lcd-dialog" hidden>
      <div class="lcd-dialog-title"></div>
      <div class="lcd-dialog-message"></div>
      <div class="lcd-dialog-hint">ENTER or ESC=OK</div>
    </div>`;

  const q = (sel: string) => el.querySelector<HTMLElement>(sel)!;
  const mod = q('.lcd-mod');
  const lock = q('.lcd-lock');
  const history = q('.lcd-history');
  const entry = q('.lcd-entry');
  const mode = q('.lcd-mode');
  const count = q('.lcd-count');
  const tabs = [...el.querySelectorAll<HTMLElement>('.lcd-tab')];
  const menu = q('.lcd-menu');
  const dialog = q('.lcd-dialog');
  const dialogTitle = q('.lcd-dialog-title');
  const dialogMessage = q('.lcd-dialog-message');

  return {
    el,
    setModifier(modifier) {
      mod.textContent = modifier ? MODIFIER_LABEL[modifier] : '';
    },
    render(state) {
      el.classList.toggle('lcd--off', state.off);
      el.classList.toggle('lcd--prgmio', state.screen === 'prgmio');
      tabs.forEach((tab, i) => {
        const open = state.menu?.tab === i || (state.screen !== 'home' && TOOLBAR[i].screen === state.screen);
        tab.classList.toggle('lcd-tab--open', open);
      });

      menu.hidden = !state.menu;
      if (state.menu) {
        const { tab, index } = state.menu;
        menu.replaceChildren(
          ...TOOLBAR[tab].items!.map((item, i) => {
            const li = document.createElement('li');
            li.textContent = `${i + 1}:${item.label}`;
            li.classList.toggle('lcd-menu-item--selected', i === index);
            return li;
          }),
        );
        menu.style.left = `${tabs[tab].offsetLeft}px`;
        menu.style.top = `${tabs[tab].offsetTop + tabs[tab].offsetHeight}px`;
      }

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

      lock.textContent = state.dragLock ? '✋︎' : '';
      mode.textContent = `${state.angle.toUpperCase()} APPROX${state.caps ? ' CAPS' : ''}`;
      count.textContent = `FUNC ${state.history.length}/${HISTORY_LIMIT}`;

      dialog.hidden = !state.dialog;
      dialogTitle.textContent = state.dialog?.title ?? '';
      dialogMessage.textContent = state.dialog?.message ?? '';
    },
  };
}
