export class MainScene {
  constructor(game) {
    this.game = game;
  }

  render() {
    const ui = this.game.ui;
    ui.render(
      '<main class="desert-screen desert-main">' +
        '<div class="desert-shade"></div>' +
        '<section class="desert-content">' +
          ui.statusBar(this.game.room, this.game.network.state) +
          '<section class="desert-title">' +
            '<span class="desert-kicker">MULTIPLAYER BATTLE</span>' +
            '<h1>남매사기단<br>파이트 더 크로스</h1>' +
          '</section>' +
          '<section class="desert-dock code-dock" aria-label="방 코드 입력">' +
            '<div class="dock-head"><strong>방 코드</strong><span>호스트가 방을 열거나 참가 코드를 입력하세요.</span></div>' +
            '<div class="desert-fields">' +
              '<label><span>Host Code</span><input id="hostCode" class="input desert-input" placeholder="예: ABCD" maxlength="6" autocomplete="off"></label>' +
              '<label><span>Join Code</span><input id="joinCode" class="input desert-input" placeholder="참가 코드" maxlength="6" autocomplete="off"></label>' +
            '</div>' +
            '<div class="desert-actions">' +
              '<button id="openServer" class="btn desert-primary">서버 열기</button>' +
              '<button id="joinServer" class="btn desert-gold">참가하기</button>' +
              '<button id="closeServer" class="btn desert-danger">서버 닫기</button>' +
              '<button id="showLobby" class="btn desert-ghost">로비</button>' +
            '</div>' +
          '</section>' +
          '<nav class="desert-menu" aria-label="메뉴">' +
            '<button data-scene="characters" class="btn desert-ghost">캐릭터</button>' +
            '<button data-scene="boxes" class="btn desert-ghost">상자</button>' +
            '<button data-scene="settings" class="btn desert-ghost">설정</button>' +
          '</nav>' +
          '<section class="desert-message">' + this.game.message + '</section>' +
        '</section>' +
      '</main>'
    );
    this.bind();
  }

  bind() {
    const input = this.game.input;
    document.querySelector('#openServer').addEventListener('click', () => {
      const code = input.normalizeCode(document.querySelector('#hostCode').value) || this.game.createShortCode();
      this.game.network.createRoom({ code, nickname: this.game.save.nickname, selectedCharacterId: this.game.save.selectedCharacterId });
    });
    document.querySelector('#joinServer').addEventListener('click', () => {
      const code = input.normalizeCode(document.querySelector('#joinCode').value);
      this.game.network.joinRoom({ code, nickname: this.game.save.nickname, selectedCharacterId: this.game.save.selectedCharacterId });
    });
    document.querySelector('#closeServer').addEventListener('click', () => {
      if (this.game.room) this.game.network.closeRoom({ code: this.game.room.code });
    });
    document.querySelector('#showLobby').addEventListener('click', () => this.game.showScene('lobby'));
    document.querySelectorAll('[data-scene]').forEach((button) => button.addEventListener('click', () => this.game.showScene(button.dataset.scene)));
  }
}
