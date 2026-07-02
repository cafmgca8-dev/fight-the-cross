export class BoxManager {
  constructor(config, settings) {
    this.config = config;
    this.settings = settings;
  }

  getVictoryReward() {
    return this.settings.victoryReward || { boxes: 1 };
  }
}
