export class DataStore {
  constructor(basePath = '') { this.basePath = basePath; this.characters = []; this.boxes = null; this.settings = null; }
  async load() {
    const list = await Promise.all([this.fetchJson('/config/characters.json'), this.fetchJson('/config/boxes.json'), this.fetchJson('/config/settings.json')]);
    this.characters = list[0]; this.boxes = list[1]; this.settings = list[2]; return this;
  }
  async fetchJson(path) { const response = await fetch(this.basePath + path); if (!response.ok) throw new Error(path + ' 로드 실패'); return response.json(); }
}
