// The wave is a wall that never ends: the crest runs along the bottom just above the sand and the face rises
// from it toward the ocean. Only its height is configurable; the rider's play area is the face.
export const WAVE_CONFIG = {
  faceFrac: 0.75, // face height as a fraction of screen height (capped so the rider stays below the top bar)
  crestGap: 36,   // px between the crest line and the shoreline
};

// Fills field.crestY (bottom edge of the face) and field.faceDepth.
export function waveGeometry(field, topLimit) {
  field.crestY = field.shoreY - WAVE_CONFIG.crestGap;
  field.faceDepth = Math.max(80, Math.min(field.h * WAVE_CONFIG.faceFrac, field.crestY - topLimit));
}
