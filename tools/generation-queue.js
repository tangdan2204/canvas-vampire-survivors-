#!/usr/bin/env node
/**
 * generation-queue.js — AIGW Image Generation Queue Engine
 *
 * Reads prompts.json, calls AIGW gemini-3.1-flash-image serially,
 * extracts base64 images from response, saves as PNG files.
 *
 * Features:
 *   - Serial execution with configurable cooldown (prevents 429)
 *   - Linear backoff retry on rate limit (30s / 60s / 90s)
 *   - Persistent queue state (resume from interruption)
 *   - Dry-run mode for prompt verification
 *   - Single-asset test mode
 *
 * Usage:
 *   node tools/generation-queue.js                    # Run full queue
 *   node tools/generation-queue.js --dry-run          # Verify prompts only
 *   node tools/generation-queue.js --test player_idle_0  # Generate single asset
 *   node tools/generation-queue.js --resume           # Resume from last state
 *   node tools/generation-queue.js --status           # Show queue progress
 */

const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const { join, dirname } = require('path');

const ROOT = join(__dirname, '..');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const CONFIG = {
    model: 'gemini-3.1-flash-image',
    endpoint: 'https://aigw.netease.com/v1/chat/completions',
    auth: 'p4x4nxxigw2ccja7.7vfnst67x7dcmghii83cw47uovjqpmrx',
    cooldownMs: 20000,
    maxRetries: 3,
    retryBackoff: [30000, 60000, 90000],
    timeoutMs: 180000,
    temperature: 0.7,
    maxTokens: 4096,
    vertexai: { response_modalities: ['IMAGE', 'TEXT'] }
};

const STATE_FILE = join(__dirname, 'queue-state.json');
const PROMPTS_FILE = join(__dirname, 'prompts.json');

// ---------------------------------------------------------------------------
// State Management
// ---------------------------------------------------------------------------
function loadState() {
    if (existsSync(STATE_FILE)) {
        return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    }
    return { completed: [], failed: [], skipped: [], lastIndex: -1, startedAt: null };
}

function saveState(state) {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Image Extraction (dual strategy from knowledge base)
// ---------------------------------------------------------------------------
function extractImageData(message) {
    const imageUrls = message.image_urls || [];
    if (imageUrls.length === 0) return null;

    const url = imageUrls[0];

    // Strategy 1: Data URI format
    if (url.startsWith('data:image/')) {
        const b64data = url.split(',')[1];
        return Buffer.from(b64data, 'base64');
    }

    // Strategy 2: Bare base64 blob (PNG magic: iVBOR, JPEG magic: /9j/)
    if (url.startsWith('iVBOR') || url.startsWith('/9j/')) {
        return Buffer.from(url.replace(/\n/g, ''), 'base64');
    }

    // Strategy 3: Plain base64 without prefix
    try {
        return Buffer.from(url, 'base64');
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// AIGW API Call
// ---------------------------------------------------------------------------
async function callAIGW(prompt) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CONFIG.timeoutMs);

    try {
        const response = await fetch(CONFIG.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CONFIG.auth}`
            },
            body: JSON.stringify({
                model: CONFIG.model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: CONFIG.maxTokens,
                temperature: CONFIG.temperature,
                vertexai: CONFIG.vertexai
            }),
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (response.status === 429) {
            return { error: 'rate_limited', status: 429 };
        }

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            return { error: `http_${response.status}`, status: response.status, detail: text };
        }

        const data = await response.json();
        const message = data.choices?.[0]?.message;
        if (!message) {
            return { error: 'no_message', detail: JSON.stringify(data).slice(0, 200) };
        }

        const imageBuffer = extractImageData(message);
        if (!imageBuffer) {
            return { error: 'no_image', detail: `message keys: ${Object.keys(message).join(',')}` };
        }

        return { success: true, imageBuffer, usage: data.usage };
    } catch (err) {
        clearTimeout(timeout);
        if (err.name === 'AbortError') {
            return { error: 'timeout' };
        }
        return { error: 'network', detail: err.message };
    }
}

// ---------------------------------------------------------------------------
// Generate Single Asset (with retry)
// ---------------------------------------------------------------------------
async function generateAsset(promptEntry) {
    for (let attempt = 0; attempt < CONFIG.maxRetries; attempt++) {
        const result = await callAIGW(promptEntry.prompt);

        if (result.success) {
            // Ensure output directory exists
            const outputPath = join(ROOT, promptEntry.outputPath);
            const dir = dirname(outputPath);
            mkdirSync(dir, { recursive: true });

            // Write image file
            writeFileSync(outputPath, result.imageBuffer);

            return {
                success: true,
                path: promptEntry.outputPath,
                bytes: result.imageBuffer.length,
                usage: result.usage
            };
        }

        if (result.error === 'rate_limited') {
            const waitMs = CONFIG.retryBackoff[attempt] || 90000;
            console.log(`  ⏳ Rate limited, waiting ${waitMs / 1000}s (attempt ${attempt + 1}/${CONFIG.maxRetries})`);
            await sleep(waitMs);
            continue;
        }

        if (result.error === 'timeout' || result.error === 'network') {
            const waitMs = CONFIG.retryBackoff[attempt] || 90000;
            console.log(`  ⚠️ ${result.error}: ${result.detail || ''}, retrying in ${waitMs / 1000}s`);
            await sleep(waitMs);
            continue;
        }

        // Non-retryable error
        return { success: false, error: result.error, detail: result.detail };
    }

    return { success: false, error: 'max_retries_exceeded' };
}

// ---------------------------------------------------------------------------
// Queue Runner
// ---------------------------------------------------------------------------
async function runQueue(prompts, options = {}) {
    const { dryRun, testId, resume } = options;
    const state = resume ? loadState() : { completed: [], failed: [], skipped: [], lastIndex: -1, startedAt: new Date().toISOString() };

    if (!state.startedAt) state.startedAt = new Date().toISOString();

    // Filter to single asset if test mode
    let queue = testId ? prompts.filter(p => p.id === testId) : prompts;

    if (queue.length === 0) {
        console.log(`No prompts found${testId ? ` matching id '${testId}'` : ''}`);
        return;
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  AIGW Image Generation Queue`);
    console.log(`  Model: ${CONFIG.model}`);
    console.log(`  Total: ${queue.length} assets`);
    console.log(`  Mode: ${dryRun ? 'DRY RUN' : testId ? 'TEST (single)' : 'FULL GENERATION'}`);
    console.log(`${'='.repeat(60)}\n`);

    if (dryRun) {
        for (const entry of queue) {
            console.log(`[${entry.id}]`);
            console.log(`  Category: ${entry.category}/${entry.subcategory}`);
            console.log(`  Size: ${entry.size[0]}x${entry.size[1]}`);
            console.log(`  Output: ${entry.outputPath}`);
            console.log(`  Prompt: ${entry.prompt.slice(0, 120)}...`);
            console.log();
        }
        console.log(`\nDry run complete. ${queue.length} prompts verified.`);
        return;
    }

    let successCount = 0;
    let failCount = 0;
    const startTime = Date.now();

    for (let i = 0; i < queue.length; i++) {
        const entry = queue[i];

        // Skip already completed (resume mode)
        if (state.completed.includes(entry.id)) {
            console.log(`[${i + 1}/${queue.length}] ✓ ${entry.id} (already done, skipping)`);
            continue;
        }

        // Skip if output file already exists
        const outputPath = join(ROOT, entry.outputPath);
        if (existsSync(outputPath)) {
            console.log(`[${i + 1}/${queue.length}] ✓ ${entry.id} (file exists, skipping)`);
            state.skipped.push(entry.id);
            continue;
        }

        console.log(`[${i + 1}/${queue.length}] ⏳ Generating ${entry.id} (${entry.size[0]}x${entry.size[1]})...`);

        const result = await generateAsset(entry);

        if (result.success) {
            console.log(`[${i + 1}/${queue.length}] ✅ ${entry.id} → ${result.path} (${(result.bytes / 1024).toFixed(1)} KB)`);
            state.completed.push(entry.id);
            successCount++;
        } else {
            console.log(`[${i + 1}/${queue.length}] ❌ ${entry.id} FAILED: ${result.error} ${result.detail || ''}`);
            state.failed.push({ id: entry.id, error: result.error, detail: result.detail });
            failCount++;
        }

        state.lastIndex = i;
        saveState(state);

        // Cooldown between requests (skip for last item)
        if (i < queue.length - 1) {
            await sleep(CONFIG.cooldownMs);
        }
    }

    // Final report
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  Generation Complete`);
    console.log(`  ✅ Success: ${successCount}`);
    console.log(`  ❌ Failed:  ${failCount}`);
    console.log(`  ⏭️  Skipped: ${state.skipped.length}`);
    console.log(`  ⏱️  Elapsed: ${elapsed}s`);
    console.log(`${'='.repeat(60)}\n`);

    state.completedAt = new Date().toISOString();
    saveState(state);
}

// ---------------------------------------------------------------------------
// Status Display
// ---------------------------------------------------------------------------
function showStatus() {
    if (!existsSync(STATE_FILE)) {
        console.log('No queue state found. Run generation first.');
        return;
    }
    const state = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    const prompts = JSON.parse(readFileSync(PROMPTS_FILE, 'utf8'));

    console.log(`Queue Status:`);
    console.log(`  Total assets:  ${prompts.length}`);
    console.log(`  Completed:     ${state.completed.length}`);
    console.log(`  Failed:        ${state.failed.length}`);
    console.log(`  Skipped:       ${state.skipped?.length || 0}`);
    console.log(`  Remaining:     ${prompts.length - state.completed.length - (state.skipped?.length || 0)}`);
    console.log(`  Started:       ${state.startedAt || 'N/A'}`);
    console.log(`  Last activity: ${state.completedAt || 'in progress'}`);

    if (state.failed.length > 0) {
        console.log(`\n  Failed items:`);
        for (const f of state.failed) {
            console.log(`    - ${f.id}: ${f.error}`);
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    const args = process.argv.slice(2);

    if (args.includes('--status')) {
        showStatus();
        return;
    }

    // Load or generate prompts
    if (!existsSync(PROMPTS_FILE)) {
        console.log('prompts.json not found. Run prompt-builder.js first.');
        console.log('  node tools/prompt-builder.js');
        process.exit(1);
    }

    const prompts = JSON.parse(readFileSync(PROMPTS_FILE, 'utf8'));

    const options = {
        dryRun: args.includes('--dry-run'),
        testId: args.includes('--test') ? args[args.indexOf('--test') + 1] : null,
        resume: args.includes('--resume')
    };

    await runQueue(prompts, options);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
