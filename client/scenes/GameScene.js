export class GameScene {
  constructor(game) {
    this.game = game;
    this.keys = new Set();
    this.touchVector = { x: 0, y: 0 };
    this.lastTime = 0;
    this.attackCooldown = 0;
    this.finished = false;
    this.frameId = null;
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
      '<button id="attackButton" class="attack-button">공격</button>' +
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
    this.attackButton = document.querySelector('#attackButton');
    this.movePad = document.querySelector('#movePad');
    this.resize();
    this.setupMatch();
    this.bind();
    this.tryLandscapeFullscreen();
    this.loadImage(map.image).then((image) => {
      this.mapImage = image;
      this.lastTime = performance.now();
      this.loop(this.lastTime);
    });
  }

  setupMatch() {
    const owned = this.game.characterManager.getOwned(this.game.save);
    const all = this.game.characterManager.getAll();
    const playerCharacter = this.game.characterManager.getById(this.game.save.selectedCharacterId) || owned[0] || all[0];
    const botCharacters = all.filter((character) => character.id !== playerCharacter.id);
    const spawns = this.map.spawnPoints;
    this.entities = [this.createEntity('player', this.game.save.nickname || '플레이어', playerCharacter, spawns[0], true)];
    for (let i = 1; i < 5; i += 1) {
      const character = botCharacters[(i - 1) % botCharacters.length] || all[i % all.length];
      this.entities.push(this.createEntity('bot' + i, '상대 ' + i, character, spawns[i], false));
    }
    this.projectiles = [];
    this.startedAt = performance.now();
    this.finished = false;
    this.attackCooldown = 0;
    this.snapCameraToPlayer();
  }

  createEntity(id, name, character, spawn, controlled) {
    const stats = this.game.levelManager.applyLevel(character, controlled ? (this.game.save.characters[character.id]?.level || 1) : 1);
    return {
      id,
      name,
      character,
      controlled,
      x: spawn.x,
      y: spawn.y,
      radius: 24,
      hp: stats.hp,
      maxHp: stats.hp,
      damage: Math.max(220, Math.round(stats.basicDamage * 0.34)),
      speed: controlled ? 250 : 210,
      color: controlled ? '#36d6a5' : ['#ff5f6d', '#ffcc4d', '#7aa7ff', '#ff75c8'][Number(id.replace('bot', '')) - 1] || '#fff',
      alive: true,
      dirX: 0,
      dirY: -1,
      attackTimer: 0
    };
  }

  bind() {
    this.onResize = () => this.resize();
    this.onKeyDown = (event) => {
      this.keys.add(event.key.toLowerCase());
      if (event.code === 'Space') this.playerAttack();
    };
    this.onKeyUp = (event) => this.keys.delete(event.key.toLowerCase());
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.exitButton.addEventListener('click', () => this.endScene());
    this.attackButton.addEventListener('click', () => this.playerAttack());
    this.bindMovePad();
  }

  bindMovePad() {
    const knob = this.movePad.querySelector('span');
    const reset = () => {
      this.touchVector = { x: 0, y: 0 };
      knob.style.transform = 'translate(-50%, -50%)';
    };
    const update = (point) => {
      const rect = this.movePad.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = point.clientX - cx;
      const dy = point.clientY - cy;
      const length = Math.min(42, Math.hypot(dx, dy));
      const angle = Math.atan2(dy, dx);
      this.touchVector = { x: Math.cos(angle) * (length / 42), y: Math.sin(angle) * (length / 42) };
      knob.style.transform = 'translate(calc(-50% + ' + Math.cos(angle) * length + 'px), calc(-50% + ' + Math.sin(angle) * length + 'px))';
    };
    this.movePad.addEventListener('pointerdown', (event) => { this.movePad.setPointerCapture(event.pointerId); update(event); });
    this.movePad.addEventListener('pointermove', (event) => { if (event.buttons) update(event); });
    this.movePad.addEventListener('pointerup', reset);
    this.movePad.addEventListener('pointercancel', reset);
  }

  tryLandscapeFullscreen() {
    const lock = async () => {
      try {
        if (document.fullscreenEnabled && !document.fullscreenElement && window.innerWidth < 900) {
          await document.documentElement.requestFullscreen();
        }
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
    const isLandscape = aspect >= 1.2;
    const viewHeight = isLandscape ? 560 : 720;
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
    const player = this.entities[0];
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
    this.updateBots(delta);
    this.updateProjectiles(delta);
    this.updateCamera(delta);
    this.updateHud();
    this.checkWinner();
  }

  updatePlayer(delta) {
    const player = this.entities[0];
    if (!player.alive) return;
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
        this.fire(bot, desiredX, desiredY);
        bot.attackTimer = 1.1;
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
    entity.x += nx * entity.speed * delta;
    entity.y += ny * entity.speed * delta;
    entity.dirX = nx;
    entity.dirY = ny;
    this.game.mapManager.clampToArena(this.map, entity);
    if (this.game.mapManager.isInsideWater(this.map, entity.x, entity.y) || this.game.mapManager.isInsideCover(this.map, entity.x, entity.y, entity.radius)) {
      entity.x = oldX;
      entity.y = oldY;
    }
  }

  playerAttack() {
    const player = this.entities[0];
    if (!player?.alive || this.attackCooldown > 0) return;
    this.fire(player, player.dirX || 0, player.dirY || -1);
    this.attackCooldown = 0.55;
  }

  fire(owner, dirX, dirY) {
    const length = Math.hypot(dirX, dirY) || 1;
    this.projectiles.push({
      ownerId: owner.id,
      x: owner.x + (dirX / length) * 32,
      y: owner.y + (dirY / length) * 32,
      vx: (dirX / length) * 650,
      vy: (dirY / length) * 650,
      radius: 8,
      damage: owner.damage,
      life: 0.9,
      color: owner.color
    });
  }

  updateProjectiles(delta) {
    for (const projectile of this.projectiles) {
      projectile.x += projectile.vx * delta;
      projectile.y += projectile.vy * delta;
      projectile.life -= delta;
      for (const entity of this.entities) {
        if (!entity.alive || entity.id === projectile.ownerId) continue;
        if (Math.hypot(entity.x - projectile.x, entity.y - projectile.y) < entity.radius + projectile.radius) {
          entity.hp = Math.max(0, entity.hp - projectile.damage);
          projectile.life = 0;
          if (entity.hp <= 0) entity.alive = false;
          break;
        }
      }
      if (this.game.mapManager.isInsideCover(this.map, projectile.x, projectile.y, 0) || this.game.mapManager.isInsideWater(this.map, projectile.x, projectile.y)) {
        projectile.life = 0;
      }
    }
    this.projectiles = this.projectiles.filter((projectile) => projectile.life > 0);
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
    this.projectiles.forEach((projectile) => this.drawProjectile(ctx, projectile));
    this.entities.forEach((entity) => this.drawEntity(ctx, entity));
    ctx.restore();
    this.drawMinimap(ctx);
  }

  drawZones(ctx) {
    ctx.fillStyle = 'rgba(8, 14, 18, 0.16)';
    for (const zone of this.map.cover || []) ctx.fillRect(zone.x, zone.y, zone.width, zone.height);
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
    ctx.fillStyle = '#111318';
    ctx.font = '700 22px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(entity.name, entity.x, entity.y - 38);
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(entity.x - 34, entity.y + 34, 68, 8);
    ctx.fillStyle = entity.hp / entity.maxHp > 0.35 ? '#36d6a5' : '#ff5f6d';
    ctx.fillRect(entity.x - 34, entity.y + 34, 68 * (entity.hp / entity.maxHp), 8);
    ctx.restore();
  }

  drawProjectile(ctx, projectile) {
    ctx.fillStyle = projectile.color;
    ctx.beginPath();
    ctx.arc(projectile.x, projectile.y, projectile.radius, 0, Math.PI * 2);
    ctx.fill();
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
    if (document.fullscreenElement) document.exitFullscreen?.().catch?.(() => {});
  }
}
