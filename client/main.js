import { GameManager } from './game/GameManager.js';
import { ViewportManager } from './ui/ViewportManager.js';

const viewport = new ViewportManager();
viewport.install();

const app = new GameManager(document.querySelector('#app'));
app.boot();
