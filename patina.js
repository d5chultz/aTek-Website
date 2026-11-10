/* ==========================================================================
   ANALOG TECH FOUNDRY — PROCEDURAL PATINA LAYER
   Draws fine micro-scratches and faint brass tarnish at the corners.
   Ambient raining snow / dust has been removed per user request.
   Exposes:
     Patina.blast(cx, cy, power)  -> temporary burst that completely fades away
     Patina.mist(on)              -> toggles a soft haze used for the reveal
     Patina.clear()               -> immediately clears and hides patina layer
   ========================================================================== */
(function () {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cvs = document.createElement('canvas');
    cvs.id = 'patina-layer';
    document.body.appendChild(cvs);
    const ctx = cvs.getContext('2d');

    let W = 0, H = 0, dpr = 1;
    let staticLayer = null;
    let dust = [];
    let mistAmount = 0, mistTarget = 0;
    let running = true;

    // Small deterministic RNG so the aging looks the same on every load
    let seed = 1938;
    function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

    function buildStatic() {
        staticLayer = document.createElement('canvas');
        staticLayer.width = W * dpr; staticLayer.height = H * dpr;
        const s = staticLayer.getContext('2d');
        s.scale(dpr, dpr);
        seed = 1938;

        // Brass tarnish: warm, very low alpha bloom in the corners (not a glow filter)
        [[0, 0], [W, 0], [0, H], [W, H]].forEach(([x, y]) => {
            const g = s.createRadialGradient(x, y, 0, x, y, Math.max(W, H) * 0.42);
            g.addColorStop(0, 'rgba(140, 100, 40, 0.07)');
            g.addColorStop(1, 'rgba(140, 100, 40, 0)');
            s.fillStyle = g; s.fillRect(0, 0, W, H);
        });

        // Micro-scratches: thin, short, mostly horizontal arcs like cleaning swirls
        const n = Math.round((W * H) / 9000);
        for (let i = 0; i < n; i++) {
            const x = rnd() * W, y = rnd() * H;
            const len = 6 + rnd() * 46;
            const ang = (rnd() - 0.5) * 0.5 + (rnd() < 0.2 ? Math.PI / 2.4 : 0);
            s.strokeStyle = 'rgba(255,255,255,' + (0.015 + rnd() * 0.04).toFixed(3) + ')';
            s.lineWidth = 0.5;
            s.beginPath();
            s.moveTo(x, y);
            s.quadraticCurveTo(x + Math.cos(ang) * len * 0.5, y + Math.sin(ang) * len * 0.5 + (rnd() - 0.5) * 3,
                               x + Math.cos(ang) * len, y + Math.sin(ang) * len);
            s.stroke();
        }
    }

    function makeDust() {
        // No ambient raining snow
        dust = [];
    }

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        W = window.innerWidth; H = window.innerHeight;
        cvs.width = W * dpr; cvs.height = H * dpr;
        cvs.style.width = W + 'px'; cvs.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        buildStatic();
        makeDust();
        if (reduce) draw();
    }

    function draw() {
        ctx.clearRect(0, 0, W, H);
        if (staticLayer && cvs.style.display !== 'none') {
            ctx.drawImage(staticLayer, 0, 0, W, H);
        }

        // Temporary blast particles that cleanly fade and terminate with zero recycling
        for (let i = dust.length - 1; i >= 0; i--) {
            const p = dust[i];
            if (p.blasted) {
                p.x += p.vx; p.y += p.vy;
                p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.02; // drag + gravity
                p.life -= 0.009; // Clean 2-second fadeout
                if (p.life <= 0 || p.y > H + 20 || p.x < -40 || p.x > W + 40) {
                    dust.splice(i, 1);
                    continue;
                }
                ctx.fillStyle = 'rgba(235, 222, 195,' + (p.a * p.life).toFixed(3) + ')';
                ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 1.5, 0, 6.2832); ctx.fill();
            } else {
                dust.splice(i, 1);
            }
        }

        mistAmount += (mistTarget - mistAmount) * 0.02;
        if (mistAmount > 0.004) {
            const g = ctx.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, Math.max(W, H) * 0.7);
            g.addColorStop(0, 'rgba(200, 188, 165,' + (0.16 * mistAmount).toFixed(3) + ')');
            g.addColorStop(1, 'rgba(200, 188, 165,0)');
            ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        }
    }

    function loop() {
        if (running && !document.hidden && cvs.style.display !== 'none') draw();
        if (!reduce) requestAnimationFrame(loop);
    }

    window.Patina = {
        blast(cx, cy, power) {
            power = power || 1;
            if (cx == null) cx = W / 2; if (cy == null) cy = H / 2;
            for (let i = 0; i < 90; i++) {
                dust.push({
                    x: cx, y: cy,
                    r: 0.6 + Math.random() * 1.5,
                    a: 0.25 + Math.random() * 0.4,
                    vx: 0, vy: 0,
                    blasted: true,
                    life: 0.7 + Math.random() * 0.4
                });
            }
            dust.forEach(p => {
                const dx = p.x - cx, dy = p.y - cy;
                const d = Math.hypot(dx, dy) || 1;
                const v = (6 + Math.random() * 14) * power * (1 + 140 / (d + 80));
                p.vx = (dx / d) * v + (Math.random() - 0.5) * 2;
                p.vy = (dy / d) * v + (Math.random() - 0.5) * 2 - 1.5;
            });
            if (dust.length > 200) dust.splice(0, dust.length - 200);
        },
        mist(on) { mistTarget = on ? 1 : 0; },
        clear() {
            dust = [];
            mistAmount = 0;
            mistTarget = 0;
            if (ctx) ctx.clearRect(0, 0, W, H);
            cvs.style.display = 'none';
        },
        hide() {
            cvs.style.display = 'none';
        },
        show() {
            cvs.style.display = 'block';
        },
        get size() { return { w: W, h: H }; }
    };

    window.addEventListener('resize', resize);
    resize();
    if (!reduce) requestAnimationFrame(loop);
})();
