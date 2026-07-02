export class DataStore {
  constructor(basePath = '') {
    this.basePath = basePath;
    this.characters = [];
    this.boxes = null;
    this.settings = null;
    this.maps = [];
  }

  async load() {
    const [characters, boxes, settings, maps] = await Promise.all([
      this.fetchJson('/config/characters.json'),
      this.fetchJson('/config/boxes.json'),
      this.fetchJson('/config/settings.json'),
      this.fetchJson('/config/maps.json')
    ]);
    this.characters = characters;
    this.boxes = boxes;
    this.settings = settings;
    this.maps = maps.maps || [];
    return this;
  }

  async fetchJson(path) {
    const response = await fetch(this.basePath + path);
    if (!response.ok) throw new Error(path + ' 로드 실패');
    return response.json();
  }
}
