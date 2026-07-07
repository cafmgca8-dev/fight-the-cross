export class AudioManager {
  constructor() {
    this.enabled = true;
    this.music = null;
    this.musicSrc = null;
    this.pendingMusic = null;
    this.unlockBound = false;
    this.handleUnlock = () => this.retryPendingMusic();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) this.stopMusic();
    else this.retryPendingMusic();
  }

  tap() {
    if (!this.enabled || !window.AudioContext) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 420;
    gain.gain.value = 0.03;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.05);
  }

  playEffect(src, options = {}) {
    if (!this.enabled) return null;
    const config = { volume: 0.72, playbackRate: 1, startTime: 0, stopAfter: 0, ...options };
    const sound = new Audio(src);
    sound.volume = config.volume;
    sound.playbackRate = config.playbackRate;
    const stop = () => {
      if (config.stopAfter <= 0) return;
      window.setTimeout(() => {
        sound.pause();
        sound.currentTime = 0;
      }, config.stopAfter);
    };
    const play = () => {
      const promise = sound.play();
      if (promise?.catch) promise.catch(() => {});
      stop();
    };
    if (config.startTime > 0) {
      sound.addEventListener('loadedmetadata', () => {
        try {
          sound.currentTime = Math.min(config.startTime, Math.max(0, sound.duration - 0.05));
        } catch {}
        play();
      }, { once: true });
      sound.load();
    } else {
      play();
    }
    return sound;
  }

  playMusic(src, options = {}) {
    const config = { loop: true, volume: 0.45, ...options };
    this.pendingMusic = { src, options: config };
    if (!this.enabled) return;
    if (this.musicSrc !== src) {
      this.stopCurrentMusic();
      this.music = new Audio(src);
      this.musicSrc = src;
      this.music.loop = config.loop;
      this.music.volume = config.volume;
      this.music.preload = 'auto';
    }
    this.music.loop = config.loop;
    this.music.volume = config.volume;
    const promise = this.music.play();
    if (promise?.catch) promise.catch(() => this.waitForUnlock());
  }

  stopMusic() {
    this.pendingMusic = null;
    this.stopCurrentMusic();
  }

  stopCurrentMusic() {
    if (!this.music) return;
    this.music.pause();
    this.music.currentTime = 0;
    this.music = null;
    this.musicSrc = null;
  }

  retryPendingMusic() {
    if (!this.pendingMusic || !this.enabled) return;
    const { src, options } = this.pendingMusic;
    this.playMusic(src, options);
  }

  waitForUnlock() {
    if (this.unlockBound) return;
    this.unlockBound = true;
    const unlock = () => {
      this.unlockBound = false;
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
      this.handleUnlock();
    };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
  }
}
