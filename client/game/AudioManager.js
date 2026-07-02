export class AudioManager {
  constructor() { this.enabled = true; }
  setEnabled(enabled) { this.enabled = enabled; }
  tap() { if (!this.enabled || !window.AudioContext) return; const context = new AudioContext(); const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.frequency.value = 420; gain.gain.value = 0.03; oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.05); }
}
