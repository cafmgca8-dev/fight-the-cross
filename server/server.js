import express from 'express';
import http from 'node:http';
import { Server } from 'socket.io';
import { readJson, resolveRoot } from './fileStore.js';
import { CharacterManager } from './characterManager.js';
import { PlayerManager } from './playerManager.js';
import { RoomManager } from './roomManager.js';
import { GameManager } from './gameManager.js';
import { BoxManager } from './boxManager.js';
import { SaveManager } from './saveManager.js';

const data = await Promise.all([
  readJson('config/characters.json'),
  readJson('config/boxes.json'),
  readJson('config/settings.json')
]);
const characters = data[0];
const boxes = data[1];
const settings = data[2];

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const characterManager = new CharacterManager(characters);
const playerManager = new PlayerManager(settings);
const roomManager = new RoomManager(settings, playerManager);
const gameManager = new GameManager(settings);
const boxManager = new BoxManager(boxes, settings);
const saveManager = new SaveManager(settings);
await saveManager.loadAll();

app.use(express.json());
app.use('/config', express.static(resolveRoot('config')));
app.use(express.static(resolveRoot('client')));

app.get('/api/health', (req, res) => res.json({ ok: true, title: settings.game.title }));
app.get('/api/characters', (req, res) => res.json(characterManager.list()));
app.get('/api/box-reward', (req, res) => res.json(boxManager.getVictoryReward()));

io.on('connection', (socket) => {
  socket.on('pingCheck', () => socket.emit('pongCheck'));

  socket.on('createRoom', (payload = {}) => handle(socket, () => {
    const room = roomManager.createRoom(socket, payload);
    socket.emit('roomCreated', room);
  }));

  socket.on('joinRoom', (payload = {}) => handle(socket, () => {
    const room = roomManager.joinRoom(socket, payload);
    socket.emit('roomJoined', room);
    socket.to(room.code).emit('roomUpdated', room);
  }));

  socket.on('closeRoom', (payload = {}) => handle(socket, () => {
    const room = roomManager.closeRoom(payload.code, socket.id);
    if (!room) return;
    io.to(room.code).emit('serverClosed', { text: '호스트가 서버를 종료했습니다.' });
    io.in(room.code).socketsLeave(room.code);
  }));

  socket.on('changeMode', (payload = {}) => handle(socket, () => {
    const room = roomManager.setMode(payload.code, socket.id, payload.modeId);
    io.to(room.code).emit('roomUpdated', room);
  }));

  socket.on('chooseCharacter', (payload = {}) => handle(socket, () => {
    if (payload.characterId && !characterManager.has(payload.characterId)) throw new Error('존재하지 않는 캐릭터입니다.');
    const room = roomManager.chooseCharacter(payload.code, socket.id, payload.characterId);
    if (room) io.to(room.code).emit('roomUpdated', room);
  }));

  socket.on('startGame', (payload = {}) => handle(socket, () => {
    const room = roomManager.get(payload.code);
    if (room) {
      const player = room.players.find((item) => item.id === socket.id);
      if (player && payload.selectedCharacterId) player.selectedCharacterId = payload.selectedCharacterId;
    }
    const result = gameManager.canStart(room, socket.id);
    if (!result.ok) throw new Error(result.reason);
    io.to(room.code).emit('message', { text: result.mode.name + ' 게임을 시작합니다.' });
    io.to(room.code).emit('gameStarted', { room, mode: result.mode, startedAt: Date.now() });
  }));

  socket.on('playerState', (payload = {}) => handle(socket, () => {
    const room = roomManager.get(payload.code);
    if (!room) return;
    socket.to(room.code).emit('playerState', { ...payload, playerId: socket.id });
  }));

  socket.on('playerAttack', (payload = {}) => handle(socket, () => {
    const room = roomManager.get(payload.code);
    if (!room) return;
    socket.to(room.code).emit('playerAttack', { ...payload, playerId: socket.id });
  }));

  socket.on('claimVictory', (payload = {}) => handle(socket, async () => {
    await saveManager.savePlayer(socket.id, payload.save);
  }));

  socket.on('openBox', (payload = {}) => handle(socket, async () => {
    await saveManager.savePlayer(socket.id, payload.save);
  }));

  socket.on('levelUp', (payload = {}) => handle(socket, async () => {
    await saveManager.savePlayer(socket.id, payload.save);
  }));

  socket.on('disconnect', () => {
    const changes = roomManager.leaveBySocket(socket.id);
    for (const change of changes) {
      if (change.closed) io.to(change.room.code).emit('serverClosed', { text: '호스트가 서버를 종료했습니다.' });
      else io.to(change.room.code).emit('roomUpdated', change.room);
    }
  });
});

function handle(socket, action) {
  Promise.resolve().then(action).catch((error) => socket.emit('message', { text: error.message }));
}

const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => {
  console.log(settings.game.title + ' server listening on http://localhost:' + port);
});
