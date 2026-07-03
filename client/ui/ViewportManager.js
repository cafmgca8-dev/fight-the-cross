export class ViewportManager {
  constructor() {
    this.activated = false;
    this.overlay = null;
    this.loadingOverlay = null;
    this.resolveStart = null;
    this.boundActivate = () => this.activateFromGate();
    this.boundUpdate = () => this.updateOverlay();
  }

  start() {
    this.createOverlay();
    this.updateOverlay(true);
    window.addEventListener('resize', this.boundUpdate);
    window.addEventListener('orientationchange', this.boundUpdate);
    return new Promise((resolve) => {
      this.resolveStart = resolve;
    });
  }

  async activateFromGate() {
    if (this.activated) return;
    this.activated = true;
    document.body.classList.add('viewport-activated');
    await this.enterFullscreen();
    await this.lockLandscape();
    this.hideOverlay();
    await this.playLoadingVideo();
    this.resolveStart?.();
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
    this.overlay.className = 'viewport-gate visible';
    this.overlay.innerHTML =
      '<div>' +
      '<strong>가로 화면으로 시작</strong>' +
      '<span>화면을 가로로 돌린 뒤 터치하면 전체화면으로 전환하고 로딩을 시작합니다.</span>' +
      '<button class="btn warning" type="button">시작</button>' +
      '</div>';
    this.overlay.addEventListener('click', this.boundActivate);
    document.body.appendChild(this.overlay);
  }

  hideOverlay() {
    if (!this.overlay) return;
    this.overlay.classList.remove('visible');
    this.overlay.removeEventListener('click', this.boundActivate);
  }

  updateOverlay(forceVisible = false) {
    if (!this.overlay || this.activated) return;
    this.overlay.classList.toggle('visible', forceVisible || true);
  }

  async playLoadingVideo() {
    this.createLoadingOverlay();
    const video = this.loadingOverlay.querySelector('video');
    this.loadingOverlay.classList.add('visible');
    video.currentTime = 0;
    try {
      await video.play();
      await new Promise((resolve) => {
        const finish = () => {
          video.removeEventListener('ended', finish);
          video.removeEventListener('error', finish);
          resolve();
        };
        video.addEventListener('ended', finish, { once: true });
        video.addEventListener('error', finish, { once: true });
      });
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    this.loadingOverlay.classList.remove('visible');
    video.pause();
  }

  createLoadingOverlay() {
    if (this.loadingOverlay) return;
    this.loadingOverlay = document.createElement('section');
    this.loadingOverlay.className = 'loading-video-screen';
    this.loadingOverlay.innerHTML =
      '<video src="/assets/ui/intro-loading.mp4" playsinline preload="auto"></video>';
    document.body.appendChild(this.loadingOverlay);
  }
}
