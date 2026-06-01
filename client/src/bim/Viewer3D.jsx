// client/src/bim/Viewer3D.jsx
// Renders the BIM model in 3D (three.js). Spaces extruded from footprints,
// colored by kind, with a ground grid and orbit controls. Reads the same model the 2D view does.
import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const KIND_HEX = { work: 0x56d4cf, meet: 0xe6a94e, social: 0x74e0a3, support: 0x8aa0b8, core: 0x586173 };

export default function Viewer3D({ model, height = 340 }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !model) return;

    const W = mount.clientWidth || 600;
    const H = height;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1116);

    const b = model.bounds();
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minY + b.maxY) / 2;
    const span = Math.max(b.wFt, b.hFt, 20);

    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 5000);
    camera.position.set(cx + span * 0.9, span * 1.1, cz + span * 1.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(cx, 0, cz);
    controls.enableDamping = true;
    controls.update();

    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(span, span * 1.5, span * 0.6);
    scene.add(dir);

    // ground grid
    const grid = new THREE.GridHelper(span * 3, Math.ceil(span * 3 / 5), 0x2a313a, 0x1a2029);
    grid.position.set(cx, 0, cz);
    scene.add(grid);

    const group = new THREE.Group();

    const extrude = (footprintFt, heightFt, hex, opacity) => {
      const shape = new THREE.Shape();
      footprintFt.forEach((p, i) => (i === 0 ? shape.moveTo(p[0], p[1]) : shape.lineTo(p[0], p[1])));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: heightFt, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2); // stand it up: plan XY -> world XZ, height along Y
      const mat = new THREE.MeshStandardMaterial({ color: hex, transparent: true, opacity, roughness: 0.8 });
      const mesh = new THREE.Mesh(geo, mat);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: hex }));
      group.add(mesh, edges);
    };

    (model.corridors || []).forEach((c) => extrude(c.footprintFt, 0.4, 0x3a4250, 0.85)); // thin floor slabs
    (model.spaces || []).forEach((s) => extrude(s.footprintFt, s.heightFt || 9, KIND_HEX[s.kind] || KIND_HEX.support, 0.45));
    (model.cores || []).forEach((c) => extrude(c.footprintFt, c.heightFt || 13, KIND_HEX.core, 0.9));
    (model.stairs || []).forEach((s) => extrude(s.footprintFt, 12, 0xc98b5a, 0.95));
    (model.columns || []).forEach((c) => {
      const g = new THREE.BoxGeometry(c.sizeFt, 11, c.sizeFt);
      const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x586173 }));
      mesh.position.set(c.xFt, 5.5, c.yFt);
      group.add(mesh);
    });

    scene.add(group);

    let raf;
    const animate = () => { raf = requestAnimationFrame(animate); controls.update(); renderer.render(scene, camera); };
    animate();

    const onResize = () => {
      const w = mount.clientWidth || W;
      camera.aspect = w / H; camera.updateProjectionMatrix(); renderer.setSize(w, H);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      renderer.dispose();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, [model, height]);

  return <div ref={mountRef} style={{ width: "100%", height, borderRadius: 8, overflow: "hidden", border: "1px solid var(--line)" }} />;
}
