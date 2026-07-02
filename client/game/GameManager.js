import { DataStore } from './DataStore.js';
import { CharacterManager } from './CharacterManager.js';
import { LevelManager } from './LevelManager.js';
import { ModeManager } from './ModeManager.js';
import { BoxManager } from './BoxManager.js';
import { SaveManager } from './SaveManager.js';
import { MapManager } from './MapManager.js';
import { AnimationManager } from './AnimationManager.js';
import { AudioManager } from './AudioManager.js';
import { InputManager } from './InputManager.js';
import { NetworkManager } from '../network/NetworkManager.js';
import { UIManager } from '../ui/UIManager.js';
import { MainScene } from '../scenes/MainScene.js';
import { CharacterScene } from '../scenes/CharacterScene.js';
import { BoxScene } from '../scenes/BoxScene.js';
import { SettingsScene } from '../scenes/SettingsScene.js';
import { LobbyScene } from '../scenes/LobbyScene.js';
import { GameScene } from '../scenes/GameScene.js';

export class GameManager {
  constructor(root) {
    this.root = root;
    this.data = new DataStore();
    this.animation = new AnimationManager();
    this.audio = new AudioManager();
    this.input = new InputManager();
    this.network = new NetworkManager();
    this.room = null;
    this.message = '준비 완료';
    this.currentScene = 'main';
  }

  async boot() {
    await this.data.load();
    this.levelManager = new LevelManager(this.data.settings);
    this.characterManager = new CharacterManager(this.data.characters, this.levelManager);
    this.modeManager = new ModeManager(this.data.settings);
    this.mapManager = new MapManager(this.data.maps);
    this.boxManager = new BoxManager(this.data.boxes, this.characterManager);
    this.saveManager = new SaveManager(this.data.settings);
    this.save = this.saveManager.loadLocal();
    this.audio.setEnabled(this.save.settings.sound);
    this.ui = new UIManager(this.root, this.animation, this.audio);
    this.scenes = {
      main: new MainScene(this),
      characters: new CharacterScene(this),
      boxes: new BoxScene(this),
      settings: new SettingsScene(this),
      lobby: new LobbyScene(this),
      game: new GameScene(this)
    };
    this.bindNetwork();
    this.network.connect();
    this.showScene('main');
  }

  bindNetwork() {
    this.network.on('connectionChanged', () => this.updateStatusOnly());
    this.network.on('pingChanged', () => this.updateStatusOnly());
    this.network.on('roomCreated', (room) => { this.room = room; this.message = '서버가 열렸습니다.'; this.showScene('lobby'); });
    this.network.on('roomJoined', (room) => { this.room = room; this.message = '방에 참가했습니다.'; this.showScene('lobby'); });
    this.network.on('roomUpdated', (room) => { this.room = room; this.refresh(); });
    this.network.on('gameStarted', (payload) => { this.room = payload.room || this.room; this.message = '게임 시작'; this.showScene('game'); });
    this.network.on('serverClosed', () => { this.room = null; this.message = '호스트가 서버를 종료했습니다.'; this.showScene('main'); });
    this.network.on('message', (payload) => { this.message = payload.text; if (this.currentScene !== 'game') this.refresh(); });
  }

  showScene(name) {
    if (this.currentScene === 'game' && name !== 'game') this.scenes.game.cleanup?.();
    this.currentScene = name;
    this.scenes[name].render();
  }

  refresh() {
    if (this.currentScene === 'game') return;
    this.scenes[this.currentScene]?.render();
  }

  updateStatusOnly() {
    this.ui?.updateStatusBar(this.room, this.network.state);
  }

  getActiveMode() {
    const modeId = this.room?.modeId || this.modeManager.selectedModeId;
    return this.modeManager.modes.get(modeId) || this.modeManager.getSelected();
  }

  persist() {
    this.saveManager.saveLocal(this.save);
  }

  recordVictory() {
    const reward = this.data.settings.victoryReward || { boxes: 1 };
    this.save = {
      ...this.save,
      wins: this.save.wins + 1,
      boxes: this.save.boxes + reward.boxes
    };
    this.message = '승리 보상: 상자 ' + reward.boxes + '개 획득';
    this.persist();
    this.network.claimVictory({ save: this.save, reward });
    this.refresh();
  }

  chooseCharacter(characterId) {
    this.save = { ...this.save, selectedCharacterId: characterId };
    this.persist();
    this.network.chooseCharacter({ code: this.room?.code, characterId });
    const character = this.characterManager.getById(characterId);
    this.message = character.name + ' 선택';
    this.refresh();
  }

  levelUp(characterId) {
    const character = this.characterManager.getById(characterId);
    const before = this.save;
    const nextSave = this.levelManager.levelUp(characterId, this.save, character);
    const record = this.save.characters[characterId];
    const maxLevel = this.levelManager.getMaxLevel(character);

    if (nextSave === before && record?.level >= maxLevel) {
      this.message = '이미 최대 레벨입니다. 최대 레벨은 ' + maxLevel + '입니다.';
    } else if (nextSave === before) {
      this.message = '코인이 부족합니다. 레벨업에는 100코인이 필요합니다.';
    } else {
      this.message = character.name + ' 레벨 업 완료';
    }

    this.save = nextSave;
    this.persist();
    this.network.levelUp({ characterId, save: this.save });
    this.refresh();
  }

  openBox() {
    const result = this.boxManager.open(this.save);
    this.save = result.save;
    this.message = result.message;
    this.persist();
    this.network.openBox({ reward: result.reward, save: this.save });
    this.refresh();
  }

  changeMode(modeId) {
    const mode = this.modeManager.select(modeId);
    if (this.room?.code) {
      this.network.changeMode({ code: this.room.code, modeId: mode.id });
    }
    this.message = mode.name + ' 모드 선택';
    this.refresh();
  }

  startGame() {
    const mode = this.getActiveMode();
    if (mode.id !== 'free_for_all_5') {
      this.message = '지금은 1 vs 1 vs 1 vs 1 vs 1 모드부터 플레이할 수 있습니다.';
      this.refresh();
      return;
    }
    if (this.room?.code) {
      this.message = '다른 플레이어를 전투 화면으로 이동시키는 중입니다.';
      this.network.startGame({ code: this.room.code });
      this.refresh();
      return;
    }
    this.message = mode.name + ' 게임 시작';
    this.showScene('game');
  }

  updateNickname(nickname) {
    this.save = { ...this.save, nickname: nickname.trim() || '플레이어' };
    this.persist();
  }

  toggleSetting(key) {
    this.save = { ...this.save, settings: { ...this.save.settings, [key]: !this.save.settings[key] } };
    this.audio.setEnabled(this.save.settings.sound);
    this.persist();
    this.refresh();
  }

  createShortCode() {
    return Math.random().toString(36).slice(2, 6).toUpperCase();
  }
}
