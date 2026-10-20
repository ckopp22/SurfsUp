// The camera scrolls horizontally and stays locked to the rider.
export const WORLD_CONFIG = {
  camTargetFrac: 0.3, // where the rider sits on screen (fraction of screen width from the left)
};

export const camera = { x: 0 };

export function snapCamera(playerX, screenW) {
  camera.x = playerX - screenW * WORLD_CONFIG.camTargetFrac;
}

export const updateCamera = snapCamera;
