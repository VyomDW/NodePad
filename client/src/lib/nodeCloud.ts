// @ts-nocheck -- imperative Three.js + DOM scene ported from the homepage mockup; React only mounts it.
import * as THREE from "three";

/** One file on the home screen, already mapped to the tool (kind or board template) it opens in. */
export interface CloudFile {
  id: string;
  tool: string;
  title: string;
  updatedAt: number;
  online: number;
  /** False for a file someone else made and shared with you. */
  mine?: boolean;
}

export interface CloudOptions {
  files: CloudFile[];
  openFile: (id: string) => void;
  /** Delete a file (everywhere if it's yours, else just from your list); resolves once the server is done. */
  deleteFile: (id: string) => Promise<void>;
  /** Start a new file in a tool, optionally with a first request for nodepad. */
  newFile: (tool: string, prompt?: string) => void;
}

const TRASH =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';

// lucide-style icon paths, 24-unit grid; drawn both in HTML and onto node textures
export const ICON = {
  slides: "M2 3h20M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3M7 21l5-5 5 5",
  doc: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7ZM14 2v4a2 2 0 0 0 2 2h4M16 13H8M16 17H8M10 9H8",
  sheet: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM3 9h18M9 3v18",
  notes:
    "M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4M2 6h4M2 10h4M2 14h4M2 18h4M21.4 5.6a2.1 2.1 0 1 0-3-3l-5 5a2 2 0 0 0-.5.85l-.84 2.87a.5.5 0 0 0 .62.62l2.87-.84a2 2 0 0 0 .85-.5z",
  whiteboard: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  flowchart: "M3 3h8v8H3zM7 11v4a2 2 0 0 0 2 2h4M13 13h8v8h-8z",
  blueprint: "M10 4a2 2 0 1 0 4 0a2 2 0 1 0-4 0M12 6L5 21M12 6l7 15M5.5 15a13 13 0 0 0 13 0",
  architecture: "M16 16h6v6h-6zM2 16h6v6H2zM9 2h6v6H9zM5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3M12 12V8",
  erd: "M4 5a8 3 0 1 0 16 0a8 3 0 1 0-16 0M4 5v14a8 3 0 0 0 16 0V5M4 12a8 3 0 0 0 16 0",
  mindmap:
    "M10 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0M12 10V6M12 14v4M10 12H6M14 12h4M10 4a2 2 0 1 0 4 0a2 2 0 1 0-4 0M10 20a2 2 0 1 0 4 0a2 2 0 1 0-4 0M2 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0M18 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
  clock: "M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18zM12 7v5l3 2",
  studio: "M12 2l9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10",
  music: "M9 18V5l12-2v13M6 21a3 3 0 1 0 0-6a3 3 0 0 0 0 6zM18 19a3 3 0 1 0 0-6a3 3 0 0 0 0 6z",
  video: "M4 11v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8zM4 11l-.88-2.87a2 2 0 0 1 1.33-2.5l11.48-3.5a2 2 0 0 1 2.5 1.33L19 6.3zM6.6 4.99l3.38 4.2M11.86 3.38l3.38 4.2",
};
export const iconSvg = (k) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[k]}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// colors and suggestions match KINDS / BOARD_TEMPLATES in kinds.ts
export const TOOL_DEFS = [
  { id: "slides", name: "Presentation", noun: "presentation", color: "#f59e0b", pos: [0, 1.65, 0.7], ask: "Make a pitch about sustainable coffee" },
  { id: "doc", name: "Document", noun: "document", color: "#2563eb", pos: [-2.4, -0.25, 1.1], ask: "Write a one-page project proposal for a campus app" },
  { id: "sheet", name: "Spreadsheet", noun: "spreadsheet", color: "#059669", pos: [2.4, -0.45, 0.9], ask: "Build a monthly student budget with a pie chart" },
  { id: "notes", name: "Notes", noun: "notes", color: "#eab308", pos: [0.1, -1.75, 0.5], ask: "Plan my hackathon weekend with a packing checklist" },
];
export const DEV_DEFS = [
  { id: "whiteboard", name: "Whiteboard", noun: "whiteboard", color: "#db2777", ask: "Brainstorm features for a campus app" },
  { id: "flowchart", name: "Flowchart", noun: "flowchart", color: "#0284c7", ask: "Flowchart of a user login flow with 2FA" },
  { id: "blueprint", name: "Blueprint", noun: "floor plan", color: "#1d4ed8", ask: "Floor plan for a 2-bedroom, 1-bath apartment" },
  { id: "architecture", name: "System design", noun: "system diagram", color: "#4f46e5", ask: "Architecture for a food delivery app" },
  { id: "erd", name: "DB schema", noun: "database schema", color: "#0d9488", ask: "Schema for a course registration system" },
  { id: "mindmap", name: "Mind map", noun: "mind map", color: "#c026d3", ask: "Mind map of hackathon ideas about sustainability" },
];
export const MEDIA_DEFS = [
  { id: "studio", name: "3D Studio", noun: "3D scene", color: "#9333ea", ask: "Build a cozy coffee shop with tables, a counter and plants" },
  { id: "music", name: "Music", noun: "track", color: "#65a30d", ask: "Upbeat lo-fi hip hop with warm piano, for studying" },
  { id: "video", name: "Video", noun: "clip", color: "#dc2626", ask: "A paper airplane gliding over a desk of pencil sketches" },
];
const DEFAULT_ASK = "Make a pitch about sustainable coffee";

// Simple keyword rules that pick the tool for a typed request
const RULES = [
  ["music", /music|song|beat|melody|soundtrack|jingle|lo-?fi|instrumental/],
  ["video", /video|clip|film|footage|movie|cinematic|drone shot/],
  ["studio", /\b3d\b|3-d|scene|render|model of|environment|sculpt/],
  ["blueprint", /floor ?plan|blueprint|apartment|bedroom|room layout|booth layout/],
  ["erd", /schema|database|\bdb\b|tables?\b|erd/],
  ["flowchart", /flow ?chart|flow\b|process|pipeline|steps of/],
  ["architecture", /architecture|system design|backend|scal(e|ing)|microservice|infra/],
  ["mindmap", /mind ?map|map out|idea map/],
  ["whiteboard", /brainstorm|whiteboard|sticky|retro|sketch/],
  ["sheet", /budget|spreadsheet|sheet|track|compare|calculat|chart|totals|expenses|scores/],
  ["slides", /pitch|deck|slides?\b|presentation|present|talk|keynote/],
  ["notes", /notes?\b|checklist|to-?do|study|packing|jot|remind/],
  ["doc", /write|essay|proposal|letter|report|minutes|doc|draft|article|summary|plan/],
];

/** The tool id a typed request should open in; documents when nothing matches. */
export const routeTool = (q: string): string => RULES.find(([, re]) => re.test(q.toLowerCase()))?.[0] ?? "doc";

const ago = (t) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
};

const MARKUP = `
<div class="ov">
  <svg class="wires" aria-hidden="true"></svg>
  <div class="greet"><b>What do you want to make?</b><span>Pick a tool, click the center for your latest files, or just describe it below.</span></div>
  <div class="hint"><span class="o">Click a node to zoom in · drag to rotate</span><span class="z"><kbd>Esc</kbd> or click the desk to zoom out</span></div>
  <div class="fhead">
    <button class="back ink-btn" type="button">← All tools</button>
    <div class="t"><span class="ic f-ic"></span><div><h3 class="f-title"></h3><p class="f-sub"></p></div></div>
    <div class="acts"><button class="pri ink-btn f-new" type="button">New</button></div>
  </div>
  <div class="route"></div>
  <form class="dock ink-btn" autocomplete="off">
    <span class="mic"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2.5" width="6" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg></span>
    <input aria-label="Describe what to make" placeholder="${DEFAULT_ASK}">
    <button class="go" type="submit" aria-label="Start" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
  </form>
</div>`;

/** Builds the node-cloud home inside `stage` and returns a cleanup function. */
export function mountNodeCloud(stage: HTMLElement, opts: CloudOptions): () => void {
  stage.innerHTML = MARKUP;
  const $ = (s) => stage.querySelector(s);
  const ov = $(".ov"), wires = $(".wires"), dock = $(".dock"), fhead = $(".fhead");
  const aski = $(".dock input"), askgo = $(".dock .go"), routeEl = $(".route");

  const TOOLS = TOOL_DEFS.map((d) => ({ ...d, size: 1.25, big: true, files: [] }));
  const DEV = DEV_DEFS.map((d, i) => {
    const a = (i / DEV_DEFS.length) * Math.PI * 2 + 0.3;
    // a separate little ring off to the back-right
    return { ...d, size: 0.74, big: false, files: [], pos: [3.9 + Math.cos(a) * 1.45, 1.6 + Math.sin(a) * 1.2, -2.4 + Math.cos(a) * 0.6] };
  });
  const MEDIA = MEDIA_DEFS.map((d, i) => {
    const a = (i / MEDIA_DEFS.length) * Math.PI * 2 - 0.4;
    // a matching little ring off to the back-left
    return { ...d, size: 0.74, big: false, files: [], pos: [-4.1 + Math.cos(a) * 1.35, 1.4 + Math.sin(a) * 1.1, -2.4 - Math.cos(a) * 0.6] };
  });
  const SMALL = DEV.concat(MEDIA);
  const ALL = TOOLS.concat(SMALL);
  const byId = Object.fromEntries(ALL.map((t) => [t.id, t]));
  let files = [...opts.files].sort((a, b) => b.updatedAt - a.updatedAt);
  files.forEach((f) => (byId[f.tool] || byId.doc).files.push(f));

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    stage.insertAdjacentHTML("beforeend", '<div class="nogl">This page needs WebGL to draw the tools.</div>');
    return () => (stage.innerHTML = "");
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  stage.insertBefore(renderer.domElement, ov);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  const cluster = new THREE.Group();
  scene.add(cluster);
  const INK = "#1c1b18";
  const disposables = [];

  // sticker textures: flat fill, ink outline, hard offset shadow
  function sticker(fill, icon, o = {}) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    const cx = 120, cy = 120, r = o.r || 92, sh = o.shadow ?? 12;
    g.fillStyle = o.shadowColor || INK;
    g.beginPath(); g.arc(cx + sh, cy + sh, r, 0, 7); g.fill();
    g.fillStyle = fill;
    g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    g.lineWidth = o.line || 7; g.strokeStyle = INK; g.stroke();
    if (icon) {
      const s = o.iconScale || 4.2;
      g.save(); g.translate(cx - 12 * s, cy - 12 * s); g.scale(s, s);
      g.strokeStyle = o.iconColor || "#fff"; g.lineWidth = 2; g.lineCap = "round"; g.lineJoin = "round";
      g.stroke(new Path2D(ICON[icon])); g.restore();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    disposables.push(t);
    return t;
  }
  function markerRing() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d");
    g.strokeStyle = "#ffffff"; g.lineCap = "round"; g.lineWidth = 7;
    g.beginPath(); g.ellipse(128, 126, 112, 106, -0.15, 0.35, Math.PI * 2 + 0.1); g.stroke();
    g.lineWidth = 4; g.globalAlpha = 0.7;
    g.beginPath(); g.ellipse(124, 130, 106, 114, 0.2, -0.4, Math.PI * 1.4); g.stroke();
    const t = new THREE.CanvasTexture(c);
    disposables.push(t);
    return t;
  }
  const RING = markerRing();
  function sprite(tex, size, extra = {}) {
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.05, ...extra });
    disposables.push(m);
    const s = new THREE.Sprite(m);
    s.scale.set(size, size, 1);
    return s;
  }
  const orange = () => new THREE.Color("#ea580c");

  // the center node: every tool's latest files
  const hitMeshes = [];
  const hub = new THREE.Group();
  const hubS = sprite(sticker(INK, "clock", { shadowColor: "#ea580c", iconScale: 4.6 }), 1.05);
  hub.add(hubS);
  cluster.add(hub);
  const ROOT = { id: "clock", name: "Recent", noun: "file", ask: DEFAULT_ASK, files: [], color: INK, size: 1.05, group: hub, hover: 0 };
  ROOT.ring = sprite(RING, 1.05 * 1.35, { color: orange(), opacity: 0, depthTest: false });
  ROOT.ring.renderOrder = 5;
  hub.add(ROOT.ring);
  const hitGeo = new THREE.SphereGeometry(1, 12, 12), hitMat = new THREE.MeshBasicMaterial({ visible: false });
  disposables.push(hitGeo, hitMat);
  const rootHit = new THREE.Mesh(hitGeo, hitMat);
  rootHit.scale.setScalar(0.7);
  rootHit.userData.svc = ROOT;
  hub.add(rootHit);
  hitMeshes.push(rootHit);

  ALL.forEach((s) => {
    const g = new THREE.Group();
    g.position.fromArray(s.pos);
    const body = sprite(sticker(s.color, s.id, { line: s.big ? 7 : 9, shadow: s.big ? 12 : 14 }), s.size);
    const ring = sprite(RING, s.size * 1.3, { color: orange(), opacity: 0, depthTest: false });
    ring.renderOrder = 5;
    const hit = new THREE.Mesh(hitGeo, hitMat);
    hit.scale.setScalar(s.size * 0.7);
    hit.userData.svc = s;
    hitMeshes.push(hit);
    g.add(body, ring, hit);
    cluster.add(g);
    Object.assign(s, { group: g, body, ring, hover: 0, dim: 0 });
  });

  // ink wires: center to every classic tool, a ring between them, and the dev ring hanging off two links
  const solid = [], dashed = [], edges = [];
  const seg = (arr, a, b, ra, rb) => {
    const d = new THREE.Vector3().subVectors(b, a), L = d.length();
    d.normalize();
    const p = a.clone().addScaledVector(d, ra), q = a.clone().addScaledVector(d, L - rb);
    arr.push(p.x, p.y, p.z, q.x, q.y, q.z);
  };
  TOOLS.forEach((s) => edges.push([hub.position, s.group.position, 0.42, s.size * 0.42]));
  TOOLS.forEach((a, i) => {
    const b = TOOLS[(i + 1) % TOOLS.length];
    edges.push([a.group.position, b.group.position, a.size * 0.42, b.size * 0.42]);
  });
  [DEV[1], DEV[4], MEDIA[0]].forEach((s) => edges.push([hub.position, s.group.position, 0.42, s.size * 0.42]));
  edges.forEach((e) => seg(solid, ...e));
  [DEV, MEDIA].forEach((ring) =>
    ring.forEach((s, i) => {
      const n = ring[(i + 1) % ring.length];
      seg(dashed, s.group.position, n.group.position, s.size * 0.42, n.size * 0.42);
    }),
  );
  function lines(arr, mat, dash) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
    disposables.push(g, mat);
    const l = new THREE.LineSegments(g, mat);
    if (dash) l.computeLineDistances();
    cluster.add(l);
    return mat;
  }
  const solidMat = lines(solid, new THREE.LineBasicMaterial({ color: 0x1c1b18, transparent: true, opacity: 0.75 }));
  const dashMat = lines(dashed, new THREE.LineDashedMaterial({ color: 0x1c1b18, transparent: true, opacity: 0.45, dashSize: 0.09, gapSize: 0.08 }), true);
  const PULSE = sticker("#ea580c", null, { r: 76, line: 18, shadow: 0 });

  // HTML labels under each node
  const toolLabel = (s) => {
    const live = s.files.filter((f) => f.online > 0).length;
    return `<span class="ic">${iconSvg(s.id)}</span><span><b>${s.name}</b>${s.big ? `<small>${s.files.length} recent${live ? ` · ${live} open now` : ""}</small>` : ""}</span>`;
  };
  ALL.forEach((s) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "label" + (s.big ? "" : " sm");
    b.style.setProperty("--c", s.color);
    b.innerHTML = toolLabel(s);
    b.onclick = (e) => { e.stopPropagation(); focus(s); };
    b.onmouseenter = () => (hovered = s);
    b.onmouseleave = () => { if (hovered === s) hovered = null; };
    ov.insertBefore(b, dock);
    s.label = b;
  });

  // handwritten group labels that zoom in on their part of the cloud
  function makeGroup(id, name, members, tagText, tagPos) {
    const c = new THREE.Vector3();
    members.forEach((m) => c.add(new THREE.Vector3().fromArray(m.pos)));
    c.multiplyScalar(1 / members.length);
    const o = new THREE.Object3D();
    o.position.copy(c);
    cluster.add(o);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tag";
    b.textContent = tagText;
    const g = { isGroup: true, id, name, color: INK, members, group: o, tag: b, tagPos };
    b.onclick = (e) => { e.stopPropagation(); focus(g); };
    ov.insertBefore(b, dock);
    return g;
  }
  const CLASSIC = makeGroup("classic", "Classic", TOOLS, "classic", new THREE.Vector3(0, 2.75, 0.7));
  const DEVG = makeGroup("dev", "Dev & design boards", DEV, "dev & design boards", new THREE.Vector3(3.9, 3.25, -2.4));
  const MEDIAG = makeGroup("media", "3D & media", MEDIA, "3d & media", new THREE.Vector3(-4.1, 3.05, -2.4));
  const GROUPS = [CLASSIC, DEVG, MEDIAG];
  let parentGroup = null;

  function preview(tool, f, i) {
    const t = esc(f.title);
    if (tool.id === "slides") return `<div class="pv slides"><b>${t}</b><em>Presentation</em></div>`;
    if (tool.id === "doc") return `<div class="pv doc"><b>${t}</b><i style="width:92%"></i><i style="width:80%"></i><i style="width:88%"></i><i style="width:56%"></i></div>`;
    if (tool.id === "sheet") {
      let h = "";
      for (let k = 0; k < 7; k++) h += `<s style="left:${14 + k * 11}%;height:${18 + ((k * 37 + i * 13) % 50)}%"></s>`;
      return `<div class="pv sheet">${h}</div>`;
    }
    if (tool.id === "studio")
      return '<div class="pv studio"><svg viewBox="0 0 100 56" aria-hidden="true"><path d="M50 10l18 9v18l-18 9-18-9V19z" fill="#f3e8ff" stroke="#1c1b18" stroke-width="1.4" stroke-linejoin="round"/><path d="M32 19l18 9 18-9M50 28v18" fill="none" stroke="#1c1b18" stroke-width="1.4" stroke-linejoin="round"/><ellipse cx="76" cy="40" rx="7" ry="3" fill="#1c1b18" opacity=".15"/><circle cx="76" cy="33" r="7" fill="#9333ea" stroke="#1c1b18" stroke-width="1.4"/></svg></div>';
    if (tool.id === "notes") return `<div class="pv notes"><b>${t}</b><i style="width:70%"></i><i style="width:86%"></i><i style="width:48%"></i></div>`;
    return '<div class="pv board"><svg viewBox="0 0 100 56" aria-hidden="true"><rect x="8" y="8" width="26" height="14" rx="2" fill="#fffefb" stroke="#1c1b18" stroke-width="1.2"/><rect x="62" y="10" width="28" height="14" rx="2" fill="#fef9c3" stroke="#1c1b18" stroke-width="1.2"/><rect x="34" y="34" width="30" height="14" rx="2" fill="#fffefb" stroke="#1c1b18" stroke-width="1.2"/><path d="M34 15H62M21 22L42 34M76 24L58 34" stroke="#1c1b18" stroke-width="1" fill="none"/></svg></div>';
  }

  const HOME = new THREE.Vector3(0, 0.5, -0.9);
  const cam = { yaw: 0, pitch: 0.2, dist: 11, target: HOME.clone() };
  const goal = { yaw: 0, pitch: 0.2, dist: 11, target: HOME.clone() };
  let focused = null, hovered = null, cards = [], cardsShownAt = 0, routed = null, launch = null, layout = null;
  const shift = { x: 0, y: 0 };
  let W = 0, H = 0;
  const DOCK_H = 70, GAP = 14;
  const narrow = () => stage.clientWidth < 760;
  const overviewDist = () => (narrow() ? 24 : 14);
  const focusDist = (s) => {
    if (s === ROOT) return narrow() ? 5.4 : 4.6;
    if (s.isGroup) return s === DEVG ? (narrow() ? 10 : 6.8) : s === MEDIAG ? (narrow() ? 10 : 7.4) : narrow() ? 13 : 9;
    return (narrow() ? 6.2 : 5.2) * (s.big ? 1 : 0.7);
  };
  function center() {
    if (!focused) return { x: W / 2, y: (H - DOCK_H) / 2 + 8 };
    if (narrow()) {
      const top = fhead.offsetTop + fhead.offsetHeight + 14;
      return { x: W / 2, y: top + (H - top - DOCK_H) / 2 };
    }
    return { x: 250 + (W - 250) / 2, y: (H - DOCK_H) / 2 + 6 };
  }
  const wrapYaw = (target) => {
    let dy = target - cam.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    return cam.yaw + dy;
  };

  function focus(s) {
    if (focused === s) return;
    clearCards();
    const from = focused;
    focused = s;
    stage.classList.add("focused");
    stage.classList.toggle("grouped", !!s.isGroup);
    stage.classList.toggle("grp-dev", s === DEVG || s === MEDIAG);
    if (s === ROOT) parentGroup = null;
    else if (!s.isGroup) parentGroup = from && from.isGroup && from.members.includes(s) ? from : null;
    fhead.style.setProperty("--c", s.color);
    const wp = new THREE.Vector3();
    s.group.getWorldPosition(wp);
    goal.target.copy(wp);
    goal.dist = focusDist(s);
    goal.pitch = 0.12;
    // classic tools are viewed from outside the center; the small rings face the front, turned a little toward the middle
    const flat = Math.hypot(wp.x, wp.z);
    const side = MEDIA.includes(s) || s === MEDIAG ? -0.45 : 0.45;
    goal.yaw = wrapYaw(s === ROOT ? 0.1 : s.isGroup ? (s === CLASSIC ? 0.05 : side) : !s.big ? side : flat > 0.3 ? Math.atan2(wp.x, wp.z) : cam.yaw);
    $(".f-ic").innerHTML = iconSvg(s.isGroup ? (s === MEDIAG ? "studio" : "whiteboard") : s.id);
    $(".f-title").textContent = s.name;
    if (s.isGroup) {
      $(".f-sub").textContent = `${s.members.length} tools · pick one to see its recent files`;
      ALL.forEach((o) => { o.label.classList.toggle("dim", !s.members.includes(o)); o.label.classList.remove("me"); });
      return;
    }
    const list = s === ROOT ? files.slice(0, 5) : s.files.slice(0, 5);
    const live = list.filter((f) => f.online > 0).length;
    $(".f-sub").textContent = MEDIA_DEFS.some((m) => m.id === s.id && m.id !== "studio") ? `Your ${s.noun}s live in the media studio` : list.length ? `${list.length} recent file${list.length > 1 ? "s" : ""}${live ? ` · ${live} open now` : ""}` : "Nothing here yet";
    $(".f-new").textContent = s === ROOT ? "New file" : `New ${s.noun}`;
    aski.placeholder = s.ask;
    ALL.forEach((o) => { o.label.classList.toggle("dim", o !== s); o.label.classList.toggle("me", o === s); });
    list.forEach((f, i) => {
      const tool = byId[f.tool] || byId.doc;
      const c = document.createElement("button");
      c.type = "button";
      c.className = "card";
      c.style.setProperty("--c", tool.color);
      c.style.setProperty("--tilt", (i % 2 ? 3 : -3) + "deg");
      let pv = preview(tool, f, i);
      if (s === ROOT) pv = pv.replace(/<\/div>$/, `<span class="kind"><span class="ki">${iconSvg(tool.id)}</span>${tool.name}</span></div>`);
      c.innerHTML = `${pv}<span class="nm">${esc(f.title)}</span><span class="mt">${f.online > 0 ? `<span class="live">${f.online} editing</span>` : ""}<span class="t">${ago(f.updatedAt)}</span></span><span class="del" role="button" tabindex="0" title="${f.mine === false ? "Remove from my files" : "Delete file"}" aria-label="Delete ${esc(f.title)}">${TRASH}</span>`;
      c.onclick = (e) => { e.stopPropagation(); opts.openFile(f.id); };
      const del = c.querySelector(".del");
      const remove = (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (!confirm(f.mine === false ? `Remove "${f.title}" from your files? It stays shared with everyone else.` : `Delete "${f.title}"? This removes it for everyone.`)) return;
        opts.deleteFile(f.id).then(() => {
          files = files.filter((x) => x.id !== f.id);
          tool.files = tool.files.filter((x) => x.id !== f.id);
          tool.label.innerHTML = toolLabel(tool);
          // redraw the open card list without the deleted file
          const s = focused;
          focused = null;
          focus(s);
        }, () => alert("Couldn't delete that file. Try again."));
      };
      del.onclick = remove;
      del.onkeydown = (e) => (e.key === "Enter" || e.key === " ") && remove(e);
      ov.insertBefore(c, dock);
      cards.push(c);
    });
    const nf = document.createElement("button");
    nf.type = "button";
    nf.className = "card newf";
    nf.style.setProperty("--c", s === ROOT ? "#ea580c" : s.color);
    nf.innerHTML = s === ROOT ? "<i>+</i>Describe something new" : `<i>+</i>New ${s.noun}`;
    nf.onclick = (e) => { e.stopPropagation(); newInFocused(); };
    ov.insertBefore(nf, dock);
    cards.push(nf);
    layoutCards();
    cardsShownAt = performance.now() + 450;
  }
  function newInFocused() {
    if (!focused || focused === ROOT || focused.isGroup) aski.focus();
    else opts.newFile(focused.id);
  }

  // Card layout: start from a ring (columns on phones), then push apart until no card touches
  // another card, the header, the hint, the prompt box or the node. Shrink the cards if it can't fit.
  const rectOf = (el, pad) => (el && el.offsetWidth ? { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight / 2, w: el.offsetWidth + pad * 2, h: el.offsetHeight + pad * 2 } : null);
  const hits = (a, b, g) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 + g && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + g;
  function solve(sc) {
    const c = center(), n = cards.length, mob = narrow();
    const R = cards.map((el) => ({ w: el.offsetWidth * sc, h: el.offsetHeight * sc, x: 0, y: 0 }));
    const ch = Math.max(...R.map((r) => r.h)), cw = R[0].w;
    const minY = 8, maxY = H - DOCK_H - 8, obs = [];
    const fh = rectOf(fhead, 4);
    if (fh) obs.push(fh);
    const hint = rectOf($(".hint"), 4);
    if (hint) obs.push(hint);
    if (!mob) {
      const rad = ((focused.size * 0.5) / (focusDist(focused) * Math.tan((camera.fov * Math.PI) / 360))) * (H / 2) * 1.15;
      obs.push({ x: c.x, y: c.y, w: rad * 2, h: rad * 2 });
    }
    const top = fh ? fh.y + fh.h / 2 + GAP : minY;
    R.forEach((r, i) => {
      if (mob) {
        const col = i % 2, row = Math.floor(i / 2), rows = Math.ceil(n / 2), span = maxY - top - ch;
        r.x = col ? W - r.w / 2 - 10 : r.w / 2 + 10;
        r.y = top + ch / 2 + (rows > 1 ? (row * span) / (rows - 1) : span / 2);
      } else {
        const a = -Math.PI / 2 + i * ((Math.PI * 2) / n), rx = Math.min((W - 250) / 2, W / 2) - cw / 2, ry = (maxY - minY) / 2 - ch / 2;
        r.x = c.x + Math.cos(a) * rx;
        r.y = c.y + Math.sin(a) * ry;
      }
    });
    const clamp = (r) => {
      r.x = Math.max(r.w / 2 + 8, Math.min(W - r.w / 2 - 8, r.x));
      r.y = Math.max(minY + r.h / 2, Math.min(maxY - r.h / 2, r.y));
    };
    const push = (a, b, share) => {
      const ox = (a.w + b.w) / 2 + GAP - Math.abs(a.x - b.x), oy = (a.h + b.h) / 2 + GAP - Math.abs(a.y - b.y);
      if (ox <= 0 || oy <= 0) return false;
      if (ox < oy) { const sx = a.x < b.x ? -1 : 1; a.x += sx * ox * share; if (share < 1) b.x -= sx * ox * share; }
      else { const sy = a.y < b.y ? -1 : 1; a.y += sy * oy * share; if (share < 1) b.y -= sy * oy * share; }
      return true;
    };
    for (let it = 0; it < 300; it++) {
      let moved = false;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) if (push(R[i], R[j], 0.5)) moved = true;
        for (const o of obs) if (push(R[i], o, 1)) moved = true;
      }
      R.forEach(clamp);
      if (!moved) break;
    }
    let ok = true;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) if (hits(R[i], R[j], GAP - 1)) ok = false;
      for (const o of obs) if (hits(R[i], o, GAP - 1)) ok = false;
    }
    return { ok, pos: R };
  }
  function layoutCards() {
    if (!focused || !cards.length) { layout = null; return; }
    let sc = 1, res;
    for (let tries = 0; tries < 8; tries++) { res = solve(sc); if (res.ok) break; sc *= 0.92; }
    layout = { sc, pos: res.pos };
  }

  // the prompt box: pick the tool as you type, then start a new file there with the request
  const pickTool = (q) => byId[routeTool(q)];
  function showRoute(going) {
    const q = aski.value.trim();
    routed = q ? pickTool(q) : null;
    askgo.disabled = !q;
    routeEl.classList.toggle("going", !!going);
    routeEl.classList.toggle("on", !!routed);
    if (!routed) return;
    routeEl.style.setProperty("--c", routed.color);
    routeEl.innerHTML = `${going ? "Opening" : "Will use"} <span class="rt"><i>${iconSvg(routed.id)}</i>${routed.name}</span>${going ? "" : "<span>and start it for you</span>"}`;
  }
  aski.addEventListener("input", () => showRoute());
  let launchTimer;
  dock.onsubmit = (e) => {
    e.preventDefault();
    const q = aski.value.trim();
    if (!q) return;
    showRoute(true);
    const tool = routed;
    if (focused && focused !== tool) { parentGroup = null; unfocus(); routed = tool; }
    launch = { sp: sprite(PULSE, 0.34), from: hub.position.clone(), to: tool.group.position, t: 0 };
    cluster.add(launch.sp);
    launchTimer = setTimeout(() => opts.newFile(tool.id, q), 750);
  };

  function clearCards() {
    cards.forEach((c) => c.remove());
    cards = [];
    layout = null;
    wires.innerHTML = "";
  }
  function unfocus() {
    if (!focused) return;
    if (!focused.isGroup && focused !== ROOT && parentGroup) {
      const g = parentGroup;
      clearCards();
      focused = null;
      focus(g);
      return;
    }
    parentGroup = null;
    focused = null;
    routed = null;
    stage.classList.remove("focused", "grouped", "grp-dev");
    clearCards();
    goal.target.copy(HOME);
    goal.dist = overviewDist();
    goal.pitch = 0.2;
    goal.yaw = wrapYaw(0);
    aski.placeholder = DEFAULT_ASK;
    ALL.forEach((o) => o.label.classList.remove("dim", "me"));
  }
  $(".back").onclick = (e) => { e.stopPropagation(); unfocus(); };
  $(".f-new").onclick = (e) => { e.stopPropagation(); newInFocused(); };
  const onKey = (e) => { if (e.key === "Escape") unfocus(); };
  window.addEventListener("keydown", onKey);

  // pointer: drag to rotate, click a node to zoom in, click the desk to zoom out
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  let down = null, dragging = false;
  function pick(e) {
    const r = stage.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const h = ray.intersectObjects(hitMeshes);
    return h.length ? h[0].object.userData.svc : null;
  }
  const onDown = (e) => {
    if (e.target.closest("button,.dock")) return;
    down = { x: e.clientX, y: e.clientY, yaw: goal.yaw, pitch: goal.pitch };
    dragging = false;
  };
  const onMove = (e) => {
    if (down) {
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) { dragging = true; stage.classList.add("drag"); }
      if (dragging) { goal.yaw = down.yaw - dx * 0.006; goal.pitch = Math.max(-0.6, Math.min(0.8, down.pitch + dy * 0.004)); }
    } else if (e.target === renderer.domElement || e.target === ov || e.target === wires) hovered = pick(e);
    else if (!e.target.closest || !e.target.closest(".label")) hovered = null;
    stage.classList.toggle("hovering", !!hovered && !dragging);
  };
  const onUp = (e) => {
    if (!down) return;
    stage.classList.remove("drag");
    if (!dragging) {
      const s = pick(e);
      if (s) focus(s);
      else if (focused) unfocus();
    }
    down = null;
    dragging = false;
  };
  stage.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);

  function resize() {
    W = stage.clientWidth;
    H = stage.clientHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.fov = W < 760 ? 52 : 40;
    camera.updateProjectionMatrix();
    goal.dist = focused ? focusDist(focused) : overviewDist();
    layoutCards();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  resize();
  cam.dist = goal.dist;
  document.fonts?.ready.then(() => layoutCards());

  const v = new THREE.Vector3(), up = new THREE.Vector3(), wp = new THREE.Vector3();
  const project = (p) => { v.copy(p).project(camera); return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H, z: v.z }; };
  const place = (el, x, y) => (el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`);
  let last = performance.now(), raf = 0;

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const k = 1 - Math.pow(0.0025, dt);
    cam.yaw += (goal.yaw - cam.yaw) * k;
    cam.pitch += (goal.pitch - cam.pitch) * k;
    cam.dist += (goal.dist - cam.dist) * k;
    cam.target.lerp(goal.target, k);
    camera.position.set(
      cam.target.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
      cam.target.y + Math.sin(cam.pitch) * cam.dist,
      cam.target.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
    );
    camera.lookAt(cam.target);
    const ctr = center();
    shift.x += (ctr.x - W / 2 - shift.x) * k;
    shift.y += (ctr.y - H / 2 - shift.y) * k;
    camera.setViewOffset(W, H, -shift.x, -shift.y, W, H);

    const rootOn = focused === ROOT;
    ROOT.hover += ((hovered === ROOT && !focused ? 1 : 0) - ROOT.hover) * k;
    hubS.scale.setScalar(1.05 * (1 + ROOT.hover * 0.12));
    hubS.material.opacity += ((focused && !rootOn ? 0.12 : 1) - hubS.material.opacity) * k;
    ROOT.ring.material.opacity = ROOT.hover;
    if (launch) {
      launch.t = Math.min(1, launch.t + dt / 0.7);
      const t = launch.t;
      launch.sp.position.lerpVectors(launch.from, launch.to, t * t * (3 - 2 * t));
    }
    ALL.forEach((s) => {
      const inG = focused && focused.isGroup && focused.members.includes(s);
      const hv = (hovered === s || routed === s) && (!focused || inG) ? 1 : 0;
      s.hover += (hv - s.hover) * k;
      const dm = inG ? 0 : focused && focused !== s ? 1 : 0;
      s.dim += (dm - s.dim) * k;
      const sc = s.size * (1 + s.hover * 0.12);
      s.body.scale.set(sc, sc, 1);
      s.body.material.opacity = 1 - s.dim * 0.88;
      s.ring.material.opacity = s.hover;
    });
    const fd = focused ? (focused.isGroup ? 0.35 : 1) : 0;
    solidMat.opacity = 0.75 - fd * 0.6;
    dashMat.opacity = 0.45 - fd * 0.35;

    renderer.render(scene, camera);

    up.setFromMatrixColumn(camera.matrixWorld, 1);
    ALL.forEach((s) => {
      s.group.getWorldPosition(wp);
      const p = project(wp);
      v.copy(wp).addScaledVector(up, s.size * 0.5);
      const edge = ((1 - v.project(camera).y) / 2) * H;
      place(s.label, p.x - s.label.offsetWidth / 2, p.y + Math.abs(p.y - edge) + 6);
      s.label.style.visibility = p.z > 1 ? "hidden" : "visible";
      s.label.style.zIndex = s.label.classList.contains("dim") ? 0 : Math.round((1 - p.z) * 1000);
      s.label.classList.toggle("hot", hovered === s && (!focused || (focused.isGroup && focused.members.includes(s))));
    });
    GROUPS.forEach((g) => {
      wp.copy(g.tagPos).applyMatrix4(cluster.matrixWorld);
      const gp = project(wp);
      place(g.tag, gp.x - g.tag.offsetWidth / 2, gp.y - 12);
    });

    if (focused && cards.length && layout) {
      focused.group.getWorldPosition(wp);
      const c = project(wp);
      const show = now > cardsShownAt;
      let svg = "";
      cards.forEach((el, i) => {
        const q = layout.pos[i];
        el.style.transform = `translate(${Math.round(q.x - q.w / 2)}px,${Math.round(q.y - q.h / 2)}px) scale(${layout.sc})`;
        if (show && !el.classList.contains("in")) setTimeout(() => el.classList.add("in"), i * 70);
        if (show) svg += `<line x1="${c.x.toFixed(1)}" y1="${c.y.toFixed(1)}" x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}" stroke="#1c1b18" stroke-opacity=".5" stroke-width="1.5" stroke-dasharray="4 5"/>`;
      });
      wires.innerHTML = svg;
    }
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  return () => {
    cancelAnimationFrame(raf);
    clearTimeout(launchTimer);
    ro.disconnect();
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    stage.removeEventListener("pointerdown", onDown);
    disposables.forEach((d) => d.dispose());
    renderer.dispose();
    stage.innerHTML = "";
  };
}
