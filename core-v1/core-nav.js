(() => {
  'use strict';

  const surface = document.getElementById('dragSurface');
  const home = document.getElementById('home');
  if (!surface || !home) return;

  const routes = new Map([
    ['cardGarden', '/core-v1/my-garden/'],
    ['cardPlantId', '/core-v1/plant-identification/'],
  ]);

  let press = null;

  function contains(rect, x, y) {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function routeForCenteredApprovedCard(x, y) {
    const homeRect = home.getBoundingClientRect();
    const targetCenterX = homeRect.left + homeRect.width / 2;
    let best = null;

    for (const [id, route] of routes) {
      const card = document.getElementById(id);
      if (!card) continue;
      const rect = card.getBoundingClientRect();
      if (!contains(rect, x, y)) continue;

      const distance = Math.abs((rect.left + rect.width / 2) - targetCenterX);
      if (!best || distance < best.distance) {
        best = { route, distance };
      }
    }

    if (!best) return null;
    if (best.distance > homeRect.width * 0.12) return null;
    return best.route;
  }

  surface.addEventListener('pointerdown', (event) => {
    press = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  }, { passive: true });

  surface.addEventListener('pointerup', (event) => {
    if (!press || press.pointerId !== event.pointerId) {
      press = null;
      return;
    }

    const start = press;
    press = null;

    const distance = Math.hypot(
      event.clientX - start.x,
      event.clientY - start.y
    );
    if (distance > 8) return;

    const route = routeForCenteredApprovedCard(event.clientX, event.clientY);
    if (route) window.location.assign(route);
  }, { passive: true });

  surface.addEventListener('pointercancel', () => {
    press = null;
  }, { passive: true });
})();
