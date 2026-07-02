export class MapManager {
  constructor(maps) {
    this.maps = new Map(maps.map((map) => [map.id, map]));
    this.mapsByMode = new Map();
    maps.forEach((map) => this.mapsByMode.set(map.modeId, map));
  }

  getForMode(modeId) {
    return this.mapsByMode.get(modeId) || Array.from(this.maps.values())[0];
  }

  isWalkable(map, x, y, radius = 20) {
    return this.isInsideArena(map, x, y, radius) &&
      !this.isInsideWater(map, x, y, radius) &&
      !this.isInsideSolid(map, x, y, radius);
  }

  isInsideArena(map, x, y, radius = 0) {
    const bounds = map.walkBounds || { x: 54, y: 54, width: map.width - 108, height: map.height - 108 };
    return x >= bounds.x + radius &&
      x <= bounds.x + bounds.width - radius &&
      y >= bounds.y + radius &&
      y <= bounds.y + bounds.height - radius;
  }

  isInsideWater(map, x, y, radius = 0) {
    return (map.waterZones || []).some((zone) => {
      if (zone.radius) {
        const dx = x - zone.x;
        const dy = y - zone.y;
        return Math.hypot(dx, dy) <= zone.radius + radius;
      }
      return this.isInsideRect(zone, x, y, radius);
    });
  }

  isInsideSolid(map, x, y, radius = 0) {
    return [...(map.walls || []), ...(map.foliage || []), ...(map.cover || [])].some((zone) => this.isInsideRect(zone, x, y, radius));
  }

  isInsideCover(map, x, y, padding = 20) {
    return this.isInsideSolid(map, x, y, padding);
  }

  isInsideRect(zone, x, y, radius = 0) {
    return x >= zone.x - radius &&
      x <= zone.x + zone.width + radius &&
      y >= zone.y - radius &&
      y <= zone.y + zone.height + radius;
  }

  clampToArena(map, entity) {
    const bounds = map.walkBounds || { x: 54, y: 54, width: map.width - 108, height: map.height - 108 };
    entity.x = Math.max(bounds.x + entity.radius, Math.min(bounds.x + bounds.width - entity.radius, entity.x));
    entity.y = Math.max(bounds.y + entity.radius, Math.min(bounds.y + bounds.height - entity.radius, entity.y));
  }
}
