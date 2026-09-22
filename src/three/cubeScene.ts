/**
 * The 3D cube.
 *
 * The 26 visible cubies live at fixed lattice points and their stickers are
 * recoloured from a facelet string. To animate a turn we temporarily reparent
 * the nine cubies of that layer under a pivot, spin the pivot, then drop the
 * rotation and recolour from the new state. Because a face turn maps its layer
 * onto itself, the recoloured cube is pixel-identical to the rotated one, so
 * the swap is invisible - and we never have to track which mesh is which piece.
 */

import * as THREE from 'three';
import { FACE_COLORS, FACE_NAMES, MOVE_FACE, MOVE_POWER } from '../cube/defs';
import { FACE_NORMAL, dragMove, faceletAt, type Vec3 } from '../cube/geometry';

const CUBIE_SIZE = 0.96;
const STICKER_INSET = 0.085;
const STICKER_LIFT = 0.503;

export interface CubeSceneOptions {
  /** Called when the user drags a layer round. */
  onUserMove?: (move: number) => void;
  /** Called when the user clicks a sticker without dragging. */
  onStickerPick?: (facelet: number | null) => void;
  /** Called as the pointer passes over stickers. */
  onStickerHover?: (facelet: number | null) => void;
  /** Called when an animated move finishes. */
  onMoveComplete?: (move: number) => void;
  background?: string;
  interactive?: boolean;
}

interface Cubie {
  group: THREE.Group;
  position: Vec3;
  stickers: { mesh: THREE.Mesh; facelet: number }[];
}

/**
 * How far a de-emphasised sticker is mixed towards the plastic body colour.
 *
 * This used to be 0.82, which washed every unaffected sticker out to a single
 * near-white beige - they read as blank, not as quiet. A sticker must always
 * remain recognisably its own colour, so the mix is deliberately partial.
 */
const DIM_MIX = 0.45;

function roundedSquare(size: number, radius: number): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  const h = size / 2;
  const r = Math.min(radius, h);
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h);
  s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r);
  s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(-h + r, h);
  s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, -h + r);
  s.quadraticCurveTo(-h, -h, -h + r, -h);
  return new THREE.ShapeGeometry(s, 8);
}

/** One sticker as the renderer currently has it painted. */
export interface InspectedSticker {
  facelet: number;
  /** The face letter the logical state says belongs in this slot. */
  face: string;
  /** True when emphasis is active and this sticker is not in the set. */
  dimmed: boolean;
  painted: string;
  /** What `painted` must equal, dimming included. */
  expected: string;
  /** The undimmed colour, for checking that the hue survived. */
  base: string;
}

export class CubeScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private root = new THREE.Group();
  private pivot = new THREE.Group();
  private cubies: Cubie[] = [];
  private raycaster = new THREE.Raycaster();
  private stickerMeshes: THREE.Mesh[] = [];

  private facelets = 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB';
  private turning: number | null = null;
  private lastTurn: number | null = null;
  private readonly axis = new THREE.Vector3();

  private yaw = 0.62;
  private pitch = 0.48;
  private targetYaw = 0.62;
  private targetPitch = 0.48;
  // Far enough back that the whole cube, corners included, sits inside the
  // frame at the default 32 degree field of view.
  private distance = 10.2;

  private emphasis: Set<number> | null = null;
  private selected: number | null = null;
  private marker: THREE.Mesh | null = null;
  private disposed = false;
  private resizeObserver: ResizeObserver;
  private clock = new THREE.Clock();

  constructor(private container: HTMLElement, private opts: CubeSceneOptions = {}) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth || 400, container.clientHeight || 400);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);

    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(5, 8, 7);
    const fill = new THREE.DirectionalLight(0xffffff, 0.75);
    fill.position.set(-6, 2, -5);
    const rim = new THREE.DirectionalLight(0xffffff, 0.5);
    rim.position.set(0, -6, 3);
    this.scene.add(key, fill, rim, new THREE.AmbientLight(0xffffff, 1.35));

    this.scene.add(this.root);
    this.root.add(this.pivot);
    this.buildCubies();
    this.applyColors();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    if (opts.interactive !== false) this.attachPointerHandlers();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  /* ----------------------------------------------------------- building --- */

  private buildCubies(): void {
    // Light warm grey rather than white: a white body makes the white stickers
    // disappear, which is the one thing the reference cube never does.
    const body = new THREE.MeshStandardMaterial({
      color: 0xd6d1c2, roughness: 0.68, metalness: 0.01,
    });
    const geom = new THREE.BoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE);
    const stickerGeom = roundedSquare(CUBIE_SIZE - STICKER_INSET * 2, 0.14);

    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue;
          const group = new THREE.Group();
          group.position.set(x, y, z);
          const mesh = new THREE.Mesh(geom, body);
          group.add(mesh);

          const stickers: Cubie['stickers'] = [];
          for (let f = 0; f < 6; f++) {
            const n = FACE_NORMAL[f];
            const outward = (n[0] !== 0 && n[0] === x) || (n[1] !== 0 && n[1] === y) || (n[2] !== 0 && n[2] === z);
            if (!outward) continue;
            const facelet = faceletAt([x, y, z], n);
            if (facelet < 0) continue;
            const material = new THREE.MeshStandardMaterial({
              color: new THREE.Color(FACE_COLORS[FACE_NAMES[f]]),
              roughness: 0.45, metalness: 0.0,
            });
            const s = new THREE.Mesh(stickerGeom, material);
            s.position.set(n[0] * STICKER_LIFT, n[1] * STICKER_LIFT, n[2] * STICKER_LIFT);
            if (n[0] !== 0) s.rotation.y = n[0] > 0 ? Math.PI / 2 : -Math.PI / 2;
            else if (n[1] !== 0) s.rotation.x = n[1] > 0 ? -Math.PI / 2 : Math.PI / 2;
            else if (n[2] < 0) s.rotation.y = Math.PI;
            s.userData = { facelet, cubie: [x, y, z] };
            group.add(s);
            stickers.push({ mesh: s, facelet });
            this.stickerMeshes.push(s);
          }
          this.root.add(group);
          this.cubies.push({ group, position: [x, y, z], stickers });
        }
      }
    }
  }

  private static readonly BODY = new THREE.Color(0xd6d1c2);

  private applyColors(): void {
    const body = CubeScene.BODY;
    for (const cubie of this.cubies) {
      for (const sticker of cubie.stickers) {
        const face = this.facelets[sticker.facelet] as keyof typeof FACE_COLORS;
        const mat = sticker.mesh.material as THREE.MeshStandardMaterial;
        mat.color.set(FACE_COLORS[face] ?? '#2b2b2b');
        if (this.emphasis && !this.emphasis.has(sticker.facelet)) {
          mat.color.lerp(body, DIM_MIX);
        }
      }
    }
    this.placeMarker();
  }

  /**
   * Fade every sticker except these, so a move's reach is visible on the cube
   * as well as on the map.
   */
  setEmphasis(facelets: Iterable<number> | null): void {
    this.emphasis = facelets ? new Set(facelets) : null;
    this.applyColors();
  }

  setSelected(facelet: number | null): void {
    this.selected = facelet;
    this.applyColors();
  }

  /**
   * A ring around the picked sticker. One mesh, reused: building a fresh
   * geometry and material on every repaint leaked both, once per move. It sits
   * a hair *below* the sticker with depth writing off, so it shows as a border
   * and can never occlude the colour it is marking.
   */
  private placeMarker(): void {
    if (this.selected === null) {
      if (this.marker) this.marker.visible = false;
      return;
    }
    if (!this.marker) {
      const geom = roundedSquare(CUBIE_SIZE - STICKER_INSET * 2 + 0.12, 0.17);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x1c6b3f, side: THREE.DoubleSide, depthWrite: false, transparent: true,
      });
      this.marker = new THREE.Mesh(geom, mat);
    }
    for (const cubie of this.cubies) {
      for (const sticker of cubie.stickers) {
        if (sticker.facelet !== this.selected) continue;
        const m = this.marker;
        m.position.copy(sticker.mesh.position).multiplyScalar(0.985);
        m.rotation.copy(sticker.mesh.rotation);
        m.visible = true;
        if (m.parent !== sticker.mesh.parent) sticker.mesh.parent?.add(m);
        return;
      }
    }
    this.marker.visible = false;
  }

  /* -------------------------------------------------------------- state --- */

  /** Show this position immediately, abandoning any turn being drawn. */
  setFacelets(facelets: string): void {
    this.abortTurn();
    this.facelets = facelets;
    this.applyColors();
  }

  getFacelets(): string { return this.facelets; }

  /* ---------------------------------------------------------- animation --- */
  /*
   * The scene no longer owns any timing. `turnClock` decides when a turn runs
   * and how far through it is; this class only knows how to draw one. That is
   * what keeps the cube and the sticker map in step, and it means a turn can
   * never be left half-applied: the store has already committed the new state
   * before `beginTurn` is called.
   */

  /** Lift the turning layer onto the pivot, ready to be rotated. */
  beginTurn(move: number): void {
    this.abortTurn();
    const n = FACE_NORMAL[MOVE_FACE[move]];
    this.pivot.rotation.set(0, 0, 0);
    this.pivot.updateMatrix();
    for (const cubie of this.cubies) {
      const [x, y, z] = cubie.position;
      const inLayer = (n[0] !== 0 && n[0] === x) || (n[1] !== 0 && n[1] === y) || (n[2] !== 0 && n[2] === z);
      if (inLayer) this.pivot.attach(cubie.group);
    }
    this.turning = move;
  }

  /** Rotate the lifted layer. `eased` runs 0..1 across the turn. */
  setTurnProgress(eased: number): void {
    if (this.turning === null) return;
    const face = MOVE_FACE[this.turning];
    const n = FACE_NORMAL[face];
    const angle = -(Math.PI / 2) * MOVE_POWER[this.turning] * eased;
    this.axis.set(n[0], n[1], n[2]).normalize();
    this.pivot.setRotationFromAxisAngle(this.axis, angle);
  }

  /**
   * Drop the layer back into the lattice and repaint from the finished state.
   * A face turn maps its layer onto itself, so the repainted cube is identical
   * to the rotated one and the swap is invisible.
   */
  endTurn(facelets: string): void {
    this.abortTurn();
    this.facelets = facelets;
    this.applyColors();
    const move = this.lastTurn;
    this.lastTurn = null;
    if (move !== null) this.opts.onMoveComplete?.(move);
  }

  /** Put every cubie back under the root with no leftover rotation. */
  private abortTurn(): void {
    if (this.turning === null) return;
    this.lastTurn = this.turning;
    this.turning = null;
    this.pivot.rotation.set(0, 0, 0);
    this.pivot.updateMatrixWorld(true);
    for (const cubie of this.cubies) {
      if (cubie.group.parent !== this.pivot) continue;
      this.root.attach(cubie.group);
      cubie.group.position.set(cubie.position[0], cubie.position[1], cubie.position[2]);
      cubie.group.rotation.set(0, 0, 0);
      cubie.group.updateMatrix();
    }
  }

  get isTurning(): boolean { return this.turning !== null; }

  private tick(): void {
    if (this.disposed) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.yaw += (this.targetYaw - this.yaw) * Math.min(1, dt * 14);
    this.pitch += (this.targetPitch - this.pitch) * Math.min(1, dt * 14);
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.distance * cp * Math.sin(this.yaw),
      this.distance * Math.sin(this.pitch),
      this.distance * cp * Math.cos(this.yaw),
    );
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }

  /* ------------------------------------------------------------- input --- */

  private attachPointerHandlers(): void {
    const el = this.renderer.domElement;
    let mode: 'none' | 'orbit' | 'turn' = 'none';
    let startX = 0, startY = 0;
    let startYaw = 0, startPitch = 0;
    let pick: { position: Vec3; normal: Vec3 } | null = null;
    let pickFacelet: number | null = null;
    let hoverFacelet: number | null = null;
    let dragged = false;

    const pointerNdc = (e: PointerEvent): THREE.Vector2 => {
      const rect = el.getBoundingClientRect();
      return new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
    };

    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      startX = e.clientX; startY = e.clientY;
      startYaw = this.targetYaw; startPitch = this.targetPitch;
      this.raycaster.setFromCamera(pointerNdc(e), this.camera);
      const hits = this.raycaster.intersectObjects(this.stickerMeshes, false);
      dragged = false;
      if (hits.length && e.button === 0 && !e.shiftKey) {
        const data = hits[0].object.userData as { facelet: number; cubie: number[] };
        pick = {
          position: data.cubie as unknown as Vec3,
          normal: FACE_NORMAL[Math.floor(data.facelet / 9)],
        };
        pickFacelet = data.facelet;
        mode = 'turn';
      } else {
        pick = null;
        pickFacelet = null;
        mode = 'orbit';
      }
    });

    el.addEventListener('pointermove', (e) => {
      if (mode === 'none') {
        this.raycaster.setFromCamera(pointerNdc(e), this.camera);
        const hit = this.raycaster.intersectObjects(this.stickerMeshes, false)[0];
        const f = hit ? (hit.object.userData as { facelet: number }).facelet : null;
        if (f !== hoverFacelet) { hoverFacelet = f; this.opts.onStickerHover?.(f); }
        return;
      }
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (mode === 'orbit') {
        this.targetYaw = startYaw - dx * 0.008;
        this.targetPitch = Math.max(-1.35, Math.min(1.35, startPitch + dy * 0.008));
        return;
      }
      if (mode === 'turn' && pick && Math.hypot(dx, dy) > 16) {
        const move = this.dragToMove(pick, dx, dy);
        mode = 'none';
        pick = null;
        dragged = true;
        if (move >= 0) this.opts.onUserMove?.(move);
      }
    });

    const end = (): void => { mode = 'none'; pick = null; };
    el.addEventListener('pointerup', (e) => {
      const moved = Math.hypot(e.clientX - startX, e.clientY - startY) > 6;
      if (!moved && !dragged) this.opts.onStickerPick?.(pickFacelet);
      end();
    });
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.distance = Math.max(7, Math.min(18, this.distance + Math.sign(e.deltaY) * 0.6));
    }, { passive: false });
  }

  /**
   * Work out which face turn a drag across a sticker means.
   *
   * All this does is read the camera: project the two in-plane directions of
   * the touched sticker onto the screen and see which one the drag follows,
   * and which way along it. Which layer that turns, and in which direction,
   * is `dragMove` - cube algebra, kept out of here so it can be tested
   * without a renderer.
   */
  private dragToMove(pick: { position: Vec3; normal: Vec3 }, dx: number, dy: number): number {
    const n = new THREE.Vector3(...pick.normal);
    const candidates: { axis: number; screen: THREE.Vector2 }[] = [];
    for (let axis = 0; axis < 3; axis++) {
      const base = new THREE.Vector3(+(axis === 0), +(axis === 1), +(axis === 2));
      if (Math.abs(base.dot(n)) > 0.5) continue;
      candidates.push({ axis, screen: this.projectDirection(base) });
    }
    if (candidates.length < 2) return -1;

    const drag = new THREE.Vector2(dx, -dy).normalize();
    let along = candidates[0];
    for (const c of candidates) {
      if (Math.abs(c.screen.dot(drag)) > Math.abs(along.screen.dot(drag))) along = c;
    }
    const sign = Math.sign(along.screen.dot(drag)) || 1;
    return dragMove(pick.normal, pick.position, along.axis, sign);
  }

  private projectDirection(dir: THREE.Vector3): THREE.Vector2 {
    const origin = new THREE.Vector3(0, 0, 0).project(this.camera);
    const tip = dir.clone().multiplyScalar(0.6).project(this.camera);
    return new THREE.Vector2(tip.x - origin.x, tip.y - origin.y).normalize();
  }

  /* ------------------------------------------------------------- misc --- */

  setOrientation(yaw: number, pitch: number): void {
    this.targetYaw = yaw;
    this.targetPitch = pitch;
  }

  private resize(): void {
    const w = this.container.clientWidth || 400;
    const h = this.container.clientHeight || 400;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /**
   * What each sticker is actually painted, next to what the logical state says
   * it should be. The rendering-consistency tests compare the two; a mismatch
   * means the picture and the model have drifted apart, which is precisely the
   * class of bug this exists to catch.
   */
  inspect(): InspectedSticker[] {
    const out: InspectedSticker[] = [];
    const probe = new THREE.Color();
    for (const cubie of this.cubies) {
      for (const sticker of cubie.stickers) {
        const mat = sticker.mesh.material as THREE.MeshStandardMaterial;
        const face = this.facelets[sticker.facelet] as keyof typeof FACE_COLORS;
        const dimmed = Boolean(this.emphasis && !this.emphasis.has(sticker.facelet));
        probe.set(FACE_COLORS[face] ?? '#2b2b2b');
        const base = `#${probe.getHexString()}`;
        if (dimmed) probe.lerp(CubeScene.BODY, DIM_MIX);
        out.push({
          facelet: sticker.facelet,
          face,
          dimmed,
          painted: `#${mat.color.getHexString()}`,
          expected: `#${probe.getHexString()}`,
          base,
        });
      }
    }
    return out.sort((a, b) => a.facelet - b.facelet);
  }

  /** The facelet string the scene believes it is showing. */
  get renderedFacelets(): string { return this.facelets; }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[];
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
    this.marker?.geometry.dispose();
    (this.marker?.material as THREE.Material | undefined)?.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
