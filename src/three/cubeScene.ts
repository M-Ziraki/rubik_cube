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
import { FACE_NORMAL, faceletAt, type Vec3 } from '../cube/geometry';

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

/** A sticker's base colour, so emphasis can be applied and undone cleanly. */
const DIM_MIX = 0.82;

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
  private queue: { move: number; onDone?: () => void }[] = [];
  private animating: { move: number; elapsed: number; duration: number; onDone?: () => void } | null = null;
  private turnMillis = 260;

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

  private applyColors(): void {
    const body = new THREE.Color(0xd6d1c2);
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

  private placeMarker(): void {
    if (this.marker) { this.marker.parent?.remove(this.marker); this.marker = null; }
    if (this.selected === null) return;
    for (const cubie of this.cubies) {
      for (const sticker of cubie.stickers) {
        if (sticker.facelet !== this.selected) continue;
        const geom = roundedSquare(CUBIE_SIZE - STICKER_INSET * 2 + 0.1, 0.16);
        const mat = new THREE.MeshBasicMaterial({ color: 0x1c6b3f, side: THREE.DoubleSide });
        const m = new THREE.Mesh(geom, mat);
        m.position.copy(sticker.mesh.position).multiplyScalar(1.004);
        m.rotation.copy(sticker.mesh.rotation);
        m.renderOrder = -1;
        sticker.mesh.parent?.add(m);
        this.marker = m;
        return;
      }
    }
  }

  /* -------------------------------------------------------------- state --- */

  setFacelets(facelets: string, options: { instant?: boolean } = {}): void {
    this.facelets = facelets;
    if (options.instant !== false) {
      this.queue.length = 0;
      this.finishAnimation(true);
    }
    this.applyColors();
  }

  getFacelets(): string { return this.facelets; }

  setTurnSpeed(millis: number): void { this.turnMillis = Math.max(30, millis); }

  /** Queue an animated turn. The caller is responsible for the new state. */
  playMove(move: number, nextFacelets: string, onDone?: () => void): void {
    this.pendingStates.set(move + this.queue.length * 100, nextFacelets);
    this.queue.push({ move, onDone });
    this.stateQueue.push(nextFacelets);
  }

  private pendingStates = new Map<number, string>();
  private stateQueue: string[] = [];

  clearQueue(): void {
    this.queue.length = 0;
    this.stateQueue.length = 0;
    this.finishAnimation(true);
  }

  get queueLength(): number { return this.queue.length + (this.animating ? 1 : 0); }

  /* ---------------------------------------------------------- animation --- */

  private startNext(): void {
    if (this.animating || this.queue.length === 0) return;
    const next = this.queue.shift()!;
    const face = MOVE_FACE[next.move];
    const n = FACE_NORMAL[face];
    this.pivot.rotation.set(0, 0, 0);
    this.pivot.updateMatrix();
    for (const cubie of this.cubies) {
      const [x, y, z] = cubie.position;
      const inLayer = (n[0] !== 0 && n[0] === x) || (n[1] !== 0 && n[1] === y) || (n[2] !== 0 && n[2] === z);
      if (inLayer) this.pivot.attach(cubie.group);
    }
    this.animating = {
      move: next.move,
      elapsed: 0,
      duration: this.turnMillis * (MOVE_POWER[next.move] === 2 ? 1.45 : 1) / 1000,
      onDone: next.onDone,
    };
  }

  private finishAnimation(silent = false): void {
    if (!this.animating) return;
    const { move, onDone } = this.animating;
    this.animating = null;
    this.pivot.rotation.set(0, 0, 0);
    this.pivot.updateMatrixWorld(true);
    for (const cubie of [...this.cubies]) {
      if (cubie.group.parent === this.pivot) {
        this.root.attach(cubie.group);
        cubie.group.position.set(cubie.position[0], cubie.position[1], cubie.position[2]);
        cubie.group.rotation.set(0, 0, 0);
        cubie.group.updateMatrix();
      }
    }
    const nextState = this.stateQueue.shift();
    if (nextState) { this.facelets = nextState; this.applyColors(); }
    if (!silent) {
      onDone?.();
      this.opts.onMoveComplete?.(move);
    }
  }

  private tick(): void {
    if (this.disposed) return;
    const dt = Math.min(this.clock.getDelta(), 0.05);

    this.startNext();
    if (this.animating) {
      this.animating.elapsed += dt;
      const t = Math.min(1, this.animating.elapsed / this.animating.duration);
      const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
      const face = MOVE_FACE[this.animating.move];
      const power = MOVE_POWER[this.animating.move];
      const n = FACE_NORMAL[face];
      const angle = -(Math.PI / 2) * power * eased;
      this.pivot.setRotationFromAxisAngle(new THREE.Vector3(n[0], n[1], n[2]).normalize(), angle);
      if (t >= 1) this.finishAnimation();
    }

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
   * Project both in-plane directions of the touched sticker onto the screen,
   * see which one the drag follows, and turn about the other one. The layer is
   * whichever one contains the sticker you grabbed.
   */
  private dragToMove(pick: { position: Vec3; normal: Vec3 }, dx: number, dy: number): number {
    const n = new THREE.Vector3(...pick.normal);
    const candidates: { axis: THREE.Vector3; screen: THREE.Vector2 }[] = [];
    for (const base of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]) {
      if (Math.abs(base.dot(n)) > 0.5) continue;
      candidates.push({ axis: base.clone(), screen: this.projectDirection(base) });
    }
    if (candidates.length < 2) return -1;

    const drag = new THREE.Vector2(dx, -dy).normalize();
    let bestIdx = 0;
    let bestScore = -Infinity;
    candidates.forEach((c, i) => {
      const score = Math.abs(c.screen.dot(drag));
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    });
    const along = candidates[bestIdx];
    const other = candidates[1 - bestIdx];
    const sign = Math.sign(along.screen.dot(drag)) || 1;

    // Turning about `other`, in the direction that carries `along` forwards.
    const axis = other.axis;
    // rotationAxis x alongAxis should point the way the sticker travels.
    const cross = new THREE.Vector3().crossVectors(axis, along.axis);
    const axisSign = cross.dot(n) > 0 ? 1 : -1;

    const axisIndex = axis.x !== 0 ? 0 : axis.y !== 0 ? 1 : 2;
    const coord = pick.position[axisIndex];
    if (coord === 0) return -1; // middle slices are not face turns
    const faceNormal: Vec3 = [
      axisIndex === 0 ? coord : 0,
      axisIndex === 1 ? coord : 0,
      axisIndex === 2 ? coord : 0,
    ];
    const face = FACE_NORMAL.findIndex((f) => f[0] === faceNormal[0] && f[1] === faceNormal[1] && f[2] === faceNormal[2]);
    if (face < 0) return -1;

    // A clockwise turn of a face is a negative rotation about its own normal.
    const direction = sign * axisSign * (coord > 0 ? 1 : -1) * (axis.dot(new THREE.Vector3(...faceNormal)) > 0 ? 1 : -1);
    const power = direction > 0 ? 3 : 1;
    return face * 3 + (power - 1);
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

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}
