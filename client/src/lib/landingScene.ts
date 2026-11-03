// @ts-nocheck -- imperative Three.js + DOM scene ported from the landing mockup; React only mounts it.
import * as THREE from "three";
import { DEV_DEFS, ICON, iconSvg, MEDIA_DEFS, TOOL_DEFS } from "./nodeCloud";

export interface LandingOptions {
  /** Called once the orange wipe covers the screen; the caller swaps in the home screen. */
  onEnter: () => void;
}

const FLOOR = -2.7;

/** Scene colors per theme, matching the page's light and dark tokens in landing.css. */
const PALETTES = {
  light: { desk: "#f6f5ef", fine: 0xe4e1d6, bold: 0xd6d3c6, paper: 0xfffefb, ink: "#1c1b18", foot: 0x2a2925, shadow: 0xdcd9cd },
  dark: { desk: "#191815", fine: 0x24231f, bold: 0x2e2c27, paper: 0x2b2a26, ink: "#eeece4", foot: 0xeeece4, shadow: 0x0f0e0c },
};

/** Builds the landing hero's 3D scene and the scroll reveals inside `root`, and returns a cleanup function. */
export function mountLanding(root: HTMLElement, opts: LandingOptions): () => void {
  const $ = (s) => root.querySelector(s);
  const hero = $(".hero"), ov = $(".ov"), ann = $(".ann"), bar = $(".progress");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cleanups = [];
  const on = (el, ev, fn, o?) => {
    el.addEventListener(ev, fn, o);
    cleanups.push(() => el.removeEventListener(ev, fn, o));
  };

  // ---- scroll reveals: shown once a block is well into view, reset instantly once it is fully off screen ----
  if (!reduce && "IntersectionObserver" in window) {
    root.classList.add("rv-on");
    const mark = (el, show) => [el, ...el.querySelectorAll(".rv")].forEach((c) => c.classList.toggle("seen", show));
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (!e.isIntersecting || e.target.classList.contains("seen")) return;
          e.target.classList.remove("rv-snap");
          void e.target.offsetWidth;
          mark(e.target, true);
        }),
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );
    const away = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting || !e.target.classList.contains("seen")) return;
          e.target.classList.add("rv-snap");
          mark(e.target, false);
        }),
      { threshold: 0 },
    );
    const watch = (el) => (io.observe(el), away.observe(el));
    const rv = (el, d) => {
      el.classList.add("rv");
      if (d != null) el.style.setProperty("--d", `${d}s`);
    };
    // clipped headings never intersect, so each heading block is watched as a whole
    root.querySelectorAll(".head").forEach((h) => {
      h.querySelectorAll(".eyebrow,h2,.sub,.hand").forEach((el, i) => rv(el, i * 0.1));
      watch(h);
    });
    root.querySelectorAll(".sheet").forEach((el, i) => {
      el.style.setProperty("--in-rot", `${i % 2 ? 5 : -5}deg`);
      el.querySelectorAll(".tools li").forEach((li, k) => li.style.setProperty("--i", k));
      rv(el, i * 0.14);
      watch(el);
    });
    const steps = $(".steps");
    steps.querySelectorAll(".step").forEach((st, i) => {
      st.style.setProperty("--d", `${0.2 + i * 0.45}s`);
      [...st.children].forEach((c, k) => c.style.setProperty("--k", k));
    });
    steps.querySelectorAll(".mini s").forEach((s, i) => s.style.setProperty("--i", i));
    steps.querySelectorAll(".live .av").forEach((a, i) => a.style.setProperty("--i", i));
    watch(steps);
    const cta = $(".cta");
    rv(cta);
    watch(cta);
    cleanups.push(() => (io.disconnect(), away.disconnect()));
  }
  const progress = () => {
    const m = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${m > 0 ? Math.min(1, scrollY / m) : 0})`;
  };
  on(window, "scroll", progress, { passive: true });
  progress();

  // anchor links scroll smoothly without changing the address
  root.querySelectorAll('a[href^="#"]').forEach((a) =>
    on(a, "click", (e) => {
      const t = root.querySelector(a.getAttribute("href"));
      if (!t) return;
      e.preventDefault();
      t.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
    }),
  );

  const go = () => goToNode();
  root.querySelectorAll("[data-go]").forEach((b) => on(b, "click", go));

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    hero.insertAdjacentHTML("afterbegin", '<div class="nogl">The 3D scene needs WebGL.</div>');
    return () => cleanups.forEach((c) => c());
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  hero.insertBefore(renderer.domElement, hero.firstChild);
  const disposables = [];

  // Follows the root's data-theme; applyTheme below recolors everything when it flips.
  const paletteOf = () => PALETTES[root.dataset.theme === "dark" ? "dark" : "light"];
  let pal = paletteOf();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(pal.desk);
  scene.fog = new THREE.Fog(pal.desk, 12, 30);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  const world = new THREE.Group();
  scene.add(world);

  // lights for the toon-shaded paper stroke
  scene.add(new THREE.AmbientLight(0xffffff, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(-4, 7, 6);
  scene.add(sun);
  const grad = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter;
  grad.needsUpdate = true;
  disposables.push(grad);

  // ---- graph-paper floor in perspective ----
  const floorLines = (() => {
    const fine = [], bold = [], N = 40, S = 0.7;
    for (let i = -N; i <= N; i++) (i % 5 === 0 ? bold : fine).push(i * S, 0, -N * S, i * S, 0, N * S, -N * S, 0, i * S, N * S, 0, i * S);
    return [[fine, pal.fine], [bold, pal.bold]].map(([a, c]) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(a, 3));
      const m = new THREE.LineBasicMaterial({ color: c });
      disposables.push(g, m);
      const l = new THREE.LineSegments(g, m);
      l.position.y = FLOOR;
      scene.add(l);
      return l;
    });
  })();

  // ---- the logo's one-stroke n, built from the same path as Logo.tsx (M10 23V15a6 6 0 0 1 12 0v8) ----
  const S = 0.3;
  const P = (x, y) => new THREE.Vector3((x - 16) * S, (16 - y) * S, 0);
  const pts = [];
  for (let i = 0; i <= 16; i++) pts.push(P(10, 23 - (8 * i) / 16));
  for (let i = 1; i <= 40; i++) {
    const a = Math.PI - (Math.PI * i) / 40;
    pts.push(P(16 + 6 * Math.cos(a), 15 - 6 * Math.sin(a)));
  }
  for (let i = 1; i <= 16; i++) pts.push(P(22, 15 + (8 * i) / 16));
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  const SEG = 220, RAD = 24, TR = 1.3 * S, NR = 2.8 * S;
  const tubeG = new THREE.TubeGeometry(curve, SEG, TR, RAD, false);
  const hullG = new THREE.TubeGeometry(curve, SEG, TR + 0.07, RAD, false);
  const paperMat = new THREE.MeshToonMaterial({ color: pal.paper, gradientMap: grad });
  const inkMat = new THREE.MeshBasicMaterial({ color: pal.ink, side: THREE.BackSide });
  disposables.push(tubeG, hullG, paperMat, inkMat);
  const nGroup = new THREE.Group();
  world.add(nGroup);
  const hull = new THREE.Mesh(hullG, inkMat);
  nGroup.add(new THREE.Mesh(tubeG, paperMat), hull);
  const sphereG = new THREE.SphereGeometry(NR, 40, 28), sphereHullG = new THREE.SphereGeometry(NR + 0.07, 40, 28);
  disposables.push(sphereG, sphereHullG);
  const node = (color, pos) => {
    const g = new THREE.Group();
    g.position.copy(pos);
    const m = new THREE.MeshToonMaterial({ color, gradientMap: grad });
    disposables.push(m);
    g.add(new THREE.Mesh(sphereG, m), new THREE.Mesh(sphereHullG, inkMat));
    g.scale.setScalar(0.001);
    nGroup.add(g);
    return g;
  };
  const footL = node(pal.foot, P(10, 23)), footR = node(0xea580c, P(22, 23));

  // flat hard shadow on the desk, projected along the light; the grid draws over it so the paper shows through
  const Ld = new THREE.Vector3(-0.35, -1, -0.45), h = FLOOR - 0.01;
  const proj = new THREE.Matrix4().set(1, -Ld.x / Ld.y, 0, (Ld.x / Ld.y) * h, 0, 0, 0, h, 0, -Ld.z / Ld.y, 1, (Ld.z / Ld.y) * h, 0, 0, 0, 1);
  const shMat = new THREE.MeshBasicMaterial({ color: pal.shadow, side: THREE.DoubleSide });
  disposables.push(shMat);
  const shadows = [hull, footL.children[1], footR.children[1]].map((mesh) => {
    const s = new THREE.Mesh(mesh.geometry, shMat);
    s.matrixAutoUpdate = false;
    s.renderOrder = -1;
    scene.add(s);
    return [s, mesh];
  });

  // ---- tool stickers: flat fill, ink outline, hard ink shadow (same textures as the home screen) ----
  // Each sticker keeps its canvas so a theme change can redraw the ink outline and shadow in place.
  const stickers = [];
  function sticker(fill, icon, o = {}) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    disposables.push(t);
    const draw = () => {
      const g = c.getContext("2d");
      g.clearRect(0, 0, c.width, c.height);
      const cx = 120, cy = 120, r = o.r || 92, sh = o.shadow ?? 12;
      if (sh) {
        g.fillStyle = pal.ink;
        g.beginPath(); g.arc(cx + sh, cy + sh, r, 0, 7); g.fill();
      }
      g.fillStyle = fill;
      g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
      g.lineWidth = o.line || 7; g.strokeStyle = pal.ink; g.stroke();
      if (icon) {
        const s = 4.2;
        g.save(); g.translate(cx - 12 * s, cy - 12 * s); g.scale(s, s);
        g.strokeStyle = "#fff"; g.lineWidth = 2; g.lineCap = "round"; g.lineJoin = "round";
        g.stroke(new Path2D(ICON[icon])); g.restore();
      }
      t.needsUpdate = true;
    };
    draw();
    stickers.push(draw);
    return t;
  }
  function sprite(tex) {
    const m = new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.05, fog: false });
    disposables.push(m);
    return new THREE.Sprite(m);
  }
  const blobMat = new THREE.MeshBasicMaterial({ color: pal.shadow });
  const blobG = new THREE.CircleGeometry(0.36, 24);
  disposables.push(blobMat, blobG);
  const RINGS = [
    { r: 3.1, tilt: 0.42, sp: 0.11, y: 0.3 },
    { r: 4.25, tilt: -0.3, sp: -0.075, y: 0.4 },
    { r: 5.3, tilt: 0.2, sp: 0.05, y: 0.7 },
  ];
  const ALL = [TOOL_DEFS, DEV_DEFS, MEDIA_DEFS].flatMap((list, ring) =>
    list.map((d, idx) => ({ ...d, ring, size: ring ? 0.74 : 1.25, ph: (idx / list.length) * Math.PI * 2 + ring * 0.9 })),
  );
  ALL.forEach((t) => {
    t.sp = sprite(sticker(t.color, t.id, { line: t.ring ? 9 : 7, shadow: t.ring ? 14 : 12 }));
    t.sp.userData.tool = t;
    world.add(t.sp);
    t.blob = new THREE.Mesh(blobG, blobMat);
    t.blob.rotation.x = -Math.PI / 2;
    t.blob.renderOrder = -1;
    scene.add(t.blob);
    t.p = new THREE.Vector3();
    t.bump = 0;
    const c = document.createElement("div");
    c.className = "chip";
    c.style.setProperty("--c", t.color);
    c.innerHTML = `<i>${iconSvg(t.id)}</i>${t.name}`;
    ov.appendChild(c);
    t.chip = c;
  });
  const pulse = sprite(sticker("#ea580c", null, { r: 70, line: 16, shadow: 0 }));
  pulse.scale.set(0.3, 0.3, 1);
  pulse.visible = false;
  world.add(pulse);

  // wires from the orange foot to every tool, rebuilt each frame
  const wpos = new Float32Array(ALL.length * 6), wg = new THREE.BufferGeometry();
  wg.setAttribute("position", new THREE.BufferAttribute(wpos, 3));
  const wireMat = new THREE.LineBasicMaterial({ color: pal.ink, transparent: true, opacity: 0.3, fog: false });
  disposables.push(wg, wireMat);
  world.add(new THREE.LineSegments(wg, wireMat));

  function applyTheme() {
    const next = paletteOf();
    if (next === pal) return;
    pal = next;
    scene.background.set(pal.desk);
    scene.fog.color.set(pal.desk);
    floorLines[0].material.color.set(pal.fine);
    floorLines[1].material.color.set(pal.bold);
    paperMat.color.set(pal.paper);
    inkMat.color.set(pal.ink);
    footL.children[0].material.color.set(pal.foot);
    shMat.color.set(pal.shadow);
    blobMat.color.set(pal.shadow);
    wireMat.color.set(pal.ink);
    stickers.forEach((draw) => draw());
  }
  const themeWatch = new MutationObserver(applyTheme);
  themeWatch.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  cleanups.push(() => themeWatch.disconnect());

  // ---- state ----
  const t0 = performance.now();
  let last = t0, clock = 0, raf = 0, W = 0, H = 0, scrollP = 0, visible = true, hovered = null, flight = null, pulseState = null, nextPulse = 3.2;
  const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
  const look = new THREE.Vector3();
  const footRW = new THREE.Vector3(), tmp = new THREE.Vector3();

  const wide = () => W >= 760 && W / H > 1.05;
  const anchor = () => (wide() ? new THREE.Vector3(0, 0.15, 0) : new THREE.Vector3(0, 2.3, 0));
  const landingCam = () => ({
    pos: new THREE.Vector3(mouse.sx * 0.6, 1.3 + scrollP * 2.2 - mouse.sy * 0.35, (wide() ? (W >= 1100 ? 13.2 : 16.5) : 15.5) + scrollP * 2),
    look: new THREE.Vector3(0, -0.1 + scrollP * 0.6 + (wide() ? 0 : -0.6), 0),
  });
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const back = (x) => 1 + 2.9 * Math.pow(x - 1, 3) + 1.9 * Math.pow(x - 1, 2);
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const screen = (v) => {
    tmp.copy(v).project(camera);
    return { x: ((tmp.x + 1) / 2) * W, y: ((1 - tmp.y) / 2) * H, z: tmp.z };
  };

  function resize() {
    W = hero.clientWidth;
    H = hero.clientHeight;
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.fov = W < 760 ? 46 : 38;
    // side layout: shift the scene right of the headline instead of moving the n off-center
    if (wide()) camera.setViewOffset(W, H, -W * (W >= 1100 ? 0.21 : 0.23), 0, W, H);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(hero);
  resize();
  const start = landingCam();
  camera.position.copy(start.pos);
  look.copy(start.look);

  function landingPos(t, out) {
    const o = RINGS[t.ring], a = t.ph + clock * o.sp, r = o.r * (wide() ? 0.88 : 1);
    return out.set(Math.cos(a) * r, o.y + Math.sin(a) * r * Math.sin(o.tilt) * 0.9, Math.sin(a) * r * Math.cos(o.tilt) * 0.75 - 1.2).add(anchor());
  }

  // ---- interaction ----
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pickables = [...ALL.map((t) => t.sp), footR.children[0]];
  function pick(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables)[0];
    return hit ? hit.object.userData.tool || "foot" : null;
  }
  on(hero, "pointermove", (e) => {
    const r = hero.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = ((e.clientY - r.top) / r.height) * 2 - 1;
    hovered = e.target === renderer.domElement ? pick(e) : null;
    renderer.domElement.style.cursor = hovered ? "pointer" : "";
  });
  on(hero, "pointerleave", () => {
    mouse.x = mouse.y = 0;
    hovered = null;
  });
  on(renderer.domElement, "click", (e) => pick(e) && goToNode());
  on(window, "scroll", () => (scrollP = clamp01(scrollY / Math.max(1, H))), { passive: true });
  const vis = new IntersectionObserver((es) => (visible = es[0].isIntersecting));
  vis.observe(hero);
  cleanups.push(() => vis.disconnect());

  // ---- go to node: fly into the orange foot, wipe the screen orange, then hand over to the home screen ----
  function goToNode() {
    if (!renderer) return opts.onEnter();
    if (flight) return;
    scrollTo({ top: 0, behavior: "auto" });
    scrollP = 0;
    root.classList.add("going");
    footR.getWorldPosition(footRW);
    flight = { k: reduce ? 1 : 0, fromPos: camera.position.clone(), fromLook: look.clone(), to: footRW.clone(), wiped: false };
  }
  function wipeAndEnter() {
    const fs = screen(footRW);
    const wipe = document.createElement("div");
    // lives on <body> so it outlasts this page and opens up again over the home screen
    wipe.style.cssText = `position:fixed;inset:0;z-index:100;background:#ea580c;pointer-events:none;clip-path:circle(0px at ${fs.x}px ${fs.y}px)`;
    document.body.appendChild(wipe);
    const grow = reduce ? 0 : 500;
    requestAnimationFrame(() => {
      wipe.style.transition = `clip-path ${grow}ms cubic-bezier(.5,0,.3,1)`;
      wipe.style.clipPath = `circle(150% at ${fs.x}px ${fs.y}px)`;
    });
    setTimeout(() => {
      opts.onEnter();
      // the home screen's hub sits in the middle of its stage, below the 56px header
      const hx = innerWidth / 2, hy = 56 + (innerHeight - 56) / 2;
      wipe.style.transition = "none";
      wipe.style.clipPath = `circle(150% at ${hx}px ${hy}px)`;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          wipe.style.transition = `clip-path ${reduce ? 0 : 650}ms cubic-bezier(.6,0,.2,1)`;
          wipe.style.clipPath = `circle(0px at ${hx}px ${hy}px)`;
          setTimeout(() => wipe.remove(), reduce ? 0 : 700);
        }),
      );
    }, grow + 20);
  }

  // ---- frame loop ----
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!visible && !flight) return;
    clock += dt;
    const T = reduce ? 10 : (now - t0) / 1000;
    mouse.sx += (mouse.x - mouse.sx) * 0.05;
    mouse.sy += (mouse.y - mouse.sy) * 0.05;

    // 1) the stroke draws itself from the left foot, 2) the orange foot pops, 3) wires shoot out to every tool
    const draw = ease(clamp01((T - 0.35) / 1.25));
    footL.scale.setScalar(Math.max(0.001, back(clamp01((T - 0.15) / 0.45))));
    footR.scale.setScalar(flight ? 1 + ease(clamp01(flight.k * 1.4)) * 0.5 : Math.max(0.001, back(clamp01((T - 1.5) / 0.5))));
    const cnt = Math.floor(SEG * draw) * RAD * 6;
    tubeG.setDrawRange(0, cnt);
    hullG.setDrawRange(0, cnt);
    nGroup.position.copy(anchor());
    nGroup.position.y += Math.sin(clock * 1.1) * 0.06;
    nGroup.rotation.y = Math.sin(clock * 0.45) * 0.32 + mouse.sx * 0.45;
    nGroup.rotation.x = -mouse.sy * 0.18 + Math.sin(clock * 0.6) * 0.04;
    nGroup.updateMatrixWorld();
    shadows.forEach(([s, m]) => s.matrix.multiplyMatrices(proj, m.matrixWorld));
    footR.getWorldPosition(footRW);

    if (flight) {
      flight.k = Math.min(1, flight.k + dt / 1.15);
      const e = ease(flight.k);
      camera.position.lerpVectors(flight.fromPos, tmp.copy(flight.to).add(new THREE.Vector3(0, 0, 0.9)), e);
      look.lerpVectors(flight.fromLook, flight.to, e);
      if (flight.k > 0.55 && !flight.wiped) {
        flight.wiped = true;
        camera.lookAt(look);
        camera.updateMatrixWorld();
        wipeAndEnter();
      }
    } else {
      const c = landingCam();
      camera.position.lerp(c.pos, 0.08);
      look.lerp(c.look, 0.08);
    }
    camera.lookAt(look);
    camera.updateMatrixWorld();

    let n = 0;
    ALL.forEach((t, k) => {
      const born = clamp01((T - 1.85 - k * 0.07) / 0.5);
      landingPos(t, t.p);
      // wires grow out of the orange foot just before each sticker lands
      const w = clamp01((T - 1.75 - k * 0.07) / 0.35);
      const tip = tmp.copy(footRW).lerp(t.p, ease(w));
      t.sp.position.copy(t.p);
      t.bump = Math.max(0, t.bump - dt * 2.2);
      const sc = t.size * 0.72 * Math.max(0.001, back(born)) * (1 + t.bump * 0.35) * (hovered === t ? 1.15 : 1);
      t.sp.scale.set(sc, sc, 1);
      t.blob.position.set(t.p.x + 0.11 * (t.p.y - FLOOR), FLOOR - 0.005, t.p.z + 0.16 * (t.p.y - FLOOR));
      t.blob.scale.setScalar(Math.max(0.001, born) * t.size * 0.8);
      if (w > 0) wpos.set([footRW.x, footRW.y, footRW.z, tip.x, tip.y, tip.z], 6 * n++);
      const s = screen(t.p);
      const show = (hovered === t || t.bump > 0.15) && s.z < 1 && !flight;
      t.chip.classList.toggle("on", show);
      if (show) t.chip.style.transform = `translate(${s.x + sc * 22}px,${s.y - 14}px)`;
    });
    wg.setDrawRange(0, n * 2);
    wg.attributes.position.needsUpdate = true;

    // every couple of seconds an orange pulse runs from the orange foot to a tool, which says its name
    if (!flight && T > 3) {
      nextPulse -= dt;
      if (nextPulse <= 0 && !pulseState) {
        pulseState = { t: ALL[Math.floor(Math.random() * ALL.length)], k: 0 };
        pulse.visible = true;
        nextPulse = 1.3 + Math.random() * 0.9;
      }
    }
    if (pulseState) {
      pulseState.k += dt / 0.7;
      pulse.position.copy(footRW).lerp(pulseState.t.p, ease(Math.min(1, pulseState.k)));
      if (pulseState.k >= 1 || flight) {
        if (!flight) pulseState.t.bump = 1;
        pulseState = null;
        pulse.visible = false;
      }
    }

    // "start here" note beside the orange foot
    const fs = screen(footRW);
    ann.classList.toggle("on", T > 2.2 && !flight);
    ann.style.transform = wide() ? `translate(${fs.x + NR * 40}px,${fs.y + 6}px)` : `translate(${fs.x + 22}px,${fs.y + 4}px)`;

    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    cleanups.forEach((c) => c());
    disposables.forEach((d) => d.dispose());
    renderer.dispose();
    renderer.domElement.remove();
    ALL.forEach((t) => t.chip.remove());
  };
}
