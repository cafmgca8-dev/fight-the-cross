export class LobbyScene {
  constructor(game) {
    this.game = game;
  }

  render() {
    const room = this.game.room;
    const players = room?.players?.map((player, index) => {
      const host = player.isHost ? '<em>HOST</em>' : '<em>PLAYER</em>';
      return '<div class="desert-player"><i>' + String(index + 1).padStart(2, '0') + '</i><span>' + player.nickname + '</span>' + host + '<strong>' + (player.selectedCharacterId || '-') + '</strong></div>';
    }).join('') || '<div class="desert-player empty"><i>--</i><span>아직 참가한 플레이어가 없습니다.</span><em>WAIT</em><strong>-</strong></div>';

    const modes = this.game.modeManager.getAll().map((mode) => {
      const selected = room?.modeId === mode.id || (!room && this.game.modeManager.selectedModeId === mode.id);
      return '<button class="desert-mode ' + (selected ? 'selected' : '') + '" data-mode="' + mode.id + '"><span>' + mode.name + '</span><strong>' + mode.minPlayers + '-' + mode.maxPlayers + '명</strong></button>';
    }).join('');

    this.game.ui.render(
      '<main class="desert-screen desert-lobby">' +
        '<div class="desert-shade"></div>' +
        '<section class="desert-content lobby-content">' +
          this.game.ui.statusBar(room, this.game.network.state) +
          '<header class="lobby-topline">' +
            '<div><span class="desert-kicker">READY ROOM</span><h1>전투 로비</h1></div>' +
            '<nav class="desert-menu compact"><button class="btn desert-ghost" data-scene="main">홈</button><button class="btn desert-ghost" data-scene="characters">캐릭터</button></nav>' +
          '</header>' +
          '<section class="lobby-grid">' +
            '<div class="desert-dock"><div class="dock-head"><strong>플레이어</strong><span>최대 5명까지 참가할 수 있습니다.</span></div><div class="desert-list">' + players + '</div></div>' +
            '<div class="desert-dock"><div class="dock-head"><strong>모드 선택</strong><span>호스트만 모드를 바꿀 수 있습니다.</span></div><div class="desert-list mode-list">' + modes + '</div><button id="startGame" class="btn desert-primary wide">게임 시작</button></div>' +
          '</section>' +
          '<section class="desert-message">' + this.game.message + '</section>' +
        '</section>' +
      '</main>'
    );
    this.bind();
  }

  bind() {
    document.querySelectorAll('[data-scene]').forEach((button) => {
      button.addEventListener('click', () => this.game.showScene(button.dataset.scene));
    });
    document.querySelectorAll('[data-mode]').forEach((button) => {
      button.addEventListener('click', () => this.game.changeMode(button.dataset.mode));
    });
    document.querySelector('#startGame').addEventListener('click', () => this.game.startGame());
  }
}
