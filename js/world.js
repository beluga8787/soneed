// world.js — психиатрическая больница «Тихая Падь»
import * as THREE from 'three';
import { TEX, rand } from './util.js';

export const W = { walls:[], doors:[], interactables:[], lights:[], corpses:[] };
export const meta = {};

const MAT = {
  floor: new THREE.MeshStandardMaterial({ map:TEX.floorTile(), roughness:.9, metalness:.05 }),
  wall: new THREE.MeshStandardMaterial({ map:TEX.wallPaint(), roughness:.95 }),
  tile: new THREE.MeshStandardMaterial({ map:TEX.wallTiles(), roughness:.6, metalness:.1 }),
  ceil: new THREE.MeshStandardMaterial({ map:TEX.ceiling(), roughness:1 }),
  wood: new THREE.MeshStandardMaterial({ map:TEX.wood(), roughness:.8 }),
  darkWood: new THREE.MeshStandardMaterial({ map:TEX.wood(), color:0x4a3a28, roughness:.9 }),
  metal: new THREE.MeshStandardMaterial({ map:TEX.metal(), roughness:.4, metalness:.7 }),
  blood: new THREE.MeshBasicMaterial({ map:TEX.bloodWall(), transparent:true, depthWrite:false }),
};

let colliderId=0;
function addCollider(mins,maxs,tag){
  const c={ id:++colliderId, min:{x:mins.x,z:mins.z}, max:{x:maxs.x,z:maxs.z}, y0:mins.y||0, y1:maxs.y||3, tag:tag||'wall', mesh:null };
  W.walls.push(c); return c;
}
function box(parent,mat,w,h,d,x,y,z,opts={}){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
  m.position.set(x,y,z); m.castShadow=!!opts.shadow; m.receiveShadow=true;
  if(opts.rotY) m.rotation.y=opts.rotY;
  parent.add(m);
  if(!opts.noCollide){
    const c=addCollider({x:x-w/2,y:y-h/2,z:z-d/2},{x:x+w/2,y:y+h/2,z:z+d/2},opts.tag);
    c.mesh=m;
  }
  return m;
}
function collNoMesh(x1,z1,x2,z2,y1,tag){ const c=addCollider({x:x1,y:0,z:z1},{x:x2,y:y1,z:z2},tag); c.mesh=null; return c; }

/* ================= ДВЕРЬ ================= */
export function makeDoor(parent, x,z, axis, opts={}){
  const doorW=1.5, doorH=2.4, t=.12;
  const pivot=new THREE.Group();
  const alongX = axis==='z';
  pivot.position.set(alongX? x-doorW/2 : x, 0, alongX? z : z-doorW/2);
  pivot.rotation.y = alongX? 0 : Math.PI/2;
  const panel=new THREE.Group(); panel.position.x=doorW/2;
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(doorW,doorH,t), opts.locked?MAT.darkWood:MAT.wood);
  mesh.position.y=doorH/2; mesh.castShadow=true; panel.add(mesh);
  const knob=new THREE.Mesh(new THREE.SphereGeometry(.05,8,8),MAT.metal);
  knob.position.set(doorW*.4,1.05,t/2+.04); panel.add(knob);
  if(opts.barricaded){ const br=new THREE.Mesh(new THREE.BoxGeometry(doorW*.9,.12,.14),MAT.darkWood);
    br.position.set(doorW/2,1.3,t/2+.1); panel.add(br);
    const br2=br.clone(); br2.position.y=.8; br2.rotation.z=.15; panel.add(br2); }
  pivot.add(panel); parent.add(pivot);
  const door={ type:'door', obj:pivot, panel, x, z, open:false, locked:!!opts.locked, barricaded:!!opts.barricaded,
    angle:0, targetAngle:0, keyType:opts.keyType||null, prompt:opts.prompt||'', swingSign:(opts.swing!==undefined?opts.swing:-1) };
  let col;
  if(axis==='x') col=addCollider({x:x-.16,y:0,z:z-doorW/2},{x:x+.16,y:doorH,z:z+doorW/2},'door');
  else col=addCollider({x:x-doorW/2,y:0,z:z-.16},{x:x+doorW/2,y:doorH,z:z+.16},'door');
  door.colliderRef=col;
  W.doors.push(door); W.interactables.push(door);
  return door;
}
export function openDoor(door){
  if(door.open) return;
  door.open=true; door.targetAngle=-Math.PI*.62*door.swingSign;
  const i=W.walls.indexOf(door.colliderRef);
  if(i>=0) W.walls.splice(i,1);
}

/* ================= КОНТЕЙНЕР ================= */
export function makeContainer(parent, x,z, kind, contents, opts={}){
  let w,h,d, mat=MAT.metal;
  if(kind==='locker'){ w=1.0;h=2.0;d=.55; }
  else if(kind==='nightstand'){ w=.6;h=.75;d=.5; mat=MAT.wood; }
  else { w=1.2;h=1.1;d=.6; mat=MAT.wood; }
  box(parent,mat,w,h,d,x,h/2,z,{shadow:true,tag:'furniture'});
  const isDouble = kind==='locker';
  const frontMat = kind==='locker'?MAT.metal:MAT.darkWood;
  const dw=w/(isDouble?2:1);
  const doors=[];
  for(let i=0;i<(isDouble?2:1);i++){
    const p=new THREE.Group();
    const leftSide = isDouble ? i===0 : true;
    const edgeX = x + (leftSide ? -w/2 : w/2);
    p.position.set(edgeX, 0, z+d/2);
    const dm=new THREE.Mesh(new THREE.BoxGeometry(dw-.02,h-.06,.05),frontMat);
    dm.position.set((leftSide?dw/2:-dw/2),h/2,.02); dm.castShadow=true; p.add(dm);
    const kn=new THREE.Mesh(new THREE.SphereGeometry(.03,6,6),MAT.metal);
    kn.position.set(leftSide?dw-.1:-dw+.1, h*.55, .07); p.add(kn);
    parent.add(p); doors.push({g:p, sign:leftSide?1:-1});
  }
  const cont={ type:'container', x,z, kind, opened:false, searchAnim:0, animating:false,
    contents:contents||[], shown:false, double:isDouble, doors, cw:w, cd:d, locked:!!opts.locked,
    prompt: opts.locked?'Заперто':'Обыскать', label:opts.label||'' };
  W.interactables.push(cont);
  return cont;
}

/* ================= МЕБЕЛЬ ================= */
function makeBed(parent,x,z,rotY=0){
  const g=new THREE.Group(); g.position.set(x,0,z); g.rotation.y=rotY; parent.add(g);
  box(g,MAT.metal,2.0,.4,.9,0,.2,0,{noCollide:true});
  box(g,MAT.metal,.06,.9,.06,-.95,.45,-.4,{noCollide:true});
  box(g,MAT.metal,.06,.9,.06,-.95,.45,.4,{noCollide:true});
  box(g,MAT.metal,.06,.5,.06,.95,.25,-.4,{noCollide:true});
  box(g,MAT.metal,.06,.5,.06,.95,.25,.4,{noCollide:true});
  box(g,MAT.metal,2.0,.05,.05,0,.85,0,{noCollide:true});
  box(g,new THREE.MeshStandardMaterial({map:TEX.mattress(),roughness:1}),1.9,.16,.82,0,.48,0,{noCollide:true});
  box(g,new THREE.MeshStandardMaterial({color:0x9a9484,roughness:1}),.5,.12,.78,-.6,.62,0,{noCollide:true});
  collNoMesh(x-1,z-.5,x+1,z+.5,1,'furniture');
  return g;
}
function makeNightstand(parent,x,z){
  collNoMesh(x-.3,z-.25,x+.3,z+.25,.7,'furniture');
  return box(parent,MAT.wood,.55,.7,.45,x,.35,z,{shadow:true,noCollide:true});
}
function makeChair(parent,x,z,rotY=0){
  const g=new THREE.Group(); g.position.set(x,0,z); g.rotation.y=rotY; parent.add(g);
  box(g,MAT.wood,.45,.06,.45,0,.45,0,{noCollide:true});
  box(g,MAT.wood,.45,.5,.06,0,.75,-.2,{noCollide:true});
  for(const [lx,lz] of [[-.18,-.18],[.18,-.18],[-.18,.18],[.18,.18]]) box(g,MAT.wood,.05,.45,.05,lx,.22,lz,{noCollide:true});
  return g;
}
function makeTable(parent,x,z,w=1.4,d=.8){
  const g=new THREE.Group(); g.position.set(x,0,z); parent.add(g);
  box(g,MAT.wood,w,.06,d,0,.75,0,{noCollide:true});
  for(const [lx,lz] of [[-w/2+.1,-d/2+.1],[w/2-.1,-d/2+.1],[-w/2+.1,d/2-.1],[w/2-.1,d/2-.1]])
    box(g,MAT.wood,.08,.75,.08,lx,.37,lz,{noCollide:true});
  collNoMesh(x-w/2,z-d/2,x+w/2,z+d/2,.8,'furniture');
  return g;
}
function makeIV(parent,x,z){
  const g=new THREE.Group(); g.position.set(x,0,z); parent.add(g);
  box(g,MAT.metal,.04,1.8,.04,0,.9,0,{noCollide:true});
  box(g,new THREE.MeshStandardMaterial({color:0xcfcac0,transparent:true,opacity:.5}),.14,.3,.1,.25,1.6,0,{noCollide:true});
  box(g,MAT.metal,.4,.03,.4,0,.02,0,{noCollide:true});
  return g;
}
function makeWheelchair(parent,x,z,rotY=0){
  const g=new THREE.Group(); g.position.set(x,0,z); g.rotation.y=rotY; parent.add(g);
  box(g,MAT.metal,.5,.05,.5,0,.5,0,{noCollide:true});
  box(g,MAT.metal,.5,.5,.05,0,.8,-.22,{noCollide:true});
  const wm=new THREE.MeshStandardMaterial({color:0x222528,roughness:.6});
  for(const s of [-1,1]){ const w=new THREE.Mesh(new THREE.TorusGeometry(.3,.04,6,14),wm);
    w.rotation.y=Math.PI/2; w.position.set(s*.28,.3,0); g.add(w); }
  collNoMesh(x-.4,z-.4,x+.4,z+.4,1,'furniture');
  return g;
}
function makeCeilingLamp(parent,x,z,on=true,flicker=false,color=0xfff2cc,intensity=1.1){
  const g=new THREE.Group(); g.position.set(x,3.05,z); parent.add(g);
  const shade=new THREE.Mesh(new THREE.CylinderGeometry(.28,.36,.12,10),
    new THREE.MeshStandardMaterial({color:0x777060,roughness:.6,metalness:.4}));
  g.add(shade);
  const bulbMat=new THREE.MeshStandardMaterial({color:0xffffee,emissive:on?color:0x000000,emissiveIntensity:on?2:.05});
  const bulb=new THREE.Mesh(new THREE.SphereGeometry(.11,8,8),bulbMat); bulb.position.y=-.08; g.add(bulb);
  let light=null;
  if(on){ light=new THREE.PointLight(color,intensity,9,1.9); light.position.y=-.25; g.add(light); }
  const lamp={g,bulbMat,light,on,flicker,baseInt:intensity,t:rand(0,10)};
  W.lights.push(lamp);
  return lamp;
}
function makeCorpse(parent,x,z,rotY=0){
  const g=new THREE.Group(); g.position.set(x,0,z); g.rotation.y=rotY; parent.add(g);
  const sk=new THREE.MeshStandardMaterial({color:0x8a9a86,roughness:1});
  const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.22,.7,4,8),sk);
  torso.rotation.z=Math.PI/2; torso.position.y=.22; torso.castShadow=true; g.add(torso);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.16,8,8),sk); head.position.set(-.62,.2,0); g.add(head);
  for(const s of [-1,1]){ const arm=new THREE.Mesh(new THREE.CapsuleGeometry(.06,.5,3,6),sk);
    arm.position.set(rand(-.2,.2),.15,s*.3); arm.rotation.x=s*.8; g.add(arm); }
  collNoMesh(x-.6,z-.45,x+.6,z+.45,.4,'low');
  W.corpses.push(g);
  return g;
}
function makeLever(parent,x,z,axis,label,cb){
  const g=new THREE.Group(); g.position.set(x,1.3,z); parent.add(g);
  if(axis==='x') g.rotation.y=Math.PI/2;
  const plate=new THREE.Mesh(new THREE.BoxGeometry(.4,.5,.06),MAT.metal); g.add(plate);
  const stick=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.28,6),new THREE.MeshStandardMaterial({color:0xaa2222,emissive:0x440000}));
  stick.rotation.z=Math.PI/3; stick.position.set(0,.05,.1); g.add(stick);
  const obj={type:'lever',obj:g,stick,x,z,used:false,prompt:label,cb};
  W.interactables.push(obj);
  return obj;
}

/* ================= СТЕНЫ С ПРОЁМАМИ ================= */
function wallSeg(parent,mat,axis,fixedCoord,a,b,hgt,notch){
  const t=.2, H=hgt||3.2;
  const parts=[];
  if(notch){
    if(notch.from>a+.05) parts.push([a,notch.from]);
    if(notch.to<b-.05) parts.push([notch.to,b]);
    if(axis==='x') box(parent,mat,notch.to-notch.from,H-2.5,t,(notch.from+notch.to)/2,2.5+(H-2.5)/2,fixedCoord,{tag:'wall'});
    else box(parent,mat,t,H-2.5,notch.to-notch.from,fixedCoord,2.5+(H-2.5)/2,(notch.from+notch.to)/2,{tag:'wall'});
  } else parts.push([a,b]);
  for(const [s,e] of parts){
    const len=e-s; if(len<=.05) continue;
    const c=(s+e)/2;
    if(axis==='x') box(parent,mat,len,H,t,c,H/2,fixedCoord,{tag:'wall'});
    else box(parent,mat,t,H,len,fixedCoord,H/2,c,{tag:'wall'});
  }
}
function floorCeil(parent,cx,cz,w,d,hgt,fmat){
  const fl=new THREE.Mesh(new THREE.PlaneGeometry(w,d),fmat||MAT.floor);
  fl.rotation.x=-Math.PI/2; fl.position.set(cx,.01,cz); fl.receiveShadow=true; parent.add(fl);
  const ce=new THREE.Mesh(new THREE.PlaneGeometry(w,d),MAT.ceil);
  ce.rotation.x=Math.PI/2; ce.position.set(cx,hgt,cz); parent.add(ce);
}
function bloodDecal(parent,x,y,z,scale=1,rot=[0,0,0]){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(1.3*scale,1.3*scale),MAT.blood);
  m.position.set(x,y,z); m.rotation.set(...rot); parent.add(m); return m;
}
function writeText(parent,x,y,z,text,size,color,rotY=0){
  const c=document.createElement('canvas'); c.width=1024;c.height=160;
  const g=c.getContext('2d'); g.clearRect(0,0,1024,160);
  g.font=`bold ${size}px Georgia`; g.textAlign='center'; g.textBaseline='middle';
  g.fillStyle=color; g.fillText(text,512,80);
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(4,.62),new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false}));
  m.position.set(x,y,z); m.rotation.y=rotY; parent.add(m);
}
function poster(parent,x,y,z,ry,key){
  const p=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshStandardMaterial({map:TEX.poster(key),roughness:1}));
  p.position.set(x,y,z); p.rotation.y=ry; parent.add(p);
}
function makeBathtub(parent,x,z){
  box(parent,new THREE.MeshStandardMaterial({color:0xb9bdb4,roughness:.4}),1.6,.5,.8,x,.25,z,{tag:'furniture'});
}

/* ================= СОБРАНИЕ МИРА ================= */
export function buildWorld(scene){
  W.walls.length=0; W.doors.length=0; W.interactables.length=0; W.lights.length=0; W.corpses.length=0;
  const root=new THREE.Group(); scene.add(root);
  const H=3.2;

  const bigFloor=new THREE.Mesh(new THREE.PlaneGeometry(140,110),new THREE.MeshStandardMaterial({color:0x1c1e18,roughness:1}));
  bigFloor.rotation.x=-Math.PI/2; bigFloor.position.y=-.03; bigFloor.receiveShadow=true; root.add(bigFloor);

  /* ---- ГЛАВНЫЙ КОРИДОР: x[-24..24], z[-1.5..1.5] ---- */
  floorCeil(root,0,0,48,3,H);
  wallSeg(root,MAT.wall,'x',-1.5,-24,24,H,{from:7,to:9});     // проём к холлу Б
  wallSeg(root,MAT.wall,'x',1.5,-24,24,H,{from:-2,to:0});     // проём к палате 4 (старт)
  wallSeg(root,MAT.wall,'z',24,-1.5,1.5,H,{from:-.8,to:.8});  // в операционную
  const line=new THREE.Mesh(new THREE.PlaneGeometry(47,.12),new THREE.MeshBasicMaterial({color:0x8a7a2a,transparent:true,opacity:.3}));
  line.rotation.x=-Math.PI/2; line.position.set(0,.02,0); root.add(line);
  for(let x=-20;x<=20;x+=5) makeCeilingLamp(root,x,0,true,Math.random()<.55,x%10===0?0xffe9c0:0xd8e8ff,.9);
  bloodDecal(root,-9,1.4,-1.36,1.6);
  bloodDecal(root,6,1.2,1.36,1.3,[0,Math.PI,0]);
  writeText(root,-14,2.0,-1.34,'ОНИ В ГОЛОВЕ',60,'#7a1010');
  writeText(root,10,2.0,1.34,'МИШУТКА ЖИВ',56,'#6a0d0d',Math.PI);
  writeText(root,-1,2.4,1.34,'← ПАЛАТА 4',34,'#8a8070',Math.PI);
  makeContainer(root,-19,-1.15,'nightstand',[{item:'bandage',n:1}],{});
  makeContainer(root,3,1.15,'nightstand',[{item:'battery',n:1}],{});
  makeContainer(root,17,-1.15,'locker',[{item:'knife',n:1}],{});
  makeChair(root,-6,1.0,Math.PI);
  makeCorpse(root,13,-.6,Math.PI/2);

  /* ---- ПРИЁМНАЯ ЗАПАД: x[-32..-24], z[-6..6] ---- */
  floorCeil(root,-28,0,8,12,H);
  wallSeg(root,MAT.wall,'x',-6,-32,-24,H,{from:-28.75,to:-27.25}); // проём в морг
  wallSeg(root,MAT.wall,'x',6,-32,-24,H);
  wallSeg(root,MAT.wall,'z',-32,-6,6,H);
  wallSeg(root,MAT.wall,'z',-24,-6,-1.7,H);
  wallSeg(root,MAT.wall,'z',-24,1.7,6,H);
  makeCeilingLamp(root,-28,0,true,false,0xfff2cc,1.2);
  makeCeilingLamp(root,-28,4,true,true);
  box(root,MAT.darkWood,4,1.1,1,-29,.55,-3,{shadow:true,tag:'furniture'});
  box(root,MAT.wood,4.2,.08,1.2,-29,1.15,-3,{noCollide:true});
  makeChair(root,-29.5,-1.5,Math.PI);
  makeContainer(root,-25.5,-5.4,'cabinet',[{item:'bandage',n:1},{item:'coat_winter',n:1}],{});
  makeContainer(root,-25.5,5.4,'locker',[{item:'pistol',n:1},{item:'ammo',n:6}],{});
  makeTable(root,-27,3,1.2,.7);
  poster(root,-31.85,1.8,0,Math.PI/2,'rules');
  poster(root,-28,-5.85,0,0,'doctor');
  writeText(root,-28,2.6,5.83,'ПРИЁМНОЕ ОТДЕЛЕНИЕ',34,'#8a8070',Math.PI);
  meta.recepDoor=makeDoor(root,-24,0,'z',{prompt:'Дверь из приёмной в коридор'});
  meta.morgDoor=makeDoor(root,-28,-6,'x',{locked:true,keyType:'normal',prompt:'Дверь в морг — заперта'});
  makeLever(root,-31.6,3,'z','РУБИЛЬНИК ЩИТОВЫХ ДВЕРЕЙ',()=>{
    if(meta.shieldDoors && !meta.shieldsOn){ meta.shieldsOn=true;
      meta.shieldDoors.forEach(d=>openDoor(d));
      if(window.__toast) window.__toast('Гудёж... щитовые двери открыты.');
      if(window.__sfx) window.__sfx.doorOpen(); }
  });

  /* ---- МОРГ: x[-32..-24], z[-14..-6] ---- */
  floorCeil(root,-28,-10,8,8,H);
  wallSeg(root,MAT.tile,'x',-14,-32,-24,H);
  wallSeg(root,MAT.tile,'z',-32,-14,-6,H);
  wallSeg(root,MAT.tile,'z',-24,-14,-6,H);
  wallSeg(root,MAT.tile,'x',-6,-32,-28.75,H);
  wallSeg(root,MAT.tile,'x',-6,-27.25,-24,H);
  makeCeilingLamp(root,-28,-10,true,true,0xbfe8ff,.8);
  for(let i=0;i<3;i++){
    box(root,MAT.metal,1.9,.12,.8,-26,.85,-8-i*1.7,{noCollide:true,shadow:true});
    box(root,MAT.metal,.25,.85,.25,-26,.4,-8-i*1.7,{noCollide:true});
    collNoMesh(-27,-8.4-i*1.7,-25,-7.6-i*1.7,1,'furniture');
    const sh=new THREE.Mesh(new THREE.SphereGeometry(.3,8,6,0,Math.PI*2,0,Math.PI/2),
      new THREE.MeshStandardMaterial({color:0xcfcabb,roughness:1}));
    sh.position.set(-26+rand(-.4,.4),.92,-8-i*1.7); sh.scale.set(2.2,1,1.05); root.add(sh);
  }
  for(let i=0;i<4;i++){
    box(root,MAT.metal,.6,.9,1.1,-31.3,.5,-7.8-i*1.5,{tag:'furniture'});
    const handle=new THREE.Mesh(new THREE.BoxGeometry(.05,.05,.5),new THREE.MeshStandardMaterial({color:0x1a1a1a}));
    handle.position.set(-30.95,.5,-7.8-i*1.5); root.add(handle);
    if(i===1){ const cc=new THREE.Mesh(new THREE.CapsuleGeometry(.18,.5,3,6),new THREE.MeshStandardMaterial({color:0x77807a,roughness:1}));
      cc.rotation.z=Math.PI/2; cc.position.set(-31.1,.3,-7.8-i*1.5); cc.scale.z=.5; root.add(cc);
      const hh=new THREE.Mesh(new THREE.SphereGeometry(.13,8,8),new THREE.MeshStandardMaterial({color:0x6f7a70}));
      hh.position.set(-30.7,.32,-7.8-i*1.5); root.add(hh); }
  }
  makeContainer(root,-24.8,-13.4,'locker',[{item:'earplugs',n:1},{item:'ammo',n:6}],{});
  writeText(root,-28,2.3,-13.83,'ЗДЕСЬ ХРАНЯТ ТЕХ, КТО ВСПОМНИЛ',30,'#7a1010');
  bloodDecal(root,-28,.04,-11.5,2.2,[-Math.PI/2,0,0]);
  poster(root,-24.15,1.8,-10,-Math.PI/2,'warning');

  /* ---- ПАЛАТЫ A (север): старт — палата 4 x[-2..2] ---- */
  const wardA=[-14,-10,-6,-2];
  wardA.forEach((cx,i)=>{
    const mid=cx+2;
    floorCeil(root,mid,5,4,7,H);
    wallSeg(root,i%2?MAT.tile:MAT.wall,'x',8.5,cx,cx+4,H);
    wallSeg(root,i%2?MAT.tile:MAT.wall,'z',cx,1.5,8.5,H);
    wallSeg(root,i%2?MAT.tile:MAT.wall,'z',cx+4,1.5,8.5,H);
    if(i!==3) wallSeg(root,i%2?MAT.tile:MAT.wall,'x',1.5,cx,cx+4,H,null);
    makeCeilingLamp(root,mid,5,i!==1,i===2,0xfff2cc,.9);
    makeBed(root,cx+1,7,0);
    makeBed(root,cx+3,7,0);
    makeNightstand(root,cx+2,8.2);
    makeIV(root,cx+3.6,3.2);
    makeContainer(root,cx+.35,2.1,'locker',[{item:i===0?'medkit':'bandage',n:1}],{});
    if(i===1){ bloodDecal(root,mid,1.5,8.36,2); writeText(root,mid,2.4,8.34,'ТЫ ОДИН ИЗ НАС',40,'#7a1010'); }
    if(i===2){ makeWheelchair(root,mid+1,3,Math.PI/2); }
    writeText(root,cx+.12,2,5,'ПАЛАТА '+(4-i),30,'#6a6455',Math.PI/2);
  });
  meta.startPos={x:0,z:5};

  /* ---- ПАЛАТЫ C (юг) ---- */
  const wardC=[-16,-12,-8];
  wardC.forEach((cx,i)=>{
    const mid=cx+2;
    floorCeil(root,mid,-5,4,7,H);
    wallSeg(root,i===0?MAT.tile:MAT.wall,'x',-8.5,cx,cx+4,H);
    wallSeg(root,i===0?MAT.tile:MAT.wall,'z',cx,-8.5,-1.5,H);
    wallSeg(root,i===0?MAT.tile:MAT.wall,'z',cx+4,-8.5,-1.5,H);
    makeCeilingLamp(root,mid,-5,i!==2,i===1,0xfff2cc,.85);
    makeBed(root,cx+2,-7,Math.PI);
    makeNightstand(root,cx+3.2,-2.4);
    makeContainer(root,cx+.4,-8.1,'cabinet',[{item:'battery',n:1}],{});
    if(i===0){ makeBathtub(root,cx+2.8,-6.5); bloodDecal(root,cx+2.8,.03,-6.5,1.3,[-Math.PI/2,0,0]); }
    if(i===1){ makeCorpse(root,cx+1,-3,0); }
    if(i===2){ makeWheelchair(root,cx+2.6,-3,Math.PI); }
  });

  /* ---- ХОЛЛ БЛОКА Б: x[4..16], z[-12..-1.5] ---- */
  floorCeil(root,10,-7,12,10.5,H);
  wallSeg(root,MAT.wall,'x',-12,4,16,H);
  wallSeg(root,MAT.wall,'z',4,-12,-1.5,H);
  wallSeg(root,MAT.wall,'z',16,-12,-1.5,H);
  makeCeilingLamp(root,7,-4,true,true,0xffe9c0,.9);
  makeCeilingLamp(root,13,-9,true,false,0xfff2cc,1.1);
  makeTable(root,10,-7,2,1);
  for(let i=0;i<4;i++) makeChair(root,8.6+i*.9,-5.8,Math.PI);
  makeContainer(root,5.2,-11.3,'locker',[{item:'ammo',n:12},{item:'vest',n:1}],{});
  makeContainer(root,15.2,-4,'cabinet',[{item:'battery',n:2},{item:'pants_cargo',n:1}],{});
  poster(root,10,-11.85,Math.PI,'warning');
  writeText(root,10,2.5,-11.83,'БЛОК Б',64,'#8a8070',Math.PI);
  box(root,MAT.metal,2.2,2.6,.3,14.5,1.3,-11.7,{tag:'wall'});
  writeText(root,14.5,1.8,-11.4,'ЛИФТ НЕ РАБОТАЕТ',26,'#aa3030',Math.PI);
  makeCorpse(root,6,-9,Math.PI/3);
  meta.exitHallDoor=makeDoor(root,16,-8,'z',{locked:true,keyType:'shield',prompt:'ЩИТОВАЯ ДВЕРЬ — заклинило',swing:1});
  meta.shieldDoors=[meta.exitHallDoor];

  /* ---- ОПЕРАЦИОННАЯ: x[24..32], z[-6..6] ---- */
  floorCeil(root,28,0,8,12,H);
  wallSeg(root,MAT.tile,'x',-6,24,32,H);
  wallSeg(root,MAT.tile,'x',6,24,32,H,{from:29.25,to:30.75}); // проём в кабинет
  wallSeg(root,MAT.tile,'z',32,-6,6,H);
  makeCeilingLamp(root,28,-2,true,false,0xffffff,1.4);
  makeCeilingLamp(root,28,2,true,true,0xffffff,1.0);
  box(root,MAT.metal,2.2,.15,.9,28,.95,0,{noCollide:true,shadow:true});
  box(root,MAT.metal,.3,.9,.3,28,.45,0,{noCollide:true});
  collNoMesh(26.9,-.5,29.1,.5,1.1,'furniture');
  bloodDecal(root,28,.03,0,1.8,[-Math.PI/2,0,0]);
  const surg=new THREE.Group(); surg.position.set(28,2.6,0); root.add(surg);
  const disc=new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,.12,14),new THREE.MeshStandardMaterial({color:0xdddddd,emissive:0xfff8e0,emissiveIntensity:1.5}));
  surg.add(disc);
  makeTable(root,30.5,-3,1,.6);
  for(let i=0;i<5;i++){ const s=new THREE.Mesh(new THREE.BoxGeometry(.25,.02,.05),MAT.metal);
    s.position.set(30.3+rand(-.2,.2),.8,-3+rand(-.2,.2)); s.rotation.y=rand(0,3); root.add(s);}
  makeContainer(root,24.8,-5,'locker',[{item:'shotgun',n:1},{item:'ammo',n:8}],{});
  makeContainer(root,31.2,5,'cabinet',[{item:'medkit',n:1},{item:'mask_doc',n:1}],{});
  writeText(root,28,2.6,-5.83,'РАЗРЕЖЕМ ЗАБВЕНИЕ',44,'#8a1515');
  bloodDecal(root,25.5,1.3,-5.83,1.8);
  makeCorpse(root,26,4,Math.PI);
  meta.officeDoor=makeDoor(root,30,6,'x',{locked:true,keyType:'office',prompt:'Кабинет главного врача — элитный замок'});

  /* ---- КАБИНЕТ ТАМИКА: x[24..32], z[6..14] ---- */
  floorCeil(root,28,10,8,8,H);
  wallSeg(root,MAT.wall,'x',14,24,32,H);
  wallSeg(root,MAT.wall,'z',24,6,14,H);
  wallSeg(root,MAT.wall,'z',32,6,14,H);
  wallSeg(root,MAT.wall,'x',6,24,29.25,H);
  wallSeg(root,MAT.wall,'x',6,30.75,32,H);
  makeCeilingLamp(root,28,10,true,false,0xffe0b0,1.3);
  box(root,MAT.darkWood,2.6,.9,1.2,28,.45,12.5,{shadow:true,tag:'furniture'});
  box(root,MAT.wood,2.8,.06,1.35,28,.93,12.5,{noCollide:true});
  makeChair(root,28,11.2,Math.PI);
  makeChair(root,28,8.5,0);
  box(root,MAT.darkWood,.4,2.4,3,24.5,1.2,8,{tag:'furniture'});
  box(root,MAT.darkWood,.4,2.4,3,24.5,1.2,12,{tag:'furniture'});
  for(let i=0;i<24;i++){ const b=new THREE.Mesh(new THREE.BoxGeometry(.06+rand(0,.05),.22+rand(0,.12),.16),
    new THREE.MeshStandardMaterial({color:new THREE.Color().setHSL(rand(0,.12),.4,.22)}));
    b.position.set(24.25,.35+Math.floor(i/8)*.62,7+(i%8)*.34); root.add(b); }
  makeContainer(root,31.2,7.5,'cabinet',[{item:'keycard',n:1}],{locked:true,label:'Сейф Тамика'});
  poster(root,28,1.8,6.15,Math.PI,'mirror');
  const mirr=new THREE.Mesh(new THREE.PlaneGeometry(1.6,2.2),new THREE.MeshStandardMaterial({color:0x1c2028,metalness:.98,roughness:.05}));
  mirr.position.set(25.6,1.4,10); mirr.rotation.y=Math.PI/2; root.add(mirr);
  writeText(root,28,2.6,13.83,'Д-Р ТАМИК',52,'#9a8a6a',Math.PI);
  bloodDecal(root,26.5,1.2,13.85,1.5,[0,Math.PI,0]);

  /* ---- КОРИДОР ВЫХОДА: x[16..24], z[-9..-7] ---- */
  floorCeil(root,20,-8,8,2,H);
  wallSeg(root,MAT.wall,'x',-9,16,24,H);
  wallSeg(root,MAT.wall,'x',-7,16,24,H);
  wallSeg(root,MAT.wall,'z',24,-9,-7,H);
  makeCeilingLamp(root,19,-8,true,true,0xffd0d0,.7);
  makeContainer(root,22,-7.6,'nightstand',[{item:'ammo',n:8}],{});
  makeContainer(root,17.5,-8.4,'cabinet',[{item:'baton',n:1},{item:'armor',n:1}],{});
  meta.finalDoor=makeDoor(root,24,-8,'z',{locked:true,keyType:'exit',prompt:'ГЛАВНЫЙ ВЫХОД — засов',barricaded:true,swing:1});
  writeText(root,23.9,2.2,-8,'ВЫХОД',60,'#3a7a3a',-Math.PI/2);

  // бочки в коридоре
  for(let i=0;i<5;i++){ const bx=rand(-20,20); if(Math.abs(bx)<3) continue;
    const bz=(bx>0)?2.6:-2.6;
    const b=new THREE.Mesh(new THREE.CylinderGeometry(.32,.32,.9,10),MAT.metal);
    b.position.set(bx,.45,bz); b.castShadow=true; root.add(b);
    collNoMesh(bx-.32,bz-.32,bx+.32,bz+.32,.9,'furniture'); }

  scene.userData.worldRoot=root;
  return { root, MAT };
}
