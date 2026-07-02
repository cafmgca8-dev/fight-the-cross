export class BoxManager {
  constructor(boxConfig, characterManager) {
    this.boxConfig = boxConfig;
    this.characterManager = characterManager;
  }

  open(save, boxId = 'basic_box') {
    if (save.boxes <= 0) {
      return { save, reward: null, message: '열 수 있는 상자가 없습니다.' };
    }

    const box = this.boxConfig.boxes.find((item) => item.id === boxId) || this.boxConfig.boxes[0];
    const drop = this.weightedPick(box.dropTable);
    let nextSave = { ...save, boxes: save.boxes - 1 };
    let reward = null;

    if (drop.type === 'character') {
      const candidates = this.getCharacterCandidates(save, drop);
      if (candidates.length > 0) {
        const character = candidates[this.randomInt(0, candidates.length - 1)];
        nextSave = {
          ...nextSave,
          characters: {
            ...nextSave.characters,
            [character.id]: { level: 1, unlockedAt: Date.now() }
          }
        };
        reward = { type: 'character', characterId: character.id, name: character.name };
      }
    }

    if (!reward) {
      const coinDrop = drop.type === 'coins' ? drop : this.getFallbackCoinDrop(box);
      const amount = this.randomInt(coinDrop.amountMin, coinDrop.amountMax);
      nextSave = { ...nextSave, coins: nextSave.coins + amount };
      reward = { type: 'coins', amount };
    }

    return { save: nextSave, reward, message: this.describeReward(reward) };
  }

  getCharacterCandidates(save, drop) {
    return this.characterManager.getAll().filter((character) => {
      const rarityMatches = !drop.rarity || character.rarity === drop.rarity;
      const lockedMatches = !drop.onlyLocked || !save.characters[character.id];
      return rarityMatches && lockedMatches;
    });
  }

  getFallbackCoinDrop(box) {
    return box.dropTable.find((item) => item.type === 'coins') || { amountMin: 40, amountMax: 120 };
  }

  weightedPick(items) {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    let roll = Math.random() * total;
    for (const item of items) {
      roll -= item.weight;
      if (roll <= 0) return item;
    }
    return items[items.length - 1];
  }

  randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  describeReward(reward) {
    if (!reward) return '';
    if (reward.type === 'coins') return '코인 ' + reward.amount + '개 획득';
    return '신규 캐릭터 ' + reward.name + ' 획득';
  }
}
