/**
 * @module sprite-loader
 * @description Preloads all generated sprite/icon assets and provides a unified
 * interface for the renderer to fetch Image objects by entity id + frame.
 *
 * Falls back gracefully to null (letting the original procedural renderer take over)
 * if any asset is not yet generated. This allows incremental replacement.
 *
 * Dependencies: none (browser Image API only).
 *
 * Exports:
 *   - {Promise<void>} preloadAll() — call before game loop starts
 *   - {HTMLImageElement|null} getSprite(category, id, frame)
 *   - {HTMLImageElement|null} getIcon(type, id)
 *   - {HTMLImageElement|null} getTile(stageId, tileName)
 *   - {boolean} spritesReady — true after preloadAll resolves
 */

// Asset base path (relative to index.html)
const ASSET_BASE = './assets';
// Cache bust version — increment after regenerating assets
const CACHE_V = '2';

// Sprite registry: category → id → frame → Image
const sprites = new Map();
// Icon registry: type → id → Image
const icons = new Map();
// Tile registry: stageId → tileName → Image
const tiles = new Map();

export let spritesReady = false;

// ---------------------------------------------------------------------------
// Manifest (derived from asset-manifest.json structure)
// ---------------------------------------------------------------------------
const SPRITE_MANIFEST = {
    player: {
        path: 'sprites/player',
        frames: ['idle_0', 'idle_1', 'walk_0', 'walk_1', 'walk_2', 'walk_3']
    },
    enemies: {
        bat: { path: 'sprites/enemies/bat', frames: ['fly_0', 'fly_1'] },
        zombie: { path: 'sprites/enemies/zombie', frames: ['walk_0', 'walk_1'] },
        skeleton: { path: 'sprites/enemies/skeleton', frames: ['walk_0', 'walk_1'] },
        wolf: { path: 'sprites/enemies/wolf', frames: ['run_0', 'run_1'] },
        golem: { path: 'sprites/enemies/golem', frames: ['idle_0', 'walk_0'] },
        ghost: { path: 'sprites/enemies/ghost', frames: ['float_0', 'float_1'] },
        mage: { path: 'sprites/enemies/mage', frames: ['idle_0', 'cast_0'] },
        slime: { path: 'sprites/enemies/slime', frames: ['idle_0', 'bounce_0'] },
        slimeling: { path: 'sprites/enemies/slimeling', frames: ['hop_0', 'hop_1'] },
        bomber: { path: 'sprites/enemies/bomber', frames: ['roll_0', 'flash_0'] },
        illusionist: { path: 'sprites/enemies/illusionist', frames: ['idle_0', 'cast_0'] }
    },
    bosses: {
        reaper: { path: 'sprites/bosses/reaper', frames: ['idle_0', 'idle_1', 'attack_0'] },
        void_lord: { path: 'sprites/bosses/void_lord', frames: ['idle_0', 'idle_1', 'charge_0'] },
        necromancer: { path: 'sprites/bosses/necromancer', frames: ['idle_0', 'idle_1', 'summon_0'] },
        chrono_lich: { path: 'sprites/bosses/chrono_lich', frames: ['idle_0', 'idle_1', 'charge_0'] },
        ice_queen: { path: 'sprites/bosses/ice_queen', frames: ['idle_0', 'idle_1', 'charge_0'] }
    }
};

const ICON_MANIFEST = {
    weapons: ['whip', 'magic_wand', 'knife', 'orbit', 'lightning', 'mine', 'garlic', 'frost_nova', 'soul_drain', 'boomerang'],
    passives: ['max_hp', 'recovery', 'armor', 'movespeed', 'might', 'area', 'cooldown', 'magnet', 'growth', 'luck', 'dodge', 'magnet_plus', 'damage_reduction']
};

const TILE_MANIFEST = {
    forest: ['ground_0', 'ground_1', 'ground_2', 'tree_0', 'tree_1', 'rock_0'],
    crypt: ['ground_0', 'ground_1', 'ground_2', 'pillar_0', 'skull_pile_0', 'brazier_0'],
    tundra: ['ground_0', 'ground_1', 'ground_2', 'ice_spire_0', 'frozen_tree_0', 'frozen_corpse_0']
};

// ---------------------------------------------------------------------------
// Image Loading
// ---------------------------------------------------------------------------

function loadImage(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null); // Graceful fallback
        img.src = src + '?v=' + CACHE_V;
    });
}

// ---------------------------------------------------------------------------
// Preload All Assets
// ---------------------------------------------------------------------------

export async function preloadAll() {
    const promises = [];

    // Player sprites
    const playerDef = SPRITE_MANIFEST.player;
    for (const frame of playerDef.frames) {
        promises.push(
            loadImage(`${ASSET_BASE}/${playerDef.path}/${frame}.png`).then(img => {
                if (img) {
                    if (!sprites.has('player')) sprites.set('player', new Map());
                    sprites.get('player').set(frame, img);
                }
            })
        );
    }

    // Enemy sprites
    for (const [id, def] of Object.entries(SPRITE_MANIFEST.enemies)) {
        for (const frame of def.frames) {
            promises.push(
                loadImage(`${ASSET_BASE}/${def.path}/${frame}.png`).then(img => {
                    if (img) {
                        if (!sprites.has(id)) sprites.set(id, new Map());
                        sprites.get(id).set(frame, img);
                    }
                })
            );
        }
    }

    // Boss sprites
    for (const [id, def] of Object.entries(SPRITE_MANIFEST.bosses)) {
        for (const frame of def.frames) {
            promises.push(
                loadImage(`${ASSET_BASE}/${def.path}/${frame}.png`).then(img => {
                    if (img) {
                        if (!sprites.has(id)) sprites.set(id, new Map());
                        sprites.get(id).set(frame, img);
                    }
                })
            );
        }
    }

    // UI icons
    for (const [type, ids] of Object.entries(ICON_MANIFEST)) {
        for (const id of ids) {
            promises.push(
                loadImage(`${ASSET_BASE}/ui/icons/${id}.png`).then(img => {
                    if (img) {
                        if (!icons.has(type)) icons.set(type, new Map());
                        icons.get(type).set(id, img);
                    }
                })
            );
        }
    }

    // Background tiles
    for (const [stageId, tileNames] of Object.entries(TILE_MANIFEST)) {
        for (const name of tileNames) {
            promises.push(
                loadImage(`${ASSET_BASE}/backgrounds/${stageId}/${name}.png`).then(img => {
                    if (img) {
                        if (!tiles.has(stageId)) tiles.set(stageId, new Map());
                        tiles.get(stageId).set(name, img);
                    }
                })
            );
        }
    }

    await Promise.all(promises);
    spritesReady = true;

    // Report load status
    let loaded = 0;
    let total = 0;
    sprites.forEach(m => { loaded += m.size; });
    icons.forEach(m => { loaded += m.size; });
    tiles.forEach(m => { loaded += m.size; });

    total = SPRITE_MANIFEST.player.frames.length;
    for (const d of Object.values(SPRITE_MANIFEST.enemies)) total += d.frames.length;
    for (const d of Object.values(SPRITE_MANIFEST.bosses)) total += d.frames.length;
    for (const ids of Object.values(ICON_MANIFEST)) total += ids.length;
    for (const names of Object.values(TILE_MANIFEST)) total += names.length;

    console.log(`[sprite-loader] Loaded ${loaded}/${total} assets`);
}

// ---------------------------------------------------------------------------
// Accessors (return null if not loaded → fallback to procedural rendering)
// ---------------------------------------------------------------------------

/**
 * Get a sprite frame for an entity.
 * @param {string} id - Entity id (e.g. 'bat', 'player', 'reaper')
 * @param {number} frameIndex - Animation frame index (wraps around available frames)
 * @returns {HTMLImageElement|null}
 */
export function getSprite(id, frameIndex = 0) {
    const frameMap = sprites.get(id);
    if (!frameMap || frameMap.size === 0) return null;
    const frames = Array.from(frameMap.values());
    return frames[frameIndex % frames.length] || null;
}

/**
 * Get a sprite by exact frame name.
 * @param {string} id - Entity id
 * @param {string} frameName - Exact frame name (e.g. 'idle_0')
 * @returns {HTMLImageElement|null}
 */
export function getSpriteByName(id, frameName) {
    const frameMap = sprites.get(id);
    if (!frameMap) return null;
    return frameMap.get(frameName) || null;
}

/**
 * Get a UI icon image.
 * @param {'weapons'|'passives'} type
 * @param {string} id - Icon id (e.g. 'whip', 'max_hp')
 * @returns {HTMLImageElement|null}
 */
export function getIcon(type, id) {
    const typeMap = icons.get(type);
    if (!typeMap) return null;
    return typeMap.get(id) || null;
}

/**
 * Get a background tile image.
 * @param {string} stageId - Stage id ('forest', 'crypt', 'tundra')
 * @param {string} tileName - Tile name (e.g. 'ground_0', 'tree_0')
 * @returns {HTMLImageElement|null}
 */
export function getTile(stageId, tileName) {
    const stageMap = tiles.get(stageId);
    if (!stageMap) return null;
    return stageMap.get(tileName) || null;
}

/**
 * Check if sprites are available for a given entity.
 * @param {string} id
 * @returns {boolean}
 */
export function hasSprite(id) {
    const frameMap = sprites.get(id);
    return frameMap != null && frameMap.size > 0;
}

/**
 * Get the number of frames available for an entity.
 * @param {string} id
 * @returns {number}
 */
export function getFrameCount(id) {
    const frameMap = sprites.get(id);
    return frameMap ? frameMap.size : 0;
}
