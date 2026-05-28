#!/usr/bin/env node
/**
 * generate-sphere-chars.js — 可爱球形脸谱角色 + 草原背景 生成管线
 *
 * 模型: gemini-3-pro-image (AIGW 专业生图，4K，思维链)
 * 风格: 3D 圆形球体 + 脸谱化表情
 * 扣背景: 白底生成 → 像素级背景移除 (R>240,G>240,B>240 → 透明)
 *
 * Usage:
 *   node tools/generate-sphere-chars.js              # 生成全部资源
 *   node tools/generate-sphere-chars.js --test       # 测试前 2 个
 *   node tools/generate-sphere-chars.js --dry-run    # 仅打印 prompt
 *   node tools/generate-sphere-chars.js --resume     # 从上次中断继续
 *   node tools/generate-sphere-chars.js --only bosses  # 仅生成 bosses
 */

const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const { join, dirname } = require('path');
const sharp = require('sharp');

const ROOT = join(__dirname, '..');

// ---------------------------------------------------------------------------
// CONFIG — gemini-3-pro-image via AIGW
// ---------------------------------------------------------------------------
const CONFIG = {
    model: 'gemini-3-pro-image',
    endpoint: 'https://aigw.netease.com/v1/chat/completions',
    auth: 'p4x4nxxigw2ccja7.7vfnst67x7dcmghii83cw47uovjqpmrx',
    cooldownMs: 25000,
    maxRetries: 3,
    retryBackoff: [30000, 60000, 90000],
    timeoutMs: 240000,
    temperature: 0.8,
    maxTokens: 4096,
    vertexai: { response_modalities: ['IMAGE', 'TEXT'] }
};

const STATE_FILE = join(__dirname, 'sphere-gen-state.json');

// ---------------------------------------------------------------------------
// STYLE — 球形脸谱风格
// ---------------------------------------------------------------------------
const STYLE_PREFIX = `3D rendered cute spherical ball character, perfectly round glossy sphere shape, character face painted directly on sphere surface like Chinese opera face paint (脸谱 style mask), big cute expressive eyes on sphere surface, smooth cel-shading, soft studio lighting, kawaii adorable style, game asset on PURE WHITE background (#FFFFFF), centered composition, single sphere character, professional quality 3D render`;

const STYLE_SUFFIX = `pure solid white background, no shadows on ground, no gradient background, clean studio lighting, game-ready sphere asset, perfectly round sphere shape maintained, no text, no watermark`;

// ---------------------------------------------------------------------------
// ASSET DEFINITIONS — 球形角色 + 草原背景
// ---------------------------------------------------------------------------
const ASSETS = [
    // ===== PLAYER =====
    { id: 'player_idle', category: 'player', path: 'assets/sprites/player/idle_0.png', size: 256,
      prompt: `A sky-blue glossy sphere character. Face paint on sphere: determined glowing blue eyes, short white bangs/fringe painted flat on sphere surface, confident small smile. The sphere has a subtle blue magical glow aura. Hero character ball.` },
    { id: 'player_walk', category: 'player', path: 'assets/sprites/player/walk_0.png', size: 256,
      prompt: `A sky-blue glossy sphere character in motion (slight tilt/lean forward suggesting movement). Same face as idle: blue glowing eyes, white bangs, determined smile. Tiny blue motion trail behind. Dynamic hero ball.` },

    // ===== ENEMIES =====
    { id: 'enemy_bat', category: 'enemies', path: 'assets/sprites/enemies/bat/fly_0.png', size: 256,
      prompt: `A small purple glossy sphere character. Face paint: large purple glowing eyes (cute but spooky), tiny sharp fangs at bottom, pointed ear-like protrusions on top of sphere. Tiny translucent purple wings on sides. Spectral bat ball.` },
    { id: 'enemy_zombie', category: 'enemies', path: 'assets/sprites/enemies/zombie/walk_0.png', size: 256,
      prompt: `A dark green matte sphere character. Face paint: one large eye and one small eye (asymmetric), stitch/sewing marks across face, greenish glow from cracks, drooling mouth. Zombie ball, cute but grotesque.` },
    { id: 'enemy_skeleton', category: 'enemies', path: 'assets/sprites/enemies/skeleton/walk_0.png', size: 256,
      prompt: `A white bone-textured sphere character. Face paint: skull face pattern with orange glowing eye sockets, nasal cavity mark, toothy grin. Surface has subtle crack/bone texture. Undead skeleton ball.` },
    { id: 'enemy_wolf', category: 'enemies', path: 'assets/sprites/enemies/wolf/run_0.png', size: 256,
      prompt: `A dark brown furry-textured sphere character. Face paint: fierce amber glowing eyes, pointed ear protrusions on top, visible fangs/snarl mouth, dark whisker marks. Aggressive dire wolf ball.` },
    { id: 'enemy_golem', category: 'enemies', path: 'assets/sprites/enemies/golem/idle_0.png', size: 256,
      prompt: `A large gray rocky sphere character. Surface texture: cracked stone with purple glowing cracks between segments. Face paint: tiny squinting angry eyes, heavy brow ridge, no mouth visible. Hulking stone golem ball, bigger than others.` },
    { id: 'enemy_ghost', category: 'enemies', path: 'assets/sprites/enemies/ghost/float_0.png', size: 256,
      prompt: `A translucent ice-blue sphere character (semi-transparent look). Face paint: large hollow black eye circles (empty/void), surprised O-shaped mouth, ethereal wispy trail at bottom of sphere. Ghost wraith ball.` },
    { id: 'enemy_mage', category: 'enemies', path: 'assets/sprites/enemies/mage/idle_0.png', size: 256,
      prompt: `A deep purple sphere character. Face paint: hooded cloak silhouette sculpted/painted on sphere surface, two glowing purple pupils visible under hood shadow, arcane symbols floating around sphere. Dark mage ball.` },
    { id: 'enemy_slime', category: 'enemies', path: 'assets/sprites/enemies/slime/idle_0.png', size: 256,
      prompt: `A translucent teal-green jelly-like sphere character. Face paint: two large round adorable eyes with highlights, small happy smile. A glowing core visible inside the translucent sphere. Cute slime ball.` },
    { id: 'enemy_slimeling', category: 'enemies', path: 'assets/sprites/enemies/slimeling/hop_0.png', size: 256,
      prompt: `A tiny light teal translucent sphere character (smaller than others). Face paint: single large cute eye with big highlight, innocent expression. Tiny baby slime ball. Very simple and adorable.` },
    { id: 'enemy_bomber', category: 'enemies', path: 'assets/sprites/enemies/bomber/roll_0.png', size: 256,
      prompt: `An orange-red sphere character with cracks showing inner fire glow. Face paint: tiny angry squinting eyes, tightly closed frustrated mouth. A lit fuse/wick protrusion sparking on top of sphere. Bomb ball about to explode.` },
    { id: 'enemy_illusionist', category: 'enemies', path: 'assets/sprites/enemies/illusionist/idle_0.png', size: 256,
      prompt: `A light purple gradient sphere character. Face paint: mysterious half-closed elegant eyes, serene enigmatic expression. Multiple fading afterimage copies of the sphere trailing behind (illusion effect). Phantom mage ball.` },

    // ===== BOSSES =====
    { id: 'boss_reaper', category: 'bosses', path: 'assets/sprites/bosses/reaper/idle_0.png', size: 256,
      prompt: `A large dark purple-black sphere character (boss-sized). Face paint: white skull face pattern with burning violet flame eyes. A tiny decorative scythe attached to side of sphere. Dark mist wisps around base. The Reaper boss ball, imposing yet cute.` },
    { id: 'boss_void_lord', category: 'bosses', path: 'assets/sprites/bosses/void_lord/idle_0.png', size: 256,
      prompt: `A very large deep purple sphere character (biggest boss). Multiple glowing eyes of different sizes scattered randomly across sphere surface. Small tentacle-like protrusions emerging from sphere. Roiling void energy effect. The Void Lord boss ball, eldritch horror cute.` },
    { id: 'boss_necromancer', category: 'bosses', path: 'assets/sprites/bosses/necromancer/idle_0.png', size: 256,
      prompt: `A large dark purple sphere with gold trim/border patterns on surface. Face paint: skeletal mage face with glowing green eyes, tiny green-glowing skull staff floating beside sphere. Necromancer boss ball, dark magic cute.` },
    { id: 'boss_chrono_lich', category: 'bosses', path: 'assets/sprites/bosses/chrono_lich/idle_0.png', size: 256,
      prompt: `A large deep blue sphere character. Surface pattern: clockwork gear engravings and mechanical patterns. Face paint: cold icy blue glowing eyes, skeletal features, hourglass symbol on forehead. Time distortion ripple effect around sphere. Chrono Lich boss ball.` },
    { id: 'boss_ice_queen', category: 'bosses', path: 'assets/sprites/bosses/ice_queen/idle_0.png', size: 256,
      prompt: `A large ice-blue crystalline sphere character. An ice crown with sharp crystal shards protrudes from top. Face paint: elegant cold beautiful face, icy blue eyes, slight frosty disdain expression, frost crystal patterns on cheeks. Ice Queen boss ball, regal and menacing.` },

    // ===== GRASSLAND BACKGROUNDS =====
    { id: 'bg_grassland_0', category: 'backgrounds', path: 'assets/backgrounds/grassland/ground_0.png', size: 512, isTile: true,
      prompt: `Top-down view lush green grassland floor texture, bright cheerful green grass, small scattered wildflowers (tiny white daisies, yellow dandelions), warm sunlit meadow feel, seamless tileable game background pattern, soft natural warm colors, game tile texture` },
    { id: 'bg_grassland_1', category: 'backgrounds', path: 'assets/backgrounds/grassland/ground_1.png', size: 512, isTile: true,
      prompt: `Top-down view green grassland floor texture variation, green grass with small pebbles and three-leaf clovers scattered, slightly different grass shade, seamless tileable game background pattern, soft natural colors, game tile texture` },
    { id: 'bg_grassland_2', category: 'backgrounds', path: 'assets/backgrounds/grassland/ground_2.png', size: 512, isTile: true,
      prompt: `Top-down view green grassland floor texture variation, slightly taller grass patches with small butterfly flowers, natural grass transition areas, seamless tileable game background pattern, cheerful green tones, game tile texture` },
];

// ---------------------------------------------------------------------------
// IMAGE EXTRACTION — 双策略 base64 提取（知识图谱方案）
// ---------------------------------------------------------------------------
function extractImageData(message) {
    const imageUrls = message.image_urls || [];
    if (imageUrls.length === 0) return null;
    const url = imageUrls[0];
    if (url.startsWith('data:image/')) return Buffer.from(url.split(',')[1], 'base64');
    if (url.startsWith('iVBOR') || url.startsWith('/9j/')) return Buffer.from(url.replace(/\n/g, ''), 'base64');
    try { return Buffer.from(url, 'base64'); } catch { return null; }
}

// ---------------------------------------------------------------------------
// BACKGROUND REMOVAL — 白底扣除 + Trim + Resize
// ---------------------------------------------------------------------------
async function removeWhiteBackground(inputBuffer, targetSize, isTile) {
    if (isTile) {
        return sharp(inputBuffer)
            .resize(targetSize, targetSize, { kernel: 'lanczos3', fit: 'cover' })
            .png()
            .toBuffer();
    }

    const image = sharp(inputBuffer);
    const meta = await image.metadata();
    const raw = await sharp(inputBuffer).ensureAlpha().raw().toBuffer();
    const w = meta.width, h = meta.height;

    const output = Buffer.from(raw);
    const WHITE_THRESHOLD = 240;
    let removed = 0;
    for (let i = 0; i < output.length; i += 4) {
        const r = output[i], g = output[i+1], b = output[i+2];
        if (r > WHITE_THRESHOLD && g > WHITE_THRESHOLD && b > WHITE_THRESHOLD) {
            output[i+3] = 0;
            removed++;
        }
    }

    const total = w * h;
    const pct = ((removed / total) * 100).toFixed(1);

    const cleaned = await sharp(output, { raw: { width: w, height: h, channels: 4 } })
        .trim({ threshold: 5 })
        .resize(targetSize, targetSize, {
            kernel: 'lanczos3',
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toBuffer();

    return { buffer: cleaned, removedPct: pct };
}

// ---------------------------------------------------------------------------
// STATE MANAGEMENT
// ---------------------------------------------------------------------------
function loadState() {
    if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
    return { completed: [], failed: [], lastIndex: -1, startedAt: null };
}

function saveState(state) {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// GENERATE SINGLE ASSET
// ---------------------------------------------------------------------------
async function generateAsset(asset) {
    const fullPrompt = asset.isTile
        ? `${asset.prompt}. No characters, no objects, pure ground texture.`
        : `${STYLE_PREFIX}. ${asset.prompt}. ${STYLE_SUFFIX}`;

    for (let attempt = 0; attempt < CONFIG.maxRetries; attempt++) {
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
                    messages: [{ role: 'user', content: fullPrompt }],
                    max_tokens: CONFIG.maxTokens,
                    temperature: CONFIG.temperature,
                    vertexai: CONFIG.vertexai
                }),
                signal: controller.signal
            });
            clearTimeout(timeout);

            if (response.status === 429) {
                const wait = CONFIG.retryBackoff[attempt] || 90000;
                console.log(`  ⏳ 429 rate limited, waiting ${wait/1000}s...`);
                await sleep(wait);
                continue;
            }
            if (!response.ok) {
                const text = await response.text().catch(() => '');
                console.log(`  ⚠️ HTTP ${response.status}: ${text.slice(0, 200)}`);
                await sleep(CONFIG.retryBackoff[attempt] || 30000);
                continue;
            }

            const data = await response.json();
            const message = data.choices?.[0]?.message;
            const imageBuffer = message ? extractImageData(message) : null;
            if (!imageBuffer) {
                console.log(`  ⚠️ No image in response (content: ${message?.content?.slice(0, 100) || 'empty'})`);
                continue;
            }

            const result = await removeWhiteBackground(imageBuffer, asset.size, asset.isTile);
            const finalBuffer = asset.isTile ? result : result.buffer;

            const outPath = join(ROOT, asset.path);
            mkdirSync(dirname(outPath), { recursive: true });
            writeFileSync(outPath, finalBuffer);

            const bytes = finalBuffer.length;
            const removedPct = asset.isTile ? 'N/A' : result.removedPct;
            return { success: true, bytes, removedPct };
        } catch (err) {
            clearTimeout(timeout);
            if (err.name === 'AbortError') {
                console.log(`  ⚠️ Timeout (${CONFIG.timeoutMs/1000}s)`);
            } else {
                console.log(`  ⚠️ ${err.message}`);
            }
            await sleep(CONFIG.retryBackoff[attempt] || 30000);
        }
    }
    return { success: false };
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    const args = process.argv.slice(2);
    const testMode = args.includes('--test');
    const dryRun = args.includes('--dry-run');
    const resume = args.includes('--resume');
    const onlyFilter = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

    let queue = ASSETS;
    if (onlyFilter) {
        queue = queue.filter(a => a.category === onlyFilter);
    }
    if (testMode) {
        queue = queue.slice(0, 2);
    }

    const state = resume ? loadState() : { completed: [], failed: [], lastIndex: -1, startedAt: new Date().toISOString() };

    if (resume && state.completed.length > 0) {
        queue = queue.filter(a => !state.completed.includes(a.id));
        console.log(`  📋 Resuming: ${state.completed.length} already done, ${queue.length} remaining`);
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  🔮 Sphere Character Generation Pipeline`);
    console.log(`  Model: ${CONFIG.model}`);
    console.log(`  Style: Cute 3D Sphere + Face Paint (脸谱)`);
    console.log(`  Total: ${queue.length} assets`);
    console.log(`  Mode: ${testMode ? 'TEST' : dryRun ? 'DRY-RUN' : 'FULL'}`);
    console.log(`${'═'.repeat(60)}\n`);

    if (dryRun) {
        for (const asset of queue) {
            const prompt = asset.isTile
                ? `${asset.prompt}. No characters, no objects, pure ground texture.`
                : `${STYLE_PREFIX}. ${asset.prompt}. ${STYLE_SUFFIX}`;
            console.log(`[${asset.id}] → ${asset.path}`);
            console.log(`  Prompt (${prompt.length} chars): ${prompt.slice(0, 120)}...`);
            console.log();
        }
        return;
    }

    let success = 0, fail = 0;
    for (let i = 0; i < queue.length; i++) {
        const asset = queue[i];
        console.log(`[${i+1}/${queue.length}] Generating ${asset.id} → ${asset.path}`);

        const result = await generateAsset(asset);
        if (result.success) {
            console.log(`  ✅ ${asset.id} (${(result.bytes/1024).toFixed(1)} KB, bg removed: ${result.removedPct}%)`);
            state.completed.push(asset.id);
            success++;
        } else {
            console.log(`  ❌ ${asset.id} FAILED after ${CONFIG.maxRetries} attempts`);
            state.failed.push(asset.id);
            fail++;
        }

        saveState(state);

        if (i < queue.length - 1) {
            console.log(`  ⏱️ Cooling down ${CONFIG.cooldownMs/1000}s...`);
            await sleep(CONFIG.cooldownMs);
        }
    }

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  Complete: ✅ ${success} | ❌ ${fail}`);
    if (state.failed.length > 0) {
        console.log(`  Failed IDs: ${state.failed.join(', ')}`);
    }
    console.log(`${'═'.repeat(60)}\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
