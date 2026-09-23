// monsters.js — призраки, порождения сознания Мишутки + босс Д-р Тамик
import * as THREE from 'three';
import { rand } from './util.js';

/* ---------- скелет-хелперы ---------- */
function limb(mat,len,r){
  const g=new THREE.Group();
  const m=new THREE.Mesh(new THREE.CapsuleGeometry(r,len,4,6),mat);
  m.position.y=-len/2-r; m.castShadow=true; g.add(m);
  return g;
}
function joint(parent,mat,r){ const j=new THREE.Mesh(new THREE.SphereGeometry(r,6,6),mat); parent.add(j); return j; }

// базовый гуманоид с иерархией костей для анимации
function humanoid(opts){
  const mat=new THREE.MeshStandardMaterial({ color:opts.color, roughness:.9, metalness:0,
    transparent:!!opts.ghostly, opacity:opts.ghostly? .78 :1, emissive:opts.emissive||0x000000, emissiveIntensity:opts.emissiveI||0 });
  const root=new THREE.Group();
  const hips=new THREE.Group(); hips.position.y=opts.hipY||.95; root.add(hips);
  const torso=limb(mat,.5,.13); torso.rotation.x=Math.PI; torso.position.y=.05; hips.add(torso);
  const chest=new THREE.Group(); chest.position.y=.62; hips.add(chest);
  const head=new THREE.Group(); head.position.y=.18; chest.add(head);
  const hm=new THREE.Mesh(new THREE.SphereGeometry(.16,8,8),mat); hm.castShadow=true; head.add(hm);
  const arms=[];
  for(const s of [-1,1]){
    const sh=new THREE.Group(); sh.position.set(s*.19,.52,0); chest.add(sh);
    const up=limb(mat,.32,.055); sh.add(up);
    const el=joint(up,mat,.05); el.position.y=-.36;
    const lo=limb(mat,.3,.045); el.add(lo);
    arms.push({sh,el,lo});
  }
  const legs=[];
  for(const s of [-1,1]){
    const hp=new THREE.Group(); hp.position.set(s*.1,0,0); hips.add(hp);
    const up=limb(mat,.42,.07); hp.add(up);
    const kn=joint(up,mat,.06); kn.position.y=-.46;
    const lo=limb(mat,.4,.05); kn.add(lo);
    legs.push({hp,kn,lo});
  }
  return {root,hips,chest,head,arms,legs,mat,hm};
}
function eyes(parent,mat,color,y=.02,z=.15,dx=.07,r=.03){
  for(const s of [-1,1]){
    const e=new THREE.Mesh(new THREE.SphereGeometry(r,6,6),new THREE.MeshBasicMaterial({color}));
    e.position.set(s*dx,y,z); parent.add(e);
  }
}

/* ---------- виды монстров ---------- */
export function buildMonster(type){
  switch(type){
    case 'crawler':{ // Шмыг — ползучий комок
      const g=new THREE.Group();
      const mat=new THREE.MeshStandardMaterial({color:0x1c1a1f,roughness:1});
      const body=new THREE.Mesh(new THREE.SphereGeometry(.42,10,8),mat);
      body.scale.set(1.4,.7,1); body.position.y=.35; body.castShadow=true; g.add(body);
      const limbs=[];
      for(let i=0;i<6;i++){
        const a=i/6*Math.PI*2;
        const l=limb(mat,.35,.035); l.position.set(Math.cos(a)*.4,.5,Math.sin(a)*.28);
        l.rotation.z=Math.cos(a)*1.6; l.rotation.x=Math.sin(a)*1.6;
        g.add(l); limbs.push({l,a});
      }
      eyes(body,mat,0xffe9c0,.05,.4,.1,.04);
      return {root:g, limbs, parts:{body}, hipY:.35};
    }
    case 'shadow':{ // Тень — силуэт в плаще
      const h=humanoid({color:0x050508, ghostly:true, emissive:0x0a0a18, emissiveI:.6, hipY:1.05});
      const cloak=new THREE.Mesh(new THREE.ConeGeometry(.5,1.5,8,1,true),
        new THREE.MeshStandardMaterial({color:0x050508,transparent:true,opacity:.85,side:THREE.DoubleSide}));
      cloak.position.y=.6; h.chest.add(cloak);
      eyes(h.head,0xffffff===undefined?null:h.mat,0xdcdcff,.02,.14,.07,.028);
      return {root:h.root, rig:h};
    }
    case 'stretcher':{ // Носильщик — с каталкой-руками
      const h=humanoid({color:0x9aa08c, hipY:1.0});
      h.mat.color.setHex(0x8a907c);
      const tray=new THREE.Mesh(new THREE.BoxGeometry(.9,.05,1.5),new THREE.MeshStandardMaterial({map:null,color:0x777d80,metalness:.6,roughness:.4}));
      tray.position.set(0,.4,.55); h.chest.add(tray);
      const lump=new THREE.Mesh(new THREE.SphereGeometry(.22,8,6),new THREE.MeshStandardMaterial({color:0xcfcabb}));
      lump.scale.set(1.6,.7,1); lump.position.set(0,.5,.55); h.chest.add(lump);
      eyes(h.head,null,0x220000,.02,.15,.06,.035);
      return {root:h.root, rig:h};
    }
    case 'sister':{ // Медсестра Рита — улыбка до ушей
      const h=humanoid({color:0xd8d2c8, hipY:.98});
      const dress=new THREE.Mesh(new THREE.ConeGeometry(.42,1.1,10),new THREE.MeshStandardMaterial({color:0xe8e2d8}));
      dress.position.y=.35; h.hips.add(dress);
      const cap=new THREE.Mesh(new THREE.BoxGeometry(.2,.08,.14),new THREE.MeshStandardMaterial({color:0xf0ece2}));
      cap.position.y=.17; h.head.add(cap);
      const smile=new THREE.Mesh(new THREE.PlaneGeometry(.2,.12),
        new THREE.MeshBasicMaterial({color:0x000000}));
      smile.position.set(0,-.02,.165); h.head.add(smile);
      const teeth=new THREE.Mesh(new THREE.PlaneGeometry(.18,.03),new THREE.MeshBasicMaterial({color:0xffffff}));
      teeth.position.set(0,-.005,.167); h.head.add(teeth);
      eyes(h.head,null,0xff2020,.05,.15,.06,.03);
      return {root:h.root, rig:h, smile};
    }
    case 'patient4':{ // Пациент №4 — сам Мишутка из отражения
      const h=humanoid({color:0xb8a888, hipY:.98});
      h.mat.color.setHex(0xa89878);
      const gown=new THREE.Mesh(new THREE.BoxGeometry(.42,.7,.3),new THREE.MeshStandardMaterial({color:0xcfc9ba}));
      gown.position.y=.3; h.hips.add(gown);
      // трещины на голове
      for(let i=0;i<4;i++){ const cr=new THREE.Mesh(new THREE.BoxGeometry(.01,.2,.01),new THREE.MeshBasicMaterial({color:0x3a0505}));
        cr.position.set(rand(-.1,.1),rand(0,.2),.15); cr.rotation.z=rand(-1,1); h.head.add(cr); }
      eyes(h.head,null,0xff4020,.03,.155,.06,.04);
      return {root:h.root, rig:h};
    }
    case 'tamik':{ // БОСС: главный врач Тамик
      const h=humanoid({color:0x2a2d34, hipY:1.15});
      h.mat.color.setHex(0x23262c);
      const coat=new THREE.Mesh(new THREE.BoxGeometry(.55,1.15,.4),new THREE.MeshStandardMaterial({color:0xe8e6de,roughness:.8}));
      coat.position.y=.15; h.chest.add(coat);
      const head2=new THREE.Mesh(new THREE.SphereGeometry(.19,10,8),new THREE.MeshStandardMaterial({color:0xc8b28f,roughness:.9}));
      head2.position.y=.05; h.head.add(head2);
      const mask=new THREE.Mesh(new THREE.BoxGeometry(.24,.16,.1),new THREE.MeshStandardMaterial({color:0x8fbf9f}));
      mask.position.set(0,-.02,.16); h.head.add(mask);
      const glasses=new THREE.Mesh(new THREE.TorusGeometry(.06,.012,6,10),new THREE.MeshStandardMaterial({color:0x111,metalness:.8}));
      glasses.position.set(-.07,.06,.18); h.head.add(glasses);
      const gl2=glasses.clone(); gl2.position.x=.07; h.head.add(gl2);
      const syringe=new THREE.Mesh(new THREE.CylinderGeometry(.02,.02,.3,6),new THREE.MeshStandardMaterial({color:0xcccccc,metalness:.6}));
      syringe.position.set(.05,-.5,.1); h.arms[1].lo.add(syringe);
      const needle=new THREE.Mesh(new THREE.ConeGeometry(.01,.15,5),new THREE.MeshStandardMaterial({color:0xddd,metalness:.9}));
      needle.position.y=-.2; syringe.add(needle);
      eyes(h.head,null,0xffd700,.07,.19,.07,.025);
      const halo=new THREE.PointLight(0xff4400,1.6,6); halo.position.y=1.4; h.root.add(halo);
      return {root:h.root, rig:h, halo};
    }
    default:{
      const h=humanoid({color:0x111114}); return {root:h.root, rig:h};
    }
  }
}

export const MONSTER_TYPES = {
  crawler:   { name:'ШМЫГ',      speed:3.4, hp:35, dmg:9,  sight:16, fearLight:1.3, sanityDrain:5, yOff:0 },
  shadow:    { name:'ТЕНЬ',      speed:2.2, hp:50, dmg:12, sight:20, fearLight:1.9, sanityDrain:7, yOff:0 },
  stretcher: { name:'НОСИЛЬЩИК', speed:2.9, hp:80, dmg:16, sight:15, fearLight:1.0, sanityDrain:4, yOff:0 },
  sister:    { name:'МЕДСЕСТРА', speed:2.6, hp:45, dmg:10, sight:18, fearLight:1.5, sanityDrain:8, yOff:0 },
  patient4:  { name:'ПАЦИЕНТ №4',speed:3.1, hp:60, dmg:14, sight:17, fearLight:1.2, sanityDrain:9, yOff:0 },
  tamik:     { name:'Д-Р ТАМИК', speed:2.6, hp:650,dmg:24, sight:30, fearLight:.3,  sanityDrain:6, yOff:0 },
};

/* ================= ИИ ================= */
export class Monster{
  constructor(scene,type,pos,isBoss=false){
    this.type=type; this.def=MONSTER_TYPES[type]; this.isBoss=isBoss;
    this.hp=this.def.hp*(isBoss?1:1); this.maxHp=this.hp;
    this.pos=pos.clone(); this.vel=new THREE.Vector3();
    this.dir=rand(0,Math.PI*2);
    this.state='idle'; this.stateT=0; this.alertT=0;
    this.attackCd=0; this.stagger=0; this.dead=false; this.deathT=0;
    this.wanderTarget=null; this.repathT=0; this.lastSeen=null;
    this.anim=rand(0,10); this.trapped=0;
    const b=buildMonster(type);
    this.model=b.rig? b.rig.root : b.root;
    this.rig=b.rig||null; this.extra=b;
    if(isBoss){ this.model.scale.setScalar(1.5); this.def={...this.def,speed:2.6}; }
    scene.add(this.model);
  }
  distTo(p){ return Math.hypot(this.pos.x-p.x,this.pos.z-p.z); }

  lineOfSight(P,colliders){
    const player={pos:P};
    const d=this.distTo(P);
    if(d>this.def.sight) return false;
    const steps=Math.ceil(d/.5);
    for(let i=1;i<steps;i++){
      const t=i/steps;
      const x=this.pos.x+(player.pos.x-this.pos.x)*t, z=this.pos.z+(player.pos.z-this.pos.z)*t;
      for(const c of colliders){
        if(x>c.min.x-.05&&x<c.max.x+.05&&z>c.min.z-.05&&z<c.max.z+.05) return false;
      }
    }
    return true;
  }

  update(dt,player,colliders,spawnMonster,onAttackPlayer,onSpot){
    if(this.dead){ this.deathT+=dt;
      this.model.rotation.z=Math.min(1.5,this.deathT*1.2);
      this.model.position.y=Math.max(-.6,this.model.position.y-dt*.4);
      this.model.traverse(o=>{ if(o.material&&o.material.opacity!==undefined){ o.material.transparent=true; o.material.opacity=Math.max(0,1-this.deathT*.7);} });
      return;
    }
    this.anim+=dt; this.stateT+=dt; this.attackCd-=dt; this.stagger-=dt;
    const P=player.pos;
    const lightOn=player.flashOn && player.aimAt && player.aimAt(this.pos);
    const inLight=lightOn && this.distTo(P)<11;
    let speedMul=1;
    if(inLight){ speedMul*= (1/(this.def.fearLight)); if(this.type!=='tamik'){ this.trapped=Math.min(1.5,this.trapped+dt*2);} }
    else this.trapped=Math.max(0,this.trapped-dt);
    if(this.stagger>0) speedMul*=.15;
    if(this.trapped>.3) speedMul*=.25;

    const seen=this.lineOfSight(P,colliders)&&this.distTo(P)<this.def.sight;
    if(seen){
      if(this.state!=='chase'){ onSpot&&onSpot(this); }
      this.state='chase'; this.alertT=6; this.lastSeen=P.clone();
    } else if(this.state==='chase'){
      this.alertT-=dt;
      if(this.alertT<=0){ this.state='wander'; this.wanderTarget=null; }
    } else if(this.state==='idle'&&this.stateT>rand(1,3)){
      this.state='wander'; this.stateT=0;
    }

    let target=null;
    if(this.state==='chase'){ target=this.lastSeen||P; }
    else if(this.state==='wander'){
      if(!this.wanderTarget||this.stateT>6||Math.hypot(this.wanderTarget.x-this.pos.x,this.wanderTarget.z-this.pos.z)<1){
        this.wanderTarget={ x:this.pos.x+rand(-9,9), z:this.pos.z+rand(-9,9) }; this.stateT=0;
      }
      target=this.wanderTarget;
    } else { this.model.position.copy(this.pos); this.animate(0); return; }

    // направление к цели с обходом стен (скольжение + тангенциальный манёвр)
    let dx=target.x-this.pos.x, dz=target.z-this.pos.z;
    const dist=Math.hypot(dx,dz)||1; dx/=dist; dz/=dist;
    let mvx=dx, mvz=dz;
    // проверка: если прямой ход блокирует collider — добавляем перпендикулярную составляющую
    const probe=this.probeBlocked(this.pos.x+dx*.8,this.pos.z+dz*.8,colliders);
    if(probe){
      const tang=probe; // -1 или 1
      mvx=dx*.35 + (-dz)*tang*.95; mvz=dz*.35 + dx*tang*.95;
      const l=Math.hypot(mvx,mvz)||1; mvx/=l; mvz/=l;
    }
    const spd=this.def.speed*speedMul*(this.isBoss&&this.phase2?1.35:1);
    let nx=this.pos.x+mvx*spd*dt, nz=this.pos.z+mvz*spd*dt;
    // коллизии монстра со стенами (скольжение по осям)
    if(this.collides(nx,this.pos.z,colliders)){ nx=this.pos.x; mvz*=.5; }
    if(this.collides(nx,nz,colliders)){ nz=this.pos.z; mvx*=.5; }
    // расталкивание с другими монстрами
    this.pos.set(nx,0,nz);
    const wanted=Math.atan2(mvx,mvz);
    this.dir=angleLerp(this.dir,wanted,Math.min(1,dt*6));
    this.model.position.set(this.pos.x,(this.extra.hipY!==undefined?0:0)+ (this.type==='crawler'?0:0),this.pos.z);
    this.model.rotation.y=this.dir;

    // атака
    const reach=this.isBoss?1.9:1.4;
    if(this.state==='chase'&&this.distTo(P)<reach&&this.attackCd<=0&&!inLight||this.state==='chase'&&this.distTo(P)<reach&&this.attackCd<=0&&this.type==='tamik'){
      this.attackCd=this.isBoss?1.4:1.8;
      this.lunge=1;
      onAttackPlayer(this,this.dmg());
    }
    this.lunge=Math.max(0,(this.lunge||0)-dt*3);
    this.animate(spd);
  }
  dmg(){ return this.def.dmg*(this.isBoss&&this.phase2?1.3:1); }
  probeBlocked(x,z,colliders){
    for(const c of colliders){
      if(x>c.min.x-.4&&x<c.max.x+.4&&z>c.min.z-.4&&z<c.max.z+.4){
        // выбрать сторону обхода
        const cx=(c.min.x+c.max.x)/2, cz=(c.min.z+c.max.z)/2;
        const cross=(this.pos.x-cx)*(z-this.pos.z)-(this.pos.z-cz)*(x-this.pos.x);
        return cross>0?-1:1;
      }
    }
    return 0;
  }
  collides(x,z,colliders){
    const r=this.isBoss?.5:.32;
    for(const c of colliders){
      if(x+r>c.min.x&&x-r<c.max.x&&z+r>c.min.z&&z-r<c.max.z) return true;
    }
    return false;
  }
  animate(spd){
    const t=this.anim, rig=this.rig;
    if(!rig){ // crawler
      const L=this.extra.limbs;
      if(L) L.forEach((o,i)=>{ o.l.rotation.x=Math.sin(t*9+i*1.2)*.9; o.l.rotation.z=Math.cos(a2(i)+t*7)*.4; });
      this.model.position.y=Math.sin(t*9)*.05;
      return;
    }
    const walk=spd>0.1?Math.sin(t*8)*.7:Math.sin(t*2)*.08;
    const walk2=spd>0.1?Math.sin(t*8+Math.PI)*.7:Math.sin(t*2+2)*.06;
    rig.legs[0].hp.rotation.x=walk; rig.legs[1].hp.rotation.x=walk2;
    rig.legs[0].kn.rotation.x=Math.max(0,-walk)*.8+.1; rig.legs[1].kn.rotation.x=Math.max(0,-walk2)*.8+.1;
    rig.arms[0].sh.rotation.x=-walk*.8+(this.type==='sister'?Math.sin(t*3)*.15:0);
    rig.arms[1].sh.rotation.x=-walk2*.8;
    rig.arms[0].sh.rotation.z=.15; rig.arms[1].sh.rotation.z=-.15;
    rig.chest.rotation.y=Math.sin(t*8)*.06;
    rig.hips.position.y=(this.isBoss?1.15:.95)+Math.abs(Math.sin(t*8))*.05-(this.lunge*.1);
    if(this.type==='sister') rig.head.rotation.z=Math.sin(t*4)*.2;
    if(this.type==='tamik'){ rig.head.rotation.x=Math.sin(t*2)*.1;
      if(this.halo) this.halo.intensity=1.4+Math.sin(t*6)*.6; }
    if(this.lunge>0){ rig.arms[0].sh.rotation.x=-2.2*this.lunge; }
    // покачивание при телепортации-спавне
  }
  takeDamage(n,stun){ this.hp-=n; this.stagger=Math.max(this.stagger,stun||.25);
    if(this.hp<=0){ this.dead=true; this.hp=0; } }
}
function a2(i){ return i/6*Math.PI*2; }
function angleLerp(a,b,t){
  let d=b-a; while(d>Math.PI)d-=Math.PI*2; while(d<-Math.PI)d+=Math.PI*2;
  return a+d*t;
}
