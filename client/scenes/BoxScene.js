export class BoxScene {
  constructor(game) {
    this.game = game;
    this.revealOverlay = null;
    this.isRevealing = false;
    this.revealType = null;
  }

  render() {
    this.closeRevealOverlay();
    this.game.ui.render('<main class="screen box-screen">' +
      this.game.ui.statusBar(this.game.room, this.game.network.state) +
      '<div class="nav-row"><button class="btn secondary" data-scene="main">홈</button><button class="btn secondary" data-scene="characters">캐릭터</button></div>' +
      '<section class="panel box-panel">' +
      '<div class="box-title-row"><div><span class="box-eyebrow">REWARD BOX</span><h2>상자</h2></div><strong class="box-count-pill">' + this.game.save.boxes + '개</strong></div>' +
      '<div class="stat-list">' +
      '<div class="stat"><span>보유 상자</span><strong id="boxCount">' + this.game.save.boxes + '</strong></div>' +
      '<div class="stat"><span>승리 수</span><strong>' + this.game.save.wins + '</strong></div>' +
      '<div class="stat"><span>코인</span><strong id="coinCount">' + this.game.save.coins + '</strong></div>' +
      '</div>' +
      '<div class="box-preview"><div class="box-preview-aura"></div><img src="/assets/ui/box-closed.png" alt="상자"></div>' +
      '<div class="button-grid box-actions"><button id="claimVictory" class="btn">승리 보상 테스트</button><button id="openBox" class="btn warning">상자 열기</button><button id="openGuaranteedBox" class="btn character-box-btn">500골드 확정 캐릭터</button></div>' +
      '</section>' +
      '<button id="openGuaranteedBoxMobile" class="btn character-box-btn mobile-guaranteed-box-btn">500골드 확정 캐릭터</button>' +
      '<section class="message-log">' + this.game.message + '</section>' +
      '</main>');

    document.querySelectorAll('[data-scene]').forEach((button) => {
      button.addEventListener('click', () => this.game.showScene(button.dataset.scene));
    });
    document.querySelector('#openBox').addEventListener('click', () => this.startReveal());
    document.querySelector('#claimVictory').addEventListener('click', () => this.game.recordVictory());
    document.querySelectorAll('#openGuaranteedBox, #openGuaranteedBoxMobile').forEach((button) => {
      button.addEventListener('click', () => this.startReveal('guaranteed_character'));
    });
  }

  startReveal(type = 'basic') {
    if (this.isRevealing) return;
    if (type === 'basic' && this.game.save.boxes <= 0) {
      this.game.message = '열 수 있는 상자가 없습니다.';
      this.game.refresh();
      return;
    }
    if (type === 'guaranteed_character' && this.game.save.coins < 500) {
      this.game.message = '500골드가 필요합니다.';
      this.game.refresh();
      return;
    }
    if (type === 'guaranteed_character' && this.game.boxManager.getCharacterCandidates(this.game.save, { onlyLocked: true }).length <= 0) {
      this.game.message = '획득 가능한 새 캐릭터가 없습니다.';
      this.game.refresh();
      return;
    }

    this.isRevealing = true;
    this.revealType = type;
    const closedImage = type === 'guaranteed_character' ? '/assets/ui/guaranteed-character-box-closed.png' : '/assets/ui/box-closed.png';
    const overlay = document.createElement('div');
    overlay.className = 'box-reveal-overlay is-ready';
    overlay.innerHTML =
      '<div class="box-reveal-stage">' +
      '<img class="box-reveal-image" src="' + closedImage + '" alt="상자">' +
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
    const type = this.revealType || 'basic';
    const openImage = type === 'guaranteed_character' ? '/assets/ui/guaranteed-character-box-open.png' : '/assets/ui/box-open.png';
    overlay.classList.add('is-shaking');
    this.game.audio.playEffect('/assets/audio/box-shake-boing.wav', { volume: 0.78 });
    if (hint) hint.textContent = '상자 여는 중...';

    window.setTimeout(() => {
      const result = type === 'guaranteed_character'
        ? this.game.boxManager.openGuaranteedCharacter(this.game.save, 500)
        : this.game.boxManager.open(this.game.save);
      this.game.save = result.save;
      this.game.message = result.message;
      this.game.persist();
      this.game.network.openBox({ reward: result.reward, save: this.game.save });

      overlay.classList.remove('is-shaking');
      overlay.classList.add('is-open');
      if (image) {
        image.src = openImage;
        image.alt = '열린 상자';
      }
      if (hint) hint.remove();
      this.renderReward(overlay, result.reward);
      this.updateCounters();
    }, 720);
  }

  renderReward(overlay, reward) {
    window.setTimeout(() => {
      const rewardNode = document.createElement('div');
      rewardNode.className = 'box-reward-text';

      if (reward?.type === 'coins') {
        const image = overlay.querySelector('.box-reveal-image');
        if (image) {
          image.src = '/assets/ui/reward-gold.png';
          image.alt = '골드 보상';
        }
        rewardNode.innerHTML = '<span>골드 획득</span><strong>+' + reward.amount + '</strong><small>화면을 누르면 돌아갑니다</small>';
        overlay.querySelector('.box-reveal-stage')?.appendChild(rewardNode);
        this.enableCloseOnTap(overlay);
        return;
      }

      if (reward?.type === 'character') {
        rewardNode.innerHTML = '<span>신규 캐릭터 획득</span><strong>' + reward.name + '</strong><small>화면을 누르면 돌아갑니다</small>';
        overlay.querySelector('.box-reveal-stage')?.appendChild(rewardNode);
        this.showCharacterRewardVisual(overlay, reward, () => this.enableCloseOnTap(overlay));
        return;
      }

      rewardNode.innerHTML = '<span>보상 획득</span><strong>완료</strong><small>화면을 누르면 돌아갑니다</small>';
      overlay.querySelector('.box-reveal-stage')?.appendChild(rewardNode);
      this.enableCloseOnTap(overlay);
    }, reward?.type === 'coins' ? 620 : 300);
  }

  showCharacterRewardVisual(overlay, reward, onReadyToClose) {
    const specialImage = this.getCharacterRewardImage(reward?.characterId);
    this.showCharacterUnlockVideo(overlay, () => {
      if (specialImage) {
        this.showCharacterRewardImage(overlay, specialImage.src, specialImage.alt);
      }
      onReadyToClose?.();
    });
  }

  getCharacterRewardImage(characterId) {
    if (characterId === 'kiseong') return { src: '/assets/ui/reward-kiseong.png', alt: '기성 획득' };
    if (characterId === 'hyoseong') return { src: '/assets/ui/reward-hyoseong.png', alt: '효성 획득' };
    const character = this.game.characterManager.getById(characterId);
    if (character?.image || character?.portrait) return { src: character.image || character.portrait, alt: character.name + ' 획득' };
    return null;
  }

  showCharacterRewardImage(overlay, src, alt) {
    const visual = overlay.querySelector('.box-reveal-video, .box-reveal-image, .box-reveal-character-image');
    if (!visual) return;
    const image = document.createElement('img');
    image.className = 'box-reveal-character-image';
    image.src = src;
    image.alt = alt;
    visual.replaceWith(image);
  }

  showCharacterUnlockVideo(overlay, onEnded) {
    overlay.classList.add('is-character-reward');
    const image = overlay.querySelector('.box-reveal-image');
    if (!image) {
      onEnded?.();
      return;
    }

    const video = document.createElement('video');
    video.className = 'box-reveal-video';
    video.src = '/assets/ui/character-unlock.mp4';
    video.autoplay = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('playsinline', '');
    image.replaceWith(video);

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      onEnded?.();
    };
    video.addEventListener('ended', finish, { once: true });
    window.setTimeout(finish, 3400);
    video.play().catch(() => window.setTimeout(finish, 900));
  }

  enableCloseOnTap(overlay) {
    window.setTimeout(() => {
      overlay.addEventListener('click', () => {
        this.closeRevealOverlay();
        this.game.refresh();
      }, { once: true });
    }, 180);
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
    this.revealType = null;
  }
}
