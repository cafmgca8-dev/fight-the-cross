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
    this.ultimatePointerId = null;
    this.ultimateStart = null;
    this.ultimateVector = { x: 0, y: -1, power: 0 };
    this.lastTime = 0;
    this.attackCooldown = 0;
    this.finished = false;
    this.frameId = null;
    this.stateSendTimer = 0;
    this.environmentTimer = 0;
    this.networkUnsubs = [];
    this.isMultiplayer = false;
    this.camera = { x: 0, y: 0, width: 980, height: 552 };
    this.storm = null;
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
      '<div id="ultimatePad" class="ultimate-pad"><span></span><b>궁</b><small>0/3</small></div>' +
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
    this.ultimatePad = document.querySelector('#ultimatePad');
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
      const localCount = Math.max(2, this.game.getActiveMode()?.maxPlayers || 5);
      for (let i = 1; i < localCount; i += 1) {
        const character = botCharacters[(i - 1) % botCharacters.length] || all[i % all.length];
        this.entities.push(this.createEntity('bot' + i, '상대 ' + i, character, spawns[i % spawns.length], false));
      }
    }

    this.projectiles = [];
    this.effects = [];
    this.startedAt = performance.now();
    this.setupStorm();
    this.finished = false;
    this.attackCooldown = 0;
    this.stateSendTimer = 0;
    this.environmentTimer = 0;
    this.snapCameraToPlayer();
  }

  createEntity(id, name, character, spawn, controlled) {
    const stats = this.game.levelManager.applyLevel(character, controlled ? (this.game.save.characters[character.id]?.level || 1) : 1);
    return {
      id, name, character, controlled, x: spawn.x, y: spawn.y, radius: 18, hitRadius: 24,
      hp: stats.hp, maxHp: stats.hp,
      damage: stats.basicDamage,
      speed: controlled ? 250 : 210,
      color: controlled ? '#36d6a5' : ['#ff5f6d', '#ffcc4d', '#7aa7ff', '#ff75c8'][Number(id.replace('bot', '')) - 1] || '#fff',
      ghostSpeed: 310,
      alive: true, dirX: 0, dirY: -1, attackTimer: 0, ammo: 3, maxAmmo: 3, ammoReloadTimer: 0,
      ultimateHits: 0, ultimateReady: false, stunnedUntil: 0, speedBoostUntil: 0
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
    this.bindUltimatePad();
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
      if (event.target.closest('#attackPad, #ultimatePad, #exitGame, .game-hud')) return false;
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
      const player = this.getControlledEntity();
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

  bindUltimatePad() {
    const knob = this.ultimatePad.querySelector('span');
    const reset = () => {
      this.ultimatePointerId = null;
      this.ultimateStart = null;
      this.ultimateVector = { x: 0, y: -1, power: 0 };
      knob.style.transform = 'translate(-50%, -50%)';
    };
    const update = (point) => {
      const vector = this.padVector(this.ultimatePad, point, 36);
      const player = this.getControlledEntity();
      this.ultimateVector = { x: vector.x, y: vector.y, power: vector.power };
      if (vector.power > 0.12 && player?.alive) {
        player.dirX = vector.x;
        player.dirY = vector.y;
      }
      knob.style.transform = 'translate(calc(-50% + ' + vector.knobX + 'px), calc(-50% + ' + vector.knobY + 'px))';
    };
    const release = (event) => {
      if (event.pointerId !== this.ultimatePointerId) return;
      const vector = { ...this.ultimateVector };
      reset();
      this.performUltimate(this.getControlledEntity(), vector.x || 0, vector.y || -1);
    };
    this.ultimatePad.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.ultimatePointerId = event.pointerId;
      this.ultimateStart = { x: event.clientX, y: event.clientY };
      this.ultimatePad.setPointerCapture(event.pointerId);
      update(event);
    });
    this.ultimatePad.addEventListener('pointermove', (event) => {
      if (event.pointerId === this.ultimatePointerId) update(event);
    });
    this.ultimatePad.addEventListener('pointerup', release);
    this.ultimatePad.addEventListener('pointercancel', reset);
    this.ultimatePad.addEventListener('lostpointercapture', reset);
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
      if (typeof payload.ultimateHits === 'number') entity.ultimateHits = payload.ultimateHits;
      if (typeof payload.ultimateReady === 'boolean') entity.ultimateReady = payload.ultimateReady;
    }));

    this.networkUnsubs.push(this.game.network.on('playerAttack', (payload) => {
      const entity = this.entities.find((item) => item.id === payload.playerId);
      if (!entity || entity.controlled || this.isStunned(entity)) return;
      entity.ammo = Math.max(0, entity.ammo - 1);
      if (entity.ammo < entity.maxAmmo && entity.ammoReloadTimer <= 0) entity.ammoReloadTimer = this.getAttackProfile(entity).reloadTime;
      this.performAttack(entity, payload.dirX, payload.dirY, true, true);
    }));

    this.networkUnsubs.push(this.game.network.on('playerUltimate', (payload) => {
      const entity = this.entities.find((item) => item.id === payload.playerId);
      if (!entity || entity.controlled || this.isStunned(entity)) return;
      entity.ultimateReady = true;
      entity.ultimateHits = 3;
      this.performUltimate(entity, payload.dirX, payload.dirY, true);
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
      ammoReloadTimer: player.ammoReloadTimer,
      ultimateHits: player.ultimateHits,
      ultimateReady: player.ultimateReady
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
    return this.getAreaMaskFlags(x, y, radius).wall || this.isInRectZones([...(this.map.walls || []), ...(this.map.cover || [])], x, y, radius);
  }

  isWaterAt(x, y, radius = 20) {
    return this.getAreaMaskFlags(x, y, radius).water || this.isInRectZones(this.map.waterZones, x, y, radius);
  }

  isSnowAt(x, y, radius = 20) {
    return this.isInRectZones(this.map.snowZones, x, y, radius);
  }

  isHealPadAt(x, y, radius = 20) {
    return this.isInRectZones(this.map.healZones, x, y, radius);
  }

  isBushAt(x, y, radius = 20) {
    return this.getAreaMaskFlags(x, y, radius).bush || this.isInRectZones(this.map.foliage, x, y, radius);
  }

  isInRectZones(zones = [], x, y, radius = 0) {
    return zones.some((zone) => x >= zone.x - radius && x <= zone.x + zone.width + radius && y >= zone.y - radius && y <= zone.y + zone.height + radius);
  }

  getTerrainSpeedMultiplier(x, y) {
    if (this.isSnowAt(x, y, 0)) return this.map.snowSpeedMultiplier || 0.5;
    if (this.isWaterAt(x, y, 0)) return this.map.waterSpeedMultiplier || 0.38;
    return 1;
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
    this.updateSpecialZones(delta);
    this.updateStorm(delta);
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
    if (!player || this.isStunned(player)) return;
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
    for (const bot of this.entities.filter((entity) => !entity.controlled && entity.alive && !this.isStunned(entity))) {
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
    entity.dirX = nx;
    entity.dirY = ny;

    if (!entity.alive) {
      entity.x += nx * (entity.ghostSpeed || 310) * delta;
      entity.y += ny * (entity.ghostSpeed || 310) * delta;
      entity.x = Math.max(0, Math.min(this.map.width, entity.x));
      entity.y = Math.max(0, Math.min(this.map.height, entity.y));
      return;
    }

    const nextX = entity.x + nx * entity.speed * delta;
    const nextY = entity.y + ny * entity.speed * delta;
    const terrainSlow = this.getTerrainSpeedMultiplier(nextX, nextY);
    const slow = terrainSlow;
    const boost = performance.now() < (entity.speedBoostUntil || 0) ? (entity.speedBoostMultiplier || 3) : 1;
    entity.x += nx * entity.speed * boost * slow * delta;
    entity.y += ny * entity.speed * boost * slow * delta;
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
    if (id === 'seojun' || name.includes('저격')) return { type: 'sniper', cooldown: 0.18, reloadTime: 1.55, range: 520, speed: 980, width: 4, hitRadius: 14, color: '#f8fbff', damageScale: 1.0 };
    if (id === 'harin' || name.includes('쌍권총')) return { type: 'dual', cooldown: 0.18, reloadTime: 1.15, range: 520, speed: 780, width: 6, hitRadius: 13, color: '#ff75c8', damageScale: 0.54 };
    if (id === 'minjun' || name.includes('배트')) return { type: 'bat', cooldown: 0.18, reloadTime: 1.05, range: 112, color: '#ffcc4d', damageScale: 0.95 };
    if (id === 'jaejun') return { type: 'punch', cooldown: 0.18, reloadTime: 1.25, range: 92, color: '#9fd2ff', damageScale: 0.72 };
    return { type: 'punch', cooldown: 0.18, reloadTime: 1.28, range: 96, color: '#36d6a5', damageScale: 1 };
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
    if (!owner?.alive || this.isStunned(owner)) return;
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
      this.playAttackProximitySound(owner, ['ain', 'jaejun'], '/assets/audio/punch-swing.wav', { selfVolume: 0.68, maxVolume: 0.62, minVolume: 0.18, range: 520 });
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

    this.playAttackProximitySound(owner, ['seojun'], '/assets/audio/sniper-fire.wav', { selfVolume: 0.76, maxVolume: 0.7, minVolume: 0.16, range: 760 });
    this.fireProjectile(owner, nx, ny, profile, 0, 0);
    this.effects.push({ type: 'line', x: owner.x, y: owner.y, dx: nx, dy: ny, color: profile.color, life: 0.14, maxLife: 0.14, range: profile.range });
  }

  playAttackProximitySound(owner, characterIds, src, options = {}) {
    if (!characterIds.includes(owner?.character?.id)) return;
    const listener = this.getControlledEntity();
    if (!listener?.alive) return;
    const audibleRange = options.range || 560;
    const distance = owner.controlled ? 0 : Math.hypot(listener.x - owner.x, listener.y - owner.y);
    if (distance > audibleRange) return;
    const selfVolume = options.selfVolume ?? 0.7;
    const maxVolume = options.maxVolume ?? 0.62;
    const minVolume = options.minVolume ?? 0.16;
    const volume = owner.controlled ? selfVolume : Math.max(minVolume, maxVolume * (1 - distance / audibleRange));
    this.game.audio.playEffect(src, { volume });
  }

  meleeAttack(owner, nx, ny, profile) {
    const hitX = owner.x + nx * profile.range;
    const hitY = owner.y + ny * profile.range;
    this.effects.push({ type: profile.type, x: owner.x, y: owner.y, dx: nx, dy: ny, color: profile.color, life: 0.18, maxLife: 0.18, range: profile.range });
    for (const entity of this.entities) {
      if (!entity.alive || entity.id === owner.id) continue;
      const distance = Math.hypot(entity.x - hitX, entity.y - hitY);
      if (distance <= (entity.hitRadius || entity.radius) + profile.range * 0.55) {
        this.damageEntity(entity, owner.damage * profile.damageScale, owner);
      }
    }
  }

  fireProjectile(owner, nx, ny, profile, offsetX, offsetY) {
    this.projectiles.push({
      ownerId: owner.id,
      x: owner.x + nx * 28 + offsetX,
      y: owner.y + ny * 28 + offsetY,
      dirX: nx,
      dirY: ny,
      vx: nx * profile.speed,
      vy: ny * profile.speed,
      speed: profile.speed,
      radius: profile.width,
      hitRadius: profile.hitRadius || profile.width,
      travelLeft: Math.max(0, profile.range - 28),
      damage: owner.damage * profile.damageScale,
      life: Math.max(0.05, (profile.range - 28) / profile.speed),
      color: profile.color,
      type: profile.type
    });
  }

  damageEntity(entity, amount, source = null) {
    if (!entity.alive) return;
    if (this.isHealPadAt(entity.x, entity.y, entity.radius || 0)) {
      entity.hp = entity.maxHp;
      return;
    }
    entity.hp = Math.max(0, entity.hp - Math.round(amount));
    if (entity.controlled) this.game.audio.playEffect('/assets/audio/hit-impact.wav', { volume: 0.78 });
    this.effects.push({ type: 'hit', x: entity.x, y: entity.y, color: '#fff', life: 0.16, maxLife: 0.16, radius: 26 });
    if (source && source.id !== entity.id && source.alive) this.addUltimateHit(source);
    if (entity.hp <= 0) this.turnIntoGhost(entity);
    if (entity.controlled && this.isMultiplayer) {
      this.stateSendTimer = 0;
      this.broadcastState(1);
    }
  }

  setupStorm() {
    const width = this.map?.width || 1600;
    const height = this.map?.height || 1600;
    this.storm = {
      centerX: width / 2,
      centerY: height / 2,
      startRadius: Math.hypot(width, height) / 2 + 80,
      finalRadius: Math.max(170, Math.min(width, height) * 0.13),
      delay: 18,
      shrinkDuration: 155,
      tick: 0.65,
      timer: 0,
      baseDps: 180,
      maxDps: 520
    };
  }

  getStormState() {
    if (!this.storm) return { progress: 0, radius: Infinity, dps: 0 };
    const elapsed = Math.max(0, (performance.now() - this.startedAt) / 1000);
    const raw = elapsed <= this.storm.delay ? 0 : Math.min(1, (elapsed - this.storm.delay) / this.storm.shrinkDuration);
    const eased = raw * raw * (3 - 2 * raw);
    const radius = this.storm.startRadius + (this.storm.finalRadius - this.storm.startRadius) * eased;
    const dps = this.storm.baseDps + (this.storm.maxDps - this.storm.baseDps) * raw;
    return { progress: raw, radius, dps };
  }

  updateSpecialZones(delta) {
    if (this.finished) return;
    const targets = this.entities.filter((entity) => entity.alive && (entity.controlled || !this.isMultiplayer));
    for (const entity of targets) {
      if (this.isHealPadAt(entity.x, entity.y, entity.radius || 0)) {
        if (entity.hp < entity.maxHp) entity.hp = entity.maxHp;
        continue;
      }
    }

    if (!this.map?.snowZones?.length) return;
    this.environmentTimer -= delta;
    if (this.environmentTimer > 0) return;
    this.environmentTimer = 0.65;
    for (const entity of targets) {
      if (this.isHealPadAt(entity.x, entity.y, entity.radius || 0)) continue;
      if (!this.isSnowAt(entity.x, entity.y, entity.radius || 0)) continue;
      this.damageHazardEntity(entity, (this.map.snowDps || 130) * this.environmentTimer, '#e9f8ff');
    }
  }

  damageHazardEntity(entity, amount, color = '#8d7cff') {
    if (!entity.alive) return;
    if (this.isHealPadAt(entity.x, entity.y, entity.radius || 0)) {
      entity.hp = entity.maxHp;
      return;
    }
    entity.hp = Math.max(0, entity.hp - Math.round(amount));
    this.effects.push({ type: 'hit', x: entity.x, y: entity.y, color, life: 0.18, maxLife: 0.18, radius: 30 });
    if (entity.hp <= 0) this.turnIntoGhost(entity);
    if (entity.controlled && this.isMultiplayer) {
      this.stateSendTimer = 0;
      this.broadcastState(1);
    }
  }

  updateStorm(delta) {
    if (!this.storm || this.finished) return;
    const state = this.getStormState();
    if (state.progress <= 0) return;
    this.storm.timer -= delta;
    if (this.storm.timer > 0) return;
    this.storm.timer = this.storm.tick;
    const targets = this.entities.filter((entity) => entity.alive && (entity.controlled || !this.isMultiplayer));
    for (const entity of targets) {
      const distance = Math.hypot(entity.x - this.storm.centerX, entity.y - this.storm.centerY);
      if (distance <= state.radius + (entity.radius || 0)) continue;
      this.damageHazardEntity(entity, state.dps * this.storm.tick, '#8d7cff');
    }
  }

  damageStormEntity(entity, amount) {
    if (!entity.alive) return;
    entity.hp = Math.max(0, entity.hp - Math.round(amount));
    this.effects.push({ type: 'hit', x: entity.x, y: entity.y, color: '#8d7cff', life: 0.18, maxLife: 0.18, radius: 30 });
    if (entity.hp <= 0) this.turnIntoGhost(entity);
    if (entity.controlled && this.isMultiplayer) {
      this.stateSendTimer = 0;
      this.broadcastState(1);
    }
  }

  addUltimateHit(entity) {
    if (!['ain', 'jaejun', 'seojun'].includes(entity?.character?.id)) return;
    if (entity.ultimateReady) return;
    entity.ultimateHits = Math.min(3, (entity.ultimateHits || 0) + 1);
    if (entity.ultimateHits >= 3) entity.ultimateReady = true;
  }

  isStunned(entity) {
    return performance.now() < (entity?.stunnedUntil || 0);
  }

  performUltimate(owner, dirX, dirY, fromNetwork = false) {
    if (!owner?.alive || this.isStunned(owner)) return;
    if (!owner.ultimateReady && !fromNetwork) return;
    const length = Math.hypot(dirX, dirY) || 1;
    const nx = dirX / length;
    const ny = dirY / length;
    owner.dirX = nx;
    owner.dirY = ny;
    owner.ultimateReady = false;
    owner.ultimateHits = 0;
    if (owner.controlled && this.isMultiplayer && this.game.room?.code && !fromNetwork) {
      this.game.network.sendPlayerUltimate({ code: this.game.room.code, dirX: nx, dirY: ny });
    }
    const id = owner.character.id;
    if (id === 'ain') this.castAinUltimate(owner);
    else if (id === 'jaejun') this.castJaejunUltimate(owner);
    else if (id === 'seojun') this.castSeojunUltimate(owner, nx, ny);
  }

  castAinUltimate(owner) {
    this.playAttackProximitySound(owner, ['ain'], '/assets/audio/ain-ultimate-shout.m4a', { selfVolume: 0.9, maxVolume: 0.82, minVolume: 0.2, range: 720 });
    const radius = 150;
    const stunDuration = 1000;
    const stunUntil = performance.now() + stunDuration;
    this.effects.push({ type: 'ultimate-ring', x: owner.x, y: owner.y, color: '#a9f5ff', life: stunDuration / 1000, maxLife: stunDuration / 1000, radius });
    for (const entity of this.entities) {
      if (!entity.alive || entity.id === owner.id) continue;
      if (Math.hypot(entity.x - owner.x, entity.y - owner.y) <= radius + entity.radius) {
        entity.stunnedUntil = Math.max(entity.stunnedUntil || 0, stunUntil);
        this.effects.push({ type: 'stun', x: entity.x, y: entity.y, color: '#f8fbff', life: 1, maxLife: 1, radius: 18 });
      }
    }
  }

  castJaejunUltimate(owner) {
    this.playAttackProximitySound(owner, ['jaejun'], '/assets/audio/jaejun-ultimate-wind.wav', { selfVolume: 0.9, maxVolume: 0.82, minVolume: 0.18, range: 760 });
    owner.speedBoostMultiplier = 3.2;
    owner.speedBoostUntil = Math.max(owner.speedBoostUntil || 0, performance.now() + 4200);
    this.effects.push({ type: 'ultimate-ring', x: owner.x, y: owner.y, color: '#ffdf6b', life: 0.62, maxLife: 0.62, radius: 105 });
  }

  castSeojunUltimate(owner, nx, ny) {
    this.playAttackProximitySound(owner, ['seojun'], '/assets/audio/sniper-fire.wav', { selfVolume: 0.86, maxVolume: 0.78, minVolume: 0.18, range: 880 });
    const target = this.findNearestTarget(owner, 680);
    this.projectiles.push({
      ownerId: owner.id,
      x: owner.x + nx * 28,
      y: owner.y + ny * 28,
      dirX: nx,
      dirY: ny,
      speed: 520,
      radius: 10,
      hitRadius: 20,
      travelLeft: 1400,
      damage: 3000,
      life: 3.0,
      color: '#ff5f6d',
      type: 'missile',
      homing: true,
      chargeUltimate: false,
      targetId: target?.id || null
    });
    this.effects.push({ type: 'muzzle', x: owner.x + nx * 34, y: owner.y + ny * 34, color: '#ff5f6d', life: 0.18, maxLife: 0.18, radius: 26 });
  }

  turnIntoGhost(entity) {
    entity.alive = false;
    entity.hp = 0;
    entity.ammo = 0;
    entity.ammoReloadTimer = 0;
    this.effects.push({ type: 'ghost', x: entity.x, y: entity.y, color: '#dce6ff', life: 0.7, maxLife: 0.7, radius: 44 });
    if (entity.controlled) {
      this.isAiming = false;
      this.attackVector.power = 0;
      this.banner.innerHTML = '<strong>관전 모드</strong><span>유령 상태로 이동하며 남은 전투를 볼 수 있습니다.</span>';
      window.setTimeout(() => { if (!this.finished && this.banner) this.banner.innerHTML = ''; }, 1800);
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
      const oldX = projectile.x;
      const oldY = projectile.y;
      if (projectile.homing) {
        const target = this.entities.find((entity) => entity.id === projectile.targetId && entity.alive) || this.findNearestProjectileTarget(projectile);
        if (target) {
          projectile.targetId = target.id;
          const dx = target.x - projectile.x;
          const dy = target.y - projectile.y;
          const len = Math.hypot(dx, dy) || 1;
          projectile.dirX = projectile.dirX * 0.82 + (dx / len) * 0.18;
          projectile.dirY = projectile.dirY * 0.82 + (dy / len) * 0.18;
          const dirLen = Math.hypot(projectile.dirX, projectile.dirY) || 1;
          projectile.dirX /= dirLen;
          projectile.dirY /= dirLen;
        }
      }
      const step = Math.min(projectile.speed * delta, projectile.travelLeft ?? projectile.speed * delta);
      projectile.x += projectile.dirX * step;
      projectile.y += projectile.dirY * step;
      projectile.travelLeft = (projectile.travelLeft ?? 0) - step;
      projectile.life -= delta;
      for (const entity of this.entities) {
        if (!entity.alive || entity.id === projectile.ownerId) continue;
        const hitSize = (entity.hitRadius || entity.radius) + (projectile.hitRadius || projectile.radius);
        if (this.distanceToSegment(entity.x, entity.y, oldX, oldY, projectile.x, projectile.y) <= hitSize) {
          const owner = this.entities.find((item) => item.id === projectile.ownerId);
          this.damageEntity(entity, projectile.damage, projectile.chargeUltimate === false ? null : owner);
          projectile.life = 0;
          break;
        }
      }
      if (this.isWallAt(projectile.x, projectile.y, 2) || !this.game.mapManager.isInsideArena(this.map, projectile.x, projectile.y, 0)) projectile.life = 0;
      if ((projectile.travelLeft ?? 0) <= 0) projectile.life = 0;
    }
    this.projectiles = this.projectiles.filter((projectile) => projectile.life > 0);
  }

  findNearestProjectileTarget(projectile) {
    let best = null;
    let bestDistance = Infinity;
    for (const entity of this.entities) {
      if (!entity.alive || entity.id === projectile.ownerId) continue;
      const distance = Math.hypot(entity.x - projectile.x, entity.y - projectile.y);
      if (distance < bestDistance) {
        best = entity;
        bestDistance = distance;
      }
    }
    return best;
  }

  updateEffects(delta) {
    for (const effect of this.effects) effect.life -= delta;
    this.effects = this.effects.filter((effect) => effect.life > 0);
  }

  updateHud() {
    const alive = this.entities.filter((entity) => entity.alive).length;
    const stormState = this.getStormState();
    const stormLabel = stormState.progress <= 0 ? '자기장 대기' : '자기장 ' + Math.round(stormState.progress * 100) + '%';
    this.aliveCount.textContent = alive + '명 생존';
    const seconds = Math.floor((performance.now() - this.startedAt) / 1000);
    this.gameTimer.textContent = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0') + ' · ' + stormLabel;
    this.updateUltimatePad();
  }

  updateUltimatePad() {
    if (!this.ultimatePad) return;
    const player = this.getControlledEntity();
    const hits = Math.min(3, player?.ultimateHits || 0);
    const ready = Boolean(player?.ultimateReady && player?.alive);
    this.ultimatePad.classList.toggle('ready', ready);
    this.ultimatePad.classList.toggle('disabled', !ready);
    const label = this.ultimatePad.querySelector('small');
    if (label) label.textContent = ready ? 'READY' : hits + '/3';
  }

  checkWinner() {
    const alive = this.entities.filter((entity) => entity.alive);
    if (alive.length > 1 || this.finished) return;
    this.finished = true;
    const winner = alive[0];
    if (this.isMultiplayer && this.game.room?.code) {
      this.finishMultiplayerMatch(winner);
      return;
    }
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

  finishMultiplayerMatch(winner) {
    const isWinner = Boolean(winner?.controlled);
    if (isWinner) this.game.recordVictory();
    const winnerName = winner?.name || '승자';
    const message = isWinner ? '승리! 로비로 돌아갑니다.' : winnerName + ' 승리. 로비로 돌아갑니다.';
    this.banner.innerHTML = '<strong>' + (isWinner ? '승리!' : '게임 종료') + '</strong><span>' + message + '</span>';
    this.game.network.endGame({ code: this.game.room.code, winnerId: winner?.id, winnerName, message });
    window.setTimeout(() => {
      this.cleanup();
      this.game.message = message;
      this.game.showScene('lobby');
    }, 1800);
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
    this.drawStorm(ctx);
    this.drawZones(ctx);
    this.drawAimLine(ctx);
    this.effects.forEach((effect) => this.drawEffect(ctx, effect));
    this.projectiles.forEach((projectile) => this.drawProjectile(ctx, projectile));
    this.entities.forEach((entity) => { if (this.canSeeEntity(entity)) this.drawEntity(ctx, entity); });
    ctx.restore();
    this.drawGhostOverlay(ctx);
  }

  getBushKey(entity) {
    if (!this.isBushAt(entity.x, entity.y, 0)) return null;
    const rectIndex = (this.map.foliage || []).findIndex((zone) => this.isInRectZones([zone], entity.x, entity.y, 0));
    if (rectIndex >= 0) return 'foliage-' + rectIndex;
    if (!this.bushComponents) return 'single-bush-fallback';
    const gx = Math.max(0, Math.min(this.bushGridWidth - 1, Math.floor(entity.x / this.map.width * this.bushGridWidth)));
    const gy = Math.max(0, Math.min(this.bushGridHeight - 1, Math.floor(entity.y / this.map.height * this.bushGridHeight)));
    const id = this.bushComponents[gy * this.bushGridWidth + gx];
    return id >= 0 ? String(id) : null;
  }

  canSeeEntity(entity) {
    if (entity.controlled) return true;
    if (!entity.alive) return false;
    const player = this.getControlledEntity();
    if (!player) return true;
    if (!player.alive) return true;
    const entityBushKey = this.getBushKey(entity);
    if (!entityBushKey) return true;
    const playerBushKey = this.getBushKey(player);
    if (!playerBushKey) return false;
    return entityBushKey === playerBushKey;
  }

  drawStorm(ctx) {
    if (!this.storm) return;
    const state = this.getStormState();
    if (state.progress <= 0) return;
    ctx.save();
    ctx.fillStyle = 'rgba(77, 56, 180, 0.42)';
    ctx.beginPath();
    ctx.rect(0, 0, this.map.width, this.map.height);
    ctx.arc(this.storm.centerX, this.storm.centerY, state.radius, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(174, 235, 255, 0.92)';
    ctx.lineWidth = 8;
    ctx.shadowColor = '#91f7ff';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(this.storm.centerX, this.storm.centerY, state.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
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
    if (!entity.alive) {
      if (entity.controlled) this.drawGhostEntity(ctx, entity);
      return;
    }
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

    const statusY = barY + barHeight + 4;
    if (this.isStunned(entity)) {
      ctx.font = '900 13px system-ui';
      ctx.fillStyle = '#f8fbff';
      ctx.strokeStyle = 'rgba(0,0,0,.72)';
      ctx.lineWidth = 3;
      ctx.strokeText('STUN', entity.x, statusY + 7);
      ctx.fillText('STUN', entity.x, statusY + 7);
    }

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

    const ultY = ammoY + ammoHeight + 5;
    const ultWidth = 18;
    const ultGap = 4;
    const ultStartX = entity.x - ((ultWidth * 3 + ultGap * 2) / 2);
    for (let i = 0; i < 3; i += 1) {
      ctx.fillStyle = 'rgba(0,0,0,.48)';
      ctx.fillRect(ultStartX + i * (ultWidth + ultGap), ultY, ultWidth, 5);
      if (entity.ultimateReady || i < (entity.ultimateHits || 0)) {
        ctx.fillStyle = entity.ultimateReady ? '#4df4ff' : '#79b8ff';
        ctx.fillRect(ultStartX + i * (ultWidth + ultGap) + 1, ultY + 1, ultWidth - 2, 3);
      }
    }
    ctx.restore();
  }

  drawGhostEntity(ctx, entity) {
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.shadowColor = 'rgba(220, 230, 255, .75)';
    ctx.shadowBlur = 20;
    ctx.fillStyle = 'rgba(220, 230, 255, .52)';
    ctx.beginPath();
    ctx.arc(entity.x, entity.y - 3, entity.radius * 0.92, Math.PI, 0);
    ctx.lineTo(entity.x + entity.radius * 0.72, entity.y + entity.radius * 0.9);
    ctx.quadraticCurveTo(entity.x + entity.radius * 0.24, entity.y + entity.radius * 0.55, entity.x, entity.y + entity.radius * 0.95);
    ctx.quadraticCurveTo(entity.x - entity.radius * 0.24, entity.y + entity.radius * 0.55, entity.x - entity.radius * 0.72, entity.y + entity.radius * 0.9);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(35, 45, 70, .72)';
    ctx.beginPath();
    ctx.arc(entity.x - 6, entity.y - 4, 2.6, 0, Math.PI * 2);
    ctx.arc(entity.x + 6, entity.y - 4, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.font = '800 12px system-ui';
    ctx.fillStyle = 'rgba(240,245,255,.9)';
    ctx.fillText('관전 중', entity.x, entity.y - 34);
    ctx.restore();
  }

  drawGhostOverlay(ctx) {
    const player = this.getControlledEntity();
    if (player?.alive !== false) return;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(120, 128, 138, .34)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = 'rgba(6, 8, 12, .18)';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.restore();
  }

  drawProjectile(ctx, projectile) {
    ctx.save();
    ctx.fillStyle = projectile.color;
    ctx.shadowColor = projectile.color;
    ctx.shadowBlur = projectile.type === 'sniper' ? 18 : 10;
    ctx.beginPath();
    if (projectile.type === 'missile') {
      ctx.translate(projectile.x, projectile.y);
      ctx.rotate(Math.atan2(projectile.dirY, projectile.dirX));
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-10, -7);
      ctx.lineTo(-5, 0);
      ctx.lineTo(-10, 7);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
      ctx.fill();
    }
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
    } else if (effect.type === 'ultimate-ring') {
      ctx.globalAlpha = t * 0.72;
      ctx.lineWidth = 10 * (1.1 - t);
      ctx.beginPath();
      ctx.arc(effect.x, effect.y, (effect.radius || 80) * (1.15 - t * 0.15), 0, Math.PI * 2);
      ctx.stroke();
    } else if (effect.type === 'stun') {
      ctx.globalAlpha = t;
      ctx.font = '900 18px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('★', effect.x, effect.y - 28 - (1 - t) * 16);
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
      if (!entity.alive && !entity.controlled) continue;
      ctx.fillStyle = entity.alive ? entity.color : 'rgba(220,230,255,.8)';
      ctx.beginPath();
      ctx.arc(x + (entity.x / this.map.width) * size, y + (entity.y / this.map.height) * size, entity.controlled ? 4 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(54,214,165,.85)';
    ctx.strokeRect(x + (this.camera.x / this.map.width) * size, y + (this.camera.y / this.map.height) * size, (this.camera.width / this.map.width) * size, (this.camera.height / this.map.height) * size);
    ctx.restore();
  }

  distanceToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
    const closestX = ax + dx * t;
    const closestY = ay + dy * t;
    return Math.hypot(px - closestX, py - closestY);
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
  }
}
