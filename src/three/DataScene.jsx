import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/*
  Zuari Insights 3D scene — "data constellation"
  - glossy azure core with gold orbit rings (same language as the main ZIBIL hero)
  - radial ring of 3D bar columns that rise in like a chart
  - drifting particle field + mouse parallax
  variant: 'hero' (landing), 'compact' (upload screens), 'band' (dashboard header)
  Pauses when off-screen, respects prefers-reduced-motion, cleans up WebGL on unmount.
*/

const GOLD = 0xd8b26a;
const AZURE = 0x2f7bff;
const TEAL = 0x19b9a6;
const AMBER = 0xe9962f;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

export default function DataScene({ variant = 'hero', accent = AZURE, className, style }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !hasWebGL()) return undefined;

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const cfg = {
      hero: { bars: 28, radius: 2.15, particles: 420, camZ: 7.2, scale: 1 },
      compact: { bars: 18, radius: 1.9, particles: 220, camZ: 7.0, scale: 0.9 },
      band: { bars: 16, radius: 1.8, particles: 160, camZ: 6.4, scale: 0.85 },
    }[variant] || {};

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0.9, cfg.camZ);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const key = new THREE.DirectionalLight(0xffffff, 1.6); key.position.set(3, 5, 4); scene.add(key);
    const rimL = new THREE.PointLight(GOLD, 18, 12); rimL.position.set(-3, 1.5, 2); scene.add(rimL);
    const blueL = new THREE.PointLight(accent, 22, 14); blueL.position.set(2.5, -1, 3); scene.add(blueL);

    const root = new THREE.Group();
    root.scale.setScalar(cfg.scale);
    root.rotation.x = 0.32;
    scene.add(root);

    const disposables = [];
    const track = (o) => { disposables.push(o); return o; };

    // ---- Core orb ----
    const core = new THREE.Mesh(
      track(new THREE.IcosahedronGeometry(0.78, 4)),
      track(new THREE.MeshPhysicalMaterial({ color: 0x0f3a7a, metalness: 0.35, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08, emissive: 0x0a3a8c, emissiveIntensity: 0.5 }))
    );
    root.add(core);
    const wire = new THREE.Mesh(
      track(new THREE.IcosahedronGeometry(0.98, 1)),
      track(new THREE.MeshBasicMaterial({ color: 0x5bc8f5, wireframe: true, transparent: true, opacity: 0.28 }))
    );
    root.add(wire);

    // ---- Gold orbit rings ----
    const ringMat = track(new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.22, envMapIntensity: 1.4 }));
    const ring1 = new THREE.Mesh(track(new THREE.TorusGeometry(1.32, 0.022, 16, 160)), ringMat);
    ring1.rotation.x = Math.PI / 2.4;
    const ring2 = new THREE.Mesh(track(new THREE.TorusGeometry(1.52, 0.014, 16, 160)), ringMat);
    ring2.rotation.set(Math.PI / 2.9, 0.6, 0);
    root.add(ring1, ring2);
    const satGeo = track(new THREE.SphereGeometry(0.07, 24, 24));
    const sat1 = new THREE.Mesh(satGeo, ringMat); ring1.add(sat1);
    const sat2 = new THREE.Mesh(satGeo, track(new THREE.MeshStandardMaterial({ color: TEAL, emissive: TEAL, emissiveIntensity: 0.6 }))); ring2.add(sat2);

    // ---- Radial bar chart ----
    const barGroup = new THREE.Group();
    root.add(barGroup);
    const palette = [AZURE, TEAL, GOLD, AMBER];
    const bars = [];
    const barGeo = track(new THREE.BoxGeometry(0.16, 1, 0.16));
    barGeo.translate(0, 0.5, 0);
    const mats = palette.map((c) => track(new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.25, roughness: 0.25, clearcoat: 0.8, emissive: c, emissiveIntensity: 0.12 })));
    for (let i = 0; i < cfg.bars; i += 1) {
      const a = (i / cfg.bars) * Math.PI * 2;
      const h = 0.25 + Math.abs(Math.sin(i * 1.7) * 0.9) + (i % 5 === 0 ? 0.45 : 0);
      const m = new THREE.Mesh(barGeo, mats[i % mats.length]);
      m.position.set(Math.cos(a) * cfg.radius, -0.95, Math.sin(a) * cfg.radius);
      m.scale.y = 0.001;
      m.userData = { target: h, phase: i * 0.37 };
      barGroup.add(m);
      bars.push(m);
    }
    // base disc
    const disc = new THREE.Mesh(
      track(new THREE.RingGeometry(cfg.radius - 0.32, cfg.radius + 0.32, 96)),
      track(new THREE.MeshBasicMaterial({ color: 0x2f7bff, transparent: true, opacity: 0.12, side: THREE.DoubleSide }))
    );
    disc.rotation.x = -Math.PI / 2; disc.position.y = -0.96;
    root.add(disc);

    // ---- Particles ----
    const pGeo = track(new THREE.BufferGeometry());
    const pos = new Float32Array(cfg.particles * 3);
    for (let i = 0; i < cfg.particles; i += 1) {
      const r = 2.6 + Math.random() * 3.2;
      const t = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 4;
      pos[i * 3] = Math.cos(t) * r; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.sin(t) * r;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const particles = new THREE.Points(pGeo, track(new THREE.PointsMaterial({ color: 0xbcd3ff, size: 0.028, transparent: true, opacity: 0.75, depthWrite: false })));
    scene.add(particles);

    // ---- Sizing ----
    const resize = () => {
      const w = mount.clientWidth || 1; const h = mount.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(mount);

    // ---- Interaction ----
    const target = { x: 0, y: 0 };
    const onMove = (e) => {
      const r = mount.getBoundingClientRect();
      target.x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      target.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    // ---- Loop (paused off-screen) ----
    let visible = true;
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { threshold: 0.01 });
    io.observe(mount);
    const clock = new THREE.Clock();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!visible) return;
      const t = clock.getElapsedTime();
      const speed = reduce ? 0 : 1;
      root.rotation.y += 0.0032 * speed;
      root.rotation.x += ((0.32 + target.y * 0.12) - root.rotation.x) * 0.04;
      root.position.x += ((target.x * 0.18) - root.position.x) * 0.04;
      core.rotation.y = t * 0.25 * speed;
      wire.rotation.y = -t * 0.18 * speed; wire.rotation.z = t * 0.07 * speed;
      ring1.rotation.z = t * 0.35 * speed; ring2.rotation.z = -t * 0.28 * speed;
      sat1.position.set(1.32, 0, 0); sat2.position.set(-1.52, 0, 0);
      particles.rotation.y = -t * 0.02 * speed;
      bars.forEach((b) => {
        const { target: h, phase } = b.userData;
        const goal = reduce ? h : h * (0.82 + 0.18 * Math.sin(t * 1.4 + phase));
        b.scale.y += (goal - b.scale.y) * 0.06;
      });
      renderer.render(scene, camera);
    };
    if (reduce) { bars.forEach((b) => { b.scale.y = b.userData.target; }); }
    tick();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect(); ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      disposables.forEach((d) => d.dispose?.());
      envTex.dispose(); pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [variant, accent]);

  return <div ref={mountRef} className={className} style={{ width: '100%', height: '100%', ...style }} aria-hidden="true" />;
}
