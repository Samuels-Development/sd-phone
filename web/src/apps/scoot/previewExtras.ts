import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import extrasUrl from './assets/extras.glb';
import { attachmentKeys, EXTRAS } from './customization';
import type { Customization } from './customization';

export async function loadExtras(scene: THREE.Scene) {
    const gltf = await new GLTFLoader().loadAsync(extrasUrl);
    const root = gltf.scene;
    scene.add(root);
    const decals = new THREE.Group(); scene.add(decals);
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 128;
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshStandardMaterial({map:texture,transparent:true,roughness:.7,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});
    for (const side of [-1,1]) {
        const ob = new THREE.Mesh(new THREE.PlaneGeometry(.34,.031),material);
        ob.position.set(side*.124,.173845,.07);ob.rotation.y=side*Math.PI/2;
        decals.add(ob);
    }
    const glow = new THREE.PointLight(0x60dcff,.3,.7,2);glow.position.set(0,.11,0);scene.add(glow);
    const haloCanvas=document.createElement('canvas');haloCanvas.width=128;haloCanvas.height=128;
    const ctx=haloCanvas.getContext('2d')!;const gradient=ctx.createRadialGradient(64,64,0,64,64,64);gradient.addColorStop(0,'rgba(255,255,255,.7)');gradient.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
    const halo=new THREE.Mesh(new THREE.PlaneGeometry(.6,.9),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(haloCanvas),transparent:true,depthWrite:false}));halo.rotation.x=-Math.PI/2;halo.position.y=.007;scene.add(halo);
    function update(value: Customization) {
        const keys=attachmentKeys(value);
        root.traverse(ob=>{if(ob.name.startsWith('SX_'))ob.visible=keys.has(ob.name.slice(3));});
        const colour=EXTRAS.lighting.find(item=>item.id===value.lighting)?.hex;
        halo.visible=glow.visible=!!colour;
        if(colour){glow.color.set(colour);halo.material.color.set(colour);}
        const text=value.decal==='name'?value.name.trim():value.decal==='number'?value.number:'';
        decals.visible=!!text;
        const context=canvas.getContext('2d')!;context.clearRect(0,0,1024,128);context.font='bold 100px Arial';context.textAlign='center';context.textBaseline='middle';context.fillStyle='#eef2ed';context.fillText(text,512,64,980);texture.needsUpdate=true;
    }
    update(EXTRAS.defaults);
    return {update,box:new THREE.Box3().setFromObject(root)};
}
