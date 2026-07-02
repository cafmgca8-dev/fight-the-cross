export class CharacterManager {
  constructor(characters, levelManager) { this.characters = new Map(characters.map((character) => [character.id, character])); this.levelManager = levelManager; }
  getAll() { return Array.from(this.characters.values()); }
  getById(id) { return this.characters.get(id) || null; }
  getOwned(save) { return this.getAll().filter((character) => save.characters[character.id]); }
  getDisplayStats(characterId, save) { const character = this.getById(characterId); const level = save.characters[characterId]?.level || 1; return this.levelManager.applyLevel(character, level); }
}
