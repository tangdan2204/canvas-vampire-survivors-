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
const STYLE_PREFIX = `3D cute chibi sphere character, perfectly round glossy ball shape, Chinese opera face-paint style (京剧脸谱) painted in bold flat color blocks on sphere surface, dramatic thick painted eye outlines, stylized opera-mask eyes with glowing pupils, all facial features are SURFACE PAINT (not 3D modeled geometry), sharp clean color boundaries between paint regions, rich vibrant saturated colors, smooth cel-shading with soft rim lighting from above-left, game asset on PURE WHITE background (#FFFFFF), centered composition, single sphere character, professional quality 3D render, highly detailed, colorful`;

const STYLE_SUFFIX = `pure solid white background, no ground plane, no shadows on ground, no gradient background, perfectly spherical silhouette maintained, face-paint consistent with Chinese opera mask tradition (脸谱), bold graphic color blocking, vibrant rich colors, no text, no watermark, game-ready sprite asset`;

// ---------------------------------------------------------------------------
// ASSET DEFINITIONS — 球形角色 + 草原背景
// ---------------------------------------------------------------------------
const ASSETS = [
    // ===== PLAYER =====
    { id: 'player_idle', category: 'player', path: 'assets/sprites/player/idle_0.png', size: 256,
      prompt: `A sky-blue high-gloss sphere. Face paint: blue-and-white dual-color opera mask — white base face area with bold blue eye-shadow color blocks framing determined glowing blue pupils, thick blue opera eye-lines in classic 丹凤眼 shape, white bangs/fringe pattern painted flat on forehead area, confident small arc smile. Aura: soft blue magical glow halo around sphere. Hero character ball.` },
    { id: 'player_walk', category: 'player', path: 'assets/sprites/player/walk_0.png', size: 256,
      prompt: `A sky-blue high-gloss sphere tilted slightly forward (motion pose). Face paint: same blue-and-white opera mask as idle — white base, blue eye-shadow blocks, thick blue eye-lines, white bangs on forehead, determined smile. Tiny blue motion trail behind sphere. Dynamic hero ball.` },

    // ===== ENEMIES =====
    { id: 'enemy_bat', category: 'enemies', path: 'assets/sprites/enemies/bat/fly_0.png', size: 256,
      prompt: `A dark purple satin-gloss sphere. Face paint: purple-and-black dual-color opera mask — large purple triangular eye-shadow blocks extending upward to forehead like bat-wing shapes, bright purple glowing round pupils, white sharp little fang marks at bottom mouth area. Accents: two tiny pointed horn nubs on top, small decorative wing patterns painted flat on sphere sides (surface art, NOT 3D wings). Aura: faint purple spectral glow. Bat ball.` },
    { id: 'enemy_zombie', category: 'enemies', path: 'assets/sprites/enemies/zombie/walk_0.png', size: 256,
      prompt: `A dark green matte sphere. Face paint: red-and-green classic opera mask (传统脸谱) — bright red center face region with dark green outer frame, asymmetric eyes (one large one small), bold black stitch/sewing line marks across face, drooling mouth with green drip. Aura: sickly green glow from surface cracks. Zombie ball, cute but grotesque.` },
    { id: 'enemy_skeleton', category: 'enemies', path: 'assets/sprites/enemies/skeleton/walk_0.png', size: 256,
      prompt: `A bone-white eggshell-textured sphere. Face paint: black-white-orange skull opera mask — large round black eye-socket circles with bright orange glowing pupils inside, black inverted-triangle nasal cavity mark, opera-style toothy grin pattern (white base with black line teeth rows), fine crack lines across forehead. Aura: faint orange bone-fire wisps. Skeleton ball.` },
    { id: 'enemy_wolf', category: 'enemies', path: 'assets/sprites/enemies/wolf/run_0.png', size: 256,
      prompt: `A dark brown furry-textured sphere. Face paint: brown-and-gold tiger-wolf opera mask — golden center face area, thick brown brow-lines and bold eye-lines, fierce amber glowing pupils, snarling fang-teeth pattern, faint 王 character shadow mark on forehead. Accents: two small pointed ear nubs on top of sphere. Wolf dire ball, fierce and powerful.` },
    { id: 'enemy_golem', category: 'enemies', path: 'assets/sprites/enemies/golem/idle_0.png', size: 256,
      prompt: `A large gray cracked-stone-textured sphere. Face paint: gray-and-red rage opera mask — bold red spiral rage-swirl patterns extending from eye corners down to chin area, tiny squinting angry eyes with heavy brow-ridge lines, NO mouth (silent menace). Aura: purple energy glow seeping from stone crack lines across surface. Golem ball, hulking and imposing.` },
    { id: 'enemy_ghost', category: 'enemies', path: 'assets/sprites/enemies/ghost/float_0.png', size: 256,
      prompt: `A translucent ice-blue semi-transparent sphere. Face paint: blue-red-black triple-color horror opera mask — large hollow black void-circle eyes with red flame-pattern eye-shadow streaks above, red tear-streak lines dripping down from eye corners, horrified O-shaped open mouth. Accents: ethereal wispy ghost trail flowing from bottom of sphere. Aura: icy blue spectral glow. Ghost wraith ball.` },
    { id: 'enemy_mage', category: 'enemies', path: 'assets/sprites/enemies/mage/idle_0.png', size: 256,
      prompt: `A deep purple silk-sheen sphere. Face paint: purple shadow opera mask — hooded cloak silhouette pattern painted across upper hemisphere of sphere (flat surface art, NOT 3D hood), two bright purple glowing pupils visible beneath hood-shadow area, rest of face covered in dark shadow paint (mysterious). Aura: small floating purple arcane rune symbols orbiting sphere. Dark mage ball.` },
    { id: 'enemy_slime', category: 'enemies', path: 'assets/sprites/enemies/slime/idle_0.png', size: 256,
      prompt: `A teal-green translucent jelly-like sphere with visible glowing warm core inside. Face paint: cute simplified opera mask — two large round eyes with black circle outlines and white highlight-dot pupils, small curved happy-smile mouth line, round rosy-red blush color blocks on both cheeks (opera-style 腮红 rouge spots). Slime ball, adorable and bouncy.` },
    { id: 'enemy_slimeling', category: 'enemies', path: 'assets/sprites/enemies/slimeling/hop_0.png', size: 256,
      prompt: `A tiny light teal translucent sphere (smaller than others). Face paint: minimal baby opera mask — single large round eye with black outline and huge white highlight-dot pupil (baby cyclops look), tiny round surprised mouth dot. Very simple, very innocent. Aura: faint internal warm glow. Baby slime ball.` },
    { id: 'enemy_bomber', category: 'enemies', path: 'assets/sprites/enemies/bomber/roll_0.png', size: 256,
      prompt: `An orange-red metallic sphere with fiery crack lines showing inner flame glow. Face paint: red-black-white triple-color rage opera mask (classic 张飞式怒脸) — thick black upward-sweeping brow-lines, small white squinting furious eyes, bold black nose-bridge line, tightly shut angry mouth line. Accents: lit sparking fuse/wick protruding from top of sphere. Bomb ball about to explode.` },
    { id: 'enemy_illusionist', category: 'enemies', path: 'assets/sprites/enemies/illusionist/idle_0.png', size: 256,
      prompt: `A light purple gradient dreamy-sheen sphere. Face paint: purple-and-silver dual-color mystic opera mask — elegant half-closed 丹凤眼 eyes with silver eye-shadow color blocks, mysterious serene half-smile, third-eye diamond mark on forehead. Aura: multiple fading translucent afterimage copies of the sphere trailing behind (phantom illusion effect). Illusionist ball.` },

    // ===== BOSSES =====
    { id: 'boss_reaper', category: 'bosses', path: 'assets/sprites/bosses/reaper/idle_0.png', size: 256,
      prompt: `A large dark purple-black sphere (boss-sized, bigger). Face paint: black-white-purple skull opera mask — white skull face region painted on sphere, deep black hollow eye-sockets with violet flames burning outward from eyes, dramatic thick bone-line patterns. Accents: tiny decorative scythe attached to side of sphere. Aura: dark mist wisps curling around base. The Reaper boss ball, imposing yet cute.` },
    { id: 'boss_void_lord', category: 'bosses', path: 'assets/sprites/bosses/void_lord/idle_0.png', size: 256,
      prompt: `A very large deep purple sphere (biggest boss). Face paint: chaotic multi-eye eldritch opera mask — multiple glowing eyes of different sizes scattered across sphere surface, EACH eye has its own bold opera-style eye-line outline, creating a fractal face-paint pattern. Accents: small tentacle-like nubs emerging from sphere edges. Aura: roiling dark void energy ripple effect. Void Lord boss ball, cosmic horror cute.` },
    { id: 'boss_necromancer', category: 'bosses', path: 'assets/sprites/bosses/necromancer/idle_0.png', size: 256,
      prompt: `A large dark purple sphere with ornate gold trim border patterns painted on surface. Face paint: purple-gold-green triple-color necro opera mask — skeletal mage face design with gold border lines framing face regions, bright green glowing eyes, bone-pattern mouth area. Accents: tiny green-glowing skull staff floating beside sphere. Aura: green necromantic energy wisps. Necromancer boss ball.` },
    { id: 'boss_chrono_lich', category: 'bosses', path: 'assets/sprites/bosses/chrono_lich/idle_0.png', size: 256,
      prompt: `A large deep blue metallic sphere with clockwork gear engravings on surface. Face paint: blue-and-silver mechanical opera mask — interlocking gear patterns framing face area, cold icy-blue glowing eyes, skeletal jaw-line features merged into mechanical patterns, hourglass symbol mark on forehead. Aura: visible time-distortion ripple waves around sphere. Chrono Lich boss ball.` },
    { id: 'boss_ice_queen', category: 'bosses', path: 'assets/sprites/bosses/ice_queen/idle_0.png', size: 256,
      prompt: `A large ice-blue crystalline sphere. Face paint: blue-white-silver ice opera mask — elegant cold 丹凤眼 eyes with icy-blue glowing pupils, delicate ice-crystal frost-flower patterns extending from eye corners across cheeks (like frozen face paint), slight disdainful thin-lip expression. Accents: small sharp ice-crystal crown shards protruding from top of sphere. Aura: swirling frost mist around sphere. Ice Queen boss ball, regal and menacing.` },

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
