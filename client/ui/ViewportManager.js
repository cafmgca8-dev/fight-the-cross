export class ViewportManager {
  constructor() {
    this.activated = false;
    this.overlay = null;
    this.boundActivate = () => this.activate();
    this.boundUpdate = () => this.updateOverlay();
  }

  install() {
    this.createOverlay();
    this.updateOverlay();
    this.activate();
    window.addEventListener('resize', this.boundUpdate);
    window.addEventListener('orientationchange', this.boundUpdate);
    document.addEventListener('pointerdown', this.boundActivate, { once: true });
    document.addEventListener('keydown', this.boundActivate, { once: true });
  }

  async activate() {
    this.activated = true;
    document.body.classList.add('viewport-activated');
    await this.enterFullscreen();
    await this.lockLandscape();
    this.updateOverlay();
  }

  async enterFullscreen() {
    try {
      if (document.fullscreenEnabled && !document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {}
  }

  async lockLandscape() {
    try {
      await screen.orientation?.lock?.('landscape');
    } catch {}
  }

  createOverlay() {
    if (this.overlay) return;
    this.overlay = document.createElement('section');
    this.overlay.className = 'viewport-gate';
    this.overlay.innerHTML =
      '<div>' +
      '<strong>가로 화면으로 시작</strong>' +
      '<span>화면을 가로로 돌린 뒤 한 번 터치하면 전체화면으로 전환됩니다.</span>' +
      '<button class="btn warning" type="button">전체화면 시작</button>' +
      '</div>';
    this.overlay.querySelector('button').addEventListener('click', this.boundActivate);
    document.body.appendChild(this.overlay);
  }

  updateOverlay() {
    if (!this.overlay) return;
    const isSmallScreen = window.matchMedia('(max-width: 900px)').matches;
    const isPortrait = window.matchMedia('(orientation: portrait)').matches;
    const needsGesture = !this.activated && isSmallScreen;
    const needsRotation = isSmallScreen && isPortrait;
    this.overlay.classList.toggle('visible', needsGesture || needsRotation);
  }
}
