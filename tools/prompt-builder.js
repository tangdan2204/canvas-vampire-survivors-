#!/usr/bin/env node
/**
 * prompt-builder.js — Generates structured prompts for each asset in the manifest.
 * Reads asset-manifest.json + game-lore.json → outputs prompts.json
 *
 * Usage: node tools/prompt-builder.js [--output tools/prompts.json]
 */

const { readFileSync, writeFileSync } = require('fs');
const { join } = require('path');

const __dirname_tools = __dirname;
const ROOT = join(__dirname_tools, '..');

const manifest = JSON.parse(readFileSync(join(__dirname_tools, 'asset-manifest.json'), 'utf8'));
const lore = JSON.parse(readFileSync(join(__dirname_tools, 'game-lore.json'), 'utf8'));

const STYLE = manifest.globalStyle;

function buildSpritePrompt(entityId, entityType, frame, size, loreDef) {
    const [w, h] = size;
    const charLore = loreDef || {};
    const visualDesc = charLore.visualDescription || '';
    const colors = (charLore.dominantColors || []).join(', ');

    const parts = [
        STYLE.prefix,
        `${w}x${h} pixel sprite, transparent PNG background`,
        visualDesc,
        colors ? `dominant colors: ${colors}` : '',
        `pose: ${frame.poseHint}`,
        `entity type: ${entityType}, game character sprite sheet frame`,
        STYLE.suffix,
        `output exactly ${w}x${h} pixels`
    ];

    return parts.filter(Boolean).join('. ');
}

function buildBackgroundTilePrompt(stageId, tile, size) {
    const region = lore.regions[stageId];
    const [w, h] = size;
    const palette = (region?.palette || []).join(', ');

    const parts = [
        STYLE.prefix,
        `${w}x${h} pixel tileable ground texture`,
        `setting: ${region?.name || stageId}`,
        `${region?.groundStyle || ''}`,
        tile.hint,
        `color palette: ${palette}`,
        'seamless tile, repeatable in all directions',
        STYLE.suffix,
        `output exactly ${w}x${h} pixels`
    ];

    return parts.filter(Boolean).join('. ');
}

function buildDecorationPrompt(stageId, deco, size) {
    const region = lore.regions[stageId];
    const [w, h] = size;

    const parts = [
        STYLE.prefix,
        `${w}x${h} pixel decoration sprite, transparent PNG background`,
        `setting: ${region?.name || stageId}`,
        deco.hint,
        `fits dark fantasy ${stageId} environment`,
        STYLE.suffix,
        `output exactly ${w}x${h} pixels`
    ];

    return parts.filter(Boolean).join('. ');
}

function buildIconPrompt(iconDef, category) {
    const [w, h] = iconDef.size;

    const parts = [
        'pixel art game icon, 16-bit retro style, clean pixel edges',
        `${w}x${h} pixel icon, transparent PNG background`,
        iconDef.hint,
        `${category} icon for dark fantasy roguelite game UI`,
        'clear silhouette, readable at small size, vibrant colors against dark background',
        'no text, no border, centered'
    ];

    return parts.filter(Boolean).join('. ');
}

function generateAllPrompts() {
    const prompts = [];

    // Player sprites
    const playerDef = manifest.sprites.player;
    const playerLore = lore.characters.player;
    for (const frame of playerDef.frames) {
        prompts.push({
            id: `player_${frame.name}`,
            category: 'sprites',
            subcategory: 'player',
            outputPath: `${playerDef.outputDir}/${frame.name}.png`,
            size: playerDef.size,
            prompt: buildSpritePrompt('player', 'hero protagonist', frame, playerDef.size, playerLore)
        });
    }

    // Enemy sprites
    for (const [key, enemyDef] of Object.entries(manifest.sprites.enemies)) {
        const enemyLore = lore.characters.enemies[key];
        for (const frame of enemyDef.frames) {
            prompts.push({
                id: `enemy_${key}_${frame.name}`,
                category: 'sprites',
                subcategory: 'enemies',
                outputPath: `${enemyDef.outputDir}/${frame.name}.png`,
                size: enemyDef.size,
                prompt: buildSpritePrompt(key, 'enemy monster', frame, enemyDef.size, enemyLore)
            });
        }
    }

    // Boss sprites
    for (const [key, bossDef] of Object.entries(manifest.sprites.bosses)) {
        const bossLore = lore.characters.bosses[key];
        for (const frame of bossDef.frames) {
            prompts.push({
                id: `boss_${key}_${frame.name}`,
                category: 'sprites',
                subcategory: 'bosses',
                outputPath: `${bossDef.outputDir}/${frame.name}.png`,
                size: bossDef.size,
                prompt: buildSpritePrompt(key, 'boss monster large powerful', frame, bossDef.size, bossLore)
            });
        }
    }

    // Background tiles
    for (const [stageId, stageDef] of Object.entries(manifest.backgrounds)) {
        for (const tile of stageDef.tiles) {
            prompts.push({
                id: `bg_${stageId}_${tile.name}`,
                category: 'backgrounds',
                subcategory: stageId,
                outputPath: `${stageDef.outputDir}/${tile.name}.png`,
                size: stageDef.tileSize,
                prompt: buildBackgroundTilePrompt(stageId, tile, stageDef.tileSize)
            });
        }
        for (const deco of stageDef.decorations) {
            prompts.push({
                id: `bg_${stageId}_${deco.name}`,
                category: 'backgrounds',
                subcategory: stageId,
                outputPath: `${stageDef.outputDir}/${deco.name}.png`,
                size: stageDef.decoSize,
                prompt: buildDecorationPrompt(stageId, deco, stageDef.decoSize)
            });
        }
    }

    // UI weapon icons
    for (const [key, iconDef] of Object.entries(manifest.ui.weaponIcons)) {
        prompts.push({
            id: `ui_weapon_${key}`,
            category: 'ui',
            subcategory: 'weapons',
            outputPath: `${manifest.ui.outputDir}/${key}.png`,
            size: iconDef.size,
            prompt: buildIconPrompt(iconDef, 'weapon')
        });
    }

    // UI passive icons
    for (const [key, iconDef] of Object.entries(manifest.ui.passiveIcons)) {
        prompts.push({
            id: `ui_passive_${key}`,
            category: 'ui',
            subcategory: 'passives',
            outputPath: `${manifest.ui.outputDir}/${key}.png`,
            size: iconDef.size,
            prompt: buildIconPrompt(iconDef, 'passive ability')
        });
    }

    return prompts;
}

// Main
const prompts = generateAllPrompts();
const outputPath = process.argv.includes('--output')
    ? process.argv[process.argv.indexOf('--output') + 1]
    : join(__dirname_tools, 'prompts.json');

writeFileSync(outputPath, JSON.stringify(prompts, null, 2), 'utf8');

console.log(`Generated ${prompts.length} prompts → ${outputPath}`);
console.log(`Breakdown:`);
console.log(`  Player frames: ${prompts.filter(p => p.subcategory === 'player').length}`);
console.log(`  Enemy frames:  ${prompts.filter(p => p.subcategory === 'enemies').length}`);
console.log(`  Boss frames:   ${prompts.filter(p => p.subcategory === 'bosses').length}`);
console.log(`  Backgrounds:   ${prompts.filter(p => p.category === 'backgrounds').length}`);
console.log(`  UI icons:      ${prompts.filter(p => p.category === 'ui').length}`);
