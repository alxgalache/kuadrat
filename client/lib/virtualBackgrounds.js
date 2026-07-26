/**
 * Catalog of virtual background images offered in Agora rooms.
 *
 * To add a background: drop the file in `client/public/fondos-virtuales/` and add
 * its entry below. See that folder's README.md for the image requirements
 * (16:9, 1280x720 recommended, width*height must be even, JPG/WEBP, <300KB).
 *
 * - `file`  — filename inside client/public/fondos-virtuales/
 * - `label` — es-ES name shown in the effects panel
 *
 * Order here is the order the thumbnails appear in. An empty catalog is a valid
 * state: the panel then offers only the blur options.
 */
export const VIRTUAL_BACKGROUNDS = [
  { file: '140d-dark.webp', label: '140d oscuro' },
  { file: '140d-light.webp', label: '140d claro' },
  { file: 'white.webp', label: 'solid light' },
  { file: 'dark.webp', label: 'solid dark' },
];

/** Whether a persisted `file` still exists in the catalog (see useAgoraVideoEffect). */
export function isKnownBackground(file) {
  return VIRTUAL_BACKGROUNDS.some((bg) => bg.file === file);
}
