export class CharacterScene {
  constructor(game) {
    this.game = game;
  }

  render() {
    const cards = this.game.characterManager.getOwned(this.game.save).map((character) => this.card(character)).join('');
    this.game.ui.render('<main class="screen">' +
      this.game.ui.statusBar(this.game.room, this.game.network.state) +
      '<div class="nav-row"><button class="btn secondary" data-scene="main">홈</button><button class="btn secondary" data-scene="lobby">로비</button></div>' +
      '<section class="panel"><h2>보유 캐릭터</h2><div class="card-grid">' + cards + '</div></section>' +
      '<section class="message-log">코인 ' + this.game.save.coins + '개 · 레벨업 비용 100코인 · ' + this.game.message + '</section>' +
      '</main>');
    this.bind();
  }

  card(character) {
    const stats = this.game.characterManager.getDisplayStats(character.id, this.game.save);
    const maxLevel = this.game.levelManager.getMaxLevel(character);
    const selected = this.game.save.selectedCharacterId === character.id ? ' selected' : '';
    const disabled = stats.level >= maxLevel ? ' disabled' : '';
    return '<article class="character-card' + selected + '" data-character-id="' + character.id + '">' +
      '<div><span class="badge">' + character.rarity + '</span><h3 class="card-name">' + character.name + '</h3></div>' +
      '<div class="stat-list">' +
      '<div class="stat"><span>레벨</span><strong>' + stats.level + ' / ' + maxLevel + '</strong></div>' +
      '<div class="stat"><span>체력</span><strong>' + stats.hp + '</strong></div>' +
      '<div class="stat"><span>' + character.basicAttack.name + '</span><strong>' + stats.basicDamage + '</strong></div>' +
      '<div class="stat"><span>' + character.ultimate.name + '</span><strong>' + character.ultimate.description + '</strong></div>' +
      '</div>' +
      '<button class="btn upgrade" data-upgrade="' + character.id + '"' + disabled + '>업그레이드 100코인</button>' +
      '</article>';
  }

  bind() {
    document.querySelectorAll('[data-scene]').forEach((button) => {
      button.addEventListener('click', () => this.game.showScene(button.dataset.scene));
    });
    document.querySelectorAll('.character-card').forEach((card) => {
      card.addEventListener('click', () => this.game.chooseCharacter(card.dataset.characterId));
    });
    document.querySelectorAll('[data-upgrade]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        this.game.levelUp(button.dataset.upgrade);
      });
    });
  }
}
