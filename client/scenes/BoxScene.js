export class BoxScene {
  constructor(game) {
    this.game = game;
    this.revealOverlay = null;
    this.isRevealing = false;
  }

  render() {
    this.closeRevealOverlay();
    this.game.ui.render('<main class="screen box-screen">' +
      this.game.ui.statusBar(this.game.room, this.game.network.state) +
      '<div class="nav-row"><button class="btn secondary" data-scene="main">홈</button><button class="btn secondary" data-scene="characters">캐릭터</button></div>' +
      '<section class="panel box-panel"><h2>상자</h2>' +
      '<div class="stat-list">' +
      '<div class="stat"><span>보유 상자</span><strong id="boxCount">' + this.game.save.boxes + '</strong></div>' +
      '<div class="stat"><span>승리 수</span><strong>' + this.game.save.wins + '</strong></div>' +
      '<div class="stat"><span>코인</span><strong id="coinCount">' + this.game.save.coins + '</strong></div>' +
      '</div>' +
      '<div class="box-preview"><img src="/assets/ui/box-closed.png" alt="상자"></div>' +
      '<div class="button-grid"><button id="claimVictory" class="btn">승리 보상 테스트</button><button id="openBox" class="btn warning">상자 열기</button></div>' +
      '</section>' +
      '<section class="message-log">' + this.game.message + '</section>' +
      '</main>');

    document.querySelectorAll('[data-scene]').forEach((button) => {
      button.addEventListener('click', () => this.game.showScene(button.dataset.scene));
    });
    document.querySelector('#openBox').addEventListener('click', () => this.startReveal());
    document.querySelector('#claimVictory').addEventListener('click', () => this.game.recordVictory());
  }

  startReveal() {
    if (this.isRevealing) return;
    if (this.game.save.boxes <= 0) {
      this.game.message = '열 수 있는 상자가 없습니다.';
      this.game.refresh();
      return;
    }

    this.isRevealing = true;
    const overlay = document.createElement('div');
    overlay.className = 'box-reveal-overlay is-ready';
    overlay.innerHTML =
      '<div class="box-reveal-stage">' +
      '<img class="box-reveal-image" src="/assets/ui/box-closed.png" alt="닫힌 상자">' +
      '<div class="box-reveal-hint">화면을 눌러 상자 열기</div>' +
      '</div>';
    document.body.appendChild(overlay);
    this.revealOverlay = overlay;

    overlay.addEventListener('click', () => this.openRevealBox(), { once: true });
  }

  openRevealBox() {
    if (!this.revealOverlay) return;
    const overlay = this.revealOverlay;
    const image = overlay.querySelector('.box-reveal-image');
    const hint = overlay.querySelector('.box-reveal-hint');
    overlay.classList.add('is-shaking');
    if (hint) hint.textContent = '상자 여는 중...';

    window.setTimeout(() => {
      const result = this.game.boxManager.open(this.game.save);
      this.game.save = result.save;
      this.game.message = result.message;
      this.game.persist();
      this.game.network.openBox({ reward: result.reward, save: this.game.save });

      overlay.classList.remove('is-shaking');
      overlay.classList.add('is-open');
      if (image) {
        image.src = '/assets/ui/box-open.png';
        image.alt = '열린 상자';
      }
      if (hint) hint.remove();
      this.renderReward(overlay, result.reward);
      this.updateCounters();
    }, 720);
  }

  renderReward(overlay, reward) {
    const showReward = () => {
      const rewardNode = document.createElement('div');
      rewardNode.className = 'box-reward-text';
      if (reward?.type === 'coins') {
        const image = overlay.querySelector('.box-reveal-image');
        if (image) {
          image.src = '/assets/ui/reward-gold.png';
          image.alt = '골드 보상';
        }
        rewardNode.innerHTML = '<span>골드 획득</span><strong>+' + reward.amount + '</strong><small>화면을 누르면 돌아갑니다</small>';
      } else if (reward?.type === 'character') {
        rewardNode.innerHTML = '<span>신규 캐릭터 획득</span><strong>' + reward.name + '</strong><small>화면을 누르면 돌아갑니다</small>';
      } else {
        rewardNode.innerHTML = '<span>보상 획득</span><strong>완료</strong><small>화면을 누르면 돌아갑니다</small>';
      }
      overlay.querySelector('.box-reveal-stage')?.appendChild(rewardNode);
      overlay.addEventListener('click', () => {
        this.closeRevealOverlay();
        this.game.refresh();
      }, { once: true });
    };

    window.setTimeout(showReward, reward?.type === 'coins' ? 620 : 220);
  }

  updateCounters() {
    const boxCount = document.querySelector('#boxCount');
    const coinCount = document.querySelector('#coinCount');
    if (boxCount) boxCount.textContent = this.game.save.boxes;
    if (coinCount) coinCount.textContent = this.game.save.coins;
  }

  closeRevealOverlay() {
    this.revealOverlay?.remove();
    this.revealOverlay = null;
    this.isRevealing = false;
  }
}
