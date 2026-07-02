export class NetworkManager {
  constructor() {
    this.socket = window.io ? window.io() : null;
    this.listeners = new Map();
    this.state = { connected: false, ping: '-' };
    this.lastPingAt = 0;
  }

  connect() {
    if (!this.socket) return;
    this.socket.on('connect', () => {
      this.state.connected = true;
      this.emitLocal('connectionChanged', this.state);
      this.startPing();
    });
    this.socket.on('disconnect', () => {
      this.state.connected = false;
      this.state.ping = '-';
      this.emitLocal('connectionChanged', this.state);
    });
    ['roomCreated', 'roomJoined', 'roomUpdated', 'serverClosed', 'message'].forEach((event) => this.forward(event));
    this.socket.on('pongCheck', () => {
      this.state.ping = String(Date.now() - this.lastPingAt) + 'ms';
      this.emitLocal('pingChanged', this.state);
    });
  }

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(handler);
  }

  emitLocal(event, payload) {
    this.listeners.get(event)?.forEach((handler) => handler(payload));
  }

  forward(event) {
    this.socket?.on(event, (payload) => this.emitLocal(event, payload));
  }

  createRoom(payload) { this.socket?.emit('createRoom', payload); }
  joinRoom(payload) { this.socket?.emit('joinRoom', payload); }
  closeRoom(payload) { this.socket?.emit('closeRoom', payload); }
  changeMode(payload) { this.socket?.emit('changeMode', payload); }
  chooseCharacter(payload) { this.socket?.emit('chooseCharacter', payload); }
  startGame(payload) { this.socket?.emit('startGame', payload); }
  openBox(payload) { this.socket?.emit('openBox', payload); }
  levelUp(payload) { this.socket?.emit('levelUp', payload); }
  claimVictory(payload) { this.socket?.emit('claimVictory', payload); }

  startPing() {
    if (this.pingTimer) return;
    this.pingTimer = window.setInterval(() => {
      if (!this.socket?.connected) return;
      this.lastPingAt = Date.now();
      this.socket.emit('pingCheck');
    }, 2500);
  }
}
