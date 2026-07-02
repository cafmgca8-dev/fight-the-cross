export class AnimationManager {
  press(element) { element.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.96)' }, { transform: 'scale(1)' }], { duration: 180, easing: 'ease-out' }); }
  transitionIn(element) { if (!element) return; element.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 220, easing: 'ease-out' }); }
}
