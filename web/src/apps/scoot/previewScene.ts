import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import modelUrl from './assets/scooter.glb';
import { loadExtras } from './previewExtras';
import type { Customization } from './customization';

const VIEW = new THREE.Vector3(2.35, 1.0, 2.75).normalize();
const FILL = 0.82;
const ZOOM_IN = 0.5;
const ZOOM_OUT = 1.9;
const FIRST_BUILD_DELAY = 450;

interface Stage {
    extras: Awaited<ReturnType<typeof loadExtras>>;
    renderer: THREE.WebGLRenderer;
    scene:    THREE.Scene;
    camera:   THREE.PerspectiveCamera;
    controls: OrbitControls;
    paint:    THREE.MeshStandardMaterial[];
    bounds:   { center: THREE.Vector3; radius: number; box: THREE.Box3 };
}

interface Session {
    host:    HTMLElement;
    onError: () => void;
}

let stagePromise: Promise<Stage> | null = null;
let stage: Stage | null = null;
let raf = 0;
const owners: Session[] = [];

async function modelBuffer(): Promise<ArrayBuffer> {
    if (!modelUrl.startsWith('data:')) {
        const res = await fetch(modelUrl);
        if (!res.ok) throw new Error('Model unavailable');
        return res.arrayBuffer();
    }
    const bin = atob(modelUrl.slice(modelUrl.indexOf(',') + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
}

function owner(): Session | null {
    return owners[owners.length - 1] ?? null;
}

function draw(): void {
    const s = stage;
    if (!s || raf || document.hidden || !owner()) return;
    raf = requestAnimationFrame(() => {
        raf = 0;
        if (stage && owner() && !document.hidden) s.renderer.render(s.scene, s.camera);
    });
}

function frame(): void {
    const s = stage;
    if (!s) return;
    const fovY = THREE.MathUtils.degToRad(s.camera.fov) / 2;
    const fovX = Math.atan(Math.tan(fovY) * s.camera.aspect);
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),VIEW).normalize();
    const up = new THREE.Vector3().crossVectors(VIEW,right).normalize();
    let distance = 0;
    for(const x of [s.bounds.box.min.x,s.bounds.box.max.x]) for(const y of [s.bounds.box.min.y,s.bounds.box.max.y]) for(const z of [s.bounds.box.min.z,s.bounds.box.max.z]) {
        const p = new THREE.Vector3(x,y,z).sub(s.bounds.center);
        distance = Math.max(distance, p.dot(VIEW) + Math.max(Math.abs(p.dot(right))/Math.tan(fovX),Math.abs(p.dot(up))/Math.tan(fovY))/FILL);
    }
    s.controls.minDistance = distance * ZOOM_IN;
    s.controls.maxDistance = distance * ZOOM_OUT;
    s.controls.target.copy(s.bounds.center);
    s.camera.position.copy(s.bounds.center).addScaledVector(VIEW, distance);
    s.controls.update();
    draw();
}

function zoom(factor: number): void {
    const s = stage;
    if (!s) return;
    const offset = s.camera.position.clone().sub(s.controls.target);
    const length = Math.min(s.controls.maxDistance, Math.max(s.controls.minDistance, offset.length() * factor));
    s.camera.position.copy(s.controls.target).addScaledVector(offset.normalize(), length);
    s.controls.update();
    draw();
}

function fit(): void {
    const s = stage, current = owner();
    if (!s || !current) return;
    const width = current.host.offsetWidth, height = current.host.offsetHeight;
    if (!width || !height) return;
    s.camera.aspect = width / height;
    s.camera.updateProjectionMatrix();
    s.renderer.setSize(width, height);
    frame();
}

function attach(): void {
    const s = stage, current = owner();
    if (!s) return;
    if (!current) { s.renderer.domElement.remove(); return; }
    if (s.renderer.domElement.parentElement !== current.host) current.host.appendChild(s.renderer.domElement);
    void current.host.offsetHeight;
    fit();
    window.setTimeout(() => { if (owner() === current) fit(); }, 50);
}

function dropStage(): void {
    const s = stage;
    stage = null;
    stagePromise = null;
    cancelAnimationFrame(raf);
    raf = 0;
    if (!s) return;
    const textures = new Set<THREE.Texture>();
    s.scene.traverse(ob => {
        if (!(ob instanceof THREE.Mesh)) return;
        ob.geometry.dispose();
        const materials = Array.isArray(ob.material) ? ob.material : [ob.material];
        materials.forEach(m => { Object.values(m).forEach(v => { if (v instanceof THREE.Texture) textures.add(v); }); m.dispose(); });
    });
    textures.forEach(t => t.dispose());
    s.scene.environment?.dispose();
    s.controls.dispose();
    s.renderer.domElement.remove();
    s.renderer.dispose();
}

async function buildStage(firstHost: HTMLElement): Promise<Stage> {
    await new Promise(r => setTimeout(r, FIRST_BUILD_DELAY));
    const data = await modelBuffer();
    const canvas = document.createElement('canvas');
    if (firstHost.isConnected) firstHost.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, .05, 30);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false; controls.enableZoom = true; controls.enableDamping = false;
    controls.zoomSpeed = 0.8;
    controls.minPolarAngle = .35; controls.maxPolarAngle = Math.PI * .64;
    controls.rotateSpeed = .65;
    controls.addEventListener('change', draw);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    scene.environment = pmrem.fromScene(room, .04).texture;
    room.dispose(); pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x7a8890, 2));
    const key = new THREE.DirectionalLight(0xfff4e9, 3); key.position.set(3, 4, 3); scene.add(key);
    renderer.domElement.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        const current = owner();
        dropStage();
        current?.onError();
    });
    const gltf = await new GLTFLoader().parseAsync(data, '');
    const paint: THREE.MeshStandardMaterial[] = [];
    gltf.scene.traverse(ob => {
        if (!(ob instanceof THREE.Mesh)) return;
        const mats = Array.isArray(ob.material) ? ob.material : [ob.material];
        mats.forEach(m => { if (m instanceof THREE.MeshStandardMaterial && m.name === 'ScootPaint') paint.push(m); });
    });
    scene.add(gltf.scene);
    const extras = await loadExtras(scene);
    const box = new THREE.Box3().setFromObject(gltf.scene).union(extras.box);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    return { renderer, scene, camera, controls, paint, extras, bounds: { center: sphere.center, radius: Math.max(sphere.radius, .01), box } };
}

function stageReady(firstHost: HTMLElement): Promise<Stage> {
    stagePromise ??= buildStage(firstHost).then(s => { stage = s; return s; }, error => { stagePromise = null; throw error; });
    return stagePromise;
}

export async function createPreview(host: HTMLElement, initialColour: string, onReady: () => void, onError: () => void) {
    const session: Session = { host, onError };
    let alive = true;
    let s: Stage;
    try { s = await stageReady(host); }
    catch { if (alive) onError(); return { extras(_value: Customization) {}, colour() {}, rotate() {}, reset() {}, zoom() {}, refresh() {}, dispose() { alive = false; } }; }
    if (!alive) return { extras(_value: Customization) {}, colour() {}, rotate() {}, reset() {}, zoom() {}, refresh() {}, dispose() {} };

    owners.push(session);
    s.paint.forEach(m => m.color.set(initialColour));
    attach();
    const ro = new ResizeObserver(() => { if (owner() === session) fit(); });
    ro.observe(host);
    const io = new IntersectionObserver(entries => { if (entries[0]?.isIntersecting && owner() === session) draw(); });
    io.observe(host);
    const onVisibility = () => draw();
    document.addEventListener('visibilitychange', onVisibility);
    onReady();

    return {
        extras(value: Customization) { stage?.extras.update(value); draw(); },
        colour(value: string) { stage?.paint.forEach(m => m.color.set(value)); draw(); },
        rotate(radians: number) {
            const st = stage; if (!st) return;
            const offset = st.camera.position.clone().sub(st.controls.target);
            offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), radians);
            st.camera.position.copy(st.controls.target).add(offset);
            st.controls.update(); draw();
        },
        reset: frame,
        zoom,
        refresh() { if (owner() === session) attach(); },
        dispose() {
            if (!alive) return;
            alive = false;
            ro.disconnect(); io.disconnect();
            document.removeEventListener('visibilitychange', onVisibility);
            const index = owners.indexOf(session);
            if (index >= 0) owners.splice(index, 1);
            attach();
        },
    };
}
