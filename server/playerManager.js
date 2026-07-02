export class PlayerManager {
  constructor(settings) {
    this.settings = settings;
  }

  create(socket, payload, isHost = false) {
    return {
      id: socket.id,
      nickname: payload.nickname || '플레이어',
      isHost,
      selectedCharacterId: payload.selectedCharacterId || this.settings.starterCharacters[0],
      ready: false
    };
  }
}
