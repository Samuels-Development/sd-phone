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

export class GameRender {
    private readonly renderer: WebGLRenderer;
    private readonly material: ShaderMaterial;
    private sceneRTT:  Scene;
    private cameraRTT: OrthographicCamera;
    private rtTexture: WebGLRenderTarget;
    private canvas: HTMLCanvasElement | null = null;
    private animated = false;
    private zoom = 1;
    private orientation: Orientation = 'portrait';
    private selfie = false;

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
        requestAnimationFrame(this.animate);
    }

    renderToTarget(canvas: HTMLCanvasElement) {
        this.rebuild(false);
        this.canvas = canvas;
        this.animated = true;
    }

    setZoom(zoom: number) {
        this.zoom = zoom > 0 ? zoom : 1;
        if (this.animated) this.rebuild(false);
    }

    setOrientation(orientation: Orientation) {
        this.orientation = orientation;
        if (this.animated) this.rebuild(false);
    }

    // Front (selfie) camera re-centres the ped; rear camera is already centred.
    setSelfie(on: boolean) {
        this.selfie = on;
        if (this.animated) this.rebuild(false);
    }

    stop() {
        this.animated = false;
        this.canvas = null;
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
        this.cameraRTT = this.buildCamera(fullScreen);
        this.sceneRTT  = this.buildScene();
        this.rtTexture = this.buildTarget();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    private animate = () => {
        requestAnimationFrame(this.animate);
        if (!this.animated || !this.canvas) return;

        const w = window.innerWidth;
        const h = window.innerHeight;
        this.renderer.clear();
        this.renderer.render(this.sceneRTT, this.cameraRTT, this.rtTexture, true);

        const pixels = new Uint8Array(w * h * 4);
        this.renderer.readRenderTargetPixels(this.rtTexture, 0, 0, w, h, pixels);

        this.canvas.width  = w;
        this.canvas.height = h;
        const ctx = this.canvas.getContext('2d');
        if (!ctx) return;
        ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer), w, h), 0, 0);
    };
}
