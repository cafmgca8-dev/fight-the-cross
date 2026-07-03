export class GameScene {
  constructor(game) {
    this.game = game;
    this.keys = new Set();
    this.touchVector = { x: 0, y: 0 };
    this.attackVector = { x: 0, y: -1, power: 0 };
    this.isAiming = false;
    this.movePointerId = null;
    this.movePadBase = null;
    this.moveAnchor = null;
    this.attackPointerId = null;
    this.attackStart = null;
    this.lastTime = 0;
    this.attackCooldown = 0;
    this.finished = false;
    this.frameId = null;
    this.stateSendTimer = 0;
    this.networkUnsubs = [];
    this.isMultiplayer = false;
    this.camera = { x: 0, y: 0, width: 980, height: 552 };
  }

  render() {
    const mode = this.game.getActiveMode();
    const map = this.game.mapManager.getForMode(mode.id);
    this.map = map;
    this.game.ui.render('<main class="game-screen">' +
      '<section class="game-hud">' +
      '<button id="exitGame" class="btn secondary">나가기</button>' +
      '<div><strong>' + mode.name + '</strong><span>' + map.name + '</span></div>' +
      '<div><strong id="aliveCount">5명 생존</strong><span id="gameTimer">00:00</span></div>' +
      '</section>' +
      '<section class="arena-wrap"><canvas id="gameCanvas" class="game-canvas"></canvas></section>' +
      '<section class="mobile-controls">' +
      '<div id="movePad" class="move-pad"><span></span></div>' +
      '<div id="attackPad" class="attack-pad"><span></span><b>공격</b></div>' +
      '</section>' +
      '<section class="rotate-hint"><strong>가로로 돌려주세요</strong><span>전투는 가로 화면에 맞춰져 있습니다.</span></section>' +
      '<section id="gameBanner" class="game-banner"></section>' +
      '</main>');

    this.canvas = document.querySelector('#gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.banner = document.querySelector('#gameBanner');
    this.aliveCount = document.querySelector('#aliveCount');
    this.gameTimer = document.querySelector('#gameTimer');
    this.exitButton = document.querySelector('#exitGame');
    this.movePad = document.querySelector('#movePad');
    this.attackPad = document.querySelector('#attackPad');
    this.resize();
    this.setupMatch();
    this.bind();
    this.tryLandscapeFullscreen();
    Promise.all([
      this.loadImage(map.image),
      map.collisionMask ? this.loadImage(map.collisionMask) : Promise.resolve(null)
    ]).then(([image, maskImage]) => {
      this.mapImage = image;
      this.setMaskImage(maskImage);
      this.lastTime = performance.now();
      this.loop(this.lastTime);
    });
  }

  setupMatch() {
    const owned = this.game.characterManager.getOwned(this.game.save);
    const all = this.game.characterManager.getAll();
    const spawns = this.map.spawnPoints;
    const myId = this.game.network.getId();
    const roomPlayers = this.game.room?.players || [];
    this.isMultiplayer = roomPlayers.length > 0;

    if (this.isMultiplayer) {
      this.entities = roomPlayers.map((player, index) => {
        const character = this.game.characterManager.getById(player.selectedCharacterId) || owned[0] || all[0];
        const spawn = spawns[index % spawns.length];
        return this.createEntity(player.id, player.nickname || '플레이어', character, spawn, player.id === myId);
      });
      if (!this.entities.some((entity) => entity.controlled)) {
        const character = this.game.characterManager.getById(this.game.save.selectedCharacterId) || owned[0] || all[0];
        const spawn = spawns[this.entities.length % spawns.length];
        this.entities.push(this.createEntity(myId, this.game.save.nickname || '플레이어', character, spawn, true));
      }
    } else {
      const playerCharacter = this.game.characterManager.getById(this.game.save.selectedCharacterId) || owned[0] || all[0];
      const botCharacters = all.filter((character) => character.id !== playerCharacter.id);
      this.entities = [this.createEntity('player', this.game.save.nickname || '플레이어', playerCharacter, spawns[0], true)];
      for (let i = 1; i < 5; i += 1) {
        const character = botCharacters[(i - 1) % botCharacters.length] || all[i % all.length];
        this.entities.push(this.createEntity('bot' + i, '상대 ' + i, character, spawns[i], false));
      }
    }

    this.projectiles = [];
    this.effects = [];
    this.startedAt = performance.now();
    this.finished = false;
    this.attackCooldown = 0;
    this.stateSendTimer = 0;
    this.snapCameraToPlayer();
  }

  createEntity(id, name, character, spawn, controlled) {
    const stats = this.game.levelManager.applyLevel(character, controlled ? (this.game.save.characters[character.id]?.level || 1) : 1);
    return {
      id, name, character, controlled, x: spawn.x, y: spawn.y, radius: 24,
      hp: stats.hp, maxHp: stats.hp,
      damage: stats.basicDamage,
      speed: controlled ? 250 : 210,
      color: controlled ? '#36d6a5' : ['#ff5f6d', '#ffcc4d', '#7aa7ff', '#ff75c8'][Number(id.replace('bot', '')) - 1] || '#fff',
      alive: true, dirX: 0, dirY: -1, attackTimer: 0, ammo: 3, maxAmmo: 3, ammoReloadTimer: 0
    };
  }

  bind() {
    this.onResize = () => this.resize();
    this.onKeyDown = (event) => {
      this.keys.add(event.key.toLowerCase());
      const player = this.getControlledEntity();
      if (event.code === 'Space' && player) this.performAttack(player, player.dirX || 0, player.dirY || -1);
    };
    this.onKeyUp = (event) => this.keys.delete(event.key.toLowerCase());
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.exitButton.addEventListener('click', () => this.endScene());
    this.bindMovePad();
    this.bindAttackPad();
    this.bindMultiplayer();
  }

  bindMovePad() {
    const knob = this.movePad.querySelector('span');
    const maxDistance = 54;
    const reset = () => {
      this.movePointerId = null;
      this.movePadBase = null;
      this.touchVector = { x: 0, y: 0 };
      knob.style.transform = 'translate(-50%, -50%)';
    };
    const setAnchorFromPad = () => {
      const rect = this.movePad.getBoundingClientRect();
      this.moveAnchor = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };
    const update = (point) => {
      if (!this.movePadBase) this.movePadBase = this.moveAnchor || { x: point.clientX, y: point.clientY };
      const dx = point.clientX - this.movePadBase.x;
      const dy = point.clientY - this.movePadBase.y;
      const rawLength = Math.hypot(dx, dy);
      const length = Math.min(maxDistance, rawLength);
      const angle = Math.atan2(dy, dx);
      const x = rawLength < 1 ? 0 : Math.cos(angle);
      const y = rawLength < 1 ? 0 : Math.sin(angle);
      const power = length / maxDistance;
      this.touchVector = { x: x * power, y: y * power };
      knob.style.transform = 'translate(calc(-50% + ' + x * length + 'px), calc(-50% + ' + y * length + 'px))';
    };
    const canStartMove = (event) => {
      if (event.target.closest('#attackPad, #exitGame, .game-hud')) return false;
      setAnchorFromPad();
      const dx = event.clientX - this.moveAnchor.x;
      const dy = event.clientY - this.moveAnchor.y;
      return event.clientX < window.innerWidth * 0.58 && Math.hypot(dx, dy) <= 130;
    };
    this.onMovePointerDown = (event) => {
      if (!canStartMove(event)) return;
      event.preventDefault();
      this.movePointerId = event.pointerId;
      this.movePadBase = { ...this.moveAnchor };
      this.movePad.classList.add('active');
      update(event);
    };
    this.onMovePointerMove = (event) => {
      if (event.pointerId === this.movePointerId) update(event);
    };
    this.onMovePointerUp = (event) => {
      if (event.pointerId === this.movePointerId) reset();
    };
    this.movePad.addEventListener('pointerdown', this.onMovePointerDown, { passive: false });
    window.addEventListener('pointermove', this.onMovePointerMove, { passive: false });
    window.addEventListener('pointerup', this.onMovePointerUp);
    window.addEventListener('pointercancel', this.onMovePointerUp);
  }

  bindAttackPad() {
    const knob = this.attackPad.querySelector('span');
    const reset = () => {
      this.attackPointerId = null;
      this.attackStart = null;
      this.isAiming = false;
      this.attackVector.power = 0;
      knob.style.transform = 'translate(-50%, -50%)';
    };
    const update = (point) => {
      const vector = this.padVector(this.attackPad, point, 42);
      const player = this.entities[0];
      this.isAiming = vector.power > 0.12;
      this.attackVector = { x: vector.x, y: vector.y, power: vector.power };
      if (this.isAiming && player) {
        player.dirX = vector.x;
        player.dirY = vector.y;
      }
      knob.style.transform = 'translate(calc(-50% + ' + vector.knobX + 'px), calc(-50% + ' + vector.knobY + 'px))';
    };
    const release = (event) => {
      if (event.pointerId !== this.attackPointerId) return;
      const vector = { ...this.attackVector };
      const start = this.attackStart;
      const moved = start ? Math.hypot(event.clientX - start.x, event.clientY - start.y) : 0;
      reset();
      if (vector.power > 0.18 && moved > 10) {
        this.performAttack(this.getControlledEntity(), vector.x, vector.y);
        return;
      }
      this.autoAttackNearest();
    };
    this.attackPad.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.attackPointerId = event.pointerId;
      this.attackStart = { x: event.clientX, y: event.clientY };
      this.attackPad.setPointerCapture(event.pointerId);
      update(event);
    });
    this.attackPad.addEventListener('pointermove', (event) => {
      if (event.pointerId === this.attackPointerId) update(event);
    });
    this.attackPad.addEventListener('pointerup', release);
    this.attackPad.addEventListener('pointercancel', reset);
    this.attackPad.addEventListener('lostpointercapture', reset);
  }

  padVector(pad, point, maxDistance) {
    const rect = pad.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = point.clientX - cx;
    const dy = point.clientY - cy;
    const rawLength = Math.hypot(dx, dy);
    const length = Math.min(maxDistance, rawLength);
    const angle = Math.atan2(dy, dx);
    const x = rawLength < 1 ? 0 : Math.cos(angle);
    const y = rawLength < 1 ? 0 : Math.sin(angle);
    return { x, y, power: length / maxDistance, knobX: x * length, knobY: y * length };
  }

  bindMultiplayer() {
    this.networkUnsubs.forEach((unsubscribe) => unsubscribe());
    this.networkUnsubs = [];
    if (!this.isMultiplayer) return;

    this.networkUnsubs.push(this.game.network.on('playerState', (payload) => {
      const entity = this.entities.find((item) => item.id === payload.playerId);
      if (!entity || entity.controlled) return;
      entity.x = payload.x;
      entity.y = payload.y;
      entity.hp = payload.hp;
      entity.alive = payload.alive;
      entity.dirX = payload.dirX;
      entity.dirY = payload.dirY;
      if (typeof payload.ammo === 'number') entity.ammo = payload.ammo;
      if (typeof payload.ammoReloadTimer === 'number') entity.ammoReloadTimer = payload.ammoReloadTimer;
    }));

    this.networkUnsubs.push(this.game.network.on('playerAttack', (payload) => {
      const entity = this.entities.find((item) => item.id === payload.playerId);
      if (!entity || entity.controlled) return;
      entity.ammo = Math.max(0, entity.ammo - 1);
      if (entity.ammo < entity.maxAmmo && entity.ammoReloadTimer <= 0) entity.ammoReloadTimer = this.getAttackProfile(entity).reloadTime;
      this.performAttack(entity, payload.dirX, payload.dirY, true, true);
    }));
  }

  broadcastState(delta) {
    if (!this.isMultiplayer || !this.game.room?.code) return;
    this.stateSendTimer -= delta;
    if (this.stateSendTimer > 0) return;
    this.stateSendTimer = 0.05;
    const player = this.getControlledEntity();
    if (!player) return;
    this.game.network.sendPlayerState({
      code: this.game.room.code,
      x: Math.round(player.x),
      y: Math.round(player.y),
      hp: player.hp,
      alive: player.alive,
      dirX: player.dirX,
      dirY: player.dirY,
      ammo: player.ammo,
      ammoReloadTimer: player.ammoReloadTimer
    });
  }

  getControlledEntity() {
    return this.entities.find((entity) => entity.controlled) || this.entities[0];
  }

  tryLandscapeFullscreen() {
    const lock = async () => {
      try {
        if (document.fullscreenEnabled && !document.fullscreenElement && window.innerWidth < 900) await document.documentElement.requestFullscreen();
        await screen.orientation?.lock?.('landscape');
      } catch {}
    };
    this.canvas.addEventListener('pointerdown', lock, { once: true });
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    this.canvas.width = Math.max(320, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(180, Math.floor(rect.height * dpr));
    this.updateCameraSize();
  }

  updateCameraSize() {
    if (!this.canvas) return;
    const aspect = this.canvas.width / this.canvas.height;
    const viewHeight = aspect >= 1.2 ? 390 : 520;
    this.camera.height = viewHeight;
    this.camera.width = viewHeight * aspect;
  }

  snapCameraToPlayer() {
    const player = this.entities?.[0];
    if (!player) return;
    this.camera.x = player.x - this.camera.width / 2;
    this.camera.y = player.y - this.camera.height / 2;
    this.clampCamera();
  }

  updateCamera(delta) {
    const player = this.getControlledEntity();
    if (!player) return;
    const targetX = player.x - this.camera.width / 2;
    const targetY = player.y - this.camera.height / 2;
    const follow = 1 - Math.pow(0.001, delta);
    this.camera.x += (targetX - this.camera.x) * follow;
    this.camera.y += (targetY - this.camera.y) * follow;
    this.clampCamera();
  }

  clampCamera() {
    this.camera.x = Math.max(0, Math.min(this.map.width - this.camera.width, this.camera.x));
    this.camera.y = Math.max(0, Math.min(this.map.height - this.camera.height, this.camera.y));
  }

  async loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  setMaskImage(maskImage) {
    this.maskImage = maskImage;
    this.maskCanvas = null;
    this.maskCtx = null;
    if (!maskImage) return;
    this.maskCanvas = document.createElement('canvas');
    this.maskCanvas.width = maskImage.naturalWidth || maskImage.width;
    this.maskCanvas.height = maskImage.naturalHeight || maskImage.height;
    this.maskCtx = this.maskCanvas.getContext('2d', { willReadFrequently: true });
    this.maskCtx.drawImage(maskImage, 0, 0, this.maskCanvas.width, this.maskCanvas.height);
    this.buildBushComponents();
  }

  buildBushComponents() {
    this.bushGridWidth = 256;
    this.bushGridHeight = 256;
    const total = this.bushGridWidth * this.bushGridHeight;
    const bush = new Uint8Array(total);
    this.bushComponents = new Int32Array(total);
    this.bushComponents.fill(-1);

    for (let y = 0; y < this.bushGridHeight; y += 1) {
      for (let x = 0; x < this.bushGridWidth; x += 1) {
        const mapX = (x + 0.5) / this.bushGridWidth * this.map.width;
        const mapY = (y + 0.5) / this.bushGridHeight * this.map.height;
        bush[y * this.bushGridWidth + x] = this.getMaskFlags(mapX, mapY).bush ? 1 : 0;
      }
    }

    let componentId = 0;
    const queue = [];
    const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let y = 0; y < this.bushGridHeight; y += 1) {
      for (let x = 0; x < this.bushGridWidth; x += 1) {
        const start = y * this.bushGridWidth + x;
        if (!bush[start] || this.bushComponents[start] !== -1) continue;
        this.bushComponents[start] = componentId;
        queue.length = 0;
        queue.push([x, y]);
        for (let i = 0; i < queue.length; i += 1) {
          const [cx, cy] = queue[i];
          for (const [dx, dy] of neighbors) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= this.bushGridWidth || ny >= this.bushGridHeight) continue;
            const next = ny * this.bushGridWidth + nx;
            if (!bush[next] || this.bushComponents[next] !== -1) continue;
            this.bushComponents[next] = componentId;
            queue.push([nx, ny]);
          }
        }
        componentId += 1;
      }
    }
  }

  getMaskFlags(x, y) {
    if (!this.maskCtx) return { wall: false, bush: false, water: false };
    const px = Math.max(0, Math.min(this.maskCanvas.width - 1, Math.round((x / this.map.width) * this.maskCanvas.width)));
    const py = Math.max(0, Math.min(this.maskCanvas.height - 1, Math.round((y / this.map.height) * this.maskCanvas.height)));
    const data = this.maskCtx.getImageData(px, py, 1, 1).data;
    const r = data[0];
    const g = data[1];
    const b = data[2];
    return {
      wall: r < 70 && g < 70 && b < 70,
      bush: g > 120 && g > r * 1.35 && g > b * 1.15,
      water: b > 130 && b > r * 1.35 && g > 80
    };
  }

  getAreaMaskFlags(x, y, radius = 20) {
    const samples = [
      [x, y], [x + radius, y], [x - radius, y], [x, y + radius], [x, y - radius],
      [x + radius * 0.7, y + radius * 0.7], [x - radius * 0.7, y + radius * 0.7],
      [x + radius * 0.7, y - radius * 0.7], [x - radius * 0.7, y - radius * 0.7]
    ];
    return samples.reduce((flags, point) => {
      const next = this.getMaskFlags(point[0], point[1]);
      flags.wall = flags.wall || next.wall;
      flags.bush = flags.bush || next.bush;
      flags.water = flags.water || next.water;
      return flags;
    }, { wall: false, bush: false, water: false });
  }

  isWallAt(x, y, radius = 20) {
    return this.getAreaMaskFlags(x, y, radius).wall;
  }

  isWaterAt(x, y, radius = 20) {
    return this.getAreaMaskFlags(x, y, radius).water;
  }

  isBushAt(x, y, radius = 20) {
    return this.getAreaMaskFlags(x, y, radius).bush;
  }

  loop(now) {
    const delta = Math.min(0.033, (now - this.lastTime) / 1000);
    this.lastTime = now;
    this.update(delta);
    this.draw();
    if (!this.finished) this.frameId = requestAnimationFrame((time) => this.loop(time));
  }

  update(delta) {
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    this.updatePlayer(delta);
    this.broadcastState(delta);
    if (!this.isMultiplayer) this.updateBots(delta);
    this.updateAmmo(delta);
    this.updateProjectiles(delta);
    this.updateEffects(delta);
    this.updateCamera(delta);
    this.updateHud();
    this.checkWinner();
  }

  updatePlayer(delta) {
    const player = this.getControlledEntity();
    if (!player?.alive) return;
    const vector = this.getMoveVector();
    this.moveEntity(player, vector.x, vector.y, delta);
  }

  getMoveVector() {
    let x = this.touchVector.x;
    let y = this.touchVector.y;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) y -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) y += 1;
    const length = Math.hypot(x, y) || 1;
    return { x: x / length, y: y / length };
  }

  updateBots(delta) {
    const alive = this.entities.filter((entity) => entity.alive);
    for (const bot of this.entities.filter((entity) => !entity.controlled && entity.alive)) {
      const target = alive.filter((entity) => entity.id !== bot.id).sort((a, b) => this.distance(bot, a) - this.distance(bot, b))[0];
      if (!target) continue;
      const dx = target.x - bot.x;
      const dy = target.y - bot.y;
      const distance = Math.hypot(dx, dy) || 1;
      const desiredX = dx / distance;
      const desiredY = dy / distance;
      if (distance > 250) this.moveEntity(bot, desiredX, desiredY, delta);
      else this.moveEntity(bot, -desiredY * 0.55, desiredX * 0.55, delta);
      bot.attackTimer -= delta;
      if (distance < 430 && bot.attackTimer <= 0) {
        this.performAttack(bot, desiredX, desiredY, true);
        bot.attackTimer = 0.55;
      }
    }
  }

  moveEntity(entity, x, y, delta) {
    if (Math.abs(x) + Math.abs(y) < 0.05) return;
    const length = Math.hypot(x, y) || 1;
    const nx = x / length;
    const ny = y / length;
    const oldX = entity.x;
    const oldY = entity.y;
    const nextX = entity.x + nx * entity.speed * delta;
    const nextY = entity.y + ny * entity.speed * delta;
    const slow = this.isWaterAt(nextX, nextY, 0) ? (this.map.waterSpeedMultiplier || 0.38) : 1;
    entity.x += nx * entity.speed * slow * delta;
    entity.y += ny * entity.speed * slow * delta;
    entity.dirX = nx;
    entity.dirY = ny;
    this.game.mapManager.clampToArena(this.map, entity);
    const outsideArena = !this.game.mapManager.isInsideArena(this.map, entity.x, entity.y, entity.radius);
    const blockedByWall = this.isWallAt(entity.x, entity.y, entity.radius);
    if (outsideArena || blockedByWall) {
      entity.x = oldX;
      entity.y = oldY;
    }
  }

  getAttackProfile(entity) {
    const id = entity.character.id;
    const name = entity.character.basicAttack.name;
    if (id === 'seojun' || name.includes('저격')) return { type: 'sniper', cooldown: 0.18, reloadTime: 1.45, range: 390, speed: 850, width: 4, color: '#f8fbff', damageScale: 1.0 };
    if (id === 'harin' || name.includes('쌍권총')) return { type: 'dual', cooldown: 0.18, reloadTime: 1.15, range: 520, speed: 780, width: 6, color: '#ff75c8', damageScale: 0.54 };
    if (id === 'minjun' || name.includes('배트')) return { type: 'bat', cooldown: 0.18, reloadTime: 1.05, range: 112, color: '#ffcc4d', damageScale: 0.95 };
    if (id === 'jaejun') return { type: 'punch', cooldown: 0.18, reloadTime: 0.95, range: 92, color: '#9fd2ff', damageScale: 0.72 };
    return { type: 'punch', cooldown: 0.18, reloadTime: 1.0, range: 96, color: '#36d6a5', damageScale: 1 };
  }

  autoAttackNearest() {
    const player = this.getControlledEntity();
    if (!player?.alive) return;
    const profile = this.getAttackProfile(player);
    const target = this.findNearestTarget(player, profile.range);
    if (!target) {
      this.performAttack(player, player.dirX || 0, player.dirY || -1);
      return;
    }
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const length = Math.hypot(dx, dy) || 1;
    this.performAttack(player, dx / length, dy / length);
  }

  findNearestTarget(owner, maxRange) {
    let best = null;
    let bestDistance = Infinity;
    for (const entity of this.entities) {
      if (!entity.alive || entity.id === owner.id) continue;
      if (!this.canSeeEntity(entity)) continue;
      const distance = Math.hypot(entity.x - owner.x, entity.y - owner.y);
      if (distance <= maxRange && distance < bestDistance) {
        best = entity;
        bestDistance = distance;
      }
    }
    return best;
  }

  performAttack(owner, dirX, dirY, ignorePlayerCooldown = false, fromNetwork = false) {
    if (!owner?.alive) return;
    if (owner.controlled && !ignorePlayerCooldown && this.attackCooldown > 0) return;
    const length = Math.hypot(dirX, dirY) || 1;
    const nx = dirX / length;
    const ny = dirY / length;
    owner.dirX = nx;
    owner.dirY = ny;
    const profile = this.getAttackProfile(owner);
    if (!fromNetwork) {
      if (owner.ammo <= 0) return;
      owner.ammo -= 1;
      if (owner.ammo < owner.maxAmmo && owner.ammoReloadTimer <= 0) owner.ammoReloadTimer = profile.reloadTime;
    }
    if (owner.controlled) {
      this.attackCooldown = profile.cooldown;
      if (this.isMultiplayer && this.game.room?.code && !fromNetwork) {
        this.game.network.sendPlayerAttack({ code: this.game.room.code, dirX: nx, dirY: ny });
      }
    }

    if (profile.type === 'punch' || profile.type === 'bat') {
      this.meleeAttack(owner, nx, ny, profile);
      return;
    }

    if (profile.type === 'dual') {
      const sideX = -ny * 12;
      const sideY = nx * 12;
      this.fireProjectile(owner, nx, ny, profile, sideX, sideY);
      this.fireProjectile(owner, nx, ny, profile, -sideX, -sideY);
      this.effects.push({ type: 'muzzle', x: owner.x + nx * 34, y: owner.y + ny * 34, color: profile.color, life: 0.12, maxLife: 0.12, radius: 20 });
      return;
    }

    this.fireProjectile(owner, nx, ny, profile, 0, 0);
    this.effects.push({ type: 'line', x: owner.x, y: owner.y, dx: nx, dy: ny, color: profile.color, life: 0.14, maxLife: 0.14, range: profile.range });
  }

  meleeAttack(owner, nx, ny, profile) {
    const hitX = owner.x + nx * profile.range;
    const hitY = owner.y + ny * profile.range;
    this.effects.push({ type: profile.type, x: owner.x, y: owner.y, dx: nx, dy: ny, color: profile.color, life: 0.18, maxLife: 0.18, range: profile.range });
    for (const entity of this.entities) {
      if (!entity.alive || entity.id === owner.id) continue;
      const distance = Math.hypot(entity.x - hitX, entity.y - hitY);
      if (distance <= entity.radius + profile.range * 0.55) {
        this.damageEntity(entity, owner.damage * profile.damageScale);
      }
    }
  }

  fireProjectile(owner, nx, ny, profile, offsetX, offsetY) {
    this.projectiles.push({
      ownerId: owner.id,
      x: owner.x + nx * 34 + offsetX,
      y: owner.y + ny * 34 + offsetY,
      vx: nx * profile.speed,
      vy: ny * profile.speed,
      radius: profile.width,
      damage: owner.damage * profile.damageScale,
      life: profile.range / profile.speed,
      color: profile.color,
      type: profile.type
    });
  }

  damageEntity(entity, amount) {
    entity.hp = Math.max(0, entity.hp - Math.round(amount));
    this.effects.push({ type: 'hit', x: entity.x, y: entity.y, color: '#fff', life: 0.16, maxLife: 0.16, radius: 26 });
    if (entity.hp <= 0) entity.alive = false;
    if (entity.controlled && this.isMultiplayer) {
      this.stateSendTimer = 0;
      this.broadcastState(1);
    }
  }

  updateAmmo(delta) {
    for (const entity of this.entities) {
      if (!entity.alive || entity.ammo >= entity.maxAmmo) continue;
      entity.ammoReloadTimer -= delta;
      if (entity.ammoReloadTimer <= 0) {
        entity.ammo += 1;
        if (entity.ammo < entity.maxAmmo) entity.ammoReloadTimer = this.getAttackProfile(entity).reloadTime;
      }
    }
  }

  updateProjectiles(delta) {
    for (const projectile of this.projectiles) {
      projectile.x += projectile.vx * delta;
      projectile.y += projectile.vy * delta;
      projectile.life -= delta;
      for (const entity of this.entities) {
        if (!entity.alive || entity.id === projectile.ownerId) continue;
        if (Math.hypot(entity.x - projectile.x, entity.y - projectile.y) < entity.radius + projectile.radius) {
          this.damageEntity(entity, projectile.damage);
          projectile.life = 0;
          break;
        }
      }
      if (this.isWallAt(projectile.x, projectile.y, 2) || !this.game.mapManager.isInsideArena(this.map, projectile.x, projectile.y, 0)) projectile.life = 0;
    }
    this.projectiles = this.projectiles.filter((projectile) => projectile.life > 0);
  }

  updateEffects(delta) {
    for (const effect of this.effects) effect.life -= delta;
    this.effects = this.effects.filter((effect) => effect.life > 0);
  }

  updateHud() {
    const alive = this.entities.filter((entity) => entity.alive).length;
    this.aliveCount.textContent = alive + '명 생존';
    const seconds = Math.floor((performance.now() - this.startedAt) / 1000);
    this.gameTimer.textContent = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
  }

  checkWinner() {
    const alive = this.entities.filter((entity) => entity.alive);
    if (alive.length > 1 || this.finished) return;
    this.finished = true;
    const winner = alive[0];
    if (winner?.controlled) {
      this.banner.innerHTML = '<strong>승리!</strong><span>상자 1개를 획득했습니다.</span><button id="rewardButton" class="btn warning">보상 받기</button>';
      document.querySelector('#rewardButton').addEventListener('click', () => {
        this.game.recordVictory();
        this.cleanup();
        this.game.showScene('boxes');
      });
    } else {
      this.banner.innerHTML = '<strong>패배</strong><span>' + (winner?.name || '상대') + ' 생존</span><button id="retryButton" class="btn">다시 하기</button>';
      document.querySelector('#retryButton').addEventListener('click', () => this.render());
    }
  }

  draw() {
    if (!this.mapImage) return;
    const ctx = this.ctx;
    const scale = this.canvas.width / this.camera.width;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.mapImage, this.camera.x, this.camera.y, this.camera.width, this.camera.height, 0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(-this.camera.x, -this.camera.y);
    this.drawZones(ctx);
    this.drawAimLine(ctx);
    this.effects.forEach((effect) => this.drawEffect(ctx, effect));
    this.projectiles.forEach((projectile) => this.drawProjectile(ctx, projectile));
    this.entities.forEach((entity) => { if (this.canSeeEntity(entity)) this.drawEntity(ctx, entity); });
    ctx.restore();
    this.drawMinimap(ctx);
  }

  getBushKey(entity) {
    if (!this.isBushAt(entity.x, entity.y, 0)) return null;
    if (!this.bushComponents) return 'single-bush-fallback';
    const gx = Math.max(0, Math.min(this.bushGridWidth - 1, Math.floor(entity.x / this.map.width * this.bushGridWidth)));
    const gy = Math.max(0, Math.min(this.bushGridHeight - 1, Math.floor(entity.y / this.map.height * this.bushGridHeight)));
    const id = this.bushComponents[gy * this.bushGridWidth + gx];
    return id >= 0 ? String(id) : null;
  }

  canSeeEntity(entity) {
    if (!entity.alive) return false;
    if (entity.controlled) return true;
    const player = this.getControlledEntity();
    if (!player) return true;
    const entityBushKey = this.getBushKey(entity);
    if (!entityBushKey) return true;
    const playerBushKey = this.getBushKey(player);
    if (!playerBushKey) return false;
    return entityBushKey === playerBushKey;
  }

  drawZones(ctx) {
    ctx.fillStyle = 'rgba(8, 14, 18, 0.14)';
    for (const zone of [...(this.map.walls || []), ...(this.map.foliage || [])]) {
      ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
    }
  }

  drawAimLine(ctx) {
    const player = this.getControlledEntity();
    if (!this.isAiming || !player?.alive) return;
    const profile = this.getAttackProfile(player);
    const range = profile.range;
    ctx.save();
    ctx.globalAlpha = 0.48;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = profile.type === 'sniper' ? 8 : 14;
    ctx.lineCap = 'round';
    ctx.setLineDash([26, 18]);
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    ctx.lineTo(player.x + this.attackVector.x * range, player.y + this.attackVector.y * range);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    const markerRadius = profile.type === 'punch' || profile.type === 'bat' ? profile.range * 0.55 : 20;
    ctx.arc(player.x + this.attackVector.x * range, player.y + this.attackVector.y * range, markerRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawEntity(ctx, entity) {
    if (!entity.alive) return;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 16;
    ctx.fillStyle = entity.color;
    ctx.beginPath();
    ctx.arc(entity.x, entity.y, entity.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = entity.controlled ? 5 : 3;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 15px system-ui';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,.82)';
    ctx.strokeText(entity.name, entity.x, entity.y - 44);
    ctx.fillStyle = '#111318';
    ctx.fillText(entity.name, entity.x, entity.y - 44);

    const barWidth = 82;
    const barHeight = 14;
    const barX = entity.x - barWidth / 2;
    const barY = entity.y - 31;
    const hpRatio = Math.max(0, entity.hp / entity.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,.58)';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    ctx.fillStyle = hpRatio > 0.35 ? '#36d6a5' : '#ff5f6d';
    ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);
    ctx.strokeStyle = 'rgba(255,255,255,.88)';
    ctx.lineWidth = 2;
    ctx.strokeRect(barX, barY, barWidth, barHeight);
    ctx.font = '800 10px system-ui';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,.7)';
    ctx.lineWidth = 3;
    const hpText = Math.ceil(entity.hp) + ' / ' + entity.maxHp;
    ctx.strokeText(hpText, entity.x, barY + barHeight / 2 + 0.5);
    ctx.fillText(hpText, entity.x, barY + barHeight / 2 + 0.5);

    const ammoY = barY + barHeight + 5;
    const ammoWidth = 22;
    const ammoHeight = 7;
    const ammoGap = 5;
    const startX = entity.x - ((ammoWidth * 3 + ammoGap * 2) / 2);
    for (let i = 0; i < 3; i += 1) {
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fillRect(startX + i * (ammoWidth + ammoGap), ammoY, ammoWidth, ammoHeight);
      ctx.strokeStyle = 'rgba(255,255,255,.65)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(startX + i * (ammoWidth + ammoGap), ammoY, ammoWidth, ammoHeight);
      if (i < entity.ammo) {
        ctx.fillStyle = '#ff9f1a';
        ctx.fillRect(startX + i * (ammoWidth + ammoGap) + 1.5, ammoY + 1.5, ammoWidth - 3, ammoHeight - 3);
      }
    }
    ctx.restore();
  }

  drawProjectile(ctx, projectile) {
    ctx.save();
    ctx.fillStyle = projectile.color;
    ctx.shadowColor = projectile.color;
    ctx.shadowBlur = projectile.type === 'sniper' ? 18 : 10;
    ctx.beginPath();
    ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawEffect(ctx, effect) {
    const t = Math.max(0, effect.life / effect.maxLife);
    ctx.save();
    ctx.globalAlpha = t;
    ctx.strokeStyle = effect.color;
    ctx.fillStyle = effect.color;
    if (effect.type === 'punch' || effect.type === 'bat') {
      ctx.lineWidth = effect.type === 'bat' ? 22 : 16;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(effect.x + effect.dx * 28, effect.y + effect.dy * 28);
      ctx.lineTo(effect.x + effect.dx * effect.range, effect.y + effect.dy * effect.range);
      ctx.stroke();
    } else if (effect.type === 'line') {
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(effect.x, effect.y);
      ctx.lineTo(effect.x + effect.dx * effect.range, effect.y + effect.dy * effect.range);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, (effect.radius || 20) * (1.2 - t), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawMinimap(ctx) {
    const size = Math.min(130, this.canvas.width * 0.18);
    const pad = 14;
    const x = this.canvas.width - size - pad;
    const y = pad;
    ctx.save();
    ctx.fillStyle = 'rgba(10, 14, 18, 0.58)';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.strokeRect(x, y, size, size);
    for (const entity of this.entities) {
      if (!entity.alive) continue;
      ctx.fillStyle = entity.color;
      ctx.beginPath();
      ctx.arc(x + (entity.x / this.map.width) * size, y + (entity.y / this.map.height) * size, entity.controlled ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(54,214,165,.85)';
    ctx.strokeRect(x + (this.camera.x / this.map.width) * size, y + (this.camera.y / this.map.height) * size, (this.camera.width / this.map.width) * size, (this.camera.height / this.map.height) * size);
    ctx.restore();
  }

  distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  endScene() {
    this.cleanup();
    this.game.showScene('lobby');
  }

  cleanup() {
    this.finished = true;
    if (this.frameId) cancelAnimationFrame(this.frameId);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.movePad?.removeEventListener('pointerdown', this.onMovePointerDown);
    window.removeEventListener('pointermove', this.onMovePointerMove);
    window.removeEventListener('pointerup', this.onMovePointerUp);
    window.removeEventListener('pointercancel', this.onMovePointerUp);
    this.networkUnsubs.forEach((unsubscribe) => unsubscribe());
    this.networkUnsubs = [];
    if (document.fullscreenElement) document.exitFullscreen?.().catch?.(() => {});
  }
}
