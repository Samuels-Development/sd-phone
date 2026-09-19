import {
    CfxTexture,
    LinearFilter,
    Mesh,
    NearestFilter,
    OrthographicCamera,
    PlaneBufferGeometry,
    RGBAFormat,
    Scene,
    ShaderMaterial,
    UnsignedByteType,
    WebGLRenderTarget,
    WebGLRenderer,
} from './threeExports';
import { computeCropRegion, SELFIE_CROP_BIAS_X, type Orientation } from './crop';

// Live game-view renderer, ported from utk_render (citizenfx/screenshot-basic).
// CfxTexture's isCfxTexture flag makes the patched fork's WebGLTextures emit a
// magic texParameterf sequence that FiveM's CEF GPU layer recognises, binding
// the live game backbuffer as the texture at draw time. Heavy (pulls the three
// fork), so only ever load this module via dynamic import — see index.ts.
//
// FiveM Enhanced (Gen9) no longer intercepts this sequence, so the backbuffer
// stays unbound and every frame reads back black. When that is detected the
// renderer falls back to an <object type="application/x-cfx-game-view"> element,
// which Enhanced DOES support, and paints it into the target canvas instead.

const VERTEX_SHADER = `
varying vec2 vUv;

void main() {
    vUv = vec2(uv.x, 1.0 - uv.y);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT_SHADER = `
varying vec2 vUv;
uniform sampler2D tDiffuse;

void main() {
    gl_FragColor = texture2D(tDiffuse, vUv);
}
`;

const PUMP_MS = 16;
const MIN_FPS = 1;
const MAX_FPS = 60;

// --- Enhanced-fallback detection constants ---
// Frame on which the black-frame check runs. Gives the GPU a few frames to warm
// up and the CfxTexture magic to take effect before we decide it is not working.
const CHECK_FRAME = 5;
// How many evenly-spaced pixels to sample from the readback buffer.
const SAMPLE_COUNT = 64;
// If the average brightness of every sampled pixel is below this, the frame is
// considered black. Threshold is generous: even a dim night scene will average
// well above 2 once the backbuffer is actually bound.
const BLACK_THRESHOLD = 2;

export class GameRender {
    private readonly renderer: WebGLRenderer;
    private readonly material: ShaderMaterial;
    private sceneRTT:  Scene;
    private cameraRTT: OrthographicCamera;
    private rtTexture: WebGLRenderTarget;
    private canvas: HTMLCanvasElement | null = null;
    private animated = false;
    private pump: ReturnType<typeof setInterval> | null = null;
    private pumpMs = PUMP_MS;
    private pixels: Uint8Array | null = null;
    private image: ImageData | null = null;
    private ctx: CanvasRenderingContext2D | null = null;
    private bufW = 0;
    private bufH = 0;
    private frames = 0;
    private zoom = 1;
    private orientation: Orientation = 'portrait';
    private selfie = false;

    // --- Enhanced fallback state ---
    // True once the CfxTexture path has been diagnosed as non-functional and the
    // renderer has switched to the <object> game-view element.
    private fallback = false;
    // The <object type="application/x-cfx-game-view"> element the fallback
    // paints from, or null when the CfxTexture path is working.
    private gameViewEl: HTMLObjectElement | null = null;
    // Container div for the game-view element; kept in the DOM while active.
    private gameViewMount: HTMLDivElement | null = null;

    constructor() {
        const gameTexture = new CfxTexture();
        gameTexture.needsUpdate = true;

        this.material = new ShaderMaterial({
            uniforms: { tDiffuse: { value: gameTexture } },
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
        });

        this.cameraRTT = this.buildCamera(true);
        this.sceneRTT  = this.buildScene();
        this.rtTexture = this.buildTarget();

        this.renderer = new WebGLRenderer();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.autoClear = false;

        const mount = document.createElement('div');
        mount.id = 'three-game-render';
        mount.style.display = 'none';
        mount.appendChild(this.renderer.domElement);
        document.body.append(mount);

        window.addEventListener('resize', () => this.rebuild(!this.animated));
    }

    renderToTarget(canvas: HTMLCanvasElement) {
        this.rebuild(false);
        this.canvas = canvas;
        this.animated = true;
        this.bufW = 0;
        this.bufH = 0;
        this.frames = 0;
        this.fallback = false;
        this.startPump();
    }

    setTargetFps(fps: number) {
        const want = Math.round(Math.min(MAX_FPS, Math.max(MIN_FPS, fps || MAX_FPS)));
        const ms = Math.max(1, Math.round(1000 / want));
        if (ms === this.pumpMs) return;
        this.pumpMs = ms;
        if (this.pump !== null) this.startPump();
    }

    framesRendered() {
        return this.frames;
    }

    private startPump() {
        if (this.pump !== null) clearInterval(this.pump);
        this.pump = setInterval(this.fallback ? this.animateFallback : this.animate, this.pumpMs);
    }

    setZoom(zoom: number) {
        this.zoom = zoom > 0 ? zoom : 1;
        // The fallback recomputes its crop in animateFallback each frame, so no
        // rebuild is needed — just store the value.
        if (this.animated && !this.fallback) this.rebuild(false);
    }

    setOrientation(orientation: Orientation) {
        this.orientation = orientation;
        if (this.animated && !this.fallback) this.rebuild(false);
    }

    // Front (selfie) camera re-centres the ped; rear camera is already centred.
    setSelfie(on: boolean) {
        this.selfie = on;
        if (this.animated && !this.fallback) this.rebuild(false);
    }

    stop() {
        this.animated = false;
        this.canvas = null;
        if (this.pump !== null) { clearInterval(this.pump); this.pump = null; }
        this.destroyGameView();
        this.fallback = false;
        this.rebuild(true);
    }

    private buildCamera(fullScreen: boolean): OrthographicCamera {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const camera = new OrthographicCamera(w / -2, w / 2, h / 2, h / -2, -10000, 10000);
        camera.position.z = 0;
        if (fullScreen) {
            camera.setViewOffset(w, h, 0, 0, w, h);
        } else {
            const biasX = this.selfie ? SELFIE_CROP_BIAS_X : 0;
            const crop  = computeCropRegion(w, h, this.zoom, this.orientation, biasX);
            camera.setViewOffset(w, h, crop.offsetX, crop.offsetY, crop.width, crop.height);
        }
        return camera;
    }

    private buildScene(): Scene {
        const scene = new Scene();
        const quad = new Mesh(new PlaneBufferGeometry(window.innerWidth, window.innerHeight), this.material);
        quad.position.z = -100;
        scene.add(quad);
        return scene;
    }

    private buildTarget(): WebGLRenderTarget {
        return new WebGLRenderTarget(window.innerWidth, window.innerHeight, {
            minFilter: LinearFilter,
            magFilter: NearestFilter,
            format:    RGBAFormat,
            type:      UnsignedByteType,
        });
    }

    private rebuild(fullScreen: boolean) {
        if (this.fallback) return;
        this.cameraRTT = this.buildCamera(fullScreen);
        this.sceneRTT  = this.buildScene();
        this.rtTexture = this.buildTarget();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // --- Black-frame detection ---

    /** Sample evenly-spaced pixels and return true if the frame is all black. */
    private isBlackFrame(pixels: Uint8Array, total: number): boolean {
        const stride = Math.max(1, Math.floor(total / SAMPLE_COUNT));
        let sum = 0;
        let count = 0;
        for (let i = 0; i < total && count < SAMPLE_COUNT; i += stride) {
            const off = i * 4;
            // Average of R, G, B (ignore alpha)
            sum += (pixels[off] + pixels[off + 1] + pixels[off + 2]) / 3;
            count += 1;
        }
        return count > 0 && (sum / count) < BLACK_THRESHOLD;
    }

    // --- Enhanced fallback: <object type="application/x-cfx-game-view"> ---

    /** Create the game-view plugin element and mount it off-screen. */
    private initFallback(): void {
        if (this.gameViewEl) return;

        const mount = document.createElement('div');
        mount.id = 'cfx-game-view-mount';
        // Positioned off-screen but rendered at full viewport size so the plugin
        // has a real render target. Visibility:hidden would prevent the plugin
        // from producing frames on some builds, so we use clip+position instead.
        mount.style.cssText = [
            'position:fixed',
            'top:0',
            'left:0',
            'width:100vw',
            'height:100vh',
            'pointer-events:none',
            'z-index:-9999',
            'opacity:0',
        ].join(';');

        const obj = document.createElement('object');
        obj.type = 'application/x-cfx-game-view';
        obj.style.cssText = 'display:block;width:100%;height:100%';
        mount.appendChild(obj);
        document.body.appendChild(mount);

        this.gameViewEl = obj;
        this.gameViewMount = mount;
    }

    /** Remove the game-view element from the DOM. */
    private destroyGameView(): void {
        if (this.gameViewMount) {
            this.gameViewMount.remove();
            this.gameViewMount = null;
        }
        this.gameViewEl = null;
    }

    /** Switch from the CfxTexture path to the fallback. */
    private switchToFallback(): void {
        this.fallback = true;
        this.initFallback();
        // Restart the pump with the fallback animator.
        if (this.pump !== null) clearInterval(this.pump);
        this.pump = setInterval(this.animateFallback, this.pumpMs);
    }

    // --- Animators ---

    private animate = () => {
        if (!this.animated || !this.canvas) return;

        const w = window.innerWidth;
        const h = window.innerHeight;
        if (w <= 0 || h <= 0) return;

        if (this.bufW !== w || this.bufH !== h || !this.pixels || !this.image || !this.ctx) {
            this.bufW = w;
            this.bufH = h;
            const buffer = new ArrayBuffer(w * h * 4);
            this.pixels = new Uint8Array(buffer);
            this.image = new ImageData(new Uint8ClampedArray(buffer), w, h);
            this.canvas.width = w;
            this.canvas.height = h;
            this.ctx = this.canvas.getContext('2d');
            if (!this.ctx) return;
        }

        this.renderer.clear();
        this.renderer.render(this.sceneRTT, this.cameraRTT, this.rtTexture, true);
        this.renderer.readRenderTargetPixels(this.rtTexture, 0, 0, w, h, this.pixels);
        this.ctx.putImageData(this.image, 0, 0);
        this.frames += 1;

        // After a few warm-up frames, check whether the CfxTexture magic
        // actually bound the backbuffer. If every frame so far is black the
        // host is likely FiveM Enhanced, which needs the <object> fallback.
        if (this.frames === CHECK_FRAME && this.isBlackFrame(this.pixels, w * h)) {
            this.switchToFallback();
        }
    };

    /**
     * Fallback animator: paints the <object type="application/x-cfx-game-view">
     * element into the target canvas, applying the same crop/zoom math the
     * CfxTexture path uses via the orthographic camera's viewOffset.
     */
    private animateFallback = () => {
        if (!this.animated || !this.canvas || !this.gameViewEl) return;

        const w = window.innerWidth;
        const h = window.innerHeight;
        if (w <= 0 || h <= 0) return;

        if (!this.ctx || this.bufW !== w || this.bufH !== h) {
            this.bufW = w;
            this.bufH = h;
            this.canvas.width = w;
            this.canvas.height = h;
            this.ctx = this.canvas.getContext('2d');
            if (!this.ctx) return;
        }

        // Compute the crop region — same math the camera viewOffset uses.
        const biasX = this.selfie ? SELFIE_CROP_BIAS_X : 0;
        const crop = computeCropRegion(w, h, this.zoom, this.orientation, biasX);

        try {
            // drawImage(source, sx, sy, sw, sh, dx, dy, dw, dh)
            // Source rect is the crop window within the full-screen game view;
            // destination is the entire target canvas.
            this.ctx.drawImage(
                this.gameViewEl as unknown as CanvasImageSource,
                crop.offsetX, crop.offsetY, crop.width, crop.height,
                0, 0, w, h,
            );
        } catch {
            // The <object> may not be drawable on some builds (SecurityError or
            // NS_ERROR). Nothing to do — the canvas stays black, same as before
            // the fallback existed.
        }
        this.frames += 1;
    };
}
