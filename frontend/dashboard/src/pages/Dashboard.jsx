import { useEffect, useState, useRef, useCallback } from "react";

/* =========================================================
   TRUSTVISION AI — COMMAND CENTER v2
   - Demo video in CCTV (with real-stream fallback)
   - Local clock + timezone
   - Crisis Protocols (8 toggleable types) with live detection
   ========================================================= */

const C = {
  bg: "#04070D",
  panel: "rgba(8, 18, 30, 0.78)",
  border: "rgba(0, 255, 209, 0.35)",
  borderDim: "rgba(0, 255, 209, 0.12)",
  primary: "#00FFD1",
  primarySoft: "#7CFFE3",
  amber: "#FFB347",
  warn: "#FF8C42",
  danger: "#FF3860",
  success: "#4ADE80",
  violet: "#A78BFA",
  text: "#E2F8F5",
  muted: "#4A6F7C",
  grid: "rgba(0, 255, 209, 0.04)",
};

const FONTS_LINK =
  "https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=JetBrains+Mono:wght@400;500;700&display=swap";

/* Stream / demo sources --- swap REAL_STREAM_URL with your backend feed */
const REAL_STREAM_URL = "http://127.0.0.1:8000/video";
const DEMO_VIDEO_URL =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4";

/* ---------- Utilities ---------- */
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function pad(n, w = 2) { return String(n).padStart(w, "0"); }
const fmtTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const fmtDate = (d) => `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
const tzAbbr = (d) => {
  try {
    const m = d.toString().match(/\(([^)]+)\)$/);
    if (m) {
      return m[1].split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 4);
    }
  } catch {}
  const off = -d.getTimezoneOffset() / 60;
  return `UTC${off >= 0 ? "+" : ""}${off}`;
};

/* ---------- Crisis taxonomy ---------- */
const CRISIS_TYPES = [
  {
    id: "surge", name: "CROWD SURGE", short: "SURGE", icon: "▲",
    color: C.danger, desc: "Critical density buildup",
    threshold: 62, defaultArmed: true,
    riskFn: (d) => clamp(((d?.crowd?.density ?? 0) / 200) * 60 + ((d?.crowd?.motion ?? 0) / 100) * 40, 0, 100),
  },
  {
    id: "intrusion", name: "PERIMETER BREACH", short: "BREACH", icon: "⛨",
    color: C.warn, desc: "Unauthorized zone entry",
    threshold: 70, defaultArmed: true,
    riskFn: () => clamp(38 + Math.sin(Date.now() / 4500) * 25 + Math.random() * 12, 0, 100),
  },
  {
    id: "altercation", name: "ALTERCATION", short: "FIGHT", icon: "✕",
    color: C.warn, desc: "Aggressive interaction",
    threshold: 72, defaultArmed: true,
    riskFn: (d) => clamp((d?.crowd?.motion ?? 0) * 0.8 + Math.random() * 12, 0, 100),
  },
  {
    id: "medical", name: "MEDICAL EVENT", short: "MED", icon: "✚",
    color: C.primarySoft, desc: "Falls, distress, collapse",
    threshold: 68, defaultArmed: true,
    riskFn: () => clamp(28 + Math.sin(Date.now() / 6500) * 18 + Math.random() * 14, 0, 100),
  },
  {
    id: "fire", name: "FIRE / SMOKE", short: "FIRE", icon: "◈",
    color: C.danger, desc: "Thermal & smoke signature",
    threshold: 78, defaultArmed: true,
    riskFn: () => clamp(18 + Math.random() * 28, 0, 100),
  },
  {
    id: "unattended", name: "UNATTENDED OBJ", short: "BAG", icon: "◌",
    color: C.amber, desc: "Stationary object > 5min",
    threshold: 60, defaultArmed: false,
    riskFn: () => clamp(34 + Math.sin(Date.now() / 7800) * 24 + Math.random() * 8, 0, 100),
  },
  {
    id: "weapon", name: "WEAPON", short: "WPN", icon: "◢",
    color: C.danger, desc: "Firearm / blade silhouette",
    threshold: 84, defaultArmed: true,
    riskFn: () => clamp(12 + Math.random() * 22, 0, 100),
  },
  {
    id: "deepfake", name: "SYNTHETIC MEDIA", short: "DFAKE", icon: "◇",
    color: C.violet, desc: "Deepfake / generated content",
    threshold: 55, defaultArmed: true,
    riskFn: (d) => clamp(100 - (d?.media?.authenticity_score ?? 90), 0, 100),
  },
];

/* ---------- Intel feed (deepfake / social media / OSINT) ---------- */
const INTEL_PLATFORMS = [
  { id: "x",    name: "X",         glyph: "𝕏",  color: "#E2F8F5" },
  { id: "tt",   name: "TikTok",    glyph: "♪",  color: "#FF3860" },
  { id: "rd",   name: "Reddit",    glyph: "®",  color: "#FFB347" },
  { id: "tg",   name: "Telegram",  glyph: "✈",  color: "#7CFFE3" },
  { id: "fb",   name: "Facebook",  glyph: "f",  color: "#A78BFA" },
  { id: "yt",   name: "YouTube",   glyph: "▶",  color: "#FF8C42" },
  { id: "dc",   name: "Discord",   glyph: "◆",  color: "#A78BFA" },
  { id: "ig",   name: "Instagram", glyph: "◉",  color: "#FF3860" },
];

const INTEL_TEMPLATES = [
  /* DEEPFAKE / SYNTHETIC MEDIA */
  { kind: "deepfake", icon: "◇", color: "#A78BFA",
    titles: [
      "Synthetic face detected in viral clip",
      "Voice clone — public figure impersonation",
      "GAN signature on uploaded image",
      "Facial reenactment artifacts found",
      "AI-generated avatar in livestream",
      "Lip-sync mismatch — generative audio",
      "Diffusion model fingerprint identified",
      "Frame interpolation anomalies present",
    ],
  },
  /* SOCIAL MEDIA / COORDINATED INAUTHENTIC BEHAVIOR */
  { kind: "social", icon: "✱", color: "#FFB347",
    titles: [
      "Coordinated hashtag campaign rising",
      "Bot cluster amplifying narrative",
      "Sentiment shift detected — sector 04",
      "Anomalous engagement spike",
      "Inauthentic account network flagged",
      "Repost cascade originating offshore",
      "Astroturf pattern across 47 accounts",
      "Burst posting from new accounts",
    ],
  },
  /* OSINT / OPEN SOURCE INTELLIGENCE */
  { kind: "osint", icon: "◈", color: "#00FFD1",
    titles: [
      "Geofenced chatter increase — venue",
      "Trending keyword cross-reference hit",
      "Mentions of incident location rising",
      "Open-source signal correlated to feed",
      "Public CCTV mirror identified",
      "Doxxing attempt — operator profile",
    ],
  },
  /* MISINFORMATION / NARRATIVE */
  { kind: "narrative", icon: "≢", color: "#FF8C42",
    titles: [
      "Fabricated quote attributed to official",
      "Recycled footage — incorrect context",
      "Out-of-date image presented as live",
      "Manipulated screenshot circulating",
    ],
  },
];

const HANDLES = [
  "@nightwatch_07", "@signal_relay", "@redshift_obs", "@cipher_404",
  "@vector_ops", "@parallax_ne", "@ghost_route", "@quiet_canopy",
  "@sentinel_x", "@truth_engine", "@deepfeed_ai", "@vigilance.io",
  "@northgate_int", "@beacon_03", "@sigma_observer",
];

function makeIntelItem(seed) {
  const tpl = INTEL_TEMPLATES[Math.floor(Math.random() * INTEL_TEMPLATES.length)];
  const platform = INTEL_PLATFORMS[Math.floor(Math.random() * INTEL_PLATFORMS.length)];
  const title = tpl.titles[Math.floor(Math.random() * tpl.titles.length)];
  const handle = HANDLES[Math.floor(Math.random() * HANDLES.length)];
  const conf = Math.round(62 + Math.random() * 37);
  const sev = conf > 88 ? "CRIT" : conf > 75 ? "HIGH" : conf > 60 ? "MED" : "LOW";
  const reach = Math.round(Math.random() * 850) * (Math.random() > 0.7 ? 10 : 1);
  return {
    id: seed,
    kind: tpl.kind,
    icon: tpl.icon,
    color: tpl.color,
    title,
    handle,
    platform,
    conf,
    sev,
    reach,
    ts: new Date(),
  };
}

/* ---------- Operator chat (AI command console) ---------- */
const QUICK_CMDS = [
  { label: "STATUS",     text: "report status" },
  { label: "SCAN 04",    text: "rescan zone 04" },
  { label: "LAST DFAKE", text: "show last deepfake hit" },
  { label: "DISPATCH",   text: "dispatch unit to alert" },
  { label: "LOCK",       text: "engage perimeter lock" },
];

function aiReply(text, ctx) {
  const t = text.toLowerCase();
  const trust = ctx?.trust ?? 0;
  const ppl = ctx?.people ?? 0;
  const armed = ctx?.armed ?? 0;
  if (/status|report|sitrep/.test(t))
    return `SITREP · trust ${trust}, subjects ${ppl}, ${armed}/8 protocols armed. No critical incidents in last 60s.`;
  if (/scan|rescan|sweep/.test(t))
    return `Acknowledged. Sweeping target zone @ 4 Hz. ETA 12s. Streaming results to feed.`;
  if (/deepfake|dfake|synthetic|gan|clone/.test(t))
    return `Last synthetic-media hit: confidence ${Math.round(70 + Math.random() * 25)}%. Vector traced through 3 hops. Sample preserved in evidence cache.`;
  if (/dispatch|unit|ground|send/.test(t))
    return `Dispatch confirmed. Ground team ETA 4m 20s. Live link enabled on channel 7.`;
  if (/lock|perimeter|seal/.test(t))
    return `Perimeter lock engaged. 4 of 4 vectors secured. All exits monitored.`;
  if (/disarm|stand.?down|cancel/.test(t))
    return `Negative — manual override required for stand-down. Use the ARM panel to disarm individual protocols.`;
  if (/social|hashtag|narrative|bot/.test(t))
    return `Tracking 3 active narrative clusters. Highest velocity: ${Math.round(80 + Math.random() * 60)}/min. Cross-platform vectors identified.`;
  if (/help|commands|cmd/.test(t))
    return `Commands: STATUS · SCAN [zone] · LAST DFAKE · DISPATCH · LOCK · DISARM. Free-form natural language also accepted.`;
  if (/hello|hi|hey/.test(t))
    return `Online. Awaiting tactical input, operator.`;
  return `Parsed. Cross-referencing query against ${Math.round(800 + Math.random() * 1400)} signal vectors. No actionable match — refine input.`;
}

function useSmoothed(target, speed = 0.12) {
  const [v, setV] = useState(target ?? 0);
  const raf = useRef();
  useEffect(() => {
    const tick = () => {
      setV((cur) => {
        const next = cur + (target - cur) * speed;
        if (Math.abs(next - target) < 0.05) return target;
        raf.current = requestAnimationFrame(tick);
        return next;
      });
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, speed]);
  return v;
}

function makeMock(prev) {
  const lastTrust = prev?.trust?.trust_score ?? 78;
  const drift = (Math.random() - 0.5) * 6;
  const trust = clamp(Math.round(lastTrust + drift), 22, 98);
  const risk = trust > 72 ? "LOW" : trust > 48 ? "MEDIUM" : "HIGH";
  const lastPeople = prev?.crowd?.people_count ?? 24;
  const people = clamp(Math.round(lastPeople + (Math.random() - 0.5) * 3), 0, 140);
  const density = clamp(Math.round(people * 1.6 + Math.random() * 8), 0, 220);
  const motion = clamp(Math.round(40 + Math.random() * 55), 0, 100);
  return {
    crowd: { people_count: people, density, motion },
    media: { authenticity_score: clamp(Math.round(70 + Math.random() * 28), 0, 100) },
    bias: { bias_score: clamp(Math.round(15 + Math.random() * 35), 0, 100) },
    trust: {
      trust_score: trust,
      risk_level: risk,
      explanation: [
        "Optical flow stable across observed quadrants",
        "Audio-visual sync within tolerance (Δ 18ms)",
        risk === "LOW" ? "No anomalous biometric clustering detected" : "Localized density spike near vector 04",
        "Adversarial signature score below threshold",
      ],
      recommended_actions:
        risk === "LOW" ? ["Maintain passive monitoring", "Continue baseline calibration"]
        : risk === "MEDIUM" ? ["Elevate scan rate to 4Hz", "Cross-reference biometric cache", "Notify station 02"]
        : ["Dispatch ground unit", "Initiate perimeter lock", "Engage secondary feed"],
    },
  };
}

/* =========================================================
   PRESENTATIONAL PIECES
   ========================================================= */

function Panel({ title, code, children, accent = C.primary, style, badge }) {
  return (
    <div className="hud-panel" style={style}>
      <span className="bracket br-tl" style={{ borderColor: accent }} />
      <span className="bracket br-tr" style={{ borderColor: accent }} />
      <span className="bracket br-bl" style={{ borderColor: accent }} />
      <span className="bracket br-br" style={{ borderColor: accent }} />
      {(title || code) && (
        <div className="hud-title">
          <span className="hud-dot" style={{ background: accent }} />
          <span className="hud-title-text" style={{ color: accent }}>{title}</span>
          {badge && <span className="hud-badge" style={{ borderColor: accent, color: accent }}>{badge}</span>}
          {code && <span className="hud-code">{code}</span>}
        </div>
      )}
      <div className="hud-body">{children}</div>
    </div>
  );
}

function Counter({ value, decimals = 0, suffix = "" }) {
  const v = useSmoothed(value ?? 0, 0.15);
  return <span>{v.toFixed(decimals)}{suffix}</span>;
}

function Sparkline({ data, color = C.primary, height = 28 }) {
  if (!data || data.length < 2) return <div style={{ height, opacity: 0.3, fontSize: 10 }}>—</div>;
  const w = 120, h = height;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((d, i) => `${(i * step).toFixed(1)},${(h - ((d - min) / range) * h).toFixed(1)}`).join(" ");
  const last = data[data.length - 1];
  const lx = (data.length - 1) * step;
  const ly = h - ((last - min) / range) * h;
  const id = `spk-${color.replace("#", "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon fill={`url(#${id})`} points={`0,${h} ${pts} ${w},${h}`} />
      <polyline fill="none" stroke={color} strokeWidth="1.4" points={pts} />
      <circle cx={lx} cy={ly} r="2.6" fill={color}>
        <animate attributeName="r" values="2.6;4;2.6" dur="1.4s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function Stat({ label, value, suffix = "", history = [], color = C.primary, icon }) {
  return (
    <div className="stat-tile">
      <div className="stat-head">
        <span className="stat-icon" style={{ color }}>{icon}</span>
        <span className="stat-label">{label}</span>
      </div>
      <div className="stat-row">
        <div className="stat-value" style={{ color }}><Counter value={value} suffix={suffix} /></div>
        <div className="stat-spark"><Sparkline data={history} color={color} /></div>
      </div>
    </div>
  );
}

function Bar({ value, color = C.primary, label }) {
  const v = useSmoothed(value ?? 0);
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="bar-label"><span>{label}</span><span style={{ color }}>{Math.round(v)}</span></div>
      <div className="bar-track">
        <div className="bar-fill" style={{
          width: `${clamp(v, 0, 100)}%`,
          background: `linear-gradient(90deg, ${color}55, ${color})`,
          boxShadow: `0 0 8px ${color}80`,
        }} />
        <div className="bar-ticks" />
      </div>
    </div>
  );
}

function TrustGauge({ score = 0, risk = "LOW" }) {
  const v = useSmoothed(score);
  const size = 200, stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = clamp(v, 0, 100) / 100;
  const dash = c * pct;
  const color = risk === "HIGH" ? C.danger : risk === "MEDIUM" ? C.warn : C.primary;

  const ticks = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 - Math.PI / 2;
    const r1 = r + 6, r2 = r + (i % 5 === 0 ? 14 : 10);
    ticks.push(
      <line key={i}
        x1={size / 2 + Math.cos(a) * r1} y1={size / 2 + Math.sin(a) * r1}
        x2={size / 2 + Math.cos(a) * r2} y2={size / 2 + Math.sin(a) * r2}
        stroke={i % 5 === 0 ? color : C.borderDim}
        strokeWidth={i % 5 === 0 ? 1.4 : 0.8}
        opacity={i % 5 === 0 ? 0.9 : 0.5} />
    );
  }
  return (
    <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
      <svg width={size} height={size} style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="1" />
            <stop offset="100%" stopColor={color} stopOpacity="0.4" />
          </linearGradient>
          <filter id="gauge-glow">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {ticks}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.borderDim} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="url(#gauge-grad)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          filter="url(#gauge-glow)" />
      </svg>
      <div className="gauge-center">
        <div className="gauge-label">TRUST INDEX</div>
        <div className="gauge-num" style={{ color }}><Counter value={v} /></div>
        <div className="gauge-risk" style={{ color, borderColor: color }}>{risk} RISK</div>
      </div>
    </div>
  );
}

function Radar({ peopleCount = 0, motion = 0 }) {
  const ref = useRef(null);
  const angleRef = useRef(0);
  const blipsRef = useRef([]);

  useEffect(() => {
    const target = clamp(Math.round(peopleCount / 3), 4, 18);
    const cur = blipsRef.current.length;
    if (cur < target) {
      for (let i = 0; i < target - cur; i++) {
        blipsRef.current.push({
          a: Math.random() * Math.PI * 2,
          r: 0.25 + Math.random() * 0.7,
          hot: Math.random() > 0.85,
        });
      }
    } else if (cur > target) {
      blipsRef.current = blipsRef.current.slice(0, target);
    }
  }, [peopleCount]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    let raf;
    const loop = () => {
      const W = cv.width, H = cv.height;
      const cx = W / 2, cy = H / 2;
      const R = Math.min(W, H) / 2 - 6;
      ctx.clearRect(0, 0, W, H);

      ctx.fillStyle = "rgba(0, 30, 25, 0.25)";
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

      for (let i = 1; i <= 4; i++) {
        ctx.strokeStyle = "rgba(0, 255, 209, 0.18)";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, (R / 4) * i, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
      ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
      ctx.stroke();

      angleRef.current += 0.018 + (motion / 100) * 0.02;
      const a = angleRef.current;
      const grad = ctx.createConicGradient ? ctx.createConicGradient(a, cx, cy) : null;
      if (grad) {
        grad.addColorStop(0, "rgba(0, 255, 209, 0.55)");
        grad.addColorStop(0.08, "rgba(0, 255, 209, 0.0)");
        grad.addColorStop(1, "rgba(0, 255, 209, 0.0)");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
        const lg = ctx.createLinearGradient(0, 0, R, 0);
        lg.addColorStop(0, "rgba(0,255,209,0.6)");
        lg.addColorStop(1, "rgba(0,255,209,0)");
        ctx.fillStyle = lg;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, -0.2, 0.2); ctx.closePath(); ctx.fill();
        ctx.restore();
      }

      ctx.strokeStyle = "rgba(0, 255, 209, 0.85)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke();

      blipsRef.current.forEach((b) => {
        const bx = cx + Math.cos(b.a) * b.r * R;
        const by = cy + Math.sin(b.a) * b.r * R;
        const diff = (((a - b.a) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const intensity = clamp(1 - diff / (Math.PI * 2), 0.15, 1);
        const col = b.hot ? "255, 56, 96" : "0, 255, 209";
        ctx.fillStyle = `rgba(${col}, ${intensity})`;
        ctx.beginPath(); ctx.arc(bx, by, b.hot ? 4 : 3, 0, Math.PI * 2); ctx.fill();
        if (intensity > 0.7) {
          ctx.strokeStyle = `rgba(${col}, ${intensity * 0.6})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(bx, by, 9 * intensity, 0, Math.PI * 2); ctx.stroke();
        }
      });

      ctx.fillStyle = "#00FFD1";
      ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = "rgba(0, 255, 209, 0.7)";
      ctx.font = "bold 10px 'JetBrains Mono', monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("N", cx, cy - R + 8);
      ctx.fillText("S", cx, cy + R - 8);
      ctx.fillText("E", cx + R - 8, cy);
      ctx.fillText("W", cx - R + 8, cy);

      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [motion]);

  return <canvas ref={ref} width={300} height={300} className="radar-canvas" />;
}

function Heatmap({ density = 0, peopleCount = 0 }) {
  const ref = useRef(null);
  const spotsRef = useRef([]);

  useEffect(() => {
    const target = clamp(Math.round(peopleCount / 4), 4, 22);
    const cur = spotsRef.current.length;
    if (cur < target) {
      for (let i = 0; i < target - cur; i++) {
        spotsRef.current.push({
          x: Math.random(), y: Math.random(),
          vx: (Math.random() - 0.5) * 0.0008,
          vy: (Math.random() - 0.5) * 0.0008,
          intensity: 0.4 + Math.random() * 0.6,
        });
      }
    } else if (cur > target) {
      spotsRef.current = spotsRef.current.slice(0, target);
    }
  }, [peopleCount]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    let raf;
    const loop = () => {
      const W = cv.width, H = cv.height;
      ctx.clearRect(0, 0, W, H);

      ctx.strokeStyle = "rgba(0, 255, 209, 0.05)";
      ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 32) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      const intensity = clamp(density / 200, 0.2, 1.2);
      spotsRef.current.forEach((s) => {
        s.x += s.vx; s.y += s.vy;
        if (s.x < 0 || s.x > 1) s.vx *= -1;
        if (s.y < 0 || s.y > 1) s.vy *= -1;
        const px = s.x * W, py = s.y * H;
        const radius = 60 * s.intensity * intensity;
        const grad = ctx.createRadialGradient(px, py, 0, px, py, radius);
        const heat = s.intensity * intensity;
        if (heat > 0.85) {
          grad.addColorStop(0, "rgba(255, 56, 96, 0.55)");
          grad.addColorStop(0.5, "rgba(255, 140, 66, 0.25)");
          grad.addColorStop(1, "rgba(255, 140, 66, 0)");
        } else if (heat > 0.55) {
          grad.addColorStop(0, "rgba(255, 179, 71, 0.45)");
          grad.addColorStop(0.6, "rgba(0, 255, 209, 0.15)");
          grad.addColorStop(1, "rgba(0, 255, 209, 0)");
        } else {
          grad.addColorStop(0, "rgba(0, 255, 209, 0.45)");
          grad.addColorStop(1, "rgba(0, 255, 209, 0)");
        }
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(px, py, radius, 0, Math.PI * 2); ctx.fill();
      });

      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [density]);

  return <canvas ref={ref} width={640} height={300} className="heatmap-canvas" />;
}

function ActivityLog({ entries }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [entries]);
  return (
    <div ref={ref} className="log">
      {entries.map((e) => (
        <div key={e.id} className={`log-line log-${e.kind}`}>
          <span className="log-time">{e.time}</span>
          <span className="log-tag">{e.kind.toUpperCase()}</span>
          <span className="log-msg">{e.msg}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- CCTV with demo video ---------- */
function CCTV({ peopleCount, density, useRealStream }) {
  const [now, setNow] = useState(new Date());
  const [streamFailed, setStreamFailed] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const showVideo = !useRealStream || streamFailed;

  return (
    <div className="cctv-wrap">
      {useRealStream && !streamFailed && (
        <img src={REAL_STREAM_URL} alt="live" className="cctv-img"
          onError={() => setStreamFailed(true)} />
      )}
      {showVideo && (
        <video src={DEMO_VIDEO_URL} autoPlay muted loop playsInline className="cctv-video" />
      )}
      <div className="cctv-tint" />
      <CCTVTargets count={Math.min(peopleCount ?? 0, 8)} />
      <svg className="cctv-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
        <g stroke={C.primary} strokeWidth="0.3" fill="none" opacity="0.7">
          <path d="M2 8 L2 2 L8 2" />
          <path d="M92 2 L98 2 L98 8" />
          <path d="M98 92 L98 98 L92 98" />
          <path d="M8 98 L2 98 L2 92" />
        </g>
      </svg>
      <div className="cctv-meta cctv-meta-tl"><span className="rec-dot" /> REC · CAM-01</div>
      <div className="cctv-meta cctv-meta-tr">{fmtDate(now)} · {fmtTime(now)} {tzAbbr(now)}</div>
      <div className="cctv-meta cctv-meta-bl">SUBJECTS: {peopleCount ?? 0} · DENSITY: {density ?? 0}</div>
      <div className="cctv-meta cctv-meta-br">ZOOM 1.0× · F2.8 · ISO AUTO</div>
      {showVideo && <div className="cctv-demo-flag">DEMO FOOTAGE</div>}
      <div className="scan-line" />
    </div>
  );
}

function CCTVTargets({ count }) {
  const [boxes, setBoxes] = useState([]);
  useEffect(() => {
    const arr = Array.from({ length: count }).map(() => ({
      x: 5 + Math.random() * 80,
      y: 10 + Math.random() * 75,
      w: 6 + Math.random() * 8,
      h: 10 + Math.random() * 12,
    }));
    setBoxes(arr);
    const t = setInterval(() => {
      setBoxes((bs) => bs.map((b) => ({
        ...b,
        x: clamp(b.x + (Math.random() - 0.5) * 1.5, 2, 92),
        y: clamp(b.y + (Math.random() - 0.5) * 1.0, 2, 88),
      })));
    }, 700);
    return () => clearInterval(t);
  }, [count]);
  return (
    <svg className="cctv-targets" viewBox="0 0 100 100" preserveAspectRatio="none">
      {boxes.map((b, i) => (
        <g key={i} stroke={C.primary} strokeWidth="0.18" fill="none">
          <rect x={b.x} y={b.y} width={b.w} height={b.h}
            opacity="0.9" style={{ transition: "all 0.6s ease-out" }} />
          <text x={b.x} y={b.y - 0.6} fill={C.primary}
            fontSize="1.4" fontFamily="JetBrains Mono" opacity="0.85">
            ID-{(i + 184).toString(16).toUpperCase()}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ---------- Crisis card ---------- */
function CrisisCard({ type, level, armed, flashing, onToggle }) {
  const v = useSmoothed(level);
  const triggered = armed && v >= type.threshold;
  return (
    <div
      className={`crisis-card ${armed ? "armed" : "standby"} ${triggered ? "triggered" : ""} ${flashing ? "flash" : ""}`}
      style={{ "--cc": type.color, "--cc-soft": type.color + "33" }}
      onClick={onToggle}
    >
      <div className="crisis-head">
        <div className="crisis-icon" style={{ color: type.color }}>{type.icon}</div>
        <div className="crisis-title">
          <div className="crisis-name">{type.name}</div>
          <div className="crisis-desc">{type.desc}</div>
        </div>
        <div className={`crisis-state ${armed ? "on" : "off"}`}>{armed ? "ARMED" : "STANDBY"}</div>
      </div>
      <div className="crisis-meter">
        <div className="crisis-meter-track">
          <div className="crisis-meter-fill" style={{
            width: `${clamp(v, 0, 100)}%`,
            background: `linear-gradient(90deg, ${type.color}55, ${type.color})`,
          }} />
          <div className="crisis-threshold"
            style={{ left: `${type.threshold}%`, background: triggered ? type.color : "rgba(255,255,255,0.3)" }} />
        </div>
        <div className="crisis-meter-row">
          <span style={{ color: triggered ? type.color : C.muted }}>
            {Math.round(v)}/{type.threshold}
          </span>
          <span className="crisis-tag">{type.short}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- INTEL FEED — deepfake / social media / OSINT cards ---------- */
function IntelFeed({ items, filter, onFilter }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0; // newest at top
  }, [items.length]);

  const visible = filter === "all" ? items : items.filter((i) => i.kind === filter);
  const counts = items.reduce((a, i) => ({ ...a, [i.kind]: (a[i.kind] || 0) + 1 }), {});

  const TABS = [
    { id: "all",       label: "ALL",      n: items.length },
    { id: "deepfake",  label: "DEEPFAKE", n: counts.deepfake || 0 },
    { id: "social",    label: "SOCIAL",   n: counts.social || 0 },
    { id: "osint",     label: "OSINT",    n: counts.osint || 0 },
    { id: "narrative", label: "NARRATIVE",n: counts.narrative || 0 },
  ];

  return (
    <div className="intel-wrap">
      <div className="intel-tabs">
        {TABS.map((t) => (
          <button key={t.id}
            className={`intel-tab ${filter === t.id ? "intel-tab-on" : ""}`}
            onClick={() => onFilter(t.id)}>
            <span>{t.label}</span>
            <span className="intel-tab-n">{t.n}</span>
          </button>
        ))}
      </div>
      <div className="intel-list" ref={ref}>
        {visible.length === 0 && (
          <div className="intel-empty">› awaiting signals…</div>
        )}
        {visible.map((it) => (
          <IntelCard key={it.id} item={it} />
        ))}
      </div>
    </div>
  );
}

function IntelCard({ item }) {
  const sevColor =
    item.sev === "CRIT" ? C.danger :
    item.sev === "HIGH" ? C.warn :
    item.sev === "MED"  ? C.amber : C.primarySoft;
  const time = `${pad(item.ts.getHours())}:${pad(item.ts.getMinutes())}:${pad(item.ts.getSeconds())}`;
  const reachStr =
    item.reach > 1000 ? `${(item.reach / 1000).toFixed(1)}K` : `${item.reach}`;

  return (
    <div className="intel-card" style={{ borderLeftColor: item.color }}>
      <div className="intel-card-icon" style={{ color: item.color, borderColor: item.color + "55" }}>
        {item.icon}
      </div>
      <div className="intel-card-body">
        <div className="intel-card-row1">
          <span className="intel-card-title">{item.title}</span>
          <span className="intel-card-sev" style={{ color: sevColor, borderColor: sevColor + "66" }}>
            {item.sev}
          </span>
        </div>
        <div className="intel-card-row2">
          <span className="intel-pf" style={{ color: item.platform.color }}>
            {item.platform.glyph} {item.platform.name}
          </span>
          <span className="intel-handle">{item.handle}</span>
          <span className="intel-meta">CONF {item.conf}%</span>
          <span className="intel-meta">REACH {reachStr}</span>
          <span className="intel-time">{time}</span>
        </div>
        <div className="intel-card-bar">
          <div className="intel-card-bar-fill" style={{
            width: `${item.conf}%`,
            background: `linear-gradient(90deg, ${item.color}33, ${item.color})`,
          }} />
        </div>
      </div>
    </div>
  );
}

/* ---------- OPS CHAT — operator command console ---------- */
function OpsChat({ messages, onSend, typing }) {
  const [draft, setDraft] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [messages, typing]);

  const send = (text) => {
    const v = (text ?? draft).trim();
    if (!v) return;
    onSend(v);
    setDraft("");
  };

  return (
    <div className="chat-wrap">
      <div className="chat-stream" ref={ref}>
        {messages.map((m) => (
          <ChatBubble key={m.id} msg={m} />
        ))}
        {typing && (
          <div className="chat-bubble chat-ai chat-typing">
            <div className="chat-avatar chat-av-ai">AI</div>
            <div className="chat-msg">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}
      </div>
      <div className="chat-quick">
        {QUICK_CMDS.map((q) => (
          <button key={q.label} className="chat-q-btn" onClick={() => send(q.text)}>
            › {q.label}
          </button>
        ))}
      </div>
      <div className="chat-input-row">
        <span className="chat-prompt">›</span>
        <input
          className="chat-input"
          placeholder="enter command or natural language…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
        />
        <button className="chat-send" onClick={() => send()}
          disabled={!draft.trim()}>SEND</button>
      </div>
    </div>
  );
}

function ChatBubble({ msg }) {
  const isOp = msg.from === "op";
  const time = `${pad(msg.ts.getHours())}:${pad(msg.ts.getMinutes())}`;
  return (
    <div className={`chat-bubble ${isOp ? "chat-op" : "chat-ai"}`}>
      <div className={`chat-avatar ${isOp ? "chat-av-op" : "chat-av-ai"}`}>
        {isOp ? "OP" : "AI"}
      </div>
      <div className="chat-col">
        <div className="chat-meta">
          <span className="chat-from">{isOp ? "OPERATOR" : "TRUSTVISION-AI"}</span>
          <span className="chat-ts">{time}</span>
        </div>
        <div className="chat-msg">{msg.text}</div>
      </div>
    </div>
  );
}

/* =========================================================
   MAIN DASHBOARD
   ========================================================= */
export default function Dashboard() {
  const [data, setData] = useState(null);
  const [demoMode, setDemoMode] = useState(false);
  const [history, setHistory] = useState({
    trust: [], people: [], density: [], motion: [], media: [], bias: [],
  });
  const [log, setLog] = useState([]);
  const [now, setNow] = useState(new Date());
  const [armedProtocols, setArmedProtocols] = useState(() =>
    CRISIS_TYPES.reduce((acc, t) => ({ ...acc, [t.id]: t.defaultArmed }), {})
  );
  const [protocolLevels, setProtocolLevels] = useState({});
  const [protocolFlash, setProtocolFlash] = useState({});
  const wsConnected = useRef(false);
  const logCounter = useRef(0);
  const lastFireRef = useRef({});

  const pushLog = useCallback((kind, msg) => {
    const t = new Date();
    const time = `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
    setLog((prev) => {
      const next = [...prev, { id: ++logCounter.current, time, kind, msg }];
      return next.length > 80 ? next.slice(-80) : next;
    });
  }, []);

  const toggleProtocol = (id) => {
    setArmedProtocols((p) => {
      const next = { ...p, [id]: !p[id] };
      const t = CRISIS_TYPES.find((x) => x.id === id);
      pushLog(next[id] ? "ok" : "warn", `${t.name} protocol ${next[id] ? "ARMED" : "DISARMED"}`);
      return next;
    });
  };

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let ws, demoTimer, watchdog;
    pushLog("info", "Boot sequence initiated");
    pushLog("info", "Loading neural inference modules...");
    pushLog("ok", "Vision pipeline online");

    try {
      ws = new WebSocket("ws://127.0.0.1:8000/ws");
      ws.onopen = () => {
        wsConnected.current = true;
        pushLog("ok", "WebSocket link established · 127.0.0.1:8000");
      };
      ws.onmessage = (event) => {
        try {
          const d = JSON.parse(event.data);
          setData(d);
        } catch {
          pushLog("err", "Malformed WS payload — discarded");
        }
      };
      ws.onerror = () => pushLog("warn", "WebSocket error — entering demo mode");
      ws.onclose = () => pushLog("warn", "WebSocket disconnected");
    } catch {
      pushLog("warn", "WebSocket unavailable");
    }

    watchdog = setTimeout(() => {
      if (!wsConnected.current) {
        setDemoMode(true);
        pushLog("warn", "No live feed — engaging SIM mode");
        const tick = () => setData((prev) => makeMock(prev));
        tick();
        demoTimer = setInterval(tick, 1800);
      }
    }, 2000);

    return () => {
      clearTimeout(watchdog);
      clearInterval(demoTimer);
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, [pushLog]);

  const lastRiskRef = useRef(null);
  useEffect(() => {
    if (!data) return;
    setHistory((h) => {
      const cap = 30;
      const push = (arr, v) => [...arr, v].slice(-cap);
      return {
        trust: push(h.trust, data.trust?.trust_score ?? 0),
        people: push(h.people, data.crowd?.people_count ?? 0),
        density: push(h.density, data.crowd?.density ?? 0),
        motion: push(h.motion, data.crowd?.motion ?? 0),
        media: push(h.media, data.media?.authenticity_score ?? 0),
        bias: push(h.bias, data.bias?.bias_score ?? 0),
      };
    });
    const risk = data.trust?.risk_level;
    if (risk && risk !== lastRiskRef.current) {
      lastRiskRef.current = risk;
      pushLog(risk === "LOW" ? "ok" : risk === "MEDIUM" ? "warn" : "err", `Risk level → ${risk}`);
    }
  }, [data, pushLog]);

  /* compute crisis levels every 600ms; fire incidents */
  useEffect(() => {
    const tick = () => {
      const next = {};
      CRISIS_TYPES.forEach((t) => {
        const lvl = data ? t.riskFn(data) : 0;
        next[t.id] = lvl;
        if (armedProtocols[t.id] && lvl >= t.threshold) {
          const last = lastFireRef.current[t.id] ?? 0;
          if (Date.now() - last > 9000) {
            lastFireRef.current[t.id] = Date.now();
            pushLog("err", `INCIDENT · ${t.name} · level ${Math.round(lvl)} ≥ ${t.threshold}`);
            setProtocolFlash((p) => ({ ...p, [t.id]: Date.now() }));
            setTimeout(() => {
              setProtocolFlash((p) => {
                const c = { ...p }; delete c[t.id]; return c;
              });
            }, 1600);
          }
        }
      });
      setProtocolLevels(next);
    };
    tick();
    const i = setInterval(tick, 600);
    return () => clearInterval(i);
  }, [data, armedProtocols, pushLog]);

  useEffect(() => {
    const phrases = [
      ["info", "Optical flow recalibrated"],
      ["info", "Biometric cache pruned"],
      ["info", "Frame Δt within tolerance"],
      ["ok", "Heartbeat OK"],
      ["info", "Edge inference ping 18ms"],
      ["info", "Audio fingerprint matched"],
    ];
    const t = setInterval(() => {
      const [k, m] = phrases[Math.floor(Math.random() * phrases.length)];
      pushLog(k, m);
    }, 4500);
    return () => clearInterval(t);
  }, [pushLog]);

  const trust = data?.trust ?? {};
  const crowd = data?.crowd ?? {};
  const media = data?.media ?? {};
  const bias = data?.bias ?? {};
  const risk = trust.risk_level ?? "LOW";
  const riskColor = risk === "HIGH" ? C.danger : risk === "MEDIUM" ? C.warn : C.primary;
  const armedCount = Object.values(armedProtocols).filter(Boolean).length;
  const triggeredCount = CRISIS_TYPES.filter(
    (t) => armedProtocols[t.id] && (protocolLevels[t.id] ?? 0) >= t.threshold
  ).length;

  return (
    <div className="hud-root">
      <link rel="stylesheet" href={FONTS_LINK} />
      <div className="bg-grid" />
      <div className="bg-vignette" />
      <div className="bg-scanlines" />

      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <svg width="22" height="22" viewBox="0 0 24 24">
              <polygon points="12,2 22,7 22,17 12,22 2,17 2,7"
                fill="none" stroke={C.primary} strokeWidth="1.6" />
              <polygon points="12,6 18,9 18,15 12,18 6,15 6,9" fill={C.primary} opacity="0.25" />
              <circle cx="12" cy="12" r="2" fill={C.primary} />
            </svg>
          </div>
          <div className="brand-text">
            <div className="brand-title">TRUSTVISION&nbsp;<span style={{ color: C.muted }}>//</span>&nbsp;AI</div>
            <div className="brand-sub">COMMAND CENTER · CLASS-IV</div>
          </div>
        </div>

        <div className="topbar-stats">
          <TopStat label="UPLINK"
            value={wsConnected.current ? "LIVE" : demoMode ? "SIM" : "INIT"}
            color={wsConnected.current ? C.success : demoMode ? C.amber : C.muted} />
          <TopStat label="LATENCY" value="18MS" color={C.primary} />
          <TopStat label="SECTOR" value="04-NW" color={C.primary} />
          <TopStat label="PROTOCOLS" value={`${armedCount}/${CRISIS_TYPES.length}`} color={C.primarySoft} />
          <TopStat label="ALERT"
            value={triggeredCount > 0 ? `${triggeredCount} ACTIVE` : risk}
            color={triggeredCount > 0 ? C.danger : riskColor}
            pulse={triggeredCount > 0 || risk !== "LOW"} />
        </div>

        <div className="clock-block">
          <div className="clock-time">{fmtTime(now)}</div>
          <div className="clock-date">{fmtDate(now)} · {tzAbbr(now)}</div>
        </div>
      </header>

      <main className="grid">
        <div className="g-cctv">
          <Panel title="LIVE FEED" code="CAM-01 / 1080p / H.264">
            <CCTV peopleCount={crowd.people_count} density={crowd.density}
              useRealStream={wsConnected.current} />
          </Panel>
        </div>

        <div className="g-radar">
          <Panel title="RADAR SWEEP" code="2.4GHz / 360°">
            <div className="radar-wrap">
              <Radar peopleCount={crowd.people_count} motion={crowd.motion} />
              <div className="radar-legend">
                <div><span className="dot" style={{ background: C.primary }} />SUBJECT</div>
                <div><span className="dot" style={{ background: C.danger }} />ANOMALY</div>
              </div>
            </div>
          </Panel>
        </div>

        <div className="g-trust">
          <Panel title="TRUST INDEX" code="Σ·INTEGRITY" accent={riskColor}>
            <TrustGauge score={trust.trust_score ?? 0} risk={risk} />
            <div className="trust-extra">
              <Bar label="MEDIA AUTHENTICITY" value={media.authenticity_score ?? 0} color={C.primary} />
              <Bar label="BIAS SCORE" value={bias.bias_score ?? 0} color={C.amber} />
            </div>
            <div className="trust-insights">
              <div className="ti-head">› EXPLAIN</div>
              {(trust.explanation ?? []).slice(0, 3).map((e, i) => (
                <div key={i} className="ti-line">· {e}</div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="g-heat">
          <Panel title="DENSITY HEATMAP" code="THERMAL · ZONE-A">
            <Heatmap density={crowd.density} peopleCount={crowd.people_count} />
          </Panel>
        </div>

        <div className="g-crisis">
          <Panel title="CRISIS PROTOCOLS" code="CLASSIFIER · v4.2"
            accent={triggeredCount > 0 ? C.danger : C.primarySoft}
            badge={`${armedCount} ARMED · ${triggeredCount} TRIGGERED`}>
            <div className="crisis-grid">
              {CRISIS_TYPES.map((t) => (
                <CrisisCard key={t.id} type={t}
                  level={protocolLevels[t.id] ?? 0}
                  armed={armedProtocols[t.id]}
                  flashing={!!protocolFlash[t.id]}
                  onToggle={() => toggleProtocol(t.id)} />
              ))}
            </div>
            <div className="crisis-foot">
              <span>› CLICK A CARD TO ARM / DISARM</span>
              <span>INCIDENT FIRES WHEN LEVEL ≥ THRESHOLD ON ARMED PROTOCOLS</span>
            </div>
          </Panel>
        </div>

        <div className="g-metrics">
          <Panel title="TELEMETRY" code="LIVE">
            <div className="stats-grid">
              <Stat label="SUBJECTS" value={crowd.people_count ?? 0} history={history.people} color={C.primary} icon="◉" />
              <Stat label="DENSITY" value={crowd.density ?? 0} history={history.density} color={C.primarySoft} icon="▦" />
              <Stat label="MOTION" value={crowd.motion ?? 0} suffix="%" history={history.motion} color={C.amber} icon="↯" />
              <Stat label="AUTH" value={media.authenticity_score ?? 0} suffix="%" history={history.media} color={C.success} icon="✓" />
              <Stat label="BIAS" value={bias.bias_score ?? 0} suffix="%" history={history.bias} color={C.warn} icon="⌘" />
              <Stat label="TRUST" value={trust.trust_score ?? 0} history={history.trust} color={riskColor} icon="◈" />
            </div>
          </Panel>
        </div>

        <div className="g-log">
          <Panel title="ACTIVITY LOG" code="STDOUT">
            <ActivityLog entries={log} />
          </Panel>
        </div>
      </main>

      {(risk !== "LOW" || triggeredCount > 0) && (
        <div className="alert-banner" style={{
          background: `linear-gradient(90deg, transparent, ${riskColor}33, transparent)`,
          borderColor: riskColor, color: riskColor,
        }}>
          <span className="alert-pulse" style={{ background: riskColor }} />
          {triggeredCount > 0
            ? `${triggeredCount} CRISIS PROTOCOL${triggeredCount > 1 ? "S" : ""} TRIGGERED`
            : `${risk} RISK DETECTED — REVIEW RECOMMENDED ACTIONS`}
          <span className="alert-pulse" style={{ background: riskColor }} />
        </div>
      )}

      <footer className="botbar">
        <span>SYS: <b style={{ color: C.success }}>NOMINAL</b></span>
        <span>GPU: <b>{Math.round(40 + Math.sin(now.getSeconds() / 5) * 12)}%</b></span>
        <span>FPS: <b>60</b></span>
        <span>FRAMES: <b>{((now.getTime() / 1000) | 0).toString().slice(-7)}</b></span>
        <span>NET: <b style={{ color: C.primary }}>{wsConnected.current ? "WS·OK" : demoMode ? "SIM" : "..."}</b></span>
        <span style={{ marginLeft: "auto", color: C.muted }}>TRUSTVISION © OPS · v2.4.1</span>
      </footer>

      <style>{styles}</style>
    </div>
  );
}

function TopStat({ label, value, color, pulse }) {
  return (
    <div className={`top-stat ${pulse ? "top-stat-pulse" : ""}`} style={{ borderColor: color }}>
      <span className="top-stat-label">{label}</span>
      <span className="top-stat-value" style={{ color }}>{value}</span>
    </div>
  );
}

const styles = `
* { box-sizing: border-box; }

html, body, #root {
  margin: 0; padding: 0;
  background: ${C.bg};
  color: ${C.text};
  overflow: hidden;
}

.hud-root {
  position: fixed;
  inset: 0;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px;
  display: grid;
  grid-template-rows: 64px 1fr 30px;
  background:
    radial-gradient(ellipse at 20% 10%, rgba(0, 255, 209, 0.05), transparent 60%),
    radial-gradient(ellipse at 80% 90%, rgba(255, 140, 66, 0.04), transparent 60%),
    ${C.bg};
  overflow: hidden;
}

.bg-grid {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(${C.grid} 1px, transparent 1px),
    linear-gradient(90deg, ${C.grid} 1px, transparent 1px);
  background-size: 32px 32px;
  pointer-events: none;
  mask-image: radial-gradient(ellipse at center, black 40%, transparent 90%);
  animation: grid-drift 60s linear infinite;
}
@keyframes grid-drift {
  from { background-position: 0 0, 0 0; }
  to { background-position: 32px 32px, 32px 32px; }
}
.bg-vignette {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.7) 100%);
  pointer-events: none;
}
.bg-scanlines {
  position: absolute; inset: 0;
  background: repeating-linear-gradient(180deg, transparent 0px, transparent 2px,
    rgba(0, 255, 209, 0.012) 2px, rgba(0, 255, 209, 0.012) 4px);
  pointer-events: none;
  mix-blend-mode: overlay;
}

.topbar {
  position: relative;
  display: flex;
  align-items: center;
  padding: 0 18px;
  border-bottom: 1px solid ${C.borderDim};
  background: linear-gradient(180deg, rgba(0, 255, 209, 0.04), transparent);
  z-index: 5;
  gap: 18px;
}
.brand { display: flex; align-items: center; gap: 12px; }
.brand-text { line-height: 1.1; }
.brand-title {
  font-family: 'Orbitron', sans-serif;
  font-weight: 900;
  font-size: 17px;
  letter-spacing: 4px;
  color: ${C.text};
}
.brand-sub {
  font-size: 9px;
  letter-spacing: 4px;
  color: ${C.muted};
  margin-top: 3px;
}
.topbar-stats {
  display: flex;
  gap: 8px;
  flex: 1;
  justify-content: center;
  flex-wrap: wrap;
}
.top-stat {
  border: 1px solid;
  padding: 4px 10px;
  display: flex;
  flex-direction: column;
  min-width: 78px;
  background: rgba(0,0,0,0.25);
  position: relative;
}
.top-stat::before {
  content: ''; position: absolute;
  top: -1px; left: -1px;
  width: 6px; height: 6px;
  border-top: 1px solid currentColor;
  border-left: 1px solid currentColor;
}
.top-stat::after {
  content: ''; position: absolute;
  bottom: -1px; right: -1px;
  width: 6px; height: 6px;
  border-bottom: 1px solid currentColor;
  border-right: 1px solid currentColor;
}
.top-stat-label { font-size: 8px; letter-spacing: 2px; color: ${C.muted}; }
.top-stat-value {
  font-family: 'Orbitron', sans-serif;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 1px;
  margin-top: 2px;
}
.top-stat-pulse { animation: stat-pulse 1.1s ease-in-out infinite; }
@keyframes stat-pulse {
  0%, 100% { box-shadow: 0 0 0 0 currentColor; opacity: 1; }
  50% { box-shadow: 0 0 12px -4px currentColor; opacity: 0.7; }
}
.clock-block { text-align: right; font-family: 'Orbitron', sans-serif; }
.clock-time {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 3px;
  color: ${C.primary};
  text-shadow: 0 0 12px ${C.primary}80;
}
.clock-date {
  font-size: 10px;
  letter-spacing: 2px;
  color: ${C.muted};
}

.grid {
  position: relative;
  display: grid;
  grid-template-columns: 1.4fr 1fr 1.2fr;
  grid-template-rows: 1.2fr 1fr 1.1fr 0.95fr;
  gap: 10px;
  padding: 10px;
  overflow: hidden;
  z-index: 2;
}
.g-cctv    { grid-column: 1 / 2; grid-row: 1 / 3; }
.g-radar   { grid-column: 2 / 3; grid-row: 1 / 2; }
.g-trust   { grid-column: 3 / 4; grid-row: 1 / 3; }
.g-heat    { grid-column: 2 / 3; grid-row: 2 / 3; }
.g-crisis  { grid-column: 1 / 4; grid-row: 3 / 4; }
.g-metrics { grid-column: 1 / 3; grid-row: 4 / 5; }
.g-log     { grid-column: 3 / 4; grid-row: 4 / 5; }

.hud-panel {
  position: relative;
  background: ${C.panel};
  border: 1px solid ${C.borderDim};
  padding: 10px 12px 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  backdrop-filter: blur(2px);
}
.hud-panel::before {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(0, 255, 209, 0.04), transparent 30%);
  pointer-events: none;
}
.bracket {
  position: absolute;
  width: 12px; height: 12px;
  border-style: solid;
  border-width: 0;
  pointer-events: none;
}
.br-tl { top: -1px; left: -1px; border-top-width: 2px; border-left-width: 2px; }
.br-tr { top: -1px; right: -1px; border-top-width: 2px; border-right-width: 2px; }
.br-bl { bottom: -1px; left: -1px; border-bottom-width: 2px; border-left-width: 2px; }
.br-br { bottom: -1px; right: -1px; border-bottom-width: 2px; border-right-width: 2px; }

.hud-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px dashed ${C.borderDim};
}
.hud-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  box-shadow: 0 0 8px currentColor;
  animation: dot-pulse 2s ease-in-out infinite;
}
@keyframes dot-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}
.hud-title-text {
  font-family: 'Orbitron', sans-serif;
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 3px;
}
.hud-badge {
  font-size: 9px;
  letter-spacing: 2px;
  border: 1px solid;
  padding: 2px 6px;
  margin-left: 4px;
}
.hud-code {
  margin-left: auto;
  font-size: 9px;
  letter-spacing: 2px;
  color: ${C.muted};
}
.hud-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.cctv-wrap {
  position: relative;
  width: 100%;
  flex: 1;
  background: #000;
  overflow: hidden;
}
.cctv-img, .cctv-video {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  object-fit: cover;
  z-index: 2;
  filter: grayscale(0.55) contrast(1.15) brightness(0.85) saturate(0.5) hue-rotate(140deg);
}
.cctv-img { filter: contrast(1.05) saturate(1.1); z-index: 3; }
.cctv-tint {
  position: absolute; inset: 0;
  z-index: 4;
  background:
    radial-gradient(ellipse at center, transparent 60%, rgba(0, 0, 0, 0.55) 100%),
    linear-gradient(0deg, rgba(0, 255, 209, 0.07), transparent);
  pointer-events: none;
  mix-blend-mode: screen;
}
.cctv-overlay, .cctv-targets {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  z-index: 5;
  pointer-events: none;
}
.cctv-meta {
  position: absolute;
  z-index: 6;
  font-size: 10px;
  letter-spacing: 1.5px;
  color: ${C.primary};
  text-shadow: 0 0 4px rgba(0,0,0,0.9);
  background: rgba(0,0,0,0.55);
  padding: 3px 8px;
  border: 1px solid ${C.borderDim};
}
.cctv-meta-tl { top: 8px; left: 8px; }
.cctv-meta-tr { top: 8px; right: 8px; }
.cctv-meta-bl { bottom: 8px; left: 8px; }
.cctv-meta-br { bottom: 8px; right: 8px; }
.cctv-demo-flag {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%) rotate(-15deg);
  z-index: 6;
  font-family: 'Orbitron', sans-serif;
  font-weight: 900;
  font-size: 28px;
  letter-spacing: 8px;
  color: rgba(255, 56, 96, 0.18);
  border: 4px solid rgba(255, 56, 96, 0.18);
  padding: 6px 22px;
  pointer-events: none;
  user-select: none;
}
.rec-dot {
  display: inline-block;
  width: 8px; height: 8px;
  border-radius: 50%;
  background: ${C.danger};
  box-shadow: 0 0 8px ${C.danger};
  margin-right: 6px;
  animation: rec-blink 1.2s infinite;
}
@keyframes rec-blink { 50% { opacity: 0.2; } }
.scan-line {
  position: absolute;
  left: 0; right: 0;
  height: 60px;
  background: linear-gradient(180deg, transparent, rgba(0, 255, 209, 0.1), transparent);
  z-index: 7;
  pointer-events: none;
  animation: scan-move 4s linear infinite;
}
@keyframes scan-move {
  0% { top: -60px; }
  100% { top: 100%; }
}

.radar-wrap {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.radar-canvas {
  width: 100%; height: 100%;
  max-width: 300px; max-height: 300px;
  filter: drop-shadow(0 0 12px rgba(0, 255, 209, 0.2));
}
.radar-legend {
  position: absolute;
  bottom: 4px; left: 4px;
  font-size: 9px;
  letter-spacing: 1.5px;
  color: ${C.muted};
}
.radar-legend > div { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
.radar-legend .dot { width: 6px; height: 6px; border-radius: 50%; box-shadow: 0 0 6px currentColor; }

.gauge-center {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 4px;
  pointer-events: none;
}
.gauge-label { font-size: 9px; letter-spacing: 4px; color: ${C.muted}; }
.gauge-num {
  font-family: 'Orbitron', sans-serif;
  font-weight: 900;
  font-size: 42px;
  letter-spacing: 2px;
  text-shadow: 0 0 16px currentColor;
  line-height: 1;
}
.gauge-risk {
  border: 1px solid;
  padding: 2px 10px;
  font-size: 10px;
  letter-spacing: 3px;
  font-weight: 700;
  margin-top: 4px;
}
.trust-extra { padding: 14px 4px 6px; }
.bar-label {
  display: flex; justify-content: space-between;
  font-size: 9px; letter-spacing: 2px;
  color: ${C.muted}; margin-bottom: 3px;
}
.bar-track {
  position: relative; height: 6px;
  background: rgba(0, 255, 209, 0.06);
  border: 1px solid ${C.borderDim};
}
.bar-fill { height: 100%; transition: width 0.5s ease-out; }
.bar-ticks {
  position: absolute; inset: 0;
  background-image: repeating-linear-gradient(90deg, transparent 0, transparent 9px,
    rgba(0, 0, 0, 0.4) 9px, rgba(0, 0, 0, 0.4) 10px);
  pointer-events: none;
}
.trust-insights {
  margin-top: 8px;
  padding: 8px;
  border: 1px dashed ${C.borderDim};
  background: rgba(0,255,209,0.02);
  font-size: 10.5px;
  flex: 1;
  overflow-y: auto;
}
.ti-head { font-size: 9px; letter-spacing: 3px; color: ${C.primarySoft}; margin-bottom: 6px; }
.ti-line { color: ${C.text}; margin-bottom: 4px; line-height: 1.5; }

.heatmap-canvas {
  width: 100%; height: 100%;
  flex: 1;
  background: #02060a;
}

.crisis-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  flex: 1;
  min-height: 0;
}
.crisis-card {
  position: relative;
  border: 1px solid var(--cc-soft);
  background: linear-gradient(135deg, rgba(0,0,0,0.5), var(--cc-soft));
  padding: 8px 10px;
  cursor: pointer;
  transition: all 0.2s ease-out;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.crisis-card.standby {
  opacity: 0.45;
  filter: grayscale(0.6);
  background: rgba(0,0,0,0.4);
  border-color: ${C.borderDim};
}
.crisis-card.armed:hover {
  border-color: var(--cc);
  box-shadow: 0 0 14px -3px var(--cc);
  transform: translateY(-1px);
}
.crisis-card.standby:hover {
  opacity: 0.7;
  filter: grayscale(0.3);
}
.crisis-card.triggered {
  border-color: var(--cc);
  box-shadow: 0 0 18px -2px var(--cc);
  animation: triggered-glow 1.4s ease-in-out infinite;
}
@keyframes triggered-glow {
  0%, 100% { box-shadow: 0 0 18px -2px var(--cc); }
  50% { box-shadow: 0 0 28px 0 var(--cc); }
}
.crisis-card.flash::after {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--cc);
  opacity: 0;
  pointer-events: none;
  animation: card-flash 1.6s ease-out;
}
@keyframes card-flash {
  0%   { opacity: 0.45; }
  100% { opacity: 0; }
}
.crisis-head { display: flex; align-items: center; gap: 8px; }
.crisis-icon {
  font-size: 22px;
  font-weight: 900;
  width: 30px;
  text-align: center;
  text-shadow: 0 0 8px currentColor;
}
.crisis-title { flex: 1; min-width: 0; }
.crisis-name {
  font-family: 'Orbitron', sans-serif;
  font-weight: 700;
  font-size: 10.5px;
  letter-spacing: 1.5px;
  color: ${C.text};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.crisis-desc {
  font-size: 9px;
  color: ${C.muted};
  letter-spacing: 0.5px;
  margin-top: 2px;
}
.crisis-state {
  font-size: 8px;
  letter-spacing: 1.5px;
  font-weight: 700;
  border: 1px solid;
  padding: 2px 5px;
}
.crisis-state.on { color: ${C.success}; border-color: ${C.success}; background: rgba(74,222,128,0.08); }
.crisis-state.off { color: ${C.muted}; border-color: ${C.muted}; }
.crisis-meter-track {
  position: relative;
  height: 5px;
  background: rgba(0,0,0,0.5);
  border: 1px solid ${C.borderDim};
}
.crisis-meter-fill { height: 100%; transition: width 0.45s ease-out; }
.crisis-threshold { position: absolute; top: -2px; bottom: -2px; width: 1.5px; }
.crisis-meter-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
  font-size: 9px;
  letter-spacing: 1px;
}
.crisis-tag {
  font-family: 'Orbitron', sans-serif;
  font-weight: 700;
  color: var(--cc);
  text-shadow: 0 0 4px var(--cc);
}
.crisis-foot {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px dashed ${C.borderDim};
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  letter-spacing: 1.5px;
  color: ${C.muted};
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 8px;
  flex: 1;
}
.stat-tile {
  border: 1px solid ${C.borderDim};
  padding: 8px 10px;
  background: rgba(0, 255, 209, 0.02);
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: relative;
  overflow: hidden;
}
.stat-tile::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, ${C.primary}, transparent);
  opacity: 0.4;
}
.stat-head { display: flex; align-items: center; gap: 6px; }
.stat-icon { font-size: 12px; }
.stat-label { font-size: 9px; letter-spacing: 2px; color: ${C.muted}; }
.stat-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.stat-value {
  font-family: 'Orbitron', sans-serif;
  font-weight: 700;
  font-size: 20px;
  text-shadow: 0 0 8px currentColor;
}
.stat-spark { flex: 1; min-width: 50px; max-width: 100px; }

.log {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
  font-size: 10.5px;
  line-height: 1.7;
}
.log::-webkit-scrollbar { width: 4px; }
.log::-webkit-scrollbar-thumb { background: ${C.borderDim}; }
.log-line {
  display: grid;
  grid-template-columns: 64px 56px 1fr;
  gap: 8px;
  padding: 1px 0;
  animation: log-in 0.25s ease-out;
}
@keyframes log-in {
  from { opacity: 0; transform: translateX(-4px); }
  to { opacity: 1; transform: translateX(0); }
}
.log-time { color: ${C.muted}; }
.log-tag {
  font-weight: 700;
  letter-spacing: 1.5px;
  font-size: 9.5px;
  align-self: center;
}
.log-info .log-tag { color: ${C.primarySoft}; }
.log-ok .log-tag { color: ${C.success}; }
.log-warn .log-tag { color: ${C.amber}; }
.log-err .log-tag { color: ${C.danger}; }
.log-msg { color: ${C.text}; }
.log-err .log-msg { color: ${C.danger}; }

.alert-banner {
  position: fixed;
  top: 70px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 24px;
  border: 1px solid;
  font-family: 'Orbitron', sans-serif;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 4px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 100;
  animation: alert-shake 0.5s ease-out, alert-pulse 1.4s ease-in-out infinite;
}
@keyframes alert-shake {
  0%, 100% { transform: translateX(-50%); }
  25% { transform: translateX(calc(-50% - 4px)); }
  75% { transform: translateX(calc(-50% + 4px)); }
}
@keyframes alert-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.65; }
}
.alert-pulse {
  width: 8px; height: 8px;
  border-radius: 50%;
  box-shadow: 0 0 12px currentColor;
  animation: dot-pulse 1s infinite;
}

.botbar {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 0 18px;
  border-top: 1px solid ${C.borderDim};
  background: linear-gradient(0deg, rgba(0, 255, 209, 0.04), transparent);
  font-size: 10px;
  letter-spacing: 2px;
  color: ${C.muted};
  z-index: 5;
  position: relative;
}
.botbar b { color: ${C.text}; font-weight: 500; margin-left: 4px; }

@media (max-width: 1280px) {
  .grid {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto auto auto auto auto;
  }
  .g-cctv    { grid-column: 1 / 3; grid-row: 1; }
  .g-radar   { grid-column: 1 / 2; grid-row: 2; }
  .g-trust   { grid-column: 2 / 3; grid-row: 2; }
  .g-heat    { grid-column: 1 / 3; grid-row: 3; }
  .g-crisis  { grid-column: 1 / 3; grid-row: 4; }
  .g-metrics { grid-column: 1 / 2; grid-row: 5; }
  .g-log     { grid-column: 2 / 3; grid-row: 5; }
  .stats-grid { grid-template-columns: repeat(3, 1fr); }
  .crisis-grid { grid-template-columns: repeat(2, 1fr); }
}
`;