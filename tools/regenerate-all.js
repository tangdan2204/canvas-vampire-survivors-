#!/usr/bin/env node
/**
 * regenerate-all.js — Complete pipeline: new prompts → generate → clean background → deploy
 *
 * Style: Cute 3D stylized horror icons (like clay/chibi horror characters)
 * Background: Pure white (#FFFFFF) for clean removal
 * Output: 512x512 with transparent background
 */

const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const { join, dirname } = require('path');
const sharp = require('sharp');

const ROOT = join(__dirname, '..');

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const CONFIG = {
    model: 'gemini-3.1-flash-image',
    endpoint: 'https://aigw.netease.com/v1/chat/completions',
    auth: 'p4x4nxxigw2ccja7.7vfnst67x7dcmghii83cw47uovjqpmrx',
    cooldownMs: 20000,
    maxRetries: 3,
    retryBackoff: [30000, 60000, 90000],
    timeoutMs: 180000,
    temperature: 0.8,
    maxTokens: 4096,
    vertexai: { response_modalities: ['IMAGE', 'TEXT'] }
};

// ---------------------------------------------------------------------------
// STYLE PREFIX — 3D Cute Horror
// ---------------------------------------------------------------------------
const STYLE_PREFIX = `3D rendered game icon, cute stylized chibi character, clay render style, soft lighting, adorable but creepy horror theme, round proportions, big expressive eyes, smooth shading, vibrant saturated colors, game asset on PURE WHITE background (#FFFFFF), centered composition, full body visible, no cropping, high detail`;

const STYLE_SUFFIX = `pure solid white background, no shadows on background, no gradient background, studio lighting, game-ready asset, clean edges, professional quality render`;

// ---------------------------------------------------------------------------
// ASSET DEFINITIONS — Larger, clearer
// ---------------------------------------------------------------------------
const ASSETS = [
    // Player (6 frames → just 2 key poses for this style)
    { id: 'player_idle', path: 'assets/sprites/player/idle_0.png', size: 512,
      prompt: `A cute chibi knight hero character, wearing tattered blue hooded cloak over silver armor, determined glowing blue eyes, short white hair, holding a small sword at ready, standing pose facing viewer. Dark fantasy hero but adorable round proportions.` },
    { id: 'player_walk', path: 'assets/sprites/player/walk_0.png', size: 512,
      prompt: `A cute chibi knight hero character, wearing tattered blue hooded cloak over silver armor, determined glowing blue eyes, running/walking pose with cloak flowing behind, dynamic movement. Same character as before, dark fantasy hero with adorable proportions.` },

    // Enemies
    { id: 'enemy_bat', path: 'assets/sprites/enemies/bat/fly_0.png', size: 512,
      prompt: `A cute but spooky chibi bat creature, purple-violet body, big glowing purple eyes, tiny fangs showing, wings spread wide in flight, ghostly purple aura trail, undead spectral bat. Adorable yet creepy.` },
    { id: 'enemy_zombie', path: 'assets/sprites/enemies/zombie/walk_0.png', size: 512,
      prompt: `A cute chibi zombie character, green-tinted rotting skin, torn dirty clothes, one arm reaching forward, big vacant green glowing eyes, exposed ribs with green glow, stumbling pose. Cute and horrifying.` },
    { id: 'enemy_skeleton', path: 'assets/sprites/enemies/skeleton/walk_0.png', size: 512,
      prompt: `A cute chibi skeleton warrior, white bones with a tiny rusted sword, glowing orange eyes in skull, wearing fragments of ancient armor, rattling walk pose, cartoonish proportions. Adorable undead.` },
    { id: 'enemy_wolf', path: 'assets/sprites/enemies/wolf/run_0.png', size: 512,
      prompt: `A cute chibi dire wolf, dark brown-black fur, fierce glowing amber eyes, elongated fangs, shadow wisps coming from body, running/pouncing aggressive pose, corrupted beast. Cute but menacing.` },
    { id: 'enemy_golem', path: 'assets/sprites/enemies/golem/idle_0.png', size: 512,
      prompt: `A cute chibi stone golem, large chunky gray body made of rocks, glowing purple cracks between stones, tiny angry eyes, massive round fists, shield rune on chest glowing blue. Big and round, adorable hulk.` },
    { id: 'enemy_ghost', path: 'assets/sprites/enemies/ghost/float_0.png', size: 512,
      prompt: `A cute chibi ghost, translucent cyan-blue floating spirit, no legs just wispy tail, big dark hollow eyes, surprised expression, ethereal glow, hovering with arms slightly raised. Cute friendly ghost gone wrong.` },
    { id: 'enemy_mage', path: 'assets/sprites/enemies/mage/idle_0.png', size: 512,
      prompt: `A cute chibi dark cultist mage, wearing oversized purple-magenta hooded robe, hands crackling with purple energy orbs, glowing eyes under hood, floating arcane symbols around. Adorable evil wizard.` },
    { id: 'enemy_slime', path: 'assets/sprites/enemies/slime/idle_0.png', size: 512,
      prompt: `A cute chibi slime blob, round teal-green gelatinous body, visible glowing core inside, two big cute dark eyes, slight smile, bubbling surface, bouncy jiggly appearance. Classic cute slime monster.` },
    { id: 'enemy_slimeling', path: 'assets/sprites/enemies/slimeling/hop_0.png', size: 512,
      prompt: `A tiny cute baby slime, very small light teal blob, one big cute eye, mid-bounce in air, simpler than parent slime, droplets around it. Tiny adorable mini slime.` },
    { id: 'enemy_bomber', path: 'assets/sprites/enemies/bomber/roll_0.png', size: 512,
      prompt: `A cute chibi bomb creature, round orange-red body like a living bomb, cracks showing inner fire glow, lit fuse on top sparking, angry determined tiny eyes, rolling forward. Adorable explosive menace.` },
    { id: 'enemy_illusionist', path: 'assets/sprites/enemies/illusionist/idle_0.png', size: 512,
      prompt: `A cute chibi phantom mage, elegant light purple robes, multiple translucent afterimages trailing behind, crown of floating crystal shards, mysterious glowing eyes, graceful pose. Beautiful but eerie.` },

    // Bosses
    { id: 'boss_reaper', path: 'assets/sprites/bosses/reaper/idle_0.png', size: 512,
      prompt: `A cute chibi grim reaper boss, oversized black tattered cloak, huge purple-glowing scythe bigger than body, skull face with burning violet eyes, dark mist at feet, imposing but adorable death figure. Boss character, larger and more detailed.` },
    { id: 'boss_void_lord', path: 'assets/sprites/bosses/void_lord/idle_0.png', size: 512,
      prompt: `A cute chibi void entity boss, a roiling mass of dark purple energy with multiple scattered glowing eyes, tentacle-like appendages reaching out, central bright eye largest, eldritch horror but cute round shape. Powerful boss monster.` },
    { id: 'boss_necromancer', path: 'assets/sprites/bosses/necromancer/idle_0.png', size: 512,
      prompt: `A cute chibi necromancer boss, skeletal body in ornate dark purple and gold robes, floating above ground, staff with glowing green skull on top, open spellbook floating nearby, raising undead. Powerful adorable dark mage.` },
    { id: 'boss_chrono_lich', path: 'assets/sprites/bosses/chrono_lich/idle_0.png', size: 512,
      prompt: `A cute chibi time lich boss, tall skeletal figure in deep blue robes with clockwork gears in bones, hourglass staff, multiple ghostly arms from back, cold blue glowing eyes, time distortion ripples. Most powerful boss, adorable ancient evil.` },
    { id: 'boss_ice_queen', path: 'assets/sprites/bosses/ice_queen/idle_0.png', size: 512,
      prompt: `A cute chibi ice queen boss, regal female figure in crystalline ice armor, flowing frost-blue cape, crown of sharp ice shards, pale skin with blue frost veins, cold beauty. Powerful elegant ice boss, adorable but menacing.` },

    // UI Icons — Weapons
    { id: 'icon_whip', path: 'assets/ui/icons/whip.png', size: 512,
      prompt: `3D game icon of a coiled red-black leather whip with barbed glowing tip, weapon icon, clean simple design, dramatic red glow effect` },
    { id: 'icon_magic_wand', path: 'assets/ui/icons/magic_wand.png', size: 512,
      prompt: `3D game icon of a crystal-tipped magic wand, purple glowing crystal on top, elegant silver handle, magical sparkles, weapon icon` },
    { id: 'icon_knife', path: 'assets/ui/icons/knife.png', size: 512,
      prompt: `3D game icon of a sleek silver throwing knife with dark edge, sharp and deadly looking, motion lines, weapon icon` },
    { id: 'icon_orbit', path: 'assets/ui/icons/orbit.png', size: 512,
      prompt: `3D game icon of glowing blue-white crystal shards orbiting in a circle pattern, soul shard weapon, magical orbit trail` },
    { id: 'icon_lightning', path: 'assets/ui/icons/lightning.png', size: 512,
      prompt: `3D game icon of a bright golden-white lightning bolt, electric energy crackling, powerful thunder strike, dramatic yellow glow` },
    { id: 'icon_mine', path: 'assets/ui/icons/mine.png', size: 512,
      prompt: `3D game icon of a dark green spiked explosive mine orb, metallic with danger markings, faintly glowing red fuse, weapon icon` },
    { id: 'icon_garlic', path: 'assets/ui/icons/garlic.png', size: 512,
      prompt: `3D game icon of a golden holy aura circle, radiant protective barrier, sacred glowing ring with divine light, ability icon` },
    { id: 'icon_frost_nova', path: 'assets/ui/icons/frost_nova.png', size: 512,
      prompt: `3D game icon of an expanding ring of ice crystals, cyan-white frost burst, cold energy nova explosion, freezing ability icon` },
    { id: 'icon_soul_drain', path: 'assets/ui/icons/soul_drain.png', size: 512,
      prompt: `3D game icon of a dark red vampiric energy beam with green healing particles flowing back, life drain ability, dark red and green` },
    { id: 'icon_boomerang', path: 'assets/ui/icons/boomerang.png', size: 512,
      prompt: `3D game icon of a curved bone boomerang weapon with carved glowing runes, white bone material, spinning motion trail, weapon icon` },

    // UI Icons — Passives
    { id: 'icon_max_hp', path: 'assets/ui/icons/max_hp.png', size: 512,
      prompt: `3D game icon of a big red crystal heart with a golden plus symbol, health boost, vibrant red glowing heart, ability icon` },
    { id: 'icon_recovery', path: 'assets/ui/icons/recovery.png', size: 512,
      prompt: `3D game icon of a green glowing heart with healing sparkles, regeneration health icon, soft green glow` },
    { id: 'icon_armor', path: 'assets/ui/icons/armor.png', size: 512,
      prompt: `3D game icon of a sturdy iron shield with a golden cross emblem, defense protection icon, metallic sheen` },
    { id: 'icon_movespeed', path: 'assets/ui/icons/movespeed.png', size: 512,
      prompt: `3D game icon of a winged boot with golden wings, speed movement icon, motion blur trail, fast and agile` },
    { id: 'icon_might', path: 'assets/ui/icons/might.png', size: 512,
      prompt: `3D game icon of a flexing muscular arm with power aura, strength damage boost icon, red energy glow` },
    { id: 'icon_area', path: 'assets/ui/icons/area.png', size: 512,
      prompt: `3D game icon of expanding concentric blue circles, area of effect range icon, growing radius visualization` },
    { id: 'icon_cooldown', path: 'assets/ui/icons/cooldown.png', size: 512,
      prompt: `3D game icon of a clock with fast-spinning hands and speed lines, cooldown reduction timer icon, blue glow` },
    { id: 'icon_magnet', path: 'assets/ui/icons/magnet.png', size: 512,
      prompt: `3D game icon of a red horseshoe magnet with blue attraction field particles, pickup magnet icon` },
    { id: 'icon_growth', path: 'assets/ui/icons/growth.png', size: 512,
      prompt: `3D game icon of a green upward arrow with golden XP sparkles, experience growth icon, leveling up` },
    { id: 'icon_luck', path: 'assets/ui/icons/luck.png', size: 512,
      prompt: `3D game icon of a glowing golden four-leaf clover with sparkle effects, luck fortune icon, shimmering` },
    { id: 'icon_dodge', path: 'assets/ui/icons/dodge.png', size: 512,
      prompt: `3D game icon of wind dash speed lines with a ghostly afterimage silhouette, evasion dodge icon, blue wind` },
    { id: 'icon_magnet_plus', path: 'assets/ui/icons/magnet_plus.png', size: 512,
      prompt: `3D game icon of a golden enhanced magnet with stronger attraction field, upgraded pickup range icon, golden glow` },
    { id: 'icon_damage_reduction', path: 'assets/ui/icons/damage_reduction.png', size: 512,
      prompt: `3D game icon of a heavy fortified tower shield with damage absorption effect, thick iron with glowing runes, defense icon` },

    // Backgrounds — keep as tiles
    { id: 'bg_forest_ground', path: 'assets/backgrounds/forest/ground_0.png', size: 512, isTile: true,
      prompt: `Top-down dark forest floor texture tile, dead leaves, scattered tiny bones, twisted roots, dark soil, seamless tileable pattern, moody dark green and brown tones, game background texture` },
    { id: 'bg_crypt_ground', path: 'assets/backgrounds/crypt/ground_0.png', size: 512, isTile: true,
      prompt: `Top-down dark dungeon stone floor texture tile, cracked ancient stone tiles, ritual circle fragments, dark water in cracks, seamless tileable pattern, very dark purple-black tones, game background texture` },
    { id: 'bg_tundra_ground', path: 'assets/backgrounds/tundra/ground_0.png', size: 512, isTile: true,
      prompt: `Top-down frozen tundra floor texture tile, cracked ice over dark water, snow patches, frost crystal formations, seamless tileable pattern, cold blue-gray tones, game background texture` },
];

// ---------------------------------------------------------------------------
// IMAGE EXTRACTION
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
// BACKGROUND REMOVAL — White background slice
// ---------------------------------------------------------------------------
async function removeWhiteBackground(inputBuffer, targetSize, isTile) {
    if (isTile) {
        // Tiles: just resize, keep opaque
        return sharp(inputBuffer)
            .resize(targetSize, targetSize, { kernel: 'lanczos3', fit: 'cover' })
            .png()
            .toBuffer();
    }

    // For sprites/icons: remove white/near-white background
    const image = sharp(inputBuffer);
    const meta = await image.metadata();
    const raw = await sharp(inputBuffer).ensureAlpha().raw().toBuffer();
    const w = meta.width, h = meta.height;

    // Make white/near-white pixels transparent
    const output = Buffer.from(raw);
    const WHITE_THRESHOLD = 240; // pixels with R>240, G>240, B>240 → transparent
    let removed = 0;
    for (let i = 0; i < output.length; i += 4) {
        const r = output[i], g = output[i+1], b = output[i+2];
        if (r > WHITE_THRESHOLD && g > WHITE_THRESHOLD && b > WHITE_THRESHOLD) {
            output[i+3] = 0;
            removed++;
        }
    }

    // Trim transparent edges, then resize to target
    const cleaned = await sharp(output, { raw: { width: w, height: h, channels: 4 } })
        .trim({ threshold: 5 })
        .resize(targetSize, targetSize, {
            kernel: 'lanczos3',
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toBuffer();

    return cleaned;
}

// ---------------------------------------------------------------------------
// GENERATE SINGLE ASSET
// ---------------------------------------------------------------------------
async function generateAsset(asset) {
    const fullPrompt = asset.isTile
        ? `${asset.prompt}. ${STYLE_SUFFIX.replace('pure solid white background, ', '')}`
        : `${STYLE_PREFIX}. ${asset.prompt}. ${STYLE_SUFFIX}`;

    for (let attempt = 0; attempt < CONFIG.maxRetries; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CONFIG.timeoutMs);

        try {
            const response = await fetch(CONFIG.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CONFIG.auth}` },
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
                console.log(`  ⚠️ HTTP ${response.status}`);
                await sleep(CONFIG.retryBackoff[attempt] || 30000);
                continue;
            }

            const data = await response.json();
            const message = data.choices?.[0]?.message;
            const imageBuffer = message ? extractImageData(message) : null;
            if (!imageBuffer) {
                console.log(`  ⚠️ No image in response`);
                continue;
            }

            // Process: remove bg + resize
            const processed = await removeWhiteBackground(imageBuffer, asset.size === 512 ? 256 : 64, asset.isTile);

            // Save
            const outPath = join(ROOT, asset.path);
            mkdirSync(dirname(outPath), { recursive: true });
            writeFileSync(outPath, processed);

            return { success: true, bytes: processed.length };
        } catch (err) {
            clearTimeout(timeout);
            console.log(`  ⚠️ ${err.message}`);
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
    const queue = testMode ? ASSETS.slice(0, 2) : ASSETS;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  3D Cute Horror Asset Generation`);
    console.log(`  Style: Chibi 3D stylized horror characters`);
    console.log(`  Total: ${queue.length} assets`);
    console.log(`  Mode: ${testMode ? 'TEST (first 2)' : 'FULL'}`);
    console.log(`${'='.repeat(60)}\n`);

    let success = 0, fail = 0;
    for (let i = 0; i < queue.length; i++) {
        const asset = queue[i];
        console.log(`[${i+1}/${queue.length}] Generating ${asset.id}...`);

        const result = await generateAsset(asset);
        if (result.success) {
            console.log(`[${i+1}/${queue.length}] ✅ ${asset.id} (${(result.bytes/1024).toFixed(1)} KB)`);
            success++;
        } else {
            console.log(`[${i+1}/${queue.length}] ❌ ${asset.id} FAILED`);
            fail++;
        }

        if (i < queue.length - 1) await sleep(CONFIG.cooldownMs);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`  Complete: ✅ ${success} | ❌ ${fail}`);
    console.log(`${'='.repeat(60)}\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
