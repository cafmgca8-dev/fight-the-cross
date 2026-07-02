export class InputManager { normalizeCode(value) { return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); } }
