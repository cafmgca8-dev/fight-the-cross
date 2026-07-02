export class LevelManager {
  constructor(settings) { this.settings = settings.level; }
  canLevelUp(characterId, save) { const record = save.characters[characterId]; return Boolean(record && record.level < this.settings.maxLevel && save.gold >= this.settings.goldPerLevel); }
  levelUp(characterId, save) { if (!this.canLevelUp(characterId, save)) return save; const characters = { ...save.characters, [characterId]: { ...save.characters[characterId], level: save.characters[characterId].level + 1 } }; return { ...save, gold: save.gold - this.settings.goldPerLevel, characters }; }
  applyLevel(character, level) { const hpMultiplier = 1 + (level - 1) * this.settings.hpGrowthPerLevel; const attackMultiplier = 1 + (level - 1) * this.settings.attackGrowthPerLevel; return { level, hp: Math.round(character.hp * hpMultiplier), basicDamage: Math.round(character.basicAttack.damage * attackMultiplier), ultimateDamage: Math.round((character.ultimate.damage || 0) * attackMultiplier) }; }
}
