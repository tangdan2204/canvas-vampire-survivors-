#!/usr/bin/env node
/**
 * fix-backgrounds.js — Remove solid backgrounds from generated sprites.
 *
 * Strategy: Sample corner pixels to detect background color, then make all
 * pixels within a color-distance threshold of that color fully transparent.
 * Uses nearest-neighbor resize to maintain pixel art crispness.
 */

const { readFileSync, writeFileSync, existsSync } = require('fs');
const { join } = require('path');
const sharp = require('sharp');

const ROOT = join(__dirname, '..');
const PROMPTS_FILE = join(__dirname, 'prompts.json');

const COLOR_THRESHOLD = 45; // Max color distance to consider as "background"

async function removeBackground(filePath, targetW, targetH, isBackground) {
    if (!existsSync(filePath)) return null;

    // Skip background tiles (they should keep their fill)
    if (isBackground) {
        // Just resize with nearest-neighbor
        const buf = await sharp(filePath)
            .resize(targetW, targetH, { kernel: 'nearest', fit: 'fill' })
            .png()
            .toBuffer();
        writeFileSync(filePath, buf);
        return { skipped: 'background tile' };
    }

    const image = sharp(filePath);
    const meta = await image.metadata();
    const raw = await image.ensureAlpha().raw().toBuffer();
    const w = meta.width;
    const h = meta.height;
    const channels = 4; // RGBA after ensureAlpha

    // Sample corners to detect background color
    function getPixel(x, y) {
        const idx = (y * w + x) * channels;
        return [raw[idx], raw[idx+1], raw[idx+2], raw[idx+3]];
    }

    const corners = [
        getPixel(0, 0), getPixel(w-1, 0),
        getPixel(0, h-1), getPixel(w-1, h-1),
        getPixel(1, 1), getPixel(w-2, 1),
        getPixel(1, h-2), getPixel(w-2, h-2)
    ];

    // Find most common corner color (background)
    let bgColor = corners[0];
    const colorCounts = new Map();
    for (const c of corners) {
        const key = `${c[0]},${c[1]},${c[2]}`;
        colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
        if ((colorCounts.get(key) || 0) > (colorCounts.get(`${bgColor[0]},${bgColor[1]},${bgColor[2]}`) || 0)) {
            bgColor = c;
        }
    }

    // If corner is already transparent, no background removal needed
    if (bgColor[3] === 0) {
        const buf = await sharp(filePath)
            .resize(targetW, targetH, { kernel: 'nearest', fit: 'contain', background: {r:0,g:0,b:0,alpha:0} })
            .png()
            .toBuffer();
        writeFileSync(filePath, buf);
        return { action: 'resize only (already transparent)' };
    }

    // Remove background: set matching pixels to transparent
    const output = Buffer.from(raw);
    let removed = 0;
    for (let i = 0; i < output.length; i += channels) {
        const r = output[i], g = output[i+1], b = output[i+2];
        const dist = Math.sqrt(
            (r - bgColor[0]) ** 2 +
            (g - bgColor[1]) ** 2 +
            (b - bgColor[2]) ** 2
        );
        if (dist < COLOR_THRESHOLD) {
            output[i+3] = 0; // Make transparent
            removed++;
        }
    }

    // Write back with background removed, then resize
    const cleaned = await sharp(output, { raw: { width: w, height: h, channels: 4 } })
        .resize(targetW, targetH, { kernel: 'nearest', fit: 'contain', background: {r:0,g:0,b:0,alpha:0} })
        .png()
        .toBuffer();

    writeFileSync(filePath, cleaned);
    const totalPixels = w * h;
    return {
        bgColor: `rgb(${bgColor[0]},${bgColor[1]},${bgColor[2]})`,
        removed: `${removed}/${totalPixels} (${Math.round(removed/totalPixels*100)}%)`
    };
}

async function main() {
    const prompts = JSON.parse(readFileSync(PROMPTS_FILE, 'utf8'));

    console.log(`Processing ${prompts.length} assets — removing backgrounds...\n`);
    let processed = 0, skipped = 0, errors = 0;

    for (const entry of prompts) {
        const filePath = join(ROOT, entry.outputPath);
        if (!existsSync(filePath)) { skipped++; continue; }

        const isBackgroundTile = entry.category === 'backgrounds' && entry.id.includes('ground');

        try {
            const result = await removeBackground(filePath, entry.size[0], entry.size[1], isBackgroundTile);
            if (result) {
                const info = result.skipped || `bg=${result.bgColor} removed=${result.removed}` || result.action;
                console.log(`  ✅ ${entry.id}: ${info}`);
                processed++;
            }
        } catch (err) {
            console.log(`  ❌ ${entry.id}: ${err.message}`);
            errors++;
        }
    }

    console.log(`\nDone: ${processed} processed, ${skipped} missing, ${errors} errors`);
}

main().catch(err => { console.error(err); process.exit(1); });
