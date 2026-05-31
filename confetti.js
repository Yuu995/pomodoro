// 轻量烟花/彩纸庆祝 · 在 (x, y) 视口坐标绽放一簇粒子
// 主窗口与悬浮窗共用。无依赖,Canvas 2D。
function burstConfetti(x, y, opts) {
  opts = opts || {};
  const colors = opts.colors || ['#16a34a', '#0ea5e9', '#f59e0b', '#ef4444', '#a855f7', '#fbbf24'];
  const N = opts.count || 34;
  const dur = opts.duration || 1100;

  let canvas = document.getElementById('__confetti');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = '__confetti';
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999';
    document.body.appendChild(canvas);
  }
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const parts = [];
  for (let i = 0; i < N; i++) {
    const ang = (Math.PI * 2 * i / N) + (Math.random() - 0.5) * 0.5;
    const sp = 2.4 + Math.random() * 4.6;
    parts.push({
      x, y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp - 2.2,
      g: 0.12 + Math.random() * 0.07,
      size: 3 + Math.random() * 3.5,
      color: colors[i % colors.length],
      rot: Math.random() * 6.28,
      vr: (Math.random() - 0.5) * 0.45
    });
  }

  const start = performance.now();
  function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    let alive = false;
    for (const p of parts) {
      p.vy += p.g; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.rot += p.vr;
      const life = 1 - t / dur;
      if (life > 0) {
        alive = true;
        ctx.save();
        ctx.globalAlpha = Math.max(0, life);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.62);
        ctx.restore();
      }
    }
    if (alive) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }
  requestAnimationFrame(frame);
}
