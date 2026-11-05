/**
 * The sign-in page's backdrop: real nodepad prompts float in pale pencil around the sign-in sheet, and take turns
 * becoming the file nodepad would make from them. Hovering (or tapping) a prompt turns it straight away.
 * Plain canvas 2D, no three.js, so the sign-in page stays light.
 */
type Ctx = CanvasRenderingContext2D;
type Draw = (ctx: Ctx, L: number, T: number, W: number, H: number, q: number, t: number, c: string) => void;

const INK = "#1c1b18";
const PAPER = "#fffefb";
const GREY = "#cfccc2";
const MID = "#9c9a90";
const ORB = "#ea580c";
const FONT = '"Space Grotesk", "Figtree", system-ui, sans-serif';

const clamp = (v: number) => Math.min(Math.max(v, 0), 1);
const ease = (v: number) => 1 - Math.pow(1 - clamp(v), 3);
/** Eased progress of q through [a, b]: used to build each file up in stages. */
const step = (q: number, a: number, b: number) => ease((q - a) / (b - a));

interface FileKind {
  id: string;
  name: string;
  color: string;
  ask: string;
}

/** One per tool, in the order they're placed around the sheet. Colours match the node cloud. */
const FILES: FileKind[] = [
  { id: "slides", name: "Presentation", color: "#f59e0b", ask: "Make a pitch about sustainable coffee" },
  { id: "doc", name: "Document", color: "#2563eb", ask: "Write a one-page project proposal for a campus app" },
  { id: "sheet", name: "Spreadsheet", color: "#059669", ask: "Build a monthly student budget with a pie chart" },
  { id: "notes", name: "Notes", color: "#eab308", ask: "Plan my hackathon weekend with a packing checklist" },
  { id: "whiteboard", name: "Whiteboard", color: "#db2777", ask: "Brainstorm features for a campus app" },
  { id: "flowchart", name: "Flowchart", color: "#0284c7", ask: "Flowchart of a user login flow with 2FA" },
  { id: "blueprint", name: "Blueprint", color: "#1d4ed8", ask: "Floor plan for a 2-bedroom, 1-bath apartment" },
  { id: "mindmap", name: "Mind map", color: "#c026d3", ask: "Mind map of hackathon ideas about sustainability" },
  { id: "studio", name: "3D Studio", color: "#9333ea", ask: "Build a cozy coffee shop with tables and plants" },
  { id: "music", name: "Music", color: "#65a30d", ask: "Upbeat lo-fi hip hop with warm piano" },
  { id: "video", name: "Video", color: "#dc2626", ask: "A paper airplane gliding over pencil sketches" },
  { id: "erd", name: "DB schema", color: "#0d9488", ask: "Schema for a course registration system" },
];

/** Where prompts sit, as fractions of the screen, keeping clear of the sheet in the middle. */
const SLOTS = {
  wide: [[0.14, 0.12], [0.39, 0.075], [0.65, 0.08], [0.87, 0.15], [0.12, 0.36], [0.88, 0.4], [0.13, 0.6], [0.87, 0.64], [0.14, 0.87], [0.38, 0.93], [0.63, 0.93], [0.87, 0.88]],
  // Phones alternate left and right so an open file doesn't land on the prompt below it.
  tall: [[0.27, 0.07], [0.73, 0.125], [0.3, 0.19], [0.72, 0.83], [0.28, 0.89], [0.72, 0.955]],
};

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function bar(ctx: Ctx, x: number, y: number, w: number, h: number, c: string) {
  if (w <= 0) return;
  ctx.fillStyle = c;
  rr(ctx, x, y, w, h, Math.min(h / 2, 3));
  ctx.fill();
}
function label(ctx: Ctx, text: string, x: number, y: number, size: number, c = INK, align: CanvasTextAlign = "center") {
  ctx.font = `600 ${size}px ${FONT}`;
  ctx.fillStyle = c;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}
function arrow(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, p: number) {
  if (p <= 0) return;
  const x = x1 + (x2 - x1) * p;
  const y = y1 + (y2 - y1) * p;
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x, y);
  ctx.stroke();
  if (p > 0.95) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 5 * Math.cos(a - 0.5), y - 5 * Math.sin(a - 0.5));
    ctx.lineTo(x - 5 * Math.cos(a + 0.5), y - 5 * Math.sin(a + 0.5));
    ctx.closePath();
    ctx.fillStyle = INK;
    ctx.fill();
  }
}
/** Runs `draw` with the current alpha scaled by s, skipping it while s is 0. */
function fade(ctx: Ctx, s: number, draw: () => void) {
  if (s <= 0) return;
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * s;
  draw();
  ctx.globalAlpha = a;
}

/** What each tool's file looks like inside its card. q runs 0..1 as the file builds itself. */
const CONTENT: Record<string, Draw> = {
  slides(ctx, L, T, W, H, q, _t, c) {
    ctx.fillStyle = "#fff7e6";
    ctx.fillRect(L, T, W, H);
    bar(ctx, L + W * 0.06, T + H * 0.12, W * 0.5 * step(q, 0, 0.35), H * 0.13, INK);
    [0.4, 0.56, 0.72].forEach((y, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(L + W * 0.06, T + H * y + H * 0.02, 4, 4);
      bar(ctx, L + W * 0.06 + 9, T + H * y, W * 0.4 * step(q, 0.2 + i * 0.12, 0.5 + i * 0.12), H * 0.07, MID);
    });
    fade(ctx, step(q, 0.45, 0.9), () => {
      ctx.fillStyle = c + "55";
      ctx.fillRect(L + W * 0.6, T + H * 0.36, W * 0.34, H * 0.48);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(L + W * 0.62, T + H * 0.82);
      ctx.lineTo(L + W * 0.72, T + H * 0.56);
      ctx.lineTo(L + W * 0.8, T + H * 0.7);
      ctx.lineTo(L + W * 0.86, T + H * 0.62);
      ctx.lineTo(L + W * 0.92, T + H * 0.82);
      ctx.fill();
    });
  },
  doc(ctx, L, T, W, H, q) {
    bar(ctx, L + W * 0.06, T + H * 0.1, W * 0.55 * step(q, 0, 0.3), H * 0.12, INK);
    [0.95, 0.9, 0.97, 0.62, 0.93, 0.85, 0.5].forEach((w, i) =>
      bar(ctx, L + W * 0.06, T + H * (0.32 + i * 0.09), W * 0.88 * w * step(q, 0.12 + i * 0.09, 0.4 + i * 0.09), H * 0.045, i === 3 ? "#93c5fd" : GREY),
    );
  },
  sheet(ctx, L, T, W, H, q, _t, c) {
    const tw = W * 0.56;
    const rh = H * 0.15;
    const cw = tw / 3;
    for (let r = 0; r < 6; r++) {
      if (step(q, r * 0.08, r * 0.08 + 0.2) <= 0) continue;
      if (r === 0) {
        ctx.fillStyle = c + "33";
        ctx.fillRect(L + W * 0.04, T + H * 0.05, tw, rh);
      }
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = GREY;
        ctx.lineWidth = 1;
        ctx.strokeRect(L + W * 0.04 + k * cw, T + H * 0.05 + r * rh, cw, rh);
        if (r > 0) bar(ctx, L + W * 0.04 + k * cw + 3, T + H * 0.05 + r * rh + rh * 0.35, cw * (k ? 0.5 : 0.7), rh * 0.3, k ? MID : "#b4b1a7");
      }
    }
    const cx = L + W * 0.8;
    const cy = T + H * 0.5;
    const r = Math.min(W * 0.17, H * 0.38);
    const sweep = step(q, 0.25, 0.95) * Math.PI * 2;
    let a0 = -Math.PI / 2;
    for (const [f, col] of [[0.42, c], [0.3, "#2563eb"], [0.28, "#f59e0b"]] as const) {
      const a1 = Math.min(a0 + f * Math.PI * 2, -Math.PI / 2 + sweep);
      if (a1 > a0) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, a0, a1);
        ctx.closePath();
        ctx.fill();
      }
      a0 += f * Math.PI * 2;
    }
    if (sweep > 0) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
  notes(ctx, L, T, W, H, q) {
    ctx.fillStyle = "#fefce8";
    ctx.fillRect(L, T, W, H);
    [0.72, 0.55, 0.8, 0.6].forEach((w, i) => {
      const y = T + H * (0.14 + i * 0.21);
      const s = step(q, i * 0.15, i * 0.15 + 0.3);
      const b = H * 0.12;
      if (s <= 0) return;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(L + W * 0.07, y, b, b);
      bar(ctx, L + W * 0.07 + b + 8, y + b * 0.3, W * w * 0.7 * s, b * 0.4, i < 2 ? "#b4b1a7" : MID);
      const k = i < 2 ? step(q, 0.5 + i * 0.15, 0.7 + i * 0.15) : 0;
      if (k > 0) {
        ctx.strokeStyle = ORB;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(L + W * 0.07 + b * 0.15, y + b * 0.5);
        ctx.lineTo(L + W * 0.07 + b * 0.4, y + b * 0.8);
        ctx.lineTo(L + W * 0.07 + b * (0.4 + 0.6 * k), y + b * (0.8 - 0.75 * k));
        ctx.stroke();
      }
    });
  },
  whiteboard(ctx, L, T, W, H, q) {
    arrow(ctx, L + W * 0.3, T + H * 0.38, L + W * 0.4, T + H * 0.55, step(q, 0.55, 0.75));
    arrow(ctx, L + W * 0.64, T + H * 0.58, L + W * 0.7, T + H * 0.42, step(q, 0.65, 0.85));
    ([[0.06, 0.12, "#fef08a", -0.06], [0.37, 0.4, "#fbcfe8", 0.05], [0.67, 0.1, "#bae6fd", -0.03]] as const).forEach(([x, y, col, rot], i) => {
      const s = step(q, i * 0.15, i * 0.15 + 0.35);
      if (s <= 0) return;
      const w = W * 0.27;
      const h = H * 0.46;
      ctx.save();
      ctx.translate(L + W * x + w / 2, T + H * y + h / 2);
      ctx.rotate(rot);
      ctx.scale(s, s);
      ctx.fillStyle = col;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      bar(ctx, -w / 2 + 5, -h / 2 + h * 0.25, w * 0.7, h * 0.1, "#3b3a3555");
      bar(ctx, -w / 2 + 5, -h / 2 + h * 0.45, w * 0.5, h * 0.1, "#3b3a3555");
      ctx.restore();
    });
  },
  flowchart(ctx, L, T, W, H, q, _t, c) {
    const y = T + H * 0.5;
    const fs = Math.max(8, H * 0.13);
    const bw = W * 0.24;
    const bh = H * 0.34;
    ctx.lineWidth = 1.2;
    fade(ctx, step(q, 0, 0.25), () => {
      ctx.fillStyle = c + "26";
      rr(ctx, L + W * 0.03, y - bh / 2, bw, bh, 6);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.stroke();
      label(ctx, "Login", L + W * 0.03 + bw / 2, y, fs);
    });
    arrow(ctx, L + W * 0.27, y, L + W * 0.37, y, step(q, 0.22, 0.32));
    fade(ctx, step(q, 0.3, 0.55), () => {
      const cx = L + W * 0.5;
      const d = H * 0.3;
      ctx.beginPath();
      ctx.moveTo(cx, y - d);
      ctx.lineTo(cx + W * 0.12, y);
      ctx.lineTo(cx, y + d);
      ctx.lineTo(cx - W * 0.12, y);
      ctx.closePath();
      ctx.fillStyle = "#fef3c7";
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      label(ctx, "2FA?", cx, y, fs);
    });
    arrow(ctx, L + W * 0.63, y, L + W * 0.73, y, step(q, 0.52, 0.62));
    fade(ctx, step(q, 0.6, 0.85), () => {
      ctx.fillStyle = "#dcfce7";
      rr(ctx, L + W * 0.73, y - bh / 2, bw, bh, 6);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      label(ctx, "Home", L + W * 0.73 + bw / 2, y, fs);
    });
  },
  blueprint(ctx, L, T, W, H, q, _t, c) {
    ctx.fillStyle = "#eef3ff";
    ctx.fillRect(L, T, W, H);
    ctx.strokeStyle = "#c7d7fe";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let x = L; x < L + W; x += 8) {
      ctx.moveTo(x, T);
      ctx.lineTo(x, T + H);
    }
    for (let y = T; y < T + H; y += 8) {
      ctx.moveTo(L, y);
      ctx.lineTo(L + W, y);
    }
    ctx.stroke();
    const x0 = L + W * 0.08;
    const y0 = T + H * 0.12;
    const w = W * 0.84;
    const h = H * 0.76;
    const walls = [
      [x0, y0, x0 + w, y0], [x0 + w, y0, x0 + w, y0 + h], [x0 + w, y0 + h, x0, y0 + h], [x0, y0 + h, x0, y0],
      [x0 + w * 0.42, y0, x0 + w * 0.42, y0 + h * 0.62], [x0, y0 + h * 0.62, x0 + w * 0.3, y0 + h * 0.62],
      [x0 + w * 0.7, y0, x0 + w * 0.7, y0 + h * 0.5], [x0 + w * 0.7, y0 + h * 0.5, x0 + w, y0 + h * 0.5],
    ];
    ctx.strokeStyle = c;
    ctx.lineWidth = 2.2;
    ctx.lineCap = "square";
    walls.forEach(([a, b, x2, y2], i) => {
      const p = step(q, i * 0.08, i * 0.08 + 0.2);
      if (p <= 0) return;
      ctx.beginPath();
      ctx.moveTo(a, b);
      ctx.lineTo(a + (x2 - a) * p, b + (y2 - b) * p);
      ctx.stroke();
    });
    ctx.lineCap = "butt";
    const d = step(q, 0.7, 0.95);
    if (d > 0) {
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x0 + w * 0.3, y0 + h * 0.62, w * 0.1, 0, (Math.PI / 2) * d);
      ctx.stroke();
      label(ctx, "BED 1", x0 + w * 0.2, y0 + h * 0.3, Math.max(7, H * 0.09), c);
      label(ctx, "BATH", x0 + w * 0.85, y0 + h * 0.25, Math.max(7, H * 0.09), c);
    }
  },
  mindmap(ctx, L, T, W, H, q, _t, c) {
    const cx = L + W / 2;
    const cy = T + H / 2;
    const cols = ["#059669", "#2563eb", "#f59e0b", "#db2777", "#0d9488", "#65a30d"];
    for (let i = 0; i < 6; i++) {
      const p = step(q, 0.15 + i * 0.1, 0.4 + i * 0.1);
      if (p <= 0) continue;
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const ex = cx + Math.cos(a) * W * 0.36;
      const ey = cy + Math.sin(a) * H * 0.36;
      ctx.strokeStyle = cols[i];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(cx + Math.cos(a) * W * 0.2, cy + Math.sin(a) * H * 0.05, cx + (ex - cx) * p, cy + (ey - cy) * p);
      ctx.stroke();
      if (p > 0.9) {
        ctx.fillStyle = PAPER;
        rr(ctx, ex - W * 0.07, ey - H * 0.08, W * 0.14, H * 0.16, 6);
        ctx.fill();
        ctx.strokeStyle = cols[i];
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }
    const s = step(q, 0, 0.25);
    if (s > 0) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.ellipse(cx, cy, W * 0.13 * s, H * 0.15 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      label(ctx, "Ideas", cx, cy, Math.max(7, H * 0.11) * s, "#fff");
    }
  },
  studio(ctx, L, T, W, H, q) {
    const u = Math.min(W, H * 1.6) * 0.09;
    const ox = L + W / 2;
    const oy = T + H * 0.32;
    const iso = (x: number, y: number, z: number) => [ox + (x - y) * u, oy + (x + y) * u * 0.5 - z * u] as const;
    const poly = (pts: [number, number, number][], fill: string) => {
      ctx.beginPath();
      pts.forEach((p, i) => {
        const [x, y] = iso(...p);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.stroke();
    };
    const box = (x: number, y: number, w: number, d: number, h: number, top: string, side: string, front: string, s: number) => {
      if (s <= 0) return;
      h *= s;
      poly([[x, y + d, 0], [x + w, y + d, 0], [x + w, y + d, h], [x, y + d, h]], front);
      poly([[x + w, y, 0], [x + w, y + d, 0], [x + w, y + d, h], [x + w, y, h]], side);
      poly([[x, y, h], [x + w, y, h], [x + w, y + d, h], [x, y + d, h]], top);
    };
    if (step(q, 0, 0.2) > 0) poly([[0, 0, 0], [5, 0, 0], [5, 5, 0], [0, 5, 0]], "#efe7da");
    box(0.4, 0.4, 3.6, 1, 1.4, "#c4a484", "#a07a58", "#b38b66", step(q, 0.2, 0.45));
    box(1.2, 2.6, 1.2, 1.2, 0.9, "#e7d3bd", "#c9ad8f", "#d8bea2", step(q, 0.4, 0.6));
    box(3.2, 3.2, 1, 1, 0.9, "#e7d3bd", "#c9ad8f", "#d8bea2", step(q, 0.5, 0.7));
    const pl = step(q, 0.65, 0.9);
    if (pl > 0) {
      box(4.1, 1.8, 0.6, 0.6, 0.6, "#9a6b4f", "#7c533c", "#8a5e45", 1);
      const [x, y] = iso(4.4, 2.1, 0.6 + 1.1 * pl);
      ctx.fillStyle = "#65a30d";
      ctx.beginPath();
      ctx.arc(x, y, u * 0.8 * pl, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
  },
  music(ctx, L, T, W, H, q, t, c) {
    const cx = L + W * 0.12;
    const cy = T + H * 0.5;
    const r = H * 0.2;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(cx, cy, r * step(q, 0, 0.25), 0, Math.PI * 2);
    ctx.fill();
    if (q > 0.25) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.3, cy - r * 0.45);
      ctx.lineTo(cx + r * 0.5, cy);
      ctx.lineTo(cx - r * 0.3, cy + r * 0.45);
      ctx.fill();
    }
    const n = 22;
    const x0 = L + W * 0.26;
    const bw = (W * 0.7) / n;
    for (let i = 0; i < n; i++) {
      const s = step(q, 0.2 + i * 0.025, 0.4 + i * 0.025);
      if (s <= 0) continue;
      const h = H * (0.12 + 0.55 * Math.abs(Math.sin(i * 1.7 + t * 3) * Math.cos(i * 0.6 - t * 1.4))) * s;
      bar(ctx, x0 + i * bw, cy - h / 2, bw * 0.6, h, i < n * 0.4 ? c : GREY);
    }
  },
  video(ctx, L, T, W, H, q, t, c) {
    ctx.fillStyle = "#efeee8";
    ctx.fillRect(L, T, W, H * 0.8);
    ctx.strokeStyle = "#cfcdc4";
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(L + W * (0.1 + i * 0.22), T + H * 0.62);
      ctx.quadraticCurveTo(L + W * (0.2 + i * 0.22), T + H * 0.5, L + W * (0.28 + i * 0.22), T + H * 0.64);
      ctx.stroke();
    }
    const s = step(q, 0.2, 0.5);
    if (s > 0) {
      ctx.save();
      ctx.translate(L + W * (0.15 + 0.7 * ((t * 0.12) % 1)), T + H * (0.3 + 0.06 * Math.sin(t * 2)));
      ctx.rotate(-0.15);
      ctx.scale(s, s);
      ctx.fillStyle = PAPER;
      ctx.strokeStyle = INK;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-10, -7);
      ctx.lineTo(-5, 0);
      ctx.lineTo(-10, 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    bar(ctx, L, T + H * 0.88, W, H * 0.06, GREY);
    bar(ctx, L, T + H * 0.88, W * 0.45 * step(q, 0.3, 1), H * 0.06, c);
  },
  erd(ctx, L, T, W, H, q, _t, c) {
    const table = (x: number, y: number, name: string, rows: number[], s: number) =>
      fade(ctx, s, () => {
        const w = W * 0.36;
        const rh = H * 0.15;
        ctx.fillStyle = c;
        ctx.fillRect(x, y, w, rh);
        label(ctx, name, x + w / 2, y + rh / 2, Math.max(7, rh * 0.6), "#fff");
        rows.forEach((rw, i) => {
          ctx.fillStyle = PAPER;
          ctx.fillRect(x, y + rh * (i + 1), w, rh);
          ctx.strokeStyle = GREY;
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y + rh * (i + 1), w, rh);
          bar(ctx, x + 4, y + rh * (i + 1.35), w * rw, rh * 0.3, i ? MID : "#b4b1a7");
        });
        ctx.strokeStyle = INK;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x, y, w, rh * (rows.length + 1));
      });
    table(L + W * 0.05, T + H * 0.1, "students", [0.4, 0.7, 0.55], step(q, 0, 0.3));
    table(L + W * 0.59, T + H * 0.3, "courses", [0.4, 0.6, 0.5, 0.65], step(q, 0.25, 0.55));
    const p = step(q, 0.55, 0.85);
    if (p > 0) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(L + W * 0.41, T + H * 0.4);
      ctx.lineTo(L + W * (0.41 + 0.18 * p), T + H * (0.4 + 0.14 * p));
      ctx.stroke();
    }
  },
};

/** A file card centred on (x, y): paper, ink outline, hard shadow, a header with the tool's name, then its content. */
function fileCard(ctx: Ctx, f: FileKind, x: number, y: number, fw: number, fh: number, p: number, t: number) {
  const a = ease(p);
  if (a <= 0) return;
  const s = 0.72 + 0.28 * a;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.rotate((1 - a) * 0.08);
  const X = -fw / 2;
  const Y = -fh / 2;
  const hh = fh * 0.17;
  ctx.fillStyle = INK;
  rr(ctx, X + 4, Y + 4, fw, fh, 7);
  ctx.fill();
  ctx.fillStyle = PAPER;
  rr(ctx, X, Y, fw, fh, 7);
  ctx.fill();
  ctx.save();
  rr(ctx, X, Y, fw, fh, 7);
  ctx.clip();
  ctx.fillStyle = f.color;
  ctx.beginPath();
  ctx.arc(X + hh * 0.7, Y + hh / 2, hh * 0.22, 0, Math.PI * 2);
  ctx.fill();
  label(ctx, f.name, X + hh * 1.15, Y + hh / 2 + 0.5, Math.max(8, hh * 0.46), INK, "left");
  ctx.strokeStyle = GREY;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(X, Y + hh);
  ctx.lineTo(X + fw, Y + hh);
  ctx.stroke();
  const pad = fw * 0.05;
  CONTENT[f.id](ctx, X + pad, Y + hh + pad * 0.8, fw - pad * 2, fh - hh - pad * 1.6, clamp((p - 0.25) / 0.75), t, f.color);
  ctx.restore();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  rr(ctx, X, Y, fw, fh, 7);
  ctx.stroke();
  ctx.restore();
}

interface Prompt {
  f: FileKind;
  lines: string[];
  lh: number;
  bw: number;
  bh: number;
  /** Resting spot, and where it has floated to this frame. */
  x: number;
  y: number;
  cx: number;
  cy: number;
  rot: number;
  /** 0 = a line of text, 1 = fully its file. */
  p: number;
  /** How long the pointer has rested on it. */
  dwell: number;
  /** Shown as a file on its own until this time. */
  auto: number;
  phase: number;
}

/** Starts the backdrop on `canvas` (sized to the window) and returns a cleanup function. */
export function mountPromptFiles(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d")!;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let w = 0;
  let h = 0;
  let fs = 14;
  let fw = 200;
  let fh = 136;
  let prompts: Prompt[] = [];
  let frame = 0;
  let last = performance.now();
  let time = 0;
  let nextAuto = 1.2;
  const pointer = { x: -9999, y: -9999, on: false };
  let lastKey = -Infinity;
  const onKey = () => {
    lastKey = performance.now();
  };
  const cur = { x: -9999, y: -9999 };

  const layout = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth;
    h = innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const tall = h > w;
    fs = tall ? Math.min(11.5, w * 0.028) : Math.min(17, Math.max(11, w * 0.0118));
    const maxW = tall ? w * 0.36 : Math.min(260, w * 0.17);
    fw = tall ? w * 0.36 : Math.min(260, Math.max(170, w * 0.16));
    fh = fw * 0.68;
    ctx.font = `500 ${fs}px ${FONT}`;
    const old = prompts;
    prompts = SLOTS[tall ? "tall" : "wide"].map(([fx, fy], i) => {
      const f = FILES[i % FILES.length];
      const lines = [""];
      for (const word of f.ask.split(" ")) {
        const line = lines[lines.length - 1];
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width > maxW && line) lines.push(word);
        else lines[lines.length - 1] = next;
      }
      const lh = fs * 1.3;
      const bw = Math.max(...lines.map((l) => ctx.measureText(l).width));
      const bh = lines.length * lh;
      const halfW = Math.max(bw, fw) / 2 + 10;
      const halfH = Math.max(bh, fh) / 2 + 10;
      const x = Math.min(Math.max(fx * w, halfW), w - halfW);
      const y = Math.min(Math.max(fy * h, halfH), h - halfH);
      return { f, lines, lh, bw, bh, x, y, cx: x, cy: y, rot: 0, p: old[i]?.p ?? 0, dwell: 0, auto: old[i]?.auto ?? 0, phase: i * 1.7 };
    });
  };

  const draw = (t: number, dt: number) => {
    ctx.clearRect(0, 0, w, h);

    if (pointer.on) {
      const k = 1 - Math.exp(-dt * 14);
      cur.x += (pointer.x - cur.x) * k;
      cur.y += (pointer.y - cur.y) * k;
    } else {
      cur.x = cur.y = -9999;
    }

    // Every prompt floats in place on its own loop: a sway, a bob and a slight tilt.
    const amp = Math.max(10, w * 0.016);
    for (const pr of prompts) {
      pr.cx = pr.x + Math.sin(t * 0.7 + pr.phase) * amp;
      pr.cy = pr.y + Math.sin(t * 1.1 + pr.phase * 1.3) * amp * 0.8;
      pr.rot = Math.sin(t * 0.8 + pr.phase * 0.7) * 0.045;
    }

    // Prompts take turns becoming their files: a new one every couple of seconds, at most two at once
    // (one on phones, where there's no room for two).
    // Nothing new starts while someone is typing in the form, so it doesn't pull their eye.
    const typing = performance.now() - lastKey < 2500;
    if (t > nextAuto && !typing) {
      const showing = prompts.filter((p) => p.auto > t).length;
      const idle = prompts.filter((p) => p.auto <= t && p.p === 0);
      if (showing < (h > w ? 1 : 2) && idle.length) idle[Math.floor(Math.random() * idle.length)].auto = t + 3.4;
      nextAuto = t + 1.9;
    }

    for (const pr of prompts) {
      const [hw, hh] = pr.p > 0.4 ? [fw / 2, fh / 2] : [pr.bw / 2 + 12, pr.bh / 2 + 12];
      const inside = Math.abs(cur.x - pr.cx) < hw && Math.abs(cur.y - pr.cy) < hh;
      pr.dwell = inside ? pr.dwell + dt : 0;
      const open = (inside && pr.dwell > 0.15) || pr.auto > t;
      pr.p = open ? Math.min(1, pr.p + dt / 1.1) : Math.max(0, pr.p - dt / 0.45);
    }

    // Open files draw last so they sit on top of the prompts around them.
    const R = Math.max(w, h) * 0.2;
    for (const pr of [...prompts].sort((a, b) => a.p - b.p)) {
      const near = clamp(1 - Math.hypot(cur.x - pr.cx, cur.y - pr.cy) / R);
      const alpha = (0.3 + 0.55 * near) * (1 - ease(pr.p * 2.2));
      if (alpha > 0.01) {
        ctx.save();
        ctx.translate(pr.cx, pr.cy);
        ctx.rotate(pr.rot);
        ctx.translate(-pr.cx, -pr.cy);
        ctx.font = `500 ${fs}px ${FONT}`;
        ctx.textBaseline = "middle";
        ctx.fillStyle = `rgba(28,27,24,${alpha})`;
        const top = pr.cy - pr.bh / 2 + pr.lh / 2 - ease(pr.p) * 8;
        pr.lines.forEach((l, i) => ctx.fillText(l, pr.cx - pr.bw / 2, top + i * pr.lh));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = pr.f.color;
        ctx.beginPath();
        ctx.arc(pr.cx - pr.bw / 2 - fs * 0.6, top, fs * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      fileCard(ctx, pr.f, pr.cx, pr.cy, fw, fh, pr.p, t);
    }
  };

  const loop = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    time += dt;
    draw(time, dt);
    frame = requestAnimationFrame(loop);
  };
  /** Reduced motion: one still frame, with two prompts shown as their files. */
  const drawStill = () => {
    prompts.forEach((p, i) => (p.p = i === 2 || i === 7 ? 1 : 0));
    draw(0, 0);
  };

  const onResize = () => {
    layout();
    if (still) drawStill();
  };
  const onMove = (e: PointerEvent) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    if (!pointer.on) {
      cur.x = e.clientX;
      cur.y = e.clientY;
    }
    pointer.on = true;
  };
  const onLeave = () => {
    pointer.on = false;
  };
  // Touch has no hover, so a tap holds the "pointer" where it landed until the finger lifts.
  const onUp = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") pointer.on = false;
  };

  layout();
  // Wait for the web font so text is measured with the face it's drawn in.
  document.fonts?.ready.then(onResize).catch(() => {});
  if (still) drawStill();
  else frame = requestAnimationFrame(loop);
  addEventListener("resize", onResize);
  addEventListener("pointermove", onMove);
  addEventListener("pointerdown", onMove);
  addEventListener("pointerup", onUp);
  addEventListener("keydown", onKey);
  document.documentElement.addEventListener("pointerleave", onLeave);
  return () => {
    cancelAnimationFrame(frame);
    removeEventListener("resize", onResize);
    removeEventListener("pointermove", onMove);
    removeEventListener("pointerdown", onMove);
    removeEventListener("pointerup", onUp);
    removeEventListener("keydown", onKey);
    document.documentElement.removeEventListener("pointerleave", onLeave);
  };
}
