#!/usr/bin/env node
/**
 * post-process.js — Image Post-Processing Pipeline
 *
 * Processes generated images to ensure they meet game requirements:
 *   - Resize to exact target dimensions
 *   - Trim transparent borders
 *   - Remove/clean backgrounds (make transparent)
 *   - Optimize PNG output
 *
 * Usage:
 *   node tools/post-process.js                     # Process all generated assets
 *   node tools/post-process.js --category sprites  # Process only sprites
 *   node tools/post-process.js --file assets/sprites/player/idle_0.png
 */

const { readFileSync, writeFileSync, existsSync } = require('fs');
const { join, dirname } = require('path');
const sharp = require('sharp');

const ROOT = join(__dirname, '..');

const PROMPTS_FILE = join(__dirname, 'prompts.json');

// ---------------------------------------------------------------------------
// Processing Functions
// ---------------------------------------------------------------------------

async function processImage(inputPath, targetWidth, targetHeight, options = {}) {
    const { isBackground = false } = options;

    let pipeline = sharp(inputPath);
    const metadata = await pipeline.metadata();

    if (!metadata.width || !metadata.height) {
        throw new Error(`Cannot read image dimensions: ${inputPath}`);
    }

    // Step 1: Trim transparent/near-transparent borders (sprites only)
    if (!isBackground) {
        pipeline = pipeline.trim({ threshold: 10 });
    }

    // Step 2: Resize to target dimensions
    pipeline = pipeline.resize(targetWidth, targetHeight, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
        kernel: 'nearest' // Nearest-neighbor for pixel art (no interpolation blur)
    });

    // Step 3: Ensure alpha channel exists
    pipeline = pipeline.ensureAlpha();

    // Step 4: For sprites, attempt to make near-white/near-black backgrounds transparent
    if (!isBackground) {
        pipeline = pipeline.removeAlpha().ensureAlpha(0);
        // Re-approach: use flatten false and keep existing alpha
        pipeline = sharp(inputPath)
            .trim({ threshold: 10 })
            .resize(targetWidth, targetHeight, {
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 },
                kernel: 'nearest'
            })
            .ensureAlpha()
            .png({ compressionLevel: 9 });
    } else {
        pipeline = pipeline.png({ compressionLevel: 9 });
    }

    const outputBuffer = await pipeline.toBuffer();
    writeFileSync(inputPath, outputBuffer);

    const outputMeta = await sharp(outputBuffer).metadata();
    return {
        originalSize: `${metadata.width}x${metadata.height}`,
        finalSize: `${outputMeta.width}x${outputMeta.height}`,
        targetSize: `${targetWidth}x${targetHeight}`,
        bytes: outputBuffer.length
    };
}

// ---------------------------------------------------------------------------
// Batch Processing
// ---------------------------------------------------------------------------

async function processAll(filter = {}) {
    if (!existsSync(PROMPTS_FILE)) {
        console.log('prompts.json not found. Run prompt-builder.js first.');
        process.exit(1);
    }

    const prompts = JSON.parse(readFileSync(PROMPTS_FILE, 'utf8'));
    let toProcess = prompts;

    // Apply filters
    if (filter.category) {
        toProcess = toProcess.filter(p => p.category === filter.category);
    }
    if (filter.subcategory) {
        toProcess = toProcess.filter(p => p.subcategory === filter.subcategory);
    }

    console.log(`Post-processing ${toProcess.length} assets...`);
    let processed = 0;
    let skipped = 0;
    let errors = 0;

    for (const entry of toProcess) {
        const filePath = join(ROOT, entry.outputPath);

        if (!existsSync(filePath)) {
            skipped++;
            continue;
        }

        try {
            const isBackground = entry.category === 'backgrounds' && !entry.id.includes('tree') && !entry.id.includes('pillar') && !entry.id.includes('skull') && !entry.id.includes('brazier') && !entry.id.includes('ice_spire') && !entry.id.includes('frozen');

            const result = await processImage(filePath, entry.size[0], entry.size[1], { isBackground });
            console.log(`  ✅ ${entry.id}: ${result.originalSize} → ${result.finalSize} (${(result.bytes / 1024).toFixed(1)} KB)`);
            processed++;
        } catch (err) {
            console.log(`  ❌ ${entry.id}: ${err.message}`);
            errors++;
        }
    }

    console.log(`\nComplete: ${processed} processed, ${skipped} not found, ${errors} errors`);
}

// ---------------------------------------------------------------------------
// Single File Processing
// ---------------------------------------------------------------------------

async function processSingleFile(filePath, width, height) {
    if (!existsSync(filePath)) {
        console.log(`File not found: ${filePath}`);
        process.exit(1);
    }

    const result = await processImage(filePath, width, height);
    console.log(`Processed: ${result.originalSize} → ${result.finalSize} (${(result.bytes / 1024).toFixed(1)} KB)`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--file')) {
        const file = args[args.indexOf('--file') + 1];
        const width = parseInt(args[args.indexOf('--width') + 1] || '32');
        const height = parseInt(args[args.indexOf('--height') + 1] || '32');
        await processSingleFile(file, width, height);
        return;
    }

    const filter = {};
    if (args.includes('--category')) {
        filter.category = args[args.indexOf('--category') + 1];
    }
    if (args.includes('--subcategory')) {
        filter.subcategory = args[args.indexOf('--subcategory') + 1];
    }

    await processAll(filter);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
