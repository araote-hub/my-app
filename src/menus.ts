// The HOME screen's toolbar: the tabs drawn across the top of the LCD and the
// menu each F-key opens. lcd.ts draws the tabs from this, and home.ts handles
// the key presses. As on the real TI-92, F7 and F8 have no tab on the HOME
// screen and do nothing there.
//
// Menus list only items that work without a computer algebra system, so the
// symbolic items of the original F2/F3 menus (factor, expand, limit, taylor, …)
// are left out.

export type MenuAction = 'cut' | 'copy' | 'paste' | 'clearHome' | 'about' | 'clearAZ' | 'newProb';

export interface MenuItem {
  label: string;
  /** Text inserted into the entry line when chosen. */
  insert?: string;
  action?: MenuAction;
}

export interface ToolbarTab {
  /** Key id from keys.ts. */
  key: string;
  /** Small caption above the tab name; ▾ marks tabs that open a menu. */
  caption: string;
  name: string;
  items?: MenuItem[];
  /** Tabs without a menu switch the LCD to another screen instead. */
  screen?: 'prgmio';
}

export const TOOLBAR: ToolbarTab[] = [
  {
    key: 'f1',
    caption: 'F1▾',
    name: '✎',
    items: [
      { label: 'Cut', action: 'cut' },
      { label: 'Copy', action: 'copy' },
      { label: 'Paste', action: 'paste' },
      { label: 'Clear Home', action: 'clearHome' },
      { label: 'About…', action: 'about' },
    ],
  },
  {
    key: 'f2',
    caption: 'F2▾',
    name: 'Algebra',
    items: [
      { label: 'solve(', insert: 'solve(' },
      { label: 'zeros(', insert: 'zeros(' },
      { label: 'approx(', insert: 'approx(' },
    ],
  },
  {
    key: 'f3',
    caption: 'F3▾',
    name: 'Calc',
    items: [
      { label: 'd( differentiate', insert: 'd(' },
      { label: '∫( integrate', insert: '∫(' },
      { label: 'Σ( sum', insert: 'Σ(' },
      { label: 'Π( product', insert: 'Π(' },
      { label: 'fMin(', insert: 'fMin(' },
      { label: 'fMax(', insert: 'fMax(' },
      { label: 'nDeriv(', insert: 'nDeriv(' },
      { label: 'nInt(', insert: 'nInt(' },
    ],
  },
  {
    key: 'f4',
    caption: 'F4▾',
    name: 'Other',
    items: [
      { label: 'Define', insert: 'Define ' },
      { label: 'DelVar', insert: 'DelVar ' },
    ],
  },
  { key: 'f5', caption: 'F5', name: 'PrgmIO', screen: 'prgmio' },
  {
    key: 'f6',
    caption: 'F6▾',
    name: 'Clear a-z',
    items: [
      { label: 'Clear a–z', action: 'clearAZ' },
      { label: 'NewProb', action: 'newProb' },
    ],
  },
];

export const ABOUT_TEXT = 'TI-92-style calculator. Unofficial recreation, not affiliated with Texas Instruments.';
