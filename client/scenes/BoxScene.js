export class BoxScene {
  constructor(game) {
    this.game = game;
  }

  render() {
    this.game.ui.render('<main class="screen">' +
      this.game.ui.statusBar(this.game.room, this.game.network.state) +
      '<div class="nav-row"><button class="btn secondary" data-scene="main">홈</button><button class="btn secondary" data-scene="characters">캐릭터</button></div>' +
      '<section class="panel"><h2>상자</h2>' +
      '<div class="stat-list">' +
      '<div class="stat"><span>보유 상자</span><strong>' + this.game.save.boxes + '</strong></div>' +
      '<div class="stat"><span>승리 수</span><strong>' + this.game.save.wins + '</strong></div>' +
      '<div class="stat"><span>코인</span><strong>' + this.game.save.coins + '</strong></div>' +
      '</div>' +
      '<div class="button-grid"><button id="claimVictory" class="btn">승리 보상 테스트</button><button id="openBox" class="btn warning">상자 열기</button></div>' +
      '</section>' +
      '<section class="message-log">' + this.game.message + '</section>' +
      '</main>');

    document.querySelectorAll('[data-scene]').forEach((button) => {
      button.addEventListener('click', () => this.game.showScene(button.dataset.scene));
    });
    document.querySelector('#openBox').addEventListener('click', () => this.game.openBox());
    document.querySelector('#claimVictory').addEventListener('click', () => this.game.recordVictory());
  }
}
