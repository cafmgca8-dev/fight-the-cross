export class BoxManager {
  constructor(boxConfig, characterManager) { this.boxConfig = boxConfig; this.characterManager = characterManager; }
  open(save, boxId = 'basic_box') {
    if (save.boxes <= 0) return { save, reward: null, message: '열 수 있는 상자가 없습니다.' };
    const box = this.boxConfig.boxes.find((item) => item.id === boxId) || this.boxConfig.boxes[0];
    const drop = this.weightedPick(box.dropTable); let nextSave = { ...save, boxes: save.boxes - 1 }; let reward = null;
    if (drop.type === 'gold') { const amount = this.randomInt(drop.amountMin, drop.amountMax); nextSave = { ...nextSave, gold: nextSave.gold + amount }; reward = { type: 'gold', amount }; }
    if (drop.type === 'character') { const candidates = this.characterManager.getAll().filter((character) => character.rarity === drop.rarity); const character = candidates[this.randomInt(0, candidates.length - 1)]; nextSave = { ...nextSave, characters: { ...nextSave.characters, [character.id]: nextSave.characters[character.id] || { level: 1, unlockedAt: Date.now() } } }; reward = { type: 'character', characterId: character.id, name: character.name }; }
    return { save: nextSave, reward, message: this.describeReward(reward) };
  }
  weightedPick(items) { const total = items.reduce((sum, item) => sum + item.weight, 0); let roll = Math.random() * total; for (const item of items) { roll -= item.weight; if (roll <= 0) return item; } return items[items.length - 1]; }
  randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  describeReward(reward) { if (!reward) return ''; if (reward.type === 'gold') return 'Gold ' + reward.amount + ' 획득'; return reward.name + ' 획득'; }
}
