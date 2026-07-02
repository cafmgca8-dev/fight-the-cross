export class SaveManager {
  constructor(settings) { this.settings = settings; this.storageKey = 'fightTheCrossSaveV2'; }
  createDefaultSave() { const characters = Object.fromEntries(this.settings.starterCharacters.map((id) => [id, { level: 1, unlockedAt: Date.now() }])); return { ...this.settings.defaultSave, characters, selectedCharacterId: this.settings.starterCharacters[0] }; }
  loadLocal() { const raw = localStorage.getItem(this.storageKey); if (!raw) return this.createDefaultSave(); return this.migrate(JSON.parse(raw)); }
  saveLocal(save) { localStorage.setItem(this.storageKey, JSON.stringify(save)); }
  migrate(save) { const base = this.createDefaultSave(); return { ...base, ...save, settings: { ...base.settings, ...(save.settings || {}) }, characters: { ...base.characters, ...(save.characters || {}) } }; }
}
