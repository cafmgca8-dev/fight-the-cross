import { GameManager } from './game/GameManager.js';

const app = new GameManager(document.querySelector('#app'));
app.boot();
