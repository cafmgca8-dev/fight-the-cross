export class ModeManager {
  constructor(settings) { this.modes = new Map(settings.modes.map((mode) => [mode.id, mode])); this.selectedModeId = settings.game.defaultMode; }
  getAll() { return Array.from(this.modes.values()); }
  getSelected() { return this.modes.get(this.selectedModeId); }
  select(modeId) { if (this.modes.has(modeId)) this.selectedModeId = modeId; return this.getSelected(); }
}
