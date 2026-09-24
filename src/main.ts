import './style.css';
import { mountCalculator } from './calculator';

const calc = mountCalculator(document.querySelector<HTMLElement>('#app')!);

// No calculation engine yet: log key events so the UI can be checked.
calc.addEventListener('calckey', (e) => console.log('calckey', e.detail));
