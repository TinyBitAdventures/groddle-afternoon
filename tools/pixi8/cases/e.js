export function t1(PIXI, flag) {
  let sprite;
  if (flag) {
    sprite = new PIXI.Graphics();
  } else {
    const marker = new PIXI.Graphics();
    marker.beginFill(0xffffff, 0.86);
    marker.drawRoundedRect(-24, -72, 48, 72, 20);
    marker.endFill();
    marker.lineStyle(3, 0x77b9cd, 0.88);
    marker.drawRoundedRect(-24, -72, 48, 72, 20);
    sprite = marker;
  }
  sprite.x = 1;
  return sprite;
}
