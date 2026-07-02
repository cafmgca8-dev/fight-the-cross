export class UIManager {
  constructor(root, animationManager, audioManager) {
    this.root = root;
    this.animationManager = animationManager;
    this.audioManager = audioManager;
  }

  render(html) {
    this.root.innerHTML = html;
    this.animationManager.transitionIn(this.root.firstElementChild);
    this.root.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', () => {
        this.animationManager.press(button);
        this.audioManager.tap();
      });
    });
  }

  statusBar(room, networkState) {
    const model = this.createStatusModel(room, networkState);
    return '<section class="status-bar" aria-label="서버 상태">' +
      this.statusItem('서버 상태', model.openText, 'server') +
      this.statusItem('방 코드', model.code, 'code') +
      this.statusItem('현재 인원', model.count, 'players') +
      this.statusItem('Ping', model.ping, 'ping') +
      '</section>';
  }

  updateStatusBar(room, networkState) {
    const model = this.createStatusModel(room, networkState);
    this.setStatusValue('server', model.openText);
    this.setStatusValue('code', model.code);
    this.setStatusValue('players', model.count);
    this.setStatusValue('ping', model.ping);
  }

  createStatusModel(room, networkState) {
    return {
      openText: room ? '열림' : '닫힘',
      code: room?.code || '-',
      count: room ? room.players.length + ' / ' + room.maxPlayers : '0 / 5',
      ping: networkState.ping
    };
  }

  statusItem(label, value, key) {
    return '<div class="status-item"><span class="status-label">' + label + '</span><span class="status-value" data-status-value="' + key + '">' + value + '</span></div>';
  }

  setStatusValue(key, value) {
    const element = this.root.querySelector('[data-status-value="' + key + '"]');
    if (element && element.textContent !== value) element.textContent = value;
  }
}
