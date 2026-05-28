# 球形脸谱角色美术设计文档

> 版本: 1.0 | 创建: 2026-05-29 | 模型: gemini-3-pro-image (AIGW)

## 设计目标

将游戏中所有角色替换为**可爱圆形立体球形 + 中国戏曲脸谱化表情**风格，统一视觉语言：
- 每个角色是一个 3D 光泽球体
- 球面上绘制该角色特征的脸谱（类似中国京剧脸谱 face paint）
- 背景统一改为草原主题（温暖、明亮、治愈）
- 保持可爱 kawaii 风格，适合休闲游戏

## 技术参数

| 参数 | 值 |
|------|-----|
| 生成模型 | `gemini-3-pro-image` (AIGW 专业生图, 4K, 思维链) |
| API 端点 | `https://aigw.netease.com/v1/chat/completions` |
| 认证账号 | td_aigwcoding |
| 输出尺寸 | 256×256 (角色) / 512×512 (背景瓦片) |
| 扣背景方案 | 白底生成 → 像素级移除 (R>240,G>240,B>240 → alpha=0) |
| vertexai 参数 | `{ response_modalities: ['IMAGE', 'TEXT'] }` |
| 温度 | 0.8 |
| 冷却间隔 | 25s |
| 游戏显示倍率 | size × 2.5 (敌人) / size × 3 (玩家) |

## 风格 Prompt

### 全局前缀 (STYLE_PREFIX)

```
3D rendered cute spherical ball character, perfectly round glossy sphere shape, 
character face painted directly on sphere surface like Chinese opera face paint 
(脸谱 style mask), big cute expressive eyes on sphere surface, smooth cel-shading, 
soft studio lighting, kawaii adorable style, game asset on PURE WHITE background 
(#FFFFFF), centered composition, single sphere character, professional quality 3D render
```

### 全局后缀 (STYLE_SUFFIX)

```
pure solid white background, no shadows on ground, no gradient background, 
clean studio lighting, game-ready sphere asset, perfectly round sphere shape 
maintained, no text, no watermark
```

---

## 角色清单与 Prompt

### 玩家 (Player)

| 帧 | 输出路径 | 球体设定 |
|----|----------|----------|
| idle_0 | `assets/sprites/player/idle_0.png` | 天蓝色光泽球 |
| walk_0 | `assets/sprites/player/walk_0.png` | 同上，带动感倾斜 |

**Prompt (idle)**:
```
A sky-blue glossy sphere character. Face paint on sphere: determined glowing blue 
eyes, short white bangs/fringe painted flat on sphere surface, confident small smile. 
The sphere has a subtle blue magical glow aura. Hero character ball.
```

**Prompt (walk)**:
```
A sky-blue glossy sphere character in motion (slight tilt/lean forward suggesting 
movement). Same face as idle: blue glowing eyes, white bangs, determined smile. 
Tiny blue motion trail behind. Dynamic hero ball.
```

---

### 敌人 (Enemies)

#### Bat (蝙蝠球)

| 属性 | 值 |
|------|-----|
| 球体颜色 | 紫色光泽 |
| 脸谱特征 | 大紫色发光眼、小尖牙、尖耳凸起 |
| 输出路径 | `assets/sprites/enemies/bat/fly_0.png` |

```
A small purple glossy sphere character. Face paint: large purple glowing eyes 
(cute but spooky), tiny sharp fangs at bottom, pointed ear-like protrusions on 
top of sphere. Tiny translucent purple wings on sides. Spectral bat ball.
```

#### Zombie (僵尸球)

| 属性 | 值 |
|------|-----|
| 球体颜色 | 暗绿色哑光 |
| 脸谱特征 | 一大一小不对称眼、缝线纹路、滴涎 |
| 输出路径 | `assets/sprites/enemies/zombie/walk_0.png` |

```
A dark green matte sphere character. Face paint: one large eye and one small eye 
(asymmetric), stitch/sewing marks across face, greenish glow from cracks, drooling 
mouth. Zombie ball, cute but grotesque.
```

#### Skeleton (骷髅球)

| 属性 | 值 |
|------|-----|
| 球体颜色 | 白色骨质纹理 |
| 脸谱特征 | 骷髅脸谱、橙色发光眼窝、裂缝 |
| 输出路径 | `assets/sprites/enemies/skeleton/walk_0.png` |

```
A white bone-textured sphere character. Face paint: skull face pattern with orange 
glowing eye sockets, nasal cavity mark, toothy grin. Surface has subtle crack/bone 
texture. Undead skeleton ball.
```

#### Wolf (狼球)

| 属性 | 值 |
|------|-----|
| 球体颜色 | 深棕色毛绒质感 |
| 脸谱特征 | 尖耳凸起、獠牙、琥珀色凶眼 |
| 输出路径 | `assets/sprites/enemies/wolf/run_0.png` |

```
A dark brown furry-textured sphere character. Face paint: fierce amber glowing eyes, 
pointed ear protrusions on top, visible fangs/snarl mouth, dark whisker marks. 
Aggressive dire wolf ball.
```

#### Golem (石魔球)

| 属性 | 值 |
|------|-----|
| 球体颜色 | 灰色岩石质感（大号） |
| 脸谱特征 | 紫色发光裂缝纹路、小眼 |
| 输出路径 | `assets/sprites/enemies/golem/idle_0.png` |

```
A large gray rocky sphere character. Surface texture: cracked stone with purple 
glowing cracks between segments. Face paint: tiny squinting angry eyes, heavy brow 
ridge, no mouth visible. Hulking stone golem ball, bigger than others.
```

#### Ghost (幽灵球)

| 属性 | 值 |
|------|-----|
| 球体颜色 | 半透明冰蓝 |
| 脸谱特征 | 空洞黑眼圈、惊讶O嘴 |
| 输出路径 | `assets/sprites/enemies/ghost/float_0.png` |

```
A translucent ice-blue sphere character (semi-transparent look). Face paint: large 
hollow black eye circles (empty/void), surprised O-shaped mouth, ethereal wispy 
trail at bottom of sphere. Ghost wraith ball.
```

#### Mage (法师球)

| 属性 | 值 |
|------|-----|
| 球体颜色 | 深紫色 |
| 脸谱特征 | 兜帽轮廓浮雕、紫色发光双瞳 |
| 输出路径 | `assets/sprites/enemies/mage/idle_0.png` |

```
A deep purple sphere character. Face paint: hooded cloak silhouette sculpted/painted 
on sphere surface, two glowing purple pupils visible under hood shadow, arcane 
symbols floating around sphere. Dark mage ball.
```

#### Slime (史莱姆球)

| 属性 | 值 |
|------|-----|
| 球体颜色 | 透明青绿果冻质感 |
| 脸谱特征 | 大萌眼+微笑、内部发光核 |
| 输出路径 | `assets/sprites/enemies/slime/idle_0.png` |

```
A translucent teal-green jelly-like sphere character. Face paint: two large round 
adorable eyes with highlights, small happy smile. A glowing core visible inside 
the translucent sphere. Cute slime ball.
```

#### Slimeling (小史莱姆球)

| 属性 | 值 |
|------|-----|
| 球体颜色 | 小号浅青透明 |
| 脸谱特征 | 单个大眼、天真表情 |
| 输出路径 | `assets/sprites/enemies/slimeling/hop_0.png` |

```
A tiny light teal translucent sphere character (smaller than others). Face paint: 
single large cute eye with big highlight, innocent expression. Tiny baby slime ball. 
Very simple and adorable.
```

#### Bomber (炸弹球)

| 属性 | 值 |
|------|-----|
| 球体颜色 | 橙红色，内部火焰裂纹 |
| 脸谱特征 | 愤怒小眼、紧闭嘴、顶部引信 |
| 输出路径 | `assets/sprites/enemies/bomber/roll_0.png` |

```
An orange-red sphere character with cracks showing inner fire glow. Face paint: 
tiny angry squinting eyes, tightly closed frustrated mouth. A lit fuse/wick 
protrusion sparking on top of sphere. Bomb ball about to explode.
```

#### Illusionist (幻术师球)

| 属性 | 值 |
|------|-----|
| 球体颜色 | 淡紫渐变 |
| 脸谱特征 | 神秘半闭眼、多重残影 |
| 输出路径 | `assets/sprites/enemies/illusionist/idle_0.png` |

```
A light purple gradient sphere character. Face paint: mysterious half-closed elegant 
eyes, serene enigmatic expression. Multiple fading afterimage copies of the sphere 
trailing behind (illusion effect). Phantom mage ball.
```

---

### Boss

#### Reaper (死神球)

| 属性 | 值 |
|------|-----|
| 球体颜色 | 暗黑紫大球 |
| 脸谱特征 | 白色骷髅脸+紫焰眼、微型镰刀装饰 |
| 输出路径 | `assets/sprites/bosses/reaper/idle_0.png` |

```
A large dark purple-black sphere character (boss-sized). Face paint: white skull 
face pattern with burning violet flame eyes. A tiny decorative scythe attached to 
side of sphere. Dark mist wisps around base. The Reaper boss ball, imposing yet cute.
```

#### Void Lord (虚空领主球)

| 属性 | 值 |
|------|-----|
| 球体颜色 | 深紫巨球 |
| 脸谱特征 | 球面多眼分布、触手凸起 |
| 输出路径 | `assets/sprites/bosses/void_lord/idle_0.png` |

```
A very large deep purple sphere character (biggest boss). Multiple glowing eyes of 
different sizes scattered randomly across sphere surface. Small tentacle-like 
protrusions emerging from sphere. Roiling void energy effect. The Void Lord boss 
ball, eldritch horror cute.
```

#### Necromancer (死灵法师球)

| 属性 | 值 |
|------|-----|
| 球体颜色 | 暗紫+金边纹路 |
| 脸谱特征 | 骷髅法师脸、绿色发光眼 |
| 输出路径 | `assets/sprites/bosses/necromancer/idle_0.png` |

```
A large dark purple sphere with gold trim/border patterns on surface. Face paint: 
skeletal mage face with glowing green eyes, tiny green-glowing skull staff floating 
beside sphere. Necromancer boss ball, dark magic cute.
```

#### Chrono Lich (时空巫妖球)

| 属性 | 值 |
|------|-----|
| 球体颜色 | 深蓝大球 |
| 脸谱特征 | 时钟齿轮纹路、冷蓝发光眼 |
| 输出路径 | `assets/sprites/bosses/chrono_lich/idle_0.png` |

```
A large deep blue sphere character. Surface pattern: clockwork gear engravings and 
mechanical patterns. Face paint: cold icy blue glowing eyes, skeletal features, 
hourglass symbol on forehead. Time distortion ripple effect around sphere. Chrono 
Lich boss ball.
```

#### Ice Queen (冰雪女王球)

| 属性 | 值 |
|------|-----|
| 球体颜色 | 冰蓝水晶球 |
| 脸谱特征 | 冰冠凸起、冷傲美丽脸谱 |
| 输出路径 | `assets/sprites/bosses/ice_queen/idle_0.png` |

```
A large ice-blue crystalline sphere character. An ice crown with sharp crystal 
shards protrudes from top. Face paint: elegant cold beautiful face, icy blue eyes, 
slight frosty disdain expression, frost crystal patterns on cheeks. Ice Queen boss 
ball, regal and menacing.
```

---

## 草原背景

| ID | 输出路径 | 描述 |
|----|----------|------|
| ground_0 | `assets/backgrounds/grassland/ground_0.png` | 翠绿草地+小野花 |
| ground_1 | `assets/backgrounds/grassland/ground_1.png` | 草地+小石子+三叶草 |
| ground_2 | `assets/backgrounds/grassland/ground_2.png` | 稍长草丛+蝴蝶花 |

**Prompt (ground_0)**:
```
Top-down view lush green grassland floor texture, bright cheerful green grass, 
small scattered wildflowers (tiny white daisies, yellow dandelions), warm sunlit 
meadow feel, seamless tileable game background pattern, soft natural warm colors, 
game tile texture
```

**Prompt (ground_1)**:
```
Top-down view green grassland floor texture variation, green grass with small 
pebbles and three-leaf clovers scattered, slightly different grass shade, seamless 
tileable game background pattern, soft natural colors, game tile texture
```

**Prompt (ground_2)**:
```
Top-down view green grassland floor texture variation, slightly taller grass 
patches with small butterfly flowers, natural grass transition areas, seamless 
tileable game background pattern, cheerful green tones, game tile texture
```

---

## 扣背景算法

```javascript
async function removeWhiteBackground(inputBuffer, targetSize, isTile) {
    // 背景瓦片: 直接 resize，保持不透明
    if (isTile) {
        return sharp(inputBuffer)
            .resize(targetSize, targetSize, { kernel: 'lanczos3', fit: 'cover' })
            .png().toBuffer();
    }

    // 角色 sprite: 白底像素 → 透明
    const raw = await sharp(inputBuffer).ensureAlpha().raw().toBuffer();
    const WHITE_THRESHOLD = 240;
    for (let i = 0; i < output.length; i += 4) {
        if (r > 240 && g > 240 && b > 240) output[i+3] = 0; // 设为透明
    }

    // Trim 透明边缘 → Resize 到目标尺寸
    return sharp(output, { raw: { width, height, channels: 4 } })
        .trim({ threshold: 5 })
        .resize(targetSize, targetSize, {
            kernel: 'lanczos3', fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png().toBuffer();
}
```

---

## 动画帧策略

球形角色本身无姿态差异（球体不需要走路/攻击动画区分），因此：
- 每角色生成 1 张主帧
- 其余动画帧直接复制主帧（`idle_0` → `idle_1`; `walk_0` → `walk_1/2/3`）
- 视觉上保持一致，无帧间跳变

## 生成脚本

- **脚本路径**: `tools/generate-sphere-chars.js`
- **状态文件**: `tools/sphere-gen-state.json`
- **用法**:
  - `node tools/generate-sphere-chars.js` — 全量生成
  - `node tools/generate-sphere-chars.js --test` — 测试前 2 个
  - `node tools/generate-sphere-chars.js --resume` — 断点续跑
  - `node tools/generate-sphere-chars.js --only bosses` — 仅 boss
  - `node tools/generate-sphere-chars.js --dry-run` — 只打印 prompt

## 部署

- 站点: https://cvs.tangdan.cc
- 方式: 腾讯云 TAT → `deploy_cvs_art_update.py`
- 流程: git push → 服务器 git pull → nginx reload → cache bust
