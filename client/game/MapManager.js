export class MapManager {
  constructor(maps) {
    this.maps = new Map(maps.map((map) => [map.id, map]));
    this.mapsByMode = new Map();
    maps.forEach((map) => this.mapsByMode.set(map.modeId, map));
  }

  getForMode(modeId) {
    return this.mapsByMode.get(modeId) || Array.from(this.maps.values())[0];
  }

  isInsideWater(map, x, y) {
    return (map.waterZones || []).some((zone) => {
      if (zone.radius) {
        const dx = x - zone.x;
        const dy = y - zone.y;
        return Math.hypot(dx, dy) <= zone.radius;
      }
      return x >= zone.x && x <= zone.x + zone.width && y >= zone.y && y <= zone.y + zone.height;
    });
  }

  isInsideCover(map, x, y, padding = 20) {
    return (map.cover || []).some((zone) => {
      return x >= zone.x - padding && x <= zone.x + zone.width + padding && y >= zone.y - padding && y <= zone.y + zone.height + padding;
    });
  }

  clampToArena(map, entity) {
    entity.x = Math.max(54, Math.min(map.width - 54, entity.x));
    entity.y = Math.max(54, Math.min(map.height - 54, entity.y));
  }
}
