export class LevelManager {
  constructor(settings) {
    this.settings = settings.level;
  }

  getCost() {
    return this.settings.coinsPerLevel || this.settings.goldPerLevel || 100;
  }

  getMaxLevel(character) {
    return Math.min(character?.maxLevel || this.settings.maxLevel || 10, this.settings.maxLevel || 10);
  }

  canLevelUp(characterId, save, character = null) {
    const record = save.characters[characterId];
    if (!record) return false;
    const maxLevel = this.getMaxLevel(character);
    return record.level < maxLevel && save.coins >= this.getCost();
  }

  levelUp(characterId, save, character = null) {
    if (!this.canLevelUp(characterId, save, character)) return save;
    const characters = {
      ...save.characters,
      [characterId]: {
        ...save.characters[characterId],
        level: save.characters[characterId].level + 1
      }
    };
    return { ...save, coins: save.coins - this.getCost(), characters };
  }

  applyLevel(character, level) {
    const hpMultiplier = 1 + (level - 1) * this.settings.hpGrowthPerLevel;
    const attackMultiplier = 1 + (level - 1) * this.settings.attackGrowthPerLevel;
    return {
      level,
      hp: Math.round(character.hp * hpMultiplier),
      basicDamage: Math.round(character.basicAttack.damage * attackMultiplier),
      ultimateDamage: Math.round((character.ultimate.damage || 0) * attackMultiplier)
    };
  }
}
