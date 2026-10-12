import '@fontsource-variable/anybody/standard.css';
import '@fontsource/space-mono/400.css';
import '@fontsource/space-mono/700.css';
import './style.css';
import { readSettings } from './core/session';
import { App } from './ui/app';

const app = new App(document, readSettings(window.location.search), {
  onSettings: (query) => {
    window.history.replaceState(null, '', query);
  },
});

// Canvases are sized from CSS, so redraw when the layout changes.
window.addEventListener('resize', () => {
  app.render();
});
