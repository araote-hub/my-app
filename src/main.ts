import './style.css';
import { mountCalculator } from './calculator';
import { Home } from './home';

const { el, lcd } = mountCalculator(document.querySelector<HTMLElement>('#app')!);
const home = new Home();

lcd.render(home.state);
el.addEventListener('calckey', (e) => {
  home.press(e.detail.id, e.detail.modifier);
  lcd.render(home.state);
});
