import { GAME_CONFIG, GHOST_COLORS, clamp, distance } from '../core/config.js';
import { GAME_MODES } from '../shared/contracts.js';

const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳'];

/** 把关卡号渲染成带圈数字 ①…⑳（也用于幽灵来源关卡标识）。 */
export function circledNumber(level) {
  if (Number.isInteger(level) && level >= 1 && level <= CIRCLED.length) return CIRCLED[level - 1];
  return String(level);
}

/* ------------------------------------------------------------------ *
 * 角色精灵图（4×4 帧，每帧 64×64，背景透明）。
 * 约定：第 0 行 = 正面（朝向镜头） / 第 1 行 = 右侧 / 第 3 行 = 背面。
 * 左侧行走用第 1 行水平翻转，保证朝向一定正确，不依赖素材猜测。
 * 中心锚点取角色实体中心（源坐标 32, 34.5），使视觉与碰撞中心对齐。
 * ------------------------------------------------------------------ */
const HERO_SHEET_URL = new URL('../../assets/character/hero-sheet-outlined.png', import.meta.url).href;
const FRAME_SIZE = 64;
const HERO_SCALE = 0.72; // 64*0.72 ≈ 46 整帧 → 角色实体约 23×40px（在 34~40 范围内）
const HERO_ANCHOR_X = 32;
const HERO_ANCHOR_Y = 34.5;

export function createRenderer(canvas, context) {
  const canvasWidth = GAME_CONFIG.canvas.width;
  const canvasHeight = GAME_CONFIG.canvas.height;
  const arena = GAME_CONFIG.arena;

  const reduceMotion =
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 粒子池（带上限，避免低端设备无限增长）
  const MAX_PARTICLES = 200;
  const particles = [];
  let prevPlayer = null;
  let prevMode = null;
  let flash = 0;
  let flashColor = '255,255,255';

  // 动画状态（闭包内持久）
  let facing = 'front';
  let facingTimer = 0;
  let walkTime = 0;
  let walkFrame = 0;
  let failTime = 0;
  let idlePhase = Math.random() * Math.PI * 2;

  // 缓存的渐变（只创建一次，避免每帧分配）
  let backdropGrad = null;
  let vignetteGrad = null;
  let prepShadeGrad = null;

  // 预渲染光晕贴图：替代每帧 createRadialGradient / shadowBlur
  function makeGlow(size, inner, outer) {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
    const surface = document.createElement('canvas');
    surface.width = size;
    surface.height = size;
    const glowContext = surface.getContext('2d');
    if (!glowContext) return null;
    const gradient = glowContext.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, inner);
    gradient.addColorStop(1, outer);
    glowContext.fillStyle = gradient;
    glowContext.fillRect(0, 0, size, size);
    return surface;
  }

  const glowWarm = makeGlow(112, 'rgba(255,236,196,.9)', 'rgba(255,236,196,0)');
  const glowDanger = makeGlow(112, 'rgba(255,150,120,.9)', 'rgba(255,150,120,0)');
  const glowGold = makeGlow(56, 'rgba(255,205,120,.75)', 'rgba(255,205,120,0)');

  // 角色精灵图（懒加载；Node/无 Image 环境或加载失败时回退为矢量小球）
  const sprite = { img: null, ready: false };
  if (typeof Image !== 'undefined') {
    const img = new Image();
    img.onload = () => { sprite.img = img; sprite.ready = true; };
    img.onerror = () => { sprite.ready = false; };
    img.src = HERO_SHEET_URL;
  }

  /* ------------------------------------------------------------------ *
   * 游戏内 / 结算背景：赛博朋克雨夜街道（程序化预渲染）
   *
   * 只在初始化时构建一次 → 每帧成本 = 1 次 drawImage + 1 条雨丝路径，
   * 低端设备也能稳定帧率；且不依赖任何外部背景图。
   * Node / 无 DOM 环境返回 null，drawBackdrop 自动回退到渐变底色
   * （单元测试走的正是这条兜底路径）。
   * ------------------------------------------------------------------ */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function next() {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 霓虹主色（与参考图一致的品红 / 青 / 紫 / 暖金）
  const NEON = ['255,45,149', '0,229,255', '168,85,247', '255,176,58'];
  const HORIZON = arena.y + 16; // 街道远端（透视消失点高度）

  function pathRoundRect(g, x, y, width, height, radius) {
    g.beginPath();
    if (typeof g.roundRect === 'function') {
      g.roundRect(x, y, width, height, radius);
      return;
    }
    g.rect(x, y, width, height);
  }

  function buildArenaBackdrop() {
    if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null;
    let surface;
    try {
      surface = document.createElement('canvas');
      surface.width = canvasWidth;
      surface.height = canvasHeight;
    } catch {
      return null;
    }
    const g = surface.getContext('2d');
    if (!g) return null;
    const rnd = mulberry32(0x51ce7a11);

    // 1) 夜空：近黑深蓝 → 街道远端霓虹 → 路面压暗（暗部要够黑，霓虹才跳得出来）
    const sky = g.createLinearGradient(0, 0, 0, canvasHeight);
    sky.addColorStop(0, '#03040c');
    sky.addColorStop(0.18, '#06071a');
    sky.addColorStop(0.33, '#0b0a24');
    sky.addColorStop(0.437, '#150a2c');
    sky.addColorStop(0.50, '#080714');
    sky.addColorStop(0.74, '#070610');
    sky.addColorStop(1, '#04030a');
    g.fillStyle = sky;
    g.fillRect(0, 0, canvasWidth, canvasHeight);

    // 2) 远端霓虹雾带：只压在街道尽头附近，避免整屏泛紫
    const band = g.createLinearGradient(0, HORIZON - 120, 0, HORIZON + 170);
    band.addColorStop(0, 'rgba(255,45,149,0)');
    band.addColorStop(0.38, 'rgba(255,45,149,.16)');
    band.addColorStop(0.52, 'rgba(0,190,255,.09)');
    band.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = band;
    g.fillRect(0, HORIZON - 120, canvasWidth, 290);

    // 2b) 远处霓虹光斑：给出明确的“光源感”，而不是一层平均的雾
    for (let i = 0; i < 14; i += 1) {
      const rgb = NEON[Math.floor(rnd() * NEON.length)];
      const cx = rnd() * canvasWidth;
      const cy = HORIZON - 8 - rnd() * 36;
      const radius = 26 + rnd() * 72;
      const spot = g.createRadialGradient(cx, cy, 0, cx, cy, radius);
      spot.addColorStop(0, `rgba(${rgb},${(0.30 + rnd() * 0.24).toFixed(3)})`);
      spot.addColorStop(0.45, `rgba(${rgb},${(0.10 + rnd() * 0.10).toFixed(3)})`);
      spot.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = spot;
      g.beginPath();
      g.arc(cx, cy, radius, 0, Math.PI * 2);
      g.fill();
    }

    // 3) 远端楼群剪影 + 窗灯
    let bx = -24;
    while (bx < canvasWidth + 40) {
      const bw = 30 + rnd() * 64;
      const bh = 22 + rnd() * 58;
      const top = HORIZON - bh;
      g.fillStyle = 'rgba(3,3,9,.96)';
      g.fillRect(bx, top, bw, bh + 10);
      const cols = Math.max(1, Math.round(bw / 13));
      const rows = Math.max(1, Math.round(bh / 13));
      for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          if (rnd() > 0.42) continue;
          const rgb = NEON[Math.floor(rnd() * NEON.length)];
          g.fillStyle = `rgba(${rgb},${(0.35 + rnd() * 0.55).toFixed(3)})`;
          g.fillRect(bx + 4 + c * 13, top + 5 + r * 13, 3, 4);
        }
      }
      bx += bw + 3 + rnd() * 9;
    }

    // 4) 两侧霓虹牌匾：竖向灯条 + 灯箱，主要出现在左右留白里，营造“霓虹峡谷”
    for (let side = 0; side < 2; side += 1) {
      for (let i = 0; i < 4; i += 1) {
        const rgb = NEON[Math.floor(rnd() * NEON.length)];
        const barW = 6 + rnd() * 11;
        const barH = 50 + rnd() * 120;
        const left = side === 0 ? 3 + rnd() * 24 : canvasWidth - 30 - rnd() * 18;
        const top = 2 + rnd() * 200;
        g.save();
        g.shadowColor = `rgba(${rgb},.95)`;
        g.shadowBlur = 34;
        g.fillStyle = `rgba(${rgb},.72)`;
        g.fillRect(left, top, barW, barH);
        g.shadowBlur = 12;
        g.fillStyle = 'rgba(255,255,255,.72)';
        g.fillRect(left + barW * 0.34, top + 5, Math.max(1.4, barW * 0.18), barH - 10);
        g.restore();
      }

      // 灯箱：细边框 + 内部横向灯条，远看像街边招牌
      const boxW = 24 + rnd() * 10;
      const boxH = 60 + rnd() * 70;
      const boxX = side === 0 ? 2 : canvasWidth - boxW - 2;
      const boxY = 30 + rnd() * 150;
      const boxRgb = NEON[Math.floor(rnd() * NEON.length)];
      g.save();
      g.shadowColor = `rgba(${boxRgb},.85)`;
      g.shadowBlur = 22;
      g.strokeStyle = `rgba(${boxRgb},.8)`;
      g.lineWidth = 2;
      g.strokeRect(boxX, boxY, boxW, boxH);
      g.shadowBlur = 0;
      g.fillStyle = `rgba(${boxRgb},.18)`;
      g.fillRect(boxX, boxY, boxW, boxH);
      g.fillStyle = `rgba(${boxRgb},.85)`;
      for (let k = 0; k < 4; k += 1) {
        const lineY = boxY + 12 + k * ((boxH - 24) / 4);
        g.fillRect(boxX + 5, lineY, boxW - 10, 2);
      }
      g.restore();
    }

    // 5) 湿地反光：只贴在左右两侧招牌下方（窄、短、锐利），中间留黑
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 16; i += 1) {
      const onLeft = i % 2 === 0;
      const rgb = NEON[Math.floor(rnd() * NEON.length)];
      const cx = onLeft ? rnd() * 130 : canvasWidth - rnd() * 130;
      const colW = 5 + rnd() * 16;
      const top = HORIZON + rnd() * 10;
      const len = 70 + rnd() * 150;
      const grad = g.createLinearGradient(0, top, 0, top + len);
      grad.addColorStop(0, `rgba(${rgb},${(0.18 + rnd() * 0.14).toFixed(3)})`);
      grad.addColorStop(0.35, `rgba(${rgb},${(0.05 + rnd() * 0.05).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = grad;
      g.fillRect(cx - colW / 2, top, colW, len);
    }

    // 街道尽头的地平线光带：给纵深一个明确锚点
    const horizonLine = g.createLinearGradient(0, HORIZON - 14, 0, HORIZON + 26);
    horizonLine.addColorStop(0, 'rgba(0,229,255,0)');
    horizonLine.addColorStop(0.42, 'rgba(150,235,255,.18)');
    horizonLine.addColorStop(0.6, 'rgba(255,45,149,.10)');
    horizonLine.addColorStop(1, 'rgba(255,45,149,0)');
    g.fillStyle = horizonLine;
    g.fillRect(0, HORIZON - 14, canvasWidth, 40);

    // 湿路面横向反光带（细、稀疏、只在近地平线一侧）
    for (let i = 0; i < 9; i += 1) {
      const ly = HORIZON + 24 + rnd() * 150;
      const lx = rnd() * canvasWidth;
      const lw = 60 + rnd() * 200;
      const lh = 1 + rnd() * 2;
      g.fillStyle = `rgba(190,230,255,${(0.03 + rnd() * 0.05).toFixed(3)})`;
      g.fillRect(lx - lw / 2, ly, lw, lh);
    }
    g.restore();

    // 6) 中央极淡暖光：给大块死黑一点表面积光，但绝不做成"雾"
    const floorGlow = g.createRadialGradient(
      canvasWidth * 0.5, canvasHeight * 0.66, 20,
      canvasWidth * 0.5, canvasHeight * 0.66, 400
    );
    floorGlow.addColorStop(0, 'rgba(255,70,150,.075)');
    floorGlow.addColorStop(0.55, 'rgba(120,60,180,.045)');
    floorGlow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = floorGlow;
    g.fillRect(0, 0, canvasWidth, canvasHeight);

    // 7) 水洼：清晰的湿面边界 + 霓虹倒影，而不是一团灰雾
    g.save();
    for (let i = 0; i < 5; i += 1) {
      const px = 90 + rnd() * (canvasWidth - 180);
      const py = HORIZON + 80 + rnd() * (canvasHeight - HORIZON - 120);
      const rw = 26 + rnd() * 58;
      const rh = rw * (0.24 + rnd() * 0.12);
      g.fillStyle = 'rgba(9,12,26,.30)';
      g.beginPath();
      g.ellipse(px, py, rw, rh, 0, 0, Math.PI * 2);
      g.fill();

      const rgb = NEON[Math.floor(rnd() * NEON.length)];
      g.strokeStyle = `rgba(${rgb},.14)`;
      g.lineWidth = 1;
      g.stroke();
    }

    // 雨滴涟漪：小而淡，只做氛围
    for (let i = 0; i < 14; i += 1) {
      const px = rnd() * canvasWidth;
      const py = HORIZON + 20 + rnd() * (canvasHeight - HORIZON - 40);
      const rr = 4 + rnd() * 8;
      g.strokeStyle = `rgba(180,230,255,${(0.04 + rnd() * 0.04).toFixed(3)})`;
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(px, py, rr, rr * 0.42, 0, 0, Math.PI * 2);
      g.stroke();
    }

    // 横向霓虹光带：招牌在湿地面上的拖影
    for (let i = 0; i < 6; i += 1) {
      const rgb = NEON[Math.floor(rnd() * NEON.length)];
      const ly = HORIZON + 40 + rnd() * (canvasHeight - HORIZON - 90);
      const lw = 180 + rnd() * 340;
      const lx = rnd() * canvasWidth;
      const lh = 6 + rnd() * 12;
      const bandGrad = g.createLinearGradient(lx - lw / 2, 0, lx + lw / 2, 0);
      bandGrad.addColorStop(0, `rgba(${rgb},0)`);
      bandGrad.addColorStop(0.5, `rgba(${rgb},${(0.08 + rnd() * 0.06).toFixed(3)})`);
      bandGrad.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = bandGrad;
      g.fillRect(lx - lw / 2, ly, lw, lh);
    }
    g.restore();

    // 7b) 地面霓虹环：参考图里那圈发光地标。纯装饰，不参与碰撞，也不暗示边界
    g.save();
    g.globalCompositeOperation = 'lighter';
    const ringCx = canvasWidth * 0.5;
    const ringCy = canvasHeight * 0.72;
    g.shadowColor = 'rgba(255,45,149,.9)';
    g.shadowBlur = 30;
    g.strokeStyle = 'rgba(255,45,149,.28)';
    g.lineWidth = 2.5;
    g.beginPath();
    g.ellipse(ringCx, ringCy, 402, 96, 0, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(0,229,255,.16)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.ellipse(ringCx, ringCy - 6, 318, 74, 0, 0, Math.PI * 2);
    g.stroke();
    g.restore();

    // 8) 压暗：整体压一层薄暗，中间略重（玩法集中在中央），但别把霓虹糊掉
    const centerShade = g.createRadialGradient(
      canvasWidth * 0.5, canvasHeight * 0.52, 60,
      canvasWidth * 0.5, canvasHeight * 0.52, canvasWidth * 0.72
    );
    centerShade.addColorStop(0, 'rgba(6,4,15,.22)');
    centerShade.addColorStop(0.55, 'rgba(6,4,15,.18)');
    centerShade.addColorStop(1, 'rgba(5,3,12,.10)');
    g.fillStyle = centerShade;
    g.fillRect(0, 0, canvasWidth, canvasHeight);

    // 8b) 场地环在地面上的漫反射：环把湿地面照亮的那一圈（甜甜圈形光晕）
    g.save();
    g.globalCompositeOperation = 'lighter';
    const ringGlow = g.createRadialGradient(
      canvasWidth * 0.5, canvasHeight * 0.54, 90,
      canvasWidth * 0.5, canvasHeight * 0.54, 470
    );
    ringGlow.addColorStop(0, 'rgba(255,45,149,0)');
    ringGlow.addColorStop(0.7, 'rgba(255,45,149,.04)');
    ringGlow.addColorStop(0.86, 'rgba(255,80,170,.11)');
    ringGlow.addColorStop(1, 'rgba(255,45,149,0)');
    g.fillStyle = ringGlow;
    g.fillRect(0, 0, canvasWidth, canvasHeight);
    g.restore();

    // 9) 场地霓虹环：静态辉光（逐帧只再描一层细线做呼吸，避免每帧 shadowBlur）
    g.save();
    g.shadowColor = 'rgba(255,45,149,1)';
    g.shadowBlur = 58;
    g.strokeStyle = 'rgba(255,45,149,.34)';
    g.lineWidth = 12;
    pathRoundRect(g, arena.x, arena.y, arena.w, arena.h, 22);
    g.stroke();

    g.shadowBlur = 30;
    g.strokeStyle = 'rgba(255,90,180,.72)';
    g.lineWidth = 3.5;
    pathRoundRect(g, arena.x, arena.y, arena.w, arena.h, 20);
    g.stroke();

    g.shadowColor = 'rgba(0,229,255,1)';
    g.shadowBlur = 20;
    g.strokeStyle = 'rgba(0,229,255,.55)';
    g.lineWidth = 2;
    pathRoundRect(g, arena.x + 8, arena.y + 8, arena.w - 16, arena.h - 16, 15);
    g.stroke();
    g.restore();

    return surface;
  }

  const arenaBackdrop = buildArenaBackdrop();

  /* 雨丝：位置解析式计算（不累积误差），整屏一次 path 一次 stroke */
  const rainDrops = [];
  {
    const rainRnd = mulberry32(0x2f9d1c33);
    const count = reduceMotion ? 34 : 68;
    for (let i = 0; i < count; i += 1) {
      rainDrops.push({
        x: rainRnd() * (canvasWidth + 200) - 100,
        y: rainRnd() * canvasHeight,
        len: 9 + rainRnd() * 20,
        speed: reduceMotion ? 0 : 300 + rainRnd() * 420
      });
    }
  }
  let rainTime = 0;

  function drawRain(deltaSeconds) {
    if (!rainDrops.length) return;
    if (!reduceMotion) rainTime += deltaSeconds || 0;
    const span = canvasHeight + 140;
    const drift = 0.13;
    context.save();
    context.strokeStyle = 'rgba(176,220,255,.085)';
    context.lineWidth = 1;
    context.beginPath();
    for (const drop of rainDrops) {
      const y = (((drop.y + rainTime * drop.speed) % span) + span) % span - 70;
      const x = drop.x - y * drift;
      context.moveTo(x, y);
      context.lineTo(x - drop.len * drift, y + drop.len);
    }
    context.stroke();
    context.restore();
  }

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  function frameRect(row, col) {
    return { sx: col * FRAME_SIZE, sy: row * FRAME_SIZE, sw: FRAME_SIZE, sh: FRAME_SIZE };
  }

  function resolveFacing(dx, dy) {
    const mag = Math.hypot(dx, dy);
    if (mag < 0.6) return null;
    if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'front' : 'back';
  }

  function lerpColor(a, b, t) {
    const ah = parseInt(a.slice(1), 16);
    const bh = parseInt(b.slice(1), 16);
    const ar = (ah >> 16) & 255, ag = (ah >> 8) & 255, ab = ah & 255;
    const br = (bh >> 16) & 255, bg = (bh >> 8) & 255, bb = bh & 255;
    const r = Math.round(ar + (br - ar) * t);
    const g = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);
    return `rgb(${r},${g},${bl})`;
  }

  function roundRect(x, y, width, height, radius, fill, stroke = null, lineWidth = 1) {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
    if (fill) {
      context.fillStyle = fill;
      context.fill();
    }
    if (stroke) {
      context.strokeStyle = stroke;
      context.lineWidth = lineWidth;
      context.stroke();
    }
  }

  function star(x, y, outer, inner, color, rotation = 0) {
    context.beginPath();
    for (let index = 0; index < 10; index += 1) {
      const angle = rotation + index * Math.PI / 5 - Math.PI / 2;
      const radius = index % 2 === 0 ? outer : inner;
      const sx = x + Math.cos(angle) * radius;
      const sy = y + Math.sin(angle) * radius;
      if (index === 0) context.moveTo(sx, sy);
      else context.lineTo(sx, sy);
    }
    context.closePath();
    context.fillStyle = color;
    context.fill();
  }

  /* 矢量小图标：替代 canvas 内的 emoji，保证跨平台一致且不依赖字体 */
  function drawIcon(kind, cx, cy, size, color) {
    const s = size / 2;
    context.save();
    context.fillStyle = color;
    context.strokeStyle = color;
    context.lineWidth = Math.max(1.4, size * 0.14);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    if (kind === 'star') {
      star(cx, cy, s, s * 0.45, color);
    } else if (kind === 'bolt') {
      context.beginPath();
      context.moveTo(cx + s * 0.25, cy - s);
      context.lineTo(cx - s * 0.5, cy + s * 0.12);
      context.lineTo(cx - s * 0.02, cy + s * 0.12);
      context.lineTo(cx - s * 0.25, cy + s);
      context.lineTo(cx + s * 0.5, cy - s * 0.14);
      context.lineTo(cx + s * 0.02, cy - s * 0.14);
      context.closePath();
      context.fill();
    } else if (kind === 'ghost') {
      context.beginPath();
      context.arc(cx, cy - s * 0.15, s * 0.75, Math.PI, 0);
      context.lineTo(cx + s * 0.75, cy + s * 0.7);
      context.quadraticCurveTo(cx + s * 0.35, cy + s * 0.35, cx, cy + s * 0.7);
      context.quadraticCurveTo(cx - s * 0.35, cy + s * 1.05, cx - s * 0.75, cy + s * 0.7);
      context.closePath();
      context.fill();
      context.fillStyle = 'rgba(20,10,30,.85)';
      context.beginPath();
      context.arc(cx - s * 0.26, cy - s * 0.18, s * 0.15, 0, Math.PI * 2);
      context.arc(cx + s * 0.26, cy - s * 0.18, s * 0.15, 0, Math.PI * 2);
      context.fill();
    } else if (kind === 'magnet') {
      context.beginPath();
      context.arc(cx, cy + s * 0.25, s * 0.62, Math.PI, 0);
      context.stroke();
      context.beginPath();
      context.moveTo(cx - s * 0.62, cy + s * 0.25);
      context.lineTo(cx - s * 0.62, cy + s * 0.85);
      context.moveTo(cx + s * 0.62, cy + s * 0.25);
      context.lineTo(cx + s * 0.62, cy + s * 0.85);
      context.stroke();
      context.fillStyle = '#ff9db8';
      context.beginPath();
      context.roundRect(cx - s * 0.82, cy + s * 0.6, s * 0.4, s * 0.34, s * 0.12);
      context.roundRect(cx + s * 0.42, cy + s * 0.6, s * 0.4, s * 0.34, s * 0.12);
      context.fill();
    } else if (kind === 'shield') {
      context.beginPath();
      context.moveTo(cx, cy - s * 0.95);
      context.lineTo(cx + s * 0.8, cy - s * 0.55);
      context.quadraticCurveTo(cx + s * 0.8, cy + s * 0.55, cx, cy + s);
      context.quadraticCurveTo(cx - s * 0.8, cy + s * 0.55, cx - s * 0.8, cy - s * 0.55);
      context.closePath();
      context.stroke();
    } else if (kind === 'heart') {
      context.beginPath();
      context.moveTo(cx, cy + s * 0.85);
      context.bezierCurveTo(cx - s * 1.1, cy + s * 0.05, cx - s * 0.55, cy - s * 0.95, cx, cy - s * 0.32);
      context.bezierCurveTo(cx + s * 0.55, cy - s * 0.95, cx + s * 1.1, cy + s * 0.05, cx, cy + s * 0.85);
      context.closePath();
      context.fill();
    }
    context.restore();
  }

  function skillIconKind(id) {
    return id === 'magnet' ? 'magnet' : id === 'shield' ? 'shield' : id === 'forgive' ? 'heart' : 'star';
  }

  function getBackdropGradient() {
    if (!backdropGrad) {
      backdropGrad = context.createLinearGradient(0, 0, canvasWidth, canvasHeight);
      backdropGrad.addColorStop(0, '#241a3d');
      backdropGrad.addColorStop(0.55, '#1a1430');
      backdropGrad.addColorStop(1, '#161130');
    }
    return backdropGrad;
  }

  function getVignetteGradient() {
    if (!vignetteGrad) {
      vignetteGrad = context.createRadialGradient(
        canvasWidth / 2, canvasHeight / 2, 60,
        canvasWidth / 2, canvasHeight / 2, canvasWidth * 0.62
      );
      vignetteGrad.addColorStop(0, 'rgba(255,255,255,0)');
      vignetteGrad.addColorStop(1, 'rgba(8,6,18,0.55)');
    }
    return vignetteGrad;
  }

  function drawBackdrop(deltaSeconds, time) {
    // 游戏内 / 结算背景：赛博朋克雨夜街道
    if (arenaBackdrop) {
      context.drawImage(arenaBackdrop, 0, 0);
      drawRain(deltaSeconds);

      // 场地霓虹环：逐帧细线描边，成本极低地做出“呼吸”感
      const pulse = reduceMotion ? 1 : 0.74 + Math.sin((time || 0) / 820) * 0.26;
      roundRect(arena.x, arena.y, arena.w, arena.h, 20, null,
        `rgba(255,45,149,${(0.40 * pulse).toFixed(3)})`, 2);
      roundRect(arena.x + 7, arena.y + 7, arena.w - 14, arena.h - 14, 15, null,
        `rgba(0,229,255,${(0.28 * pulse).toFixed(3)})`, 1.5);
    } else {
      // Node / 无 DOM / 构建失败时的兜底：渐变底色
      context.fillStyle = getBackdropGradient();
      context.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    context.fillStyle = getVignetteGradient();
    context.fillRect(0, 0, canvasWidth, canvasHeight);

    // 四角霓虹描边：这是“场地边界”的最终视觉锚点，保持锐利
    context.strokeStyle = 'rgba(120,235,255,.34)';
    context.lineWidth = 2;
    const corner = 26;
    const corners = [
      [arena.x, arena.y, 1, 1],
      [arena.x + arena.w, arena.y, -1, 1],
      [arena.x, arena.y + arena.h, 1, -1],
      [arena.x + arena.w, arena.y + arena.h, -1, -1]
    ];
    for (const [x, y, sx, sy] of corners) {
      context.beginPath();
      context.moveTo(x + sx * corner, y);
      context.lineTo(x + sx * 9, y);
      context.quadraticCurveTo(x, y, x, y + sy * 9);
      context.lineTo(x, y + sy * corner);
      context.stroke();
    }
  }

  function drawCoin(coin, time, offset) {
    if (coin.taken) return;
    const pulse = 1 + Math.sin(time * 0.004 + offset * 1.7) * 0.06;
    const bob = Math.sin(time * 0.003 + offset * 2.1) * 2;
    context.save();
    context.translate(coin.x, coin.y + bob);
    if (glowGold) {
      context.globalAlpha = 0.85;
      context.drawImage(glowGold, -28, -28, 56, 56);
      context.globalAlpha = 1;
    }
    context.scale(pulse, pulse);
    star(0, 0, 12, 5.6, '#ffd479', time * 0.0006);
    star(0, 0, 5.6, 2.6, '#fff3c8', time * 0.0006);
    context.restore();
  }

  /* ---------- 角色绘制（精灵图 + 状态叠加） ---------- */

  function drawActiveSkillChips(snapshot, time) {
    const skills = snapshot.skills || [];
    const active = skills.filter((skill) => skill.active);
    if (!active.length) return;
    const chipW = 62;
    let x = arena.x + arena.w / 2 - (active.length * chipW) / 2;
    const y = arena.y + 30;
    for (const skill of active) {
      roundRect(x, y, chipW - 6, 24, 12, 'rgba(255,255,255,.10)', 'rgba(120,241,230,.5)');
      drawIcon(skillIconKind(skill.id), x + 14, y + 12, 13, '#aef7ec');
      context.textAlign = 'left';
      context.font = '700 11px system-ui';
      context.fillStyle = '#d7fff8';
      context.fillText('生效', x + 25, y + 16);
      x += chipW;
    }
    context.textAlign = 'left';
  }

  function drawFallBackAvatar(x, y, expression) {
    const tint = '#68f5e5';
    context.save();
    context.shadowColor = tint;
    context.shadowBlur = 30;
    context.beginPath();
    context.arc(x, y, 17, 0, Math.PI * 2);
    context.fillStyle = tint;
    context.fill();
    context.shadowBlur = 0;
    context.restore();
  }

  function drawAvatar(x, y, opts) {
    const { facing: face, anim = 'idle', danger = false, failProgress = 0 } = opts;
    const alpha = opts.alpha == null ? 1 : opts.alpha;

    // 地面投影
    context.save();
    context.globalAlpha = alpha * 0.5;
    context.fillStyle = '#0a0814';
    context.beginPath();
    context.ellipse(x, y + 18 * HERO_SCALE * (1 - failProgress * 0.2), 16 * HERO_SCALE + 4, 6.5 * HERO_SCALE + 1.5, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();

    // 暖色光晕（玩家专属，与幽灵区分）
    if (sprite.ready && (glowWarm || glowDanger)) {
      const glow = danger ? glowDanger : glowWarm;
      if (glow) {
        context.save();
        context.globalAlpha = alpha * (danger ? 0.42 : 0.27);
        const gs = 58;
        context.drawImage(glow, x - gs / 2, y - 2 - gs / 2, gs, gs);
        context.restore();
      }
    }

    // 失败时下坠 + 倾斜 + 压扁
    let ox = 0;
    let oy = 0;
    let rot = 0;
    let sx = 1;
    let sy = 1;
    if (anim === 'fail') {
      const p = clamp(failProgress, 0, 1);
      oy = p * 10 * HERO_SCALE;
      rot = (1 - Math.cos(p * Math.PI)) * 0.5 * (x % 2 ? 1 : -1);
      sx = 1 + p * 0.28;
      sy = 1 - p * 0.34;
    } else if (anim === 'danger' && !reduceMotion) {
      ox = Math.sin(performance.now() * 0.045) * 1.4;
    } else if (anim === 'idle' && !reduceMotion) {
      const breathe = Math.sin((idlePhase + walkTime) * 2.0);
      oy = breathe * 1.1;
      sy = 1 + breathe * 0.02;
    }

    if (sprite.ready && sprite.img) {
      const row = face === 'back' ? 3 : 1; // 右/左都用第1行，左翻转
      const col = anim === 'idle' ? 1 : [0, 1, 2, 3][walkFrame % 4];
      const rect = frameRect(row, col);
      const size = FRAME_SIZE * HERO_SCALE;
      context.save();
      context.globalAlpha = alpha;
      context.translate(x + ox, y + oy);
      if (face === 'left') context.scale(-1, 1);
      context.translate(-x, -y);
      if (rot || sx !== 1 || sy !== 1) {
        context.translate(x, y);
        context.rotate(rot);
        context.scale(sx, sy);
        context.translate(-x, -y);
      }
      context.imageSmoothingEnabled = false;
      context.drawImage(
        sprite.img,
        rect.sx, rect.sy, rect.sw, rect.sh,
        x - HERO_ANCHOR_X * HERO_SCALE, y - HERO_ANCHOR_Y * HERO_SCALE,
        size, size
      );
      context.restore();
    } else {
      drawFallBackAvatar(x, y, anim);
    }

    // 危险：汗滴 + 短促感叹
    if (danger && anim !== 'fail') {
      const t = performance.now() * 0.004;
      const dropY = y - 14 * HERO_SCALE + ((t * 18) % 12);
      context.save();
      context.globalAlpha = alpha;
      context.fillStyle = 'rgba(140,210,255,.9)';
      context.beginPath();
      context.ellipse(x + 11 * HERO_SCALE, dropY, 1.8, 2.6, 0, 0, Math.PI * 2);
      context.fill();
      context.font = '800 14px system-ui';
      context.textAlign = 'center';
      context.fillStyle = '#ff6f6f';
      context.fillText('!', x - 12 * HERO_SCALE, y - 16 * HERO_SCALE);
      context.restore();
      context.textAlign = 'left';
    }

    // 失败：叉叉眼
    if (anim === 'fail') {
      context.save();
      context.globalAlpha = alpha;
      context.strokeStyle = 'rgba(40,20,40,.9)';
      context.lineWidth = 1.6;
      const ex = x - 12 * HERO_SCALE;
      const ey = y - 16 * HERO_SCALE;
      for (const cx of [ex - 3, ex + 3]) {
        context.beginPath();
        context.moveTo(cx - 2, ey - 2);
        context.lineTo(cx + 2, ey + 2);
        context.moveTo(cx + 2, ey - 2);
        context.lineTo(cx - 2, ey + 2);
        context.stroke();
      }
      context.restore();
    }

    if (opts.label) {
      context.save();
      context.font = '800 11px system-ui';
      context.textAlign = 'center';
      const width = 24;
      roundRect(x - width / 2, y - 36, width, 17, 8, 'rgba(28,18,46,.85)', 'rgba(120,241,230,.4)');
      context.fillStyle = '#c2fff7';
      context.fillText(opts.label, x, y - 24);
      context.restore();
      context.textAlign = 'left';
    }
  }

  /* ---------- 幽灵绘制（半透明、按来源关卡稳定配色、残影） ---------- */

  function drawGhostBadge(x, y, sourceLevel, tint) {
    const badge = circledNumber(sourceLevel);
    context.save();
    context.font = '800 13px system-ui';
    context.textAlign = 'center';
    const w = 24;
    roundRect(x - w / 2, y - 50, w, 19, 9, 'rgba(12,10,26,.82)', tint);
    context.fillStyle = '#ffffff';
    context.fillText(badge, x, y - 37);
    context.restore();
  }

  function drawGhosts(snapshot, time) {
    const ghostCount = snapshot.ghosts.length;
    const manyGhosts = ghostCount > 6;
    const intangible = snapshot.mode === GAME_MODES.PLAYING && snapshot.graceLeft > 0;
    snapshot.ghosts.forEach((ghost, index) => {
      const tint = GHOST_COLORS[(ghost.sourceLevel - 1) % GHOST_COLORS.length];
      // 残影（越旧越淡越小，限制 4 点避免杂乱）
      const trail = ghost.trail || [];
      const trailMax = manyGhosts ? 2 : 4;
      for (let i = 0; i < trail.length; i += 1) {
        const t = trail[i];
        const ratio = (i + 1) / trail.length;
        if (trail.length - i > trailMax) continue;
        context.save();
        context.globalAlpha = (0.18 / Math.max(1, trail.length)) * (i + 1) * (manyGhosts ? 0.6 : 1);
        context.fillStyle = tint;
        context.beginPath();
        context.arc(t.x, t.y, 11 - ratio * 6, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }

      const bob = Math.sin(time * 0.004 + index * 1.3) * 3;
      const gy = ghost.y + bob;
      drawGhostBadge(ghost.x, gy, ghost.sourceLevel, tint);

      const R = 16;
      const bottom = gy + R * 0.95;
      const feet = 4;
      const w = (2 * R) / feet;
      context.save();
      context.globalAlpha = intangible ? 0.42 : 0.82;
      context.beginPath();
      context.arc(ghost.x, gy, R, Math.PI, Math.PI * 2, false);
      context.lineTo(ghost.x + R, bottom);
      for (let i = 0; i < feet; i += 1) {
        const xa = ghost.x + R - w * i;
        const xb = ghost.x + R - w * (i + 1);
        const xm = (xa + xb) / 2;
        context.quadraticCurveTo(xm, bottom + 7, xb, bottom);
      }
      context.closePath();
      context.fillStyle = tint;
      context.fill();
      // 细亮边替代 shadowBlur：便宜且能让半透明边缘更清晰
      context.globalAlpha *= 0.55;
      context.strokeStyle = 'rgba(255,255,255,.55)';
      context.lineWidth = 1;
      context.stroke();
      // 高光
      context.globalAlpha *= 0.5;
      context.beginPath();
      context.arc(ghost.x - 5, gy - 5, R * 0.5, Math.PI * 1.05, Math.PI * 1.75, false);
      context.strokeStyle = 'rgba(255,255,255,.7)';
      context.lineWidth = 2.2;
      context.stroke();
      // 空洞眼睛
      const eyeY = gy - 1;
      context.globalAlpha = intangible ? 0.4 : 0.82;
      context.fillStyle = '#2a1430';
      context.beginPath();
      context.arc(ghost.x - 5, eyeY, 3, 0, Math.PI * 2);
      context.arc(ghost.x + 5, eyeY, 3, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(255,120,170,.32)';
      context.beginPath();
      context.arc(ghost.x - 8, gy + 3, 2, 0, Math.PI * 2);
      context.arc(ghost.x + 8, gy + 3, 2, 0, Math.PI * 2);
      context.fill();
      context.restore();
    });
  }

  function drawSkillEffects(snapshot, time) {
    const player = snapshot.player;
    const skills = snapshot.skills || [];
    const magnet = skills.find((skill) => skill.id === 'magnet');
    const shield = skills.find((skill) => skill.id === 'shield');

    if (shield && shield.active) {
      context.save();
      context.globalAlpha = 0.55;
      context.strokeStyle = '#78f1e6';
      context.lineWidth = 3;
      context.shadowColor = '#78f1e6';
      context.shadowBlur = 12;
      context.beginPath();
      context.arc(player.x, player.y, 24, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
    if (magnet && magnet.active) {
      const radius = (GAME_CONFIG.playerRadius + GAME_CONFIG.coinRadius + 2) * 2;
      const pulse = 1 + Math.sin(time * 0.006) * 0.05;
      context.save();
      context.globalAlpha = 0.28;
      context.strokeStyle = '#ffd26f';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(player.x, player.y, radius * pulse, 0, Math.PI * 2);
      context.stroke();
      context.restore();
    }
  }

  function drawHud(snapshot, time) {
    // 顶部时间条（信息清晰、无闪烁）
    const barW = 220;
    const barX = arena.x + arena.w / 2 - barW / 2;
    const barY = arena.y + 12;
    const ratio = clamp(snapshot.timeLeft / GAME_CONFIG.roundDuration, 0, 1);
    const barColor = ratio > 0.5
      ? lerpColor('#ffcd68', '#55efd9', (ratio - 0.5) * 2)
      : lerpColor('#ff79af', '#ffcd68', ratio * 2);
    roundRect(barX - 2, barY - 2, barW + 4, 10, 6, 'rgba(10,8,24,.6)');
    roundRect(barX, barY, barW, 6, 3, 'rgba(120,140,190,.25)');
    if (ratio > 0) roundRect(barX, barY, Math.max(6, barW * ratio), 6, 3, barColor);

    // 左侧数据卡
    const cardX = arena.x + 14;
    const cardY = arena.y + 26;
    const cardW = 162;
    const cardH = 58;
    roundRect(cardX, cardY, cardW, cardH, 12, 'rgba(12,10,28,.76)', 'rgba(150,200,255,.18)');

    context.textAlign = 'left';
    drawIcon('star', cardX + 21, cardY + 20, 15, '#ffd479');
    context.font = '800 19px system-ui';
    context.fillStyle = '#ffe9b8';
    context.fillText(`${snapshot.coinsGot} / ${snapshot.goal}`, cardX + 34, cardY + 26);

    const points = snapshot.points || 0;
    const pointCap = snapshot.pointCap || 0;
    drawIcon('bolt', cardX + 21, cardY + 43, 13, '#aef7ec');
    context.font = '700 13px system-ui';
    context.fillStyle = '#aef7ec';
    context.fillText(`${points} / ${pointCap}`, cardX + 34, cardY + 47);

    drawIcon('ghost', cardX + cardW - 44, cardY + 42, 14, '#c9b8ff');
    context.textAlign = 'right';
    context.font = '700 13px system-ui';
    context.fillStyle = '#c9b8ff';
    context.fillText(`× ${snapshot.ghosts.length}`, cardX + cardW - 14, cardY + 47);
    context.textAlign = 'left';

    drawActiveSkillChips(snapshot, time);

    if (snapshot.mode === GAME_MODES.PLAYING && snapshot.graceLeft > 0) {
      const gx = arena.x + arena.w / 2;
      const gy = arena.y + 50;
      roundRect(gx - 96, gy, 192, 26, 13, 'rgba(120,241,230,.10)', 'rgba(120,241,230,.35)');
      context.textAlign = 'center';
      context.font = '700 12px system-ui';
      context.fillStyle = '#8ef3e6';
      context.fillText(`出生保护 ${snapshot.graceLeft.toFixed(1)} 秒`, gx, gy + 17);
      context.textAlign = 'left';
    }
    if (snapshot.mode === GAME_MODES.PLAYING && snapshot.coinsGot >= snapshot.goal) {
      const bx = arena.x + arena.w / 2;
      const by = arena.y + arena.h - 26;
      roundRect(bx - 124, by - 18, 248, 30, 15, 'rgba(40,120,110,.72)', 'rgba(120,241,230,.4)');
      context.textAlign = 'center';
      context.font = '700 13px system-ui';
      context.fillStyle = '#d4ffee';
      context.fillText('✓ 目标达成！坚持到倒计时结束', bx, by + 2);
      context.textAlign = 'left';
    }

    if (snapshot.mode === GAME_MODES.PLAYING && snapshot.timeLeft <= 3) {
      const pulse = reduceMotion ? 1 : 1 + Math.sin(time * 0.012) * 0.12;
      const size = 30 * pulse;
      context.save();
      context.textAlign = 'center';
      context.font = `900 ${size}px system-ui`;
      context.fillStyle = '#ff5d8f';
      context.shadowColor = '#ff5d8f';
      context.shadowBlur = reduceMotion ? 0 : 16;
      context.fillText(snapshot.timeLeft.toFixed(1), arena.x + arena.w / 2, arena.y + arena.h * 0.32);
      context.restore();
      context.textAlign = 'left';
    }
  }

  function drawPrepPreview(snapshot) {
    const paths = snapshot.previewPaths || [];
    context.save();
    context.lineCap = 'round';
    context.lineJoin = 'round';
    paths.forEach((path, index) => {
      const newest = index === paths.length - 1;
      context.globalAlpha = newest ? 0.95 : 0.3;
      context.strokeStyle = GHOST_COLORS[(path.sourceLevel - 1) % GHOST_COLORS.length] || GHOST_COLORS[index % GHOST_COLORS.length];
      context.lineWidth = newest ? 3 : 2;
      context.shadowColor = context.strokeStyle;
      context.shadowBlur = newest ? 10 : 0;
      context.beginPath();
      (path.points || []).forEach((point, pointIndex) => {
        if (pointIndex === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
      context.stroke();
    });
    context.restore();

    const coins = snapshot.previewCoins || [];
    context.save();
    context.globalAlpha = 0.55;
    for (const coin of coins) {
      star(coin.x, coin.y, 13.8, 6.7, '#ffd479', 0);
    }
    context.restore();
  }

  function drawPrepPanel(snapshot, time) {
    const outcome = snapshot.outcome || {};
    const cx = canvasWidth / 2;

    if (!prepShadeGrad) {
      prepShadeGrad = context.createLinearGradient(0, 0, 0, canvasHeight);
      prepShadeGrad.addColorStop(0, 'rgba(14,10,30,0.72)');
      prepShadeGrad.addColorStop(0.28, 'rgba(14,10,30,0.24)');
      prepShadeGrad.addColorStop(0.74, 'rgba(14,10,30,0.24)');
      prepShadeGrad.addColorStop(1, 'rgba(14,10,30,0.84)');
    }
    context.fillStyle = prepShadeGrad;
    context.fillRect(0, 0, canvasWidth, canvasHeight);

    context.textAlign = 'center';

    context.font = '800 30px system-ui';
    context.fillStyle = '#68f5e5';
    context.shadowColor = 'rgba(104,245,229,.5)';
    context.shadowBlur = 14;
    context.fillText(`第 ${outcome.finishedLevel} 关 成功！`, cx, 104);
    context.shadowBlur = 0;

    context.font = '700 14px system-ui';
    context.fillStyle = '#c2fff7';
    context.fillText(
      `本关 ${outcome.coinsGot ?? snapshot.coinsGot} / ${snapshot.goal} 颗星 · 积分 ${snapshot.points}/${snapshot.pointCap}`,
      cx,
      132
    );

    // 准备倒计时环
    const prepRatio = clamp(snapshot.prepLeft / GAME_CONFIG.prepDuration, 0, 1);
    const ringCx = cx;
    const ringCy = 168;
    const ringR = 18;
    context.save();
    context.lineWidth = 4;
    context.strokeStyle = 'rgba(120,241,230,.2)';
    context.beginPath();
    context.arc(ringCx, ringCy, ringR, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = '#78f1e6';
    context.beginPath();
    context.arc(ringCx, ringCy, ringR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prepRatio);
    context.stroke();
    context.fillStyle = '#eafcff';
    context.font = '800 13px system-ui';
    context.fillText(`${Math.ceil(snapshot.prepLeft)}`, ringCx, ringCy + 5);
    context.restore();

    const skills = snapshot.skills || [];
    const cardWidth = Math.min(280, (arena.w - 80) / skills.length - 14);
    const cardHeight = 68;
    const gap = 14;
    const totalWidth = skills.length * cardWidth + (skills.length - 1) * gap;
    const startX = (canvasWidth - totalWidth) / 2;
    const cardY = 434;

    skills.forEach((skill, index) => {
      const x = startX + index * (cardWidth + gap);
      const active = skill.active;
      const affordable = (snapshot.points || 0) >= skill.cost && !active;
      roundRect(x, cardY, cardWidth, cardHeight, 14,
        active ? 'rgba(31,74,72,.9)' : 'rgba(20,16,42,.9)',
        active ? 'rgba(120,241,230,.6)' : affordable ? 'rgba(120,241,230,.4)' : 'rgba(150,170,230,.16)');

      roundRect(x + 14, cardY + 14, 20, 20, 6,
        active ? 'rgba(120,241,230,.22)' : affordable ? 'rgba(120,241,230,.18)' : 'rgba(150,170,230,.1)');
      context.textAlign = 'center';
      context.font = '800 12px system-ui';
      context.fillStyle = active ? '#78f1e6' : affordable ? '#c2fff7' : '#556096';
      context.fillText(String(index + 1), x + 24, cardY + 28);

      context.textAlign = 'left';
      drawIcon(skillIconKind(skill.id), x + 52, cardY + 22, 14, active ? '#78f1e6' : affordable ? '#eef3ff' : '#6878a0');
      context.font = '700 14px system-ui';
      context.fillStyle = active ? '#78f1e6' : affordable ? '#eef3ff' : '#6878a0';
      context.fillText(skill.name, x + 63, cardY + 28);

      context.textAlign = 'right';
      context.font = '700 12px system-ui';
      context.fillStyle = active ? '#9ff9ef' : affordable ? '#ffd479' : '#556096';
      context.fillText(active ? '已购买' : `${skill.cost} 分`, x + cardWidth - 16, cardY + 28);

      context.textAlign = 'left';
      context.font = '600 11px system-ui';
      context.fillStyle = active ? '#a9e8e2' : affordable ? '#aab6d6' : '#556096';
      context.fillText(skill.desc, x + 44, cardY + 50);
    });

    context.textAlign = 'center';
    context.font = '600 12px system-ui';
    context.fillStyle = '#8f9fc5';
    context.fillText('按 1 / 2 / 3 购买 · 空格跳过 · 亮线是新幽灵的路线', cx, 526);

    context.textAlign = 'left';
  }

  function updateAnimation(snapshot, deltaSeconds) {
    const dx = snapshot.player.x - (prevPlayer ? prevPlayer.x : snapshot.player.x);
    const dy = snapshot.player.y - (prevPlayer ? prevPlayer.y : snapshot.player.y);
    const moving = Math.hypot(dx, dy) > 0.8;

    if (moving) {
      const f = resolveFacing(dx, dy);
      if (f) {
        if (f !== facing) {
          facingTimer += deltaSeconds;
          if (facingTimer > 0.05) { facing = f; facingTimer = 0; }
        } else {
          facingTimer = 0;
        }
      }
      walkTime += deltaSeconds;
      walkFrame = Math.floor(walkTime * 9) % 4;
    }

    const danger = snapshot.mode === GAME_MODES.PLAYING &&
      snapshot.graceLeft <= 0 &&
      snapshot.ghosts.some((g) => distance(snapshot.player, g) < 120);

    let anim = 'idle';
    if (snapshot.mode === GAME_MODES.OVER) anim = 'fail';
    else if (danger) anim = 'danger';
    else if (moving) anim = 'move';

    if (anim === 'fail') failTime = Math.min(1, failTime + deltaSeconds * 2.2);
    else failTime = 0;

    return { facing, anim, danger };
  }

  function drawParticles(deltaSeconds) {
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.life -= deltaSeconds;
      if (particle.life <= 0) {
        particles.splice(index, 1);
        continue;
      }
      particle.x += particle.vx * deltaSeconds;
      particle.y += particle.vy * deltaSeconds;
      particle.vx *= 0.98;
      particle.vy *= 0.98;
      context.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, 2.6, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function spawnParticles(x, y, color, count = 8) {
    if (particles.length > MAX_PARTICLES) return;
    for (let index = 0; index < count; index += 1) {
      if (particles.length >= MAX_PARTICLES) break;
      const angle = random(0, Math.PI * 2);
      const speed = random(40, 148);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: random(0.28, 0.7),
        maxLife: 0.7,
        color
      });
    }
  }

  function drawFlash() {
    if (flash <= 0) return;
    context.save();
    context.fillStyle = `rgba(${flashColor},${clamp(flash, 0, 1) * 0.5})`;
    context.fillRect(0, 0, canvasWidth, canvasHeight);
    context.restore();
  }

  return {
    notify(events) {
      for (const event of events) {
        if (event.type === 'coin') spawnParticles(event.x, event.y, '#ffcf72', 10);
        if (event.type === 'lose') { spawnParticles(event.x, event.y, '#ff6c9c', 26); flash = 0.9; flashColor = '255,93,143'; }
        if (event.type === 'clear') { spawnParticles(event.x, event.y, '#68f5e5', 18); flash = 0.9; flashColor = '120,249,224'; }
        if (event.type === 'shield') spawnParticles(event.x, event.y, '#78f1e6', 22);
      }
    },
    render(snapshot, deltaSeconds, time) {
      if (prevMode !== GAME_MODES.CLEAR && snapshot.mode === GAME_MODES.CLEAR) { flash = 0.9; flashColor = '120,249,224'; }
      if (prevMode !== GAME_MODES.OVER && snapshot.mode === GAME_MODES.OVER) { flash = 0.9; flashColor = '255,93,143'; }

      const anim = updateAnimation(snapshot, deltaSeconds);

      drawBackdrop(deltaSeconds, time);
      if (snapshot.mode === GAME_MODES.PREP) {
        drawPrepPreview(snapshot);
        drawPrepPanel(snapshot, time);
        drawParticles(deltaSeconds);
        drawFlash();
        if (flash > 0) flash = Math.max(0, flash - deltaSeconds * 2.5);
        prevPlayer = { x: snapshot.player.x, y: snapshot.player.y };
        prevMode = snapshot.mode;
        return;
      }
      snapshot.coins.forEach((coin, index) => drawCoin(coin, time, index));
      drawGhosts(snapshot, time);
      drawAvatar(snapshot.player.x, snapshot.player.y, {
        facing: anim.facing,
        anim: anim.anim,
        danger: anim.danger,
        failProgress: failTime,
        label: null,
        alpha: 1
      });
      drawSkillEffects(snapshot, time);
      drawHud(snapshot, time);
      drawParticles(deltaSeconds);
      drawFlash();

      if (flash > 0) flash = Math.max(0, flash - deltaSeconds * 2.5);
      prevPlayer = { x: snapshot.player.x, y: snapshot.player.y };
      prevMode = snapshot.mode;
    }
  };
}
