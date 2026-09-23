// main.js — ядро игры «МИШУТКА: Тихая Падь»
import * as THREE from 'three';
import { SFX, TEX, rand, randi, pick, clamp } from './util.js';
import { buildWorld, W, meta, openDoor } from './world.js';
import { Monster } from './monsters.js';
import { NOTES, ITEMS, CUTSCENE, OBJECTIVES } from './data.js';

window.__sfx = SFX;
const $=id=>document.getElementById(id);
window.__toast=null;

/* ================= СОСТОЯНИЕ ================= */
let renderer,scene,camera,clock;
let player, monsters=[], projectiles=[], pickups=[], noteObjs=[], particles=[];
let raycaster=new THREE.Raycaster();
let state='menu'; // menu|cut|play|inv|puzzle|note|door|dead|win|pause
let keys={}, mouseHeld=false, aimHeld=false;
let yaw=0,pitch=0, locked=false;
let gameTime=0, shakeT=0, shakeAmt=0;
let boss=null, bossSpawned=false, mergeDone=false, endingShown=false;
let flashlight, flashOn=true, flashCharge=100;
let weaponMeshGroup, handItems={};
let currentSlot=0;
let whisperT=3, heartbeatT=0, spawnT=8, ambientT=0;
let puzzleCb=null;
let deathFade=0;
let gameReady=false, loopStarted=false, menuWired=false;

const P = { // параметры игрока
  hp:100,maxHp:100,st:100,san:100, speed:3.2, runSpeed:5.6, crouchSpeed:1.6,
  y:.9, pos:new THREE.Vector3(0,.9,5), vel:new THREE.Vector3(), r:.35,
  weapons:['fists'], ammo:{pistol:0,shotgun:0,revolver:0}, mag:{pistol:0,shotgun:0,revolver:0},
  inv:[], worn:{chest:'shirt_hospital',pants:'pants_gown',head:null,face:null,ear:null,feet:null},
  hasKey:{normal:false,card:false,exit:false},
  attackCd:0, reloadT:0, hurtT:0, stepT:0, bobT:0, notesFound:0, earplugs:false,
};
window.P=P;
let muzzleT=0, qualityScale=1, perfAcc=0, perfFrames=0;

/* ================= UI ХЕЛПЕРЫ ================= */
function safeCall(fn,label){ if(typeof fn!=='function') return; try{ fn(); }catch(err){ console.error('[MIŠUTKA] ошибка в "'+label+'":',err); } }
function toast(msg,dur=3){ const t=$('toast'); t.textContent=msg; t.style.opacity=1;
  clearTimeout(toast._h); toast._h=setTimeout(()=>t.style.opacity=0,dur*1000); }
window.__toast=toast;
function setObjective(txt){ $('objective').innerHTML='ЗАДАЧА:<br>'+txt; }
function updateHUD(){
  $('hpBar').style.width=clamp(P.hp/P.maxHp*100,0,100)+'%';
  $('stBar').style.width=clamp(P.st,0,100)+'%';
  $('snBar').style.width=clamp(P.san,0,100)+'%';
  const w=P.weapons[currentSlot]; const it=ITEMS[w];
  $('handName').textContent=it?it.name:'—';
  if(it&&it.ammo) $('ammoInfo').textContent=`${P.mag[it.ammo]} / ${P.ammo[it.ammo]}`;
  else $('ammoInfo').textContent= it&&it.dmg?'∞':'—';
  $('flashInfo').textContent=`Фонарь: ${flashOn?'ВКЛ':'ВЫКЛ'} · ${Math.round(flashCharge)}%`;
  document.querySelectorAll('#hotbar .slot').forEach((s,i)=>{
    s.classList.toggle('sel',i===currentSlot);
    const k=P.weapons[i]; s.querySelector('.ic').textContent=k?ITEMS[k].icon:'';
  });
  // лицо
  const scared=1-P.san/100;
  $('cracks').setAttribute('opacity',scared>.5?(scared-.5)*2:0);
  $('bloodDrips').setAttribute('opacity',P.hp<45?1:0);
  const m=$('mouth');
  m.setAttribute('d', P.hp<40?'M40 72 Q50 64 60 72': scared>.6?'M40 74 Q50 66 60 74':'M40 70 Q50 74 60 70');
  const pl=2+scared*3.5; $('pupilL').setAttribute('r',pl); $('pupilR').setAttribute('r',pl);
}

/* ================= ИНИЦИАЛИЗАЦИЯ СЦЕНЫ ================= */
function initThree(){
  renderer=new THREE.WebGLRenderer({canvas:$('game'),antialias:true,powerPreference:'high-performance'});
  qualityScale=Math.min(devicePixelRatio,1.75);
  renderer.setPixelRatio(qualityScale);
  renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=.98;
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x04050a);
  scene.fog=new THREE.FogExp2(0x04050a,.055);
  camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.05,120);
  clock=new THREE.Clock();
  scene.add(new THREE.AmbientLight(0x223044,.5));
  const moon=new THREE.DirectionalLight(0x445577,.25); moon.position.set(-20,30,-10); scene.add(moon);
  // статичная карта окружения — металл и стекло начинают «отражать», PBR выглядит дороже
  try{
    const pmrem=new THREE.PMREMGenerator(renderer);
    const envScene=new THREE.Scene(); envScene.background=new THREE.Color(0x0b0f16);
    const warm=new THREE.Mesh(new THREE.PlaneGeometry(20,20),new THREE.MeshBasicMaterial({color:0x3a3528}));
    warm.position.set(0,6,-8); envScene.add(warm);
    const env=pmrem.fromScene(envScene,.04);
    scene.environment=env.texture; pmrem.dispose();
  }catch(e){ /* старые GPU — без env-карты */ }
  addEventListener('resize',()=>{ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth,innerHeight); });
}
/* авто-детект производительности: если FPS падает — снижаем разрешение рендера */
function perfGovernor(dt){
  perfAcc+=dt; perfFrames++;
  if(perfAcc>=2){
    const fps=perfFrames/perfAcc; perfAcc=0; perfFrames=0;
    if(fps<40&&qualityScale>.75){ qualityScale=Math.max(.75,qualityScale-.25); renderer.setPixelRatio(qualityScale); }
    else if(fps>58&&qualityScale<Math.min(devicePixelRatio,1.75)){ qualityScale=Math.min(Math.min(devicePixelRatio,1.75),qualityScale+.25); renderer.setPixelRatio(qualityScale); }
  }
}

/* фонарик (spotlight от камеры) */
function initFlashlight(){
  flashlight=new THREE.SpotLight(0xfff2cc,0,18,Math.PI/6.5,.5,1.4);
  flashlight.castShadow=true;
  flashlight.shadow.mapSize.set(1024,1024);
  flashlight.shadow.camera.near=.1; flashlight.shadow.camera.far=18;
  const tgt=new THREE.Object3D(); scene.add(tgt); flashlight.target=tgt;
  scene.add(flashlight);
}

/* руки и оружие от первого лица */
function initHands(){
  weaponMeshGroup=new THREE.Group(); camera.add(weaponMeshGroup); scene.add(camera);
  const skin=new THREE.MeshStandardMaterial({color:0xc8a078,roughness:.9});
  function arm(s){ const a=new THREE.Group();
    const up=new THREE.Mesh(new THREE.CapsuleGeometry(.05,.22,3,6),skin); up.position.y=-.11; a.add(up);
    const lo=new THREE.Group(); lo.position.y=-.24; a.add(lo);
    const lo2=new THREE.Mesh(new THREE.CapsuleGeometry(.045,.2,3,6),skin); lo2.position.y=-.1; lo.add(lo2);
    const fist=new THREE.Mesh(new THREE.SphereGeometry(.06,6,6),skin); fist.position.y=-.22; lo.add(fist);
    a.position.set(s*.22,-.32,-.45); a.rotation.z=-s*.3;
    return {a,lo,fist};
  }
  handItems.armsL=arm(-1); handItems.armsR=arm(1);
  weaponMeshGroup.add(handItems.armsL.a,handItems.armsR.a);
  rebuildWeaponMeshes();
}
function rebuildWeaponMeshes(){
  ['wep'].forEach(k=>{});
  if(handItems.wep) weaponMeshGroup.remove(handItems.wep);
  const w=P.weapons[currentSlot]; const g=new THREE.Group();
  const met=new THREE.MeshStandardMaterial({color:0x33363b,metalness:.8,roughness:.35});
  const wood=new THREE.MeshStandardMaterial({color:0x5a4022,roughness:.8});
  if(w==='knife'){ const bl=new THREE.Mesh(new THREE.BoxGeometry(.02,.3,.05),new THREE.MeshStandardMaterial({color:0xcccccc,metalness:.9,roughness:.15}));
    bl.position.set(0,-.1,-.3); bl.rotation.x=Math.PI/2.4; g.add(bl); }
  else if(w==='baton'){ const b=new THREE.Mesh(new THREE.CylinderGeometry(.025,.03,.5,6),wood); b.position.set(0,-.15,-.35); b.rotation.x=.9; g.add(b);}
  else if(w==='pipe'){ const b=new THREE.Mesh(new THREE.CylinderGeometry(.03,.03,.7,6),met); b.position.set(0,-.2,-.4); b.rotation.x=1.1; g.add(b);}
  else if(w==='axe'){ const h=new THREE.Mesh(new THREE.CylinderGeometry(.02,.02,.6,6),wood); h.position.set(0,-.2,-.35); h.rotation.x=.8; g.add(h);
    const head=new THREE.Mesh(new THREE.BoxGeometry(.18,.12,.04),met); head.position.set(0,-.45,-.55); g.add(head);}
  else if(w==='katana'){ const bl=new THREE.Mesh(new THREE.BoxGeometry(.02,.6,.04),new THREE.MeshStandardMaterial({color:0xdfe6ee,metalness:.95,roughness:.05}));
    bl.position.set(0,-.25,-.5); bl.rotation.x=.7; g.add(bl);}
  else if(w==='pistol'||w==='revolver'){ const b=new THREE.Mesh(new THREE.BoxGeometry(.05,.09,.22),met); b.position.set(0,-.18,-.4); g.add(b);
    const grip=new THREE.Mesh(new THREE.BoxGeometry(.045,.14,.06),wood); grip.position.set(0,-.28,-.32); grip.rotation.x=.3; g.add(grip);}
  else if(w==='shotgun'){ const b=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.6,6),met); b.rotation.x=1.35; b.position.set(0,-.18,-.45); g.add(b);
    const stock=new THREE.Mesh(new THREE.BoxGeometry(.05,.1,.2),wood); stock.position.set(0,-.24,-.15); g.add(stock);}
  else if(w==='flashlight'){ const b=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,.25,6),new THREE.MeshStandardMaterial({color:0x222,roughness:.5}));
    b.rotation.x=1.4; b.position.set(0,-.18,-.4); g.add(b);
    const lens=new THREE.Mesh(new THREE.CircleGeometry(.033,8),new THREE.MeshBasicMaterial({color:flashOn?0xfff6d0:0x333}));
    lens.position.set(0,-.16,-.53); lens.rotation.x=-1.1; g.add(lens);}
  handItems.wep=g; weaponMeshGroup.add(g);
}
function selectWeapon(i){
  if(i>=P.weapons.length) return;
  currentSlot=i; rebuildWeaponMeshes(); updateHUD();
  SFX.reload();
}

/* ================= ПОДБОРЫ ================= */
function addPickup(item,x,y,z,n=1){
  const g=new THREE.Group(); g.position.set(x,y,z);
  let mesh;
  const met=new THREE.MeshStandardMaterial({color:0xb8a06a,metalness:.6,roughness:.4,emissive:0x443300,emissiveIntensity:.4});
  if(['ammo','shells','mag357'].includes(item)) mesh=new THREE.Mesh(new THREE.BoxGeometry(.18,.08,.1),met);
  else if(item==='battery') mesh=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,.12,8),new THREE.MeshStandardMaterial({color:0x228833,emissive:0x114411}));
  else if(item==='key_normal'||item==='key_exit') mesh=new THREE.Mesh(new THREE.TorusGeometry(.06,.02,6,8),met);
  else if(item==='keycard') mesh=new THREE.Mesh(new THREE.BoxGeometry(.15,.02,.1),new THREE.MeshStandardMaterial({color:0x2255aa,emissive:0x112244}));
  else mesh=new THREE.Mesh(new THREE.BoxGeometry(.15,.15,.15),met);
  mesh.castShadow=true; g.add(mesh);
  const glow=new THREE.PointLight(0xffdd88,.6,2.5); glow.position.y=.1; g.add(glow);
  scene.add(g);
  pickups.push({item,g,mesh,x,y,z,n,t:rand(0,6)});
}

/* ================= ИНВЕНТАРЬ ================= */
function invCapacity(){ return P.worn.pants==='pants_cargo'?24:20; }
const WEAR_SLOT={ 'wear:chest':'chest','wear:pants':'pants','wear:head':'head','wear:face':'face','wear:ear':'ear','wear:feet':'feet' };
function giveItem(item,n=1){
  const def=ITEMS[item]; if(!def) return;
  if(['use','wear:chest','wear:pants','wear:head','wear:face','wear:ear','wear:feet','hand'].includes(def.slot)){
    let cnt=0; for(const s of P.inv) cnt+=s.n;
    if(cnt>=invCapacity()){ toast('Рюкзак набит — освободи место в инвентаре [I].'); return; }
  }
  if(def.slot==='ammoBelt'||['ammo','shells','mag357','battery'].includes(item)){
    if(item==='battery'){ flashCharge=Math.min(100,flashCharge+50); toast('Батарейка вставлена в фонарь.'); }
    else if(item==='ammo'){ P.ammo.pistol+=n; toast(`+${n} патронов 9мм`); }
    else if(item==='shells'){ P.ammo.shotgun+=n; toast(`+${n} патронов 12к`); }
    else if(item==='mag357'){ P.ammo.revolver+=n; toast(`+${n} .357`); }
    updateHUD(); return;
  }
  if(item==='key_normal'){ P.hasKey.normal=true; toast('Получен обычный ключ.'); return; }
  if(item==='keycard'){ P.hasKey.card=true; toast('Получена карта врача.'); return; }
  if(item==='key_exit'){ P.hasKey.exit=true; toast('КЛЮЧ ВЫХОДА! Беги к юго-восточной двери!'); setObjective(OBJECTIVES[7]); return; }
  if(def.slot==='hand'){
    if(!P.weapons.includes(item)){ P.weapons.push(item);
      if(def.ammo&&!P.mag[def.ammo]) P.mag[def.ammo]=0;
      selectWeapon(P.weapons.indexOf(item)); toast(`Подобрано: ${def.name}`); }
    else { P.inv.push({item,n:1}); }
    return;
  }
  if(def.slot.startsWith('wear')){ P.inv.push({item,n}); toast(`${def.name} — надень в инвентаре [I]`); renderInventory(); return; }
  // расходники стакаются
  const st=P.inv.find(s=>s.item===item);
  if(st) st.n+=n; else P.inv.push({item,n});
  toast(`Подобрано: ${def.name}${n>1?' ×'+n:''}`);
  renderInventory();
}
function renderInventory(){
  const grid=$('invGrid'); grid.innerHTML='';
  const cap=invCapacity();
  const cells=Math.ceil(cap/5)*5;
  for(let i=0;i<cells;i++){
    const d=document.createElement('div'); d.className='invCell';
    const s=P.inv[i];
    if(s){ const it=ITEMS[s.item];
      d.innerHTML=`<span>${it.icon}</span>${s.n>1?`<span class="cnt">${s.n}</span>`:''}<span class="nm">${it.name.slice(0,9)}</span>`;
      d.onclick=()=>{ grid.querySelectorAll('.sel').forEach(e=>e.classList.remove('sel')); d.classList.add('sel');
        window.__selInv=i; $('invItemInfo').innerHTML=`<b>${it.name}</b><br>${it.desc}`; }
      d.ondblclick=()=>{ window.__selInv=i; useSelected(); };
    }
    grid.appendChild(d);
  }
  // слоты одежды
  const names={chest:'Туловище',pants:'Ноги',head:'Голова',face:'Лицо',ear:'Уши',feet:'Обувь'};
  $('wearSlots').innerHTML='';
  for(const k of ['chest','pants','head','face','ear','feet']){
    const div=document.createElement('div'); div.className='wearSlot';
    const it=P.worn[k]?ITEMS[P.worn[k]]:null;
    div.textContent=`${names[k]}: ${it?it.name:'—'}`;
    $('wearSlots').appendChild(div);
  }
}
function unequip(slot){
  const cur=P.worn[slot]; if(!cur) return;
  let cnt=0; for(const s of P.inv) cnt+=s.n;
  if(cnt>=invCapacity()){ toast('Рюкзак набит — некуда положить снятую вещь.'); return; }
  P.worn[slot]=null; P.inv.push({item:cur,n:1});
  applyWorn(); renderInventory(); updateHUD(); toast('Снято: '+ITEMS[cur].name);
}
function useSelected(){
  const i=window.__selInv; if(i===undefined||!P.inv[i]) return;
  const s=P.inv[i], it=ITEMS[s.item];
  if(it.slot==='use'){
    if(!it.hp&&!it.san){ toast('Это нельзя использовать.'); return; }
    if(it.hp&&P.hp>=P.maxHp&&!it.san){ toast('Ты цел(а). Прибереги.'); return; }
    if(it.san&&P.san>=100&&!it.hp){ toast('Голова ясная. Таблетки подождут.'); return; }
    if(it.hp){ P.hp=Math.min(P.maxHp,P.hp+it.hp); toast(it.name+' применён'); }
    if(it.san){ P.san=Math.min(100,P.san+it.san); toast('Ты дышешь ровно. Рассудок +'+it.san); }
    s.n--; if(s.n<=0) P.inv.splice(i,1);
  } else if(it.slot.startsWith('wear')){
    const slot=WEAR_SLOT[it.slot]; if(!slot){ toast('Нельзя надеть.'); return; }
    if(P.worn[slot]===s.item){ toast('Уже надето.'); return; }
    if(P.worn[slot]){ P.inv.push({item:P.worn[slot],n:1}); }
    P.worn[slot]=s.item; s.n--; if(s.n<=0) P.inv.splice(i,1);
    applyWorn(); toast('Надето: '+it.name);
  } else if(it.slot==='hand'){
    if(P.worn.feet==='boots') P.st=clamp(P.st+10,0,100);
    selectWeapon(P.weapons.indexOf(s.item)>=0?P.weapons.indexOf(s.item):0);
    s.n--; if(s.n<=0) P.inv.splice(i,1);
  } else { toast('Этот предмет нельзя использовать напрямую.'); return; }
  window.__selInv=undefined;
  renderInventory(); updateHUD();
}
function applyWorn(){
  P.maxHp=100+(P.worn.chest==='coat_winter'?15:0);
  P.earplugs=P.worn.ear==='earplugs';
  updateCharacterSvg();
}
function updateCharacterSvg(){
  const cl=$('clothingLayer'); const wep=$('weaponLayer');
  const chestColors={shirt_hospital:'#d8d2c4',coat_winter:'#3c4a55',vest:'#8a2f1f',armor:'#4a3320'};
  const pantsColors={pants_gown:'#7a7f86',pants_cargo:'#4a5240'};
  $('torsoShape').setAttribute('fill',chestColors[P.worn.chest]||'#d8d2c4');
  $('legsShape').setAttribute('fill',pantsColors[P.worn.pants]||'#7a7f86');
  $('armsShape').setAttribute('fill',chestColors[P.worn.chest]||'#d8d2c4');
  let extra='';
  if(P.worn.head==='cap_nurse') extra+='<path d="M78 28 Q100 12 122 28 L118 20 Q100 8 82 20Z" fill="#f0ece2"/>';
  if(P.worn.head==='beanie') extra+='<path d="M74 34 Q100 6 126 34 Q100 20 74 34Z" fill="#7a2020"/>';
  if(P.worn.face==='mask_doc') extra+='<rect x="86" y="56" width="28" height="14" rx="4" fill="#8fbf9f"/>';
  if(P.worn.face==='gasmask') extra+='<circle cx="90" cy="60" r="7" fill="#333"/><circle cx="110" cy="60" r="7" fill="#333"/><rect x="86" y="56" width="28" height="16" rx="6" fill="#444"/>';
  if(P.worn.ear==='earplugs') extra+='<circle cx="70" cy="52" r="4" fill="#d8c890"/><circle cx="130" cy="52" r="4" fill="#d8c890"/>';
  cl.innerHTML=extra;
  const w=P.weapons[currentSlot];
  let wi='';
  if(w==='knife') wi='<rect x="150" y="150" width="6" height="60" rx="2" fill="#ccc" transform="rotate(15 153 180)"/>';
  else if(w==='pistol'||w==='revolver') wi='<path d="M146 160 l40 -6 l0 14 l-28 4 l-4 18 l-10 0z" fill="#33363b"/>';
  else if(w==='shotgun') wi='<rect x="140" y="120" width="10" height="110" rx="4" fill="#33363b" transform="rotate(12 145 175)"/>';
  else if(w==='baton'||w==='pipe') wi='<rect x="148" y="130" width="8" height="90" rx="4" fill="#5a4022" transform="rotate(10 152 175)"/>';
  else if(w==='axe') wi='<rect x="150" y="120" width="8" height="110" fill="#5a4022"/><path d="M140 120 q30 -10 34 20 q-20 6 -34 -4z" fill="#999"/>';
  else if(w==='katana') wi='<rect x="146" y="110" width="6" height="120" fill="#dfe6ee" transform="rotate(18 149 170)"/>';
  wep.innerHTML=wi;
}

/* ================= ЗАМЕТКИ В МИРЕ ================= */
function spawnNotes(){
  noteObjs.forEach(n=>scene.remove(n.g)); noteObjs=[];
  NOTES.forEach(note=>{
    if(note.read) return;
    if(note.hiddenIn) return; // спрятана в контейнере
    const g=new THREE.Group();
    const card=new THREE.Mesh(new THREE.PlaneGeometry(.35,.45),
      new THREE.MeshStandardMaterial({map:(()=>{const c=document.createElement('canvas');c.width=64;c.height=80;const gg=c.getContext('2d');
        gg.fillStyle='#d8cba4';gg.fillRect(0,0,64,80);gg.strokeStyle='#6a5a30';for(let i=0;i<8;i++){gg.beginPath();gg.moveTo(8,10+i*8);gg.lineTo(56,10+i*8);gg.stroke();}
        const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;})(),side:THREE.DoubleSide}));
    card.rotation.x=-Math.PI/2.4; g.add(card);
    const gl=new THREE.PointLight(0xffe9a0,.7,3); gl.position.y=.3; g.add(gl);
    g.position.set(note.spot.x,note.spot.y,note.spot.z);
    scene.add(g);
    noteObjs.push({note,g,type:'note',x:note.spot.x,z:note.spot.z,prompt:'Прочитать записку'});
    W.interactables.push(noteObjs[noteObjs.length-1]);
  });
}
function showNote(note){
  note.read=true; P.notesFound++;
  $('noteTitle').textContent=note.title;
  $('noteBody').textContent='';
  $('noteModal').classList.remove('hidden');
  state='note'; document.exitPointerLock?.();
  const txt=note.text; let i=0;
  clearInterval(showNote._iv);
  showNote._iv=setInterval(()=>{ i+=2; $('noteBody').textContent=txt.slice(0,i); if(i>=txt.length) clearInterval(showNote._iv); },24);
  SFX.pickup();
  P.san=clamp(P.san+8,0,100);
  checkProgress();
}
function closeNote(){ $('noteModal').classList.add('hidden'); state='play'; lockPointer(); spawnNotes(); }

/* ================= ПРОГРЕСС СЮЖЕТА ================= */
function updateObjective(){
  const n=P.notesFound;
  if(n>=6&&mergeDone==='done'&&!endingShown) setObjective(OBJECTIVES[7]);
  else if(n>=6) setObjective(OBJECTIVES[6]);
  else if(n>=5) setObjective(OBJECTIVES[5]);
  else if(n>=4) setObjective(OBJECTIVES[4]);
  else if(n>=3) setObjective(OBJECTIVES[3]);
  else if(n>=2) setObjective(OBJECTIVES[2]);
  else if(n>=1) setObjective(OBJECTIVES[1]);
  else setObjective(OBJECTIVES[0]);
}
function checkProgress(){
  const n=P.notesFound;
  updateObjective();
  if(n>=6 && !mergeDone){ triggerMerge(); }
}
function triggerMerge(){
  mergeDone=true;
  setObjective(OBJECTIVES[6]);
  toast('ТЫ ВСПОМНИЛ ВСЁ. Больница содрогнулась...',6);
  SFX.thunder(); shake(2,1.5);
  // гаснет свет
  W.lights.forEach(l=>{ if(l.light){ l.light.intensity*=.25; } l.bulbMat.emissiveIntensity=.2; });
  setTimeout(()=>{
    // спавн босса в палате №4
    boss=new Monster(scene,'tamik',new THREE.Vector3(0,0,6.5),true);
    monsters.push(boss); bossSpawned=true;
    boss.phase2=false;
    toast('Д-Р ТАМИК СОШЁЛ В ПАЛАТУ №4. ОСТАНОВИ ЕГО.',6);
    SFX.monsterGrowl();
  },4000);
}

/* ================= СПАВН ПРИЗРАКОВ ================= */
function spawnGhost(forceType){
  const alive=monsters.filter(m=>!m.dead&&!m.isBoss).length;
  if(alive>=5) return;
  const types=['crawler','shadow','sister','stretcher','patient4'];
  const type=forceType||pick(types);
  // спавним в тёмном месте подальше от игрока
  let best=null,bestScore=-1;
  for(let i=0;i<12;i++){
    const spot=pick([[rand(-22,-14),rand(3,8)],[-28,rand(-4,4)],[-28,rand(-13,-7)],[rand(5,15),rand(-11,-3)],
      [rand(24,31),rand(-5,5)],[rand(24,31),rand(7,13)],[rand(-16,-5),rand(-8,-3)],[rand(18,23),-8]]);
    const d=Math.hypot(spot[0]-P.pos.x,spot[1]-P.pos.z);
    if(d<10||d>45) continue;
    const score=d;
    if(score>bestScore){bestScore=score;best=spot;}
  }
  if(!best) return;
  const m=new Monster(scene,type,new THREE.Vector3(best[0],0,best[1]));
  m.fadeIn=0; m.model.traverse(o=>{if(o.material){o.material.transparent=true;o.material.opacity=0;}});
  monsters.push(m);
  SFX.whisper();
}

/* ================= БОЙ ================= */
let tracerPool=[], tracerT=[];
function addTracer(a,b){
  // пул из 6 трассеров: переиспользуем линии (без создания геометрии каждый выстрел)
  if(!tracerPool.length){ for(let i=0;i<6;i++){
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(6),3));
    const ln=new THREE.Line(geo,new THREE.LineBasicMaterial({color:0xffe9a0,transparent:true,opacity:.9}));
    ln.frustumCulled=false; ln.visible=false; scene.add(ln); tracerPool.push(ln); } }
  const idx=tracerPool._next=(tracerPool._next||0)%6;
  const ln=tracerPool[idx]; const p=ln.geometry.attributes.position.array;
  p[0]=a.x;p[1]=a.y;p[2]=a.z; p[3]=b.x;p[4]=b.y;p[5]=b.z;
  ln.geometry.attributes.position.needsUpdate=true;
  ln.material.opacity=.9; ln.visible=true; tracerT[idx]=.07;
}
function updateTracers(dt){
  for(let i=0;i<tracerPool.length;i++){ const ln=tracerPool[i];
    if(tracerT[i]>0){ tracerT[i]-=dt; if(tracerT[i]<=0) ln.visible=false; } }
}
function attackMelee(){
  if(P.attackCd>0) return;
  const w=P.weapons[currentSlot]; const it=ITEMS[w]||ITEMS.fists;
  P.attackCd = (w==='fists')?.45:(w==='baton'?.8:(w==='katana'?.6:.55));
  P.st=clamp(P.st-6,0,100);
  handItems.swing=1;
  const dmg=it.dmg||8, reach=it.reach||1.6;
  SFX.slash();
  let hitAny=false;
  for(const m of monsters){
    if(m.dead) continue;
    const d=m.distTo(P.pos);
    if(d<reach+ (m.isBoss?.5:0)){
      const ang=Math.abs(angleDiff(Math.atan2(m.pos.x-P.pos.x,m.pos.z-P.pos.z),Math.atan2(-Math.sin(yaw),-Math.cos(yaw))));
      if(ang<1.0){ hurtMonster(m,dmg,w==='fists'?.15:.35); hitAny=true; }
    }
  }
  if(hitAny) SFX.hit(); else if(w==='flashlight'||!it.dmg){} 
}
function angleDiff(a,b){ let d=a-b; while(d>Math.PI)d-=Math.PI*2; while(d<-Math.PI)d+=Math.PI*2; return d; }
function shoot(){
  const w=P.weapons[currentSlot]; const it=ITEMS[w];
  if(!it.ammo) return false;
  if(P.reloadT>0) return true;
  if(P.mag[it.ammo]<=0){
    if(P.ammo[it.ammo]>0) startReload(); else { SFX.emptyClick(); toast('Нет патронов!'); }
    return true;
  }
  P.mag[it.ammo]--;
  P.attackCd=w==='shotgun'?1.0:.35;
  SFX.gunshot();
  handItems.kick=1; shake(.15,w==='shotgun'?1.2:.5);
  // вспышка выстрела (кратковременный light без пересоздания)
  muzzleT=.06;
  const pellets=it.perShot||1;
  const dir=camDir();
  const origin=P.pos.clone().setY(1.5);
  for(let i=0;i<pellets;i++){
    const d=dir.clone();
    const spread=w==='shotgun'?.09:.02;
    d.x+=rand(-spread,spread); d.y+=rand(-spread,spread); d.z+=rand(-spread,spread);
    d.normalize();
    raycaster.set(origin,d);
    const hits=raycaster.intersectObjects(monsters.filter(m=>!m.dead).map(m=>m.model),true);
    if(hits.length){
      let obj=hits[0].object, mm=null;
      while(obj&&!mm){ mm=monsters.find(m=>m.model===obj); obj=obj.parent; }
      if(mm) hurtMonster(mm,it.dmg/pellets*(pellets>1?1.6:1),.1);
      spark(hits[0].point); addTracer(origin,hits[0].point);
    } else { const far=origin.clone().addScaledVector(d,14); puff(far,0x886644,2,.1); addTracer(origin,far); }
  }
  updateHUD();
  return true;
}
function camDir(){ const d=new THREE.Vector3(); camera.getWorldDirection(d); return d; }
function startReload(){
  const w=P.weapons[currentSlot]; const it=ITEMS[w]; if(!it.ammo) return;
  if(P.ammo[it.ammo]<=0||P.mag[it.ammo]>=capFor(it.ammo)) return;
  P.reloadT= it.ammo==='shotgun'?1.6:1.2; SFX.reload();
}
function capFor(a){ return a==='pistol'?12:a==='shotgun'?6:6; }
function hurtMonster(m,dmg,stun){
  m.takeDamage(dmg,stun);
  bloodPuff(m.pos.clone().setY(1));
  if(m.dead){
    SFX.monsterDie();
    P.san=clamp(P.san+4,0,100);
    if(m.isBoss) onBossDeath();
    else if(Math.random()<.4) addPickup(pick(['ammo','bandage','battery']),m.pos.x,.4,m.pos.z,1);
  }
}
function onBossDeath(){
  toast('ТАМИК РАСТВОРИЛСЯ... В ГОЛОВЕ СТАЛО ТИХО.',5);
  mergeDone='done';
  // из тела выпадает ключ выхода
  addPickup('key_exit',boss.pos.x,.5,boss.pos.z);
  setObjective(OBJECTIVES[7]);
  W.lights.forEach(l=>{ if(l.light) l.light.intensity=l.baseInt; l.bulbMat.emissiveIntensity=2; });
  boss=null;
}
function damagePlayer(dmg,fromPos){
  const red=(P.worn.chest==='vest'?.8:P.worn.chest==='armor'?.7:1);
  dmg*=red;
  P.hp-=dmg; P.hurtT=.6;
  SFX.hit(); shake(.4,1);
  $('damageFlash').style.opacity=1; setTimeout(()=>$('damageFlash').style.opacity=0,250);
  P.san=clamp(P.san-dmg*.4,0,100);
  if(fromPos){ /* оттолкнуть взглядом на нападавшего */ }
  if(P.hp<=0){ die(); }
  updateHUD();
}
function die(){
  if(state==='dead') return;
  state='dead'; deathFade=0;
  document.exitPointerLock?.();
  $('pauseTitle').textContent='ТЫ РАСТВОРИЛСЯ';
  $('pauseSub').textContent='Больница забрала ещё одну память. Носителей осталось меньше.';
  $('pauseMenu').classList.remove('hidden');
}

/* ================= ЧАСТИЦЫ ================= */
function spark(pos){ puff(pos,0xffcc66,6,.15); }
function bloodPuff(pos){ puff(pos,0x881111,12,.5); }
function puff(pos,color,n,size){
  for(let i=0;i<n;i++){
    const m=new THREE.Mesh(new THREE.SphereGeometry(rand(size*.4,size),4,4),
      new THREE.MeshBasicMaterial({color,transparent:true,opacity:.9}));
    m.position.copy(pos); scene.add(m);
    particles.push({m,v:new THREE.Vector3(rand(-2,2),rand(0,3),rand(-2,2)),t:0,life:rand(.3,.8)});
  }
}
function updateParticles(dt){
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i]; p.t+=dt;
    p.v.y-=6*dt; p.m.position.addScaledVector(p.v,dt);
    p.m.material.opacity=.9*(1-p.t/p.life);
    if(p.t>p.life){ scene.remove(p.m); particles.splice(i,1); }
  }
}

/* ================= ПАЗЛ ЗАМКА ================= */
let lockState=null;
function startLockPuzzle(onSuccess,onCancel){
  state='puzzle'; document.exitPointerLock?.();
  cabState=null; // режим замка — мини-игра шкафа выключена
  $('lockPuzzle').classList.remove('hidden');
  const h3=$('lockPuzzle').querySelector('h3'); if(h3) h3.textContent='ВЗЛОМ ЗАМКА';
  const hint=$('lockPuzzle').querySelector('.hint');
  if(hint) hint.textContent='Нажми на штырёк и веди мышью ВВЕРХ — лови линию реза. Когда все 4 встанут — зажми ЛКМ у сердцевины и тяни вправо до упора.';
  const pins=[1,2,3,4].map(()=>({set:false,pos:0,target:rand(.55,.9)}));
  lockState={pins,angle:0,drag:null};
  puzzleCb={ok:onSuccess,cancel:onCancel};
  drawLock();
}
function drawLock(){
  const cv=$('lockCanvas'),g=cv.getContext('2d');
  g.fillStyle='#0a0806'; g.fillRect(0,0,300,300);
  g.strokeStyle='#8a7040'; g.lineWidth=3;
  g.beginPath(); g.arc(150,150,110,0,7); g.stroke();
  g.beginPath(); g.arc(150,150,80,0,7); g.stroke();
  lockState.pins.forEach((p,i)=>{
    const x=30+i*62;
    // корпус штыря
    g.fillStyle='#221d14'; g.fillRect(x-14,40,28,190);
    // пружина
    g.strokeStyle='#666'; g.beginPath();
    for(let k=0;k<6;k++){ g.moveTo(x-10,50+k*6); g.lineTo(x+10,53+k*6); }
    g.stroke();
    // сам штырь (двигается по вертикали): pos 0..1 => y 190..60
    const py=190-p.pos*130;
    g.fillStyle=p.set?'#5ac85a':'#c8b070';
    g.fillRect(x-9,py,18,46);
    // линия среза замка
    g.strokeStyle=p.set?'#5ac85a':'#aa3030'; g.lineWidth=2;
    g.beginPath(); g.moveTo(x-16,120); g.lineTo(x+16,120); g.stroke();
    g.fillStyle='#ddd'; g.font='11px monospace'; g.fillText(String(i+1),x-3,250);
  });
  const allSet=lockState.pins.every(p=>p.set);
  g.save(); g.translate(150,150); g.rotate(lockState.angle);
  g.fillStyle='#bbb'; g.fillRect(0,-4,70,8);
  g.fillStyle='#654'; g.fillRect(-30,-7,32,14);
  g.restore();
  if(allSet){
    g.fillStyle=`rgba(200,162,74,${.6+.4*Math.sin(Date.now()/200)})`;
    g.font='bold 13px Georgia'; g.textAlign='center';
    g.fillText('⟶ ТЯНИ СЕРДЕЧВИНУ ВПРАВО ⟵',150,292);
    if(!drawLock._iv) drawLock._iv=setInterval(()=>{ if(lockState&&lockState.pins.every(p=>p.set)) drawLock(); else {clearInterval(drawLock._iv);drawLock._iv=null;} },140);
  }
  $('lockStatus').textContent=allSet?
    'Все штыри встали по линии реза — ХВАТАЙ сердцевину (ЛКМ у центра) и ПОВЕРНИ мышью вправо до упора!':
    `Штыри: ${lockState.pins.filter(p=>p.set).length}/4 · Зажми ЛКМ на штыре и ТЯНИ мышкой вверх`;
}
function lockPos(e){
  const r=$('lockCanvas').getBoundingClientRect();
  return {x:(e.clientX-r.left)*(300/r.width),y:(e.clientY-r.top)*(300/r.height)};
}
/* единые обработчики для обеих мини-игр (замок + шкаф) на одном canvas */
$('lockCanvas').addEventListener('mousedown',e=>{
  e.preventDefault();
  if(cabState){ cabDown(e); return; }
  if(!lockState) return;
  const p=lockPos(e);
  if(lockState.pins.every(s=>s.set)){
    if(Math.hypot(p.x-150,p.y-150)<95){ lockState.drag={mode:'turn',sx:p.x,a0:lockState.angle}; $('lockCanvas').style.cursor='grabbing'; }
    return;
  }
  for(let i=0;i<4;i++){
    const x=30+i*62;
    if(Math.abs(p.x-x)<22&&p.y>40&&p.y<250&&!lockState.pins[i].set){
      lockState.drag={mode:'pin',i,startY:p.y,startPos:lockState.pins[i].pos};
      $('lockCanvas').style.cursor='grabbing';
    }
  }
});
addEventListener('mousemove',e=>{
  if(cabState){ cabMove(e); return; }
  if(!lockState||!lockState.drag) return;
  const p=lockPos(e);
  const d=lockState.drag;
  if(d.mode==='pin'){
    const pin=lockState.pins[d.i];
    pin.pos=clamp(d.startPos+(d.startY-p.y)/130,0,1);
    if(Math.abs(pin.pos-pin.target)<.05){ pin.set=true; SFX.puzzleTick(true); d.mode=null; }
    else if(pin.pos>pin.target+.1){ pin.pos=pin.target+.1; } // жёсткий упор: дальше штырь не идёт
  } else if(d.mode==='turn'){
    lockState.angle=clamp(d.a0+((p.x-d.sx)+(d.sy!==undefined?(d.sy-p.y):0))*.006,0,Math.PI/2);
    if(lockState.angle>=Math.PI/2-.02){ winLock(); return; }
  }
  drawLock();
});
addEventListener('mouseup',e=>{
  if(cabState){ cabUp(e); return; }
  if(!lockState||!lockState.drag) return;
  if(lockState.drag.mode==='pin'){
    const pin=lockState.pins[lockState.drag.i];
    if(!pin.set){ // пружина отбрасывает вниз, если не поймал момент
      let from=pin.pos; const t0=performance.now();
      const fall=()=>{ const k=Math.min(1,(performance.now()-t0)/300);
        pin.pos=from*(1-k*k); if(k<1&&lockState) requestAnimationFrame(fall()); if(lockState) drawLock(); };
      fall(); SFX.puzzleTick(false);
    }
  }
  lockState.drag=null; $('lockCanvas').style.cursor='grab';
});
function winLock(){
  $('lockPuzzle').classList.add('hidden');
  const cb=puzzleCb?puzzleCb.ok:null; lockState=null; state='play'; SFX.unlock(); cb&&cb();
}
function cancelLock(){
  $('lockPuzzle').classList.add('hidden');
  const cb=puzzleCb?puzzleCb.cancel:null; lockState=null; cabState=null; state='play'; cb&&cb();
}

/* ================= ДВЕРНАЯ МИНИ-ИГРА ================= */
let doorState=null;
function startDoorMinigame(onSuccess,onCancel){
  state='door'; document.exitPointerLock?.();
  $('doorMinigame').classList.remove('hidden');
  doorState={prog:0,decay:rand(14,20),push:0,ok:false};
  puzzleCb={ok:onSuccess,cancel:onCancel};
}
function tickDoor(dt){
  if(!doorState) return;
  const d=doorState;
  d.prog+=(mouseHeld?34:-d.decay)*dt;
  d.prog=clamp(d.prog,0,100);
  $('doorFill').style.width=d.prog+'%';
  const danger=18+Math.sin(gameTime*3)*4;
  $('doorMarker').style.left=danger+'%';
  $('doorDanger').style.width=danger+'%';
  if(d.prog<=danger&&d.prog<5&&mouseHeld===false&&d.prog<=0){ /* провал не мгновенный */ }
  if(d.prog>=100){ d.ok=true; finishDoor(true); }
  else if(d.prog<=0&&gameTime-(d.lastZero||0)>2.5){ finishDoor(false); }
  if(d.prog<=0) d.lastZero=d.lastZero||gameTime; else d.lastZero=0;
  $('doorStatus').textContent=mouseHeld?'ДЕРЖИМ! Ползёт вверх...':'Отпустил — дверь запирает обратно!';
}
function finishDoor(ok){
  $('doorMinigame').classList.add('hidden');
  const cb=ok?puzzleCb.ok:puzzleCb.cancel; doorState=null; state='play';
  if(ok){SFX.unlock();}else{SFX.pluck();}
  cb&&cb();
}

/* ================= ВЗАИМОДЕЙСТВИЕ ================= */
function tryInteract(){
  const near=findTarget();
  if(!near) return;
  const o=near.obj;
  if(o.type==='note'){ showNote(o.note); return; }
  if(o.type==='container'){ interactContainer(o); return; }
  if(o.type==='door'){ interactDoor(o); return; }
  if(o.type==='lever'){ if(!o.used){ o.used=true; o.stick.rotation.z=-Math.PI/3; SFX.pluck(); safeCall(o.cb,'рычаг'); } return; }
}
function findTarget(){
  let best=null,bd=2.4;
  for(const o of W.interactables){
    if(o.removed) continue;
    const d=Math.hypot((o.x??o.obj?.position?.x??99)-P.pos.x,(o.z??o.obj?.position?.z??99)-P.pos.z);
    if(d<bd){
      bd=d; best={obj:o,d};
    }
  }
  return best;
}
function interactContainer(cont){
  if(cont.locked&&!cont.unlocked){
    toast('Заперто. Ломай замок [ЛКМ] или вскрой затычкой-отмычкой [2].');
    openWithPick(cont,false);
    return;
  }
  if(cont.opened){ if(!cont.shown&&cont.contents.length) revealContents(cont); return; }
  // тумбочки и мелкие ящики открываются сразу — без мини-игры (дверца одна, тянуть не за что)
  if(!cont.double){ openContainerAnim(cont); return; }
  startCabinetGame(cont,()=>openContainerAnim(cont));
}
function openContainerAnim(cont){
  cont.animating=true; cont.searchAnim=0; state='searching';
  SFX.cabinet();
  const iv=setInterval(()=>{
    cont.searchAnim+=.06;
    const a=Math.min(1.9,cont.searchAnim*1.8);
    cont.doors.forEach(d=>{ d.g.rotation.y=d.sign>0?-a:a; });
    if(cont.searchAnim>=1.2){ clearInterval(iv); cont.opened=true; cont.animating=false; state='play'; revealContents(cont); }
  },30);
}
function revealContents(cont){
  cont.shown=true;
  const items=cont.contents; cont.contents=[];
  if(!items.length){ toast('Пусто.'); return; }
  items.forEach((it,i)=>setTimeout(()=>{
    if(it.item==='note_n3'){ const nt=NOTES.find(x=>x.id==='n3'); if(nt&&!nt.read){ showNote(nt); return; } }
    giveItem(it.item,it.n);
  },i*350));
}
function interactDoor(door){
  if(door.open) return;
  if(door.locked){
    const need=door.keyType;
    if(need==='normal'&&!P.hasKey.normal){ toast('Нужен обычный ключ.'); return; }
    if(need==='office'&&!(P.hasKey.card)){ toast('Нужна карта врача.'); return; }
    if(need==='shield'){ toast('Эта дверь на щитовом приводе. Ищи рубильник в приёмной.'); return; }
    if(need==='exit'){
      if(!P.hasKey.exit){ toast('Засов держится намертво. Ключ — у сердца больницы.'); return; }
      startDoorMinigame(()=>{ unlockExit(door); },null);
      return;
    }
    // есть ключ — взламываем замок для атмосферы
    startLockPuzzle(()=>{ door.locked=false; openDoor(door); SFX.doorOpen(); },null);
    return;
  }
  openDoor(door); SFX.doorOpen();
}
function unlockExit(door){
  door.locked=false; openDoor(door); SFX.doorOpen();
  toast('ЗАСОВ ОТПУЩЕН. ВЫХОД ОТКРЫТ.',5);
  setTimeout(()=>winGame(),1500);
}

/* ================= КАТСКАЧЕНА (3D) ================= */
let csScene,csCam,csRoom,csT=0,csShown=-1;
function buildCutscene(){
  csScene=new THREE.Scene(); csScene.background=new THREE.Color(0x000000);
  csScene.fog=new THREE.FogExp2(0x000000,.12);
  csCam=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.05,60);
  csRoom=new THREE.Group(); csScene.add(csRoom);
  const wallM=new THREE.MeshStandardMaterial({map:TEX.wallPaint(),roughness:1,color:0x555548});
  const fl=new THREE.Mesh(new THREE.PlaneGeometry(8,8),new THREE.MeshStandardMaterial({map:TEX.floorTile(),roughness:1,color:0x666658}));
  fl.rotation.x=-Math.PI/2; csRoom.add(fl);
  for(const [x,z,ry] of [[0,-4,0],[0,4,Math.PI],[-4,0,Math.PI/2]]){
    const w=new THREE.Mesh(new THREE.PlaneGeometry(8,3.4),wallM); w.position.set(x,1.7,z); w.rotation.y=ry; csRoom.add(w); }
  // койка
  const bed=new THREE.Group(); csRoom.add(bed);
  const bm=new THREE.MeshStandardMaterial({color:0x999,metalness:.5,roughness:.5});
  const frame=new THREE.Mesh(new THREE.BoxGeometry(2,.1,.9),bm); frame.position.set(-.5,.4,1.5); frame.rotation.y=.6; bed.add(frame);
  const mat=new THREE.Mesh(new THREE.BoxGeometry(1.9,.15,.85),new THREE.MeshStandardMaterial({color:0xb8b2a0}));
  mat.position.set(-.5,.5,1.5); mat.rotation.y=.6; bed.add(mat);
  // тело Мишутки
  const body=new THREE.Group(); bed.add(body);
  const sk=new THREE.MeshStandardMaterial({color:0xcaa27a,roughness:1});
  const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.2,.6,4,8),sk); torso.rotation.z=Math.PI/2; torso.position.set(-.5,.62,1.5); torso.rotation.y=.6; body.add(torso);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.17,10,8),sk); head.position.set(-1.15,.66,1.95); body.add(head);
  // силуэт врача
  const doc=new THREE.Group(); csRoom.add(doc);
  const dm=new THREE.MeshStandardMaterial({color:0xe8e6de,roughness:.9});
  const dt=new THREE.Mesh(new THREE.CapsuleGeometry(.25,.8,4,8),dm); dt.position.y=1; doc.add(dt);
  const dh=new THREE.Mesh(new THREE.SphereGeometry(.18,10,8),new THREE.MeshStandardMaterial({color:0xc8b28f})); dh.position.y=1.7; doc.add(dh);
  const gl=new THREE.Mesh(new THREE.TorusGeometry(.06,.012,6,10),new THREE.MeshStandardMaterial({color:0x111,metalness:.8})); gl.position.set(-.07,1.74,.16); doc.add(gl);
  const gl2=gl.clone(); gl2.position.x=.07; doc.add(gl2);
  doc.position.set(1.2,0,.5);
  // лампа
  const lamp=new THREE.PointLight(0xfff2cc,1.4,10); lamp.position.set(0,2.8,0); csScene.add(lamp);
  csScene.add(new THREE.AmbientLight(0x223040,.4));
  // дождь за окном (справа стена отсутствует — добавим окно)
  const win=new THREE.Mesh(new THREE.PlaneGeometry(1.6,1.4),new THREE.MeshBasicMaterial({color:0x0a1424}));
  win.position.set(3.98,1.7,0); win.rotation.y=-Math.PI/2; csRoom.add(win);
  const rainGeo=new THREE.BufferGeometry(); const rp=[];
  for(let i=0;i<200;i++) rp.push(3.9,rand(1,3.4),rand(-.7,.7));
  rainGeo.setAttribute('position',new THREE.Float32BufferAttribute(rp,3));
  const rain=new THREE.Points(rainGeo,new THREE.PointsMaterial({color:0x88aacc,size:.02,transparent:true,opacity:.6}));
  csRoom.add(rain); csRoom.userData.rain=rain;
  csRoom.userData.doc=doc; csRoom.userData.body=body; csRoom.userData.lamp=lamp;
}
function updateCutscene(dt){
  csT+=dt;
  const steps=CUTSCENE;
  const cur=steps.filter(s=>s.t<=csT).pop();
  if(cur&&steps.indexOf(cur)!==csShown){
    csShown=steps.indexOf(cur);
    const el=$('csText'); el.style.opacity=0;
    setTimeout(()=>{ el.textContent=cur.txt; el.style.opacity=cur.txt?1:0; },400);
  }
  // движение камеры вокруг сцены
  const a=csT*.12;
  const r=3.6-Math.min(1.6,csT*.03);
  csCam.position.set(Math.sin(a)*r*.6+1.2,1.7-Math.min(.6,csT*.012),Math.cos(a)*r*.5+.4);
  csCam.lookAt(-.5,.7,1.6);
  const doc=csRoom.userData.doc;
  doc.position.x=1.2-Math.min(.5,csT*.02);
  doc.children.forEach(c=>c.rotation.y=Math.sin(csT*.5)*.05);
  const rain=csRoom.userData.rain; const pos=rain.geometry.attributes.position;
  for(let i=0;i<pos.count;i++){ let y=pos.getY(i)-dt*4; if(y<1)y=3.4; pos.setY(i,y); }
  pos.needsUpdate=true;
  csRoom.userData.lamp.intensity=1.4+Math.sin(csT*17)*.15*(Math.random()<.05?3:0);
  renderer.render(csScene,csCam);
  if(csT>CUTSCENE[CUTSCENE.length-1].t+1.5&&state==='cut'){ endCutscene(); }
}
function endCutscene(){
  if(state!=='cut') return;
  state='play';
  $('cutscene').classList.add('hidden');
  $('cineBars').classList.add('hidden');
  $('hud').classList.remove('hidden');
  setObjective(OBJECTIVES[0]);
  toast('Палата №4. Осмотрись. [E] — взаимодействовать. F — фонарь.',6);
  SFX.startAmbience();
  lockPointer();
  if(!loopRunning){ loopRunning=true; loop(); }
}

/* ================= ФИНАЛ ================= */
function winGame(){
  if(endingShown) return; endingShown=true;
  state='win'; document.exitPointerLock?.();
  $('hud').classList.add('hidden');
  $('ending').classList.remove('hidden');
  const lines=[
'Ты выходишь под дождь. Лес молчит.',
'',
'Семеро голосов внутри наконец говорят одно:',
'«Мы помним». ',
'',
'Мишутка больше не имя на браслете.',
'Это имя того, кто остался держать дверь,',
'пока остальные вышли.',
'',
'Где-то позади, в пустой палате №4,',
'койка ещё тёплая. На стене — свежая царапина:',
'«СЛЕДУЮЩИЙ — ТЫ».',
'',
'— КОНЕЦ —'];
  $('endText').textContent='';
  let i=0; const full=lines.join('\n');
  const iv=setInterval(()=>{ i+=3; $('endText').textContent=full.slice(0,i); if(i>=full.length)clearInterval(iv); },40);

}

/* ================= УПРАВЛЕНИЕ ================= */
function lockPointer(){ const c=$('game'); c.requestPointerLock&&c.requestPointerLock(); }
addEventListener('keydown',e=>{
  keys[e.code]=true;
  if(e.code==='KeyF'&&state==='play'){ flashOn=!flashOn; toast(flashOn?'Фонарь включён':'Фонарь выключен'); }
  if(e.code==='KeyR'&&state==='play') startReload();
  if(e.code==='KeyE'){ if(state==='note') closeNote(); else if(state==='play') tryInteract(); }
  if(e.code==='KeyI'){ if(state==='play'){ state='inv'; $('inventory').classList.remove('hidden'); renderInventory(); document.exitPointerLock?.(); }
    else if(state==='inv'){ state='play'; $('inventory').classList.add('hidden'); lockPointer(); } }
  if(e.code==='Escape'){
    if(state==='puzzle') cancelLock();
    else if(state==='door') finishDoor(false);
    else if(state==='play'){ state='pause'; $('pauseMenu').classList.remove('hidden'); $('pauseTitle').textContent='ПАУЗА';
      $('pauseSub').textContent='Больница подождёт. Она никуда не денется.'; document.exitPointerLock?.(); }
    else if(state==='pause'){ resume(); }
  }
  if(/^Digit[1-4]$/.test(e.code)&&state==='play') selectWeapon(+e.code.slice(5)-1);
  if(e.code==='Space'&&state==='cut'){ endCutscene(); }
});
addEventListener('keyup',e=>keys[e.code]=false);
addEventListener('mousemove',e=>{
  if(!locked||state!=='play') return;
  yaw-=e.movementX*.0022; pitch-=e.movementY*.0022;
  pitch=clamp(pitch,-1.45,1.45);
});
$('game').addEventListener('mousedown',e=>{
  if(state!=='play') return;
  if(e.button===0) mouseHeld=true;
  if(e.button===2) aimHeld=true;
});
addEventListener('mouseup',e=>{ if(e.button===0)mouseHeld=false; if(e.button===2)aimHeld=false; });
addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('pointerlockchange',()=>{
  locked=document.pointerLockElement===$('game');
});
$('lockCancel').onclick=cancelLock;
$('doorCancel').onclick=()=>finishDoor(false);
$('noteClose').onclick=closeNote;
$('invClose').onclick=()=>{ state='play'; $('inventory').classList.add('hidden'); lockPointer(); };
$('invUse').onclick=useSelected;
document.querySelectorAll('#hotbar .slot').forEach(s=>s.onclick=()=>selectWeapon(+s.dataset.i));
$('btnResume').onclick=resume;
$('btnRestart2').onclick=()=>location.reload();
$('btnRestart').onclick=()=>location.reload();
function resume(){ if(state==='pause'){ $('pauseMenu').classList.add('hidden'); state='play'; lockPointer(); } }


/* ================= ФИЗИКА ИГРОКА ================= */
function collide(px,pz,r){
  for(const c of W.walls){
    if(px+r>c.min.x&&px-r<c.max.x&&pz+r>c.min.z&&pz-r<c.max.z){
      // выталкивание по минимальной оси
      const dxL=px-(c.min.x-r), dxR=(c.max.x+r)-px, dzN=pz-(c.min.z-r), dzS=(c.max.z+r)-pz;
      const m=Math.min(dxL,dxR,dzN,dzS);
      if(m===dxL) px=c.min.x-r; else if(m===dxR) px=c.max.x+r;
      else if(m===dzN) pz=c.min.z-r; else pz=c.max.z+r;
    }
  }
  return [px,pz];
}
function updatePlayer(dt){
  const fwd=(keys.KeyW?1:0)-(keys.KeyS?1:0);
  const str=(keys.KeyD?1:0)-(keys.KeyA?1:0);
  const crouch=keys.ControlLeft||keys.KeyC;
  const running=keys.ShiftLeft&&P.st>5&&!crouch&&fwd!==0;
  let spd=crouch?P.crouchSpeed:(running?P.runSpeed:P.speed);
  if(P.worn.feet==='sneakers'&&running) spd*=1.1;
  if(P.san<25) spd*=.85;
  const sin=Math.sin(yaw),cos=Math.cos(yaw);
  let vx=(str*cos - fwd*sin), vz=(-str*sin - fwd*cos);
  const l=Math.hypot(vx,vz)||1;
  if(fwd||str){ vx/=l; vz/=l; } else { vx=0; vz=0; }
  // трение
  P.vel.x+= (vx*spd-P.vel.x)*Math.min(1,dt*10);
  P.vel.z+= (vz*spd-P.vel.z)*Math.min(1,dt*10);
  let nx=P.pos.x+P.vel.x*dt, nz=P.pos.z+P.vel.z*dt;
  [nx,nz]=collide(nx,nz,P.r);
  P.pos.x=nx; P.pos.z=nz;
  // стамина
  if(running) P.st=clamp(P.st-dt*14,0,100); else P.st=clamp(P.st+dt*(crouch?10:7),0,100);
  // шаги
  const moving=Math.hypot(P.vel.x,P.vel.z)>.5;
  if(moving){ P.stepT+=dt*(running?2.2:crouch?.7:1.4);
    if(P.stepT>1){ P.stepT=0; SFX.step(running);
      if(P.worn.feet!=='boots'&&running) noiseAlert(); } }
  P.bobT+=dt*(running?11:7);
  // камера
  const bob=moving?Math.sin(P.bobT)*(running?.06:.03):0;
  const sway=moving?Math.cos(P.bobT*.5)*.01:0;
  camera.position.set(P.pos.x,P.y+(crouch?-.35:0)+bob,P.pos.z);
  camera.rotation.set(0,0,sway);
  camera.rotateY(yaw); camera.rotateX(pitch);
  if(shakeT>0){ shakeT-=dt;
    camera.position.x+=rand(-1,1)*shakeAmt*.05; camera.position.y+=rand(-1,1)*shakeAmt*.05; }
  // фонарь
  const wantOn=flashOn&&flashCharge>0;
  flashlight.intensity+= ((wantOn?(aimHeld?5.5:4):0)-flashlight.intensity)*Math.min(1,dt*8);
  if(wantOn){ flashCharge=clamp(flashCharge-dt*(aimHeld?1.6:1),0,100);
    if(flashCharge<=0){ flashOn=false; toast('Батарейка села!'); } }
  const fd=new THREE.Vector3(); camera.getWorldDirection(fd);
  flashlight.position.copy(camera.position).addScaledVector(fd,.1);
  flashlight.target.position.copy(camera.position).addScaledVector(fd,10);
  player.flashOn=wantOn&&flashlight.intensity>1;
  player.aimAt=(pos)=>{ const v=pos.clone().setY(1); return v.sub(camera.position).normalize().dot(fd)>Math.cos(aimHeld?.16:.3); };
  // атака удержанием ЛКМ
  if(mouseHeld){
    const w=P.weapons[currentSlot];
    if(ITEMS[w].ammo) shoot(); else attackMelee();
  }
  P.attackCd-=dt; P.hurtT-=dt;
  if(P.reloadT>0){ P.reloadT-=dt;
    if(P.reloadT<=0){ const w=P.weapons[currentSlot],a=ITEMS[w].ammo;
      const need=capFor(a)-P.mag[a], take=Math.min(need,P.ammo[a]);
      P.mag[a]+=take; P.ammo[a]-=take; updateHUD(); } }
  // анимация рук
  animHands(dt,moving,running);
  // рассудок
  let drain=.35*dt;
  if(!player.flashOn) drain+=.9*dt;
  const nearMon=monsters.some(m=>!m.dead&&m.distTo(P.pos)<6);
  if(nearMon) drain+=1.6*dt;
  if(P.worn.ear==='earplugs') drain*=.6;
  if(P.worn.face==='gasmask') drain*=.75;
  if(P.worn.head==='beanie') drain-=.15*dt;
  P.san=clamp(P.san-drain,0,100);
  if(P.san<=0){ damagePlayer(dt*4,null); }
  // шёпот
  whisperT-=dt;
  if(whisperT<=0){ whisperT=rand(6,14)/(1+(1-P.san/100)*2);
    if(P.san<75) SFX.whisper(); }
  // сердцебиение
  const fear=clamp(1-P.san/100,0,1)+(nearMon?.4:0);
  heartbeatT-=dt;
  if(heartbeatT<=0&&fear>.25){ heartbeatT=Math.max(.35,1.3-fear); SFX.heartbeat(fear*.25); }
  $('sanityMeterFx').style.opacity=fear>.5?(fear-.5)*1.4:0;
  // спавн призраков
  spawnT-=dt;
  if(spawnT<=0){ spawnT=rand(14,26)-Math.min(10,P.notesFound*1.6);
    if(P.notesFound>=1||gameTime>60) spawnGhost(); }
  updateHUD();
}
function noiseAlert(){
  for(const m of monsters){ if(!m.dead&&!m.isBoss&&m.distTo(P.pos)<14&&Math.random()<.5){
    m.state='chase'; m.alertT=4; m.lastSeen=P.pos.clone(); } }
}
function animHands(dt,moving,running){
  const sw=handItems.swing||0, kick=handItems.kick||0;
  handItems.swing=Math.max(0,sw-dt*4); handItems.kick=Math.max(0,kick-dt*5);
  const bobX=Math.sin(P.bobT)*(moving?.02:0), bobY=Math.abs(Math.cos(P.bobT))*(moving?.025:.004);
  const L=handItems.armsL.a,R=handItems.armsR.a;
  L.position.x=-.22+bobX; R.position.x=.22+bobX;
  L.position.y=-.32-bobY; R.position.y=-.32-bobY;
  if(sw>0){ R.rotation.x=-sw*2.4; R.position.z=-.45+sw*.15; }
  else { R.rotation.x=Math.sin(P.bobT)*.05; R.position.z=-.45; }
  L.rotation.x=Math.sin(P.bobT+2)*.06;
  if(kick>0){ weaponMeshGroup.position.z=kick*.08; } else weaponMeshGroup.position.z=0;
  if(aimHeld){ weaponMeshGroup.position.x=0; weaponMeshGroup.position.y=.06; }
  else { weaponMeshGroup.position.x=bobX*.5; weaponMeshGroup.position.y=-bobY*.5; }
}
function shake(t,amt){ shakeT=t; shakeAmt=amt; }

/* ================= ОБНОВЛЕНИЕ МИРА ================= */
function updateWorld(dt){
  // мерцание ламп
  for(const l of W.lights){
    if(!l.flicker||!l.light) continue;
    l.t+=dt;
    const n=Math.sin(l.t*13)*Math.sin(l.t*7.3)*Math.sin(l.t*2.1);
    l.light.intensity=l.baseInt*(.6+.4*Math.max(0,n)+ (Math.random()<.02?-0.8:0));
    if(l.light.intensity<0) l.light.intensity=0;
  }
  // двери
  for(const d of W.doors){
    const da=d.open?d.targetAngle:0;
    d.angle+= (da-d.angle)*Math.min(1,dt*4);
    d.panel.parent.rotation.y= (d.obj.rotation.y% (Math.PI*2)) ; // base
    d.obj.rotation.y= (d.obj.userData.baseRot||(d.obj.userData.baseRot=d.obj.rotation.y)) + d.angle;
  }
  // монстры
  for(const m of monsters){
    if(m.fadeIn!==undefined){ m.fadeIn+=dt*2;
      m.model.traverse(o=>{ if(o.material) o.material.opacity=Math.min(m.isBoss?1:.85,m.fadeIn*(m.isBoss?1:.85)); });
      if(m.fadeIn>=1) delete m.fadeIn; }
    m.update(dt,player,W.walls,null,(mon,dmg)=>{ damagePlayer(dmg,mon.pos); },
      (mon)=>{ if(!mon.notified){ mon.notified=true; SFX.monsterGrowl(); } });
    if(m.isBoss&&!m.dead){
      if(!m.phase2&&m.hp<m.maxHp*.45){ m.phase2=true; toast('ТАМИК РАСКОЛОЛСЯ. Он быстрее.',4); SFX.monsterGrowl(); shake(1,2); }
      // фаза телепортов
      m.tpT=(m.tpT||0)+dt;
      if(m.tpT>12){ m.tpT=0;
        const spots=[[0,6],[rand(-20,20),rand(-10,10)]];
        const s=pick(spots);
        if(Math.hypot(s[0]-P.pos.x,s[1]-P.pos.z)>8){ m.pos.set(s[0],0,s[1]); SFX.whisper(); }
      }
    }
  }
  monsters=monsters.filter(m=>!m.dead||m.deathT<2);
  // подбираемые
  for(let i=pickups.length-1;i>=0;i--){
    const p=pickups[i]; p.t+=dt;
    p.mesh.rotation.y+=dt*1.5; p.g.position.y=p.y+Math.sin(p.t*2)*.06;
    if(Math.hypot(p.x-P.pos.x,p.z-P.pos.z)<1.3){
      giveItem(p.item,p.n); scene.remove(p.g); pickups.splice(i,1); }
  }
  // заметки покачивание
  for(const n of noteObjs){ n.g.rotation.y=Math.sin(gameTime+n.x)*.2; }
  updateParticles(dt);
  // подсказка взаимодействия
  const near=findTarget();
  const pr=$('interactPrompt');
  if(near&&state==='play'){ pr.classList.remove('hidden');
    const o=near.obj;
    let txt='[E] ';
    if(o.type==='door') txt+= o.locked?('Запертая дверь'+(o.prompt?' — '+o.prompt:'')):'Открыть дверь';
    else if(o.type==='container') txt+= (o.opened?'Взять':'Обыскать '+(o.label||'шкаф'));
    else if(o.type==='note') txt+='Прочитать записку';
    else if(o.type==='lever') txt+=o.prompt;
    pr.textContent=txt;
  } else pr.classList.add('hidden');
  // амбиент-звуки
  ambientT-=dt;
  if(ambientT<=0){ ambientT=rand(8,18);
    if(Math.random()<.4) SFX.thunder(); else SFX.playNoise?SFX.playNoise(1.2,180,'lowpass',.05):0; }
}

/* ================= ГЛАВНЫЙ ЦИКЛ ================= */
let loopRunning=false;
function startLoop(){ if(!loopRunning){ loopRunning=true; requestAnimationFrame(loop); } }
function loop(){
  requestAnimationFrame(loop);
  const dt=Math.min(.05,clock.getDelta());
  if(state==='cut'){ updateCutscene(dt); return; }
  if(state==='door') tickDoor(dt);
  gameTime+=dt;
  if(state==='play'||state==='inv'||state==='note'||state==='searching'||state==='puzzle'){
    if(state==='play'){ updatePlayer(dt); }
    updateWorld(dt);
  }
  if(state==='dead'){ deathFade+=dt; camera.position.y=Math.max(.3,P.y-deathFade*.5); }
  renderer.render(scene,camera);
}
// страховка от «бесконечного» rAF при ошибке в кадре — цикл не должен умирать молча
addEventListener('unhandledrejection',ev=>console.error('promise',ev.reason));

/* ================= СТАРТ / БОТВАРЬ / ОТКРЫТИЕ ШКАФОВ ================= */
const BOOT={ step:'init', err:null };
window.__BOOT=BOOT;
function bootFail(where,err){
  BOOT.err=(where+': '+(err&&err.message?err.message:String(err)));
  console.error('[МИШУТКА] ошибка загрузки',where,err);
  try{
    let e=$('bootErr');
    if(!e){ e=document.createElement('div'); e.id='bootErr';
      e.style.cssText='position:fixed;left:50%;top:50%;transform:translateX(-50%);z-index:999;color:#c8b060;background:rgba(5,4,2,.92);border:1px solid #5a4a28;padding:18px 26px;font:14px Georgia;max-width:70vw;text-align:center;line-height:1.7;display:none}';
      document.body.appendChild(e); }
    e.textContent='Сбой в больнице («'+where+'»): '+(err&&err.message?err.message:err)+'. Игра попытается продолжить.';
    e.style.display='block'; clearTimeout(bootFail._h);
    bootFail._h=setTimeout(()=>e.style.display='none',6000);
  }catch(_e){}
}
function showMenuError(msg){
  const b=$('btnStart'); if(!b) return;
  b.disabled=false; b.textContent='► НАЧАТЬ СМЕНУ ПАМЯТИ';
  let e=$('menuErr');
  if(!e){ e=document.createElement('div'); e.id='menuErr';
    e.style.cssText='color:#c05050;margin-top:14px;font-size:13px;max-width:60vw;line-height:1.6';
    b.parentNode.insertBefore(e,b.nextSibling); }
  e.textContent=msg;
}

// ——— «затычка»: отпирать запертые двери/шкафы без взлома замка ———
function useEarplugPick(door,cont){
  const i=P.inv.findIndex(s=>s.item==='earplug_pick');
  if(i<0){ toast('Нужна «затычка-отмычка». Ищи в шкафчиках и тумбочках.'); return false; }
  const s=P.inv[i];
  if(Math.random()<.4){
    if(--s.n<=0) P.inv.splice(i,1);
    toast('Затычка сломалась в замке!'); SFX.pluck(); renderInventory(); updateHUD();
    return false;
  }
  if(--s.n<=0) P.inv.splice(i,1);
  renderInventory(); updateHUD();
  return true;
}
function openWithPick(target,isDoor){
  startLockPuzzle(()=>{
    if(isDoor){ target.locked=false; openDoor(target); SFX.doorOpen(); toast('Замок щёлкнул.'); }
    else { target.unlocked=true; target.locked=false; openContainerAnim(target); }
  },()=>{
    if(useEarplugPick(isDoor?target:null,isDoor?null:target)){
      toast('Ты вскрываешь замок затычкой-отмычкой...',3);
      setTimeout(()=>{
        if(isDoor){ target.locked=false; openDoor(target); }
        else { target.unlocked=true; target.locked=false; openContainerAnim(target); }
        SFX.unlock();
      },500);
    }
  });
}

// ——— мини-игра открытия шкафа/тумбочки: держи ЛКМ на дверце и тяни к краю ———
let cabState=null;
function startCabinetGame(cont,onDone){
  state='puzzle'; document.exitPointerLock?.();
  lockState=null; puzzleCb=null; // режим замка выключен — работает режим шкафа
  $('lockPuzzle').classList.remove('hidden');
  const h3=$('lockPuzzle').querySelector('h3'); if(h3) h3.textContent='ОБЫСК: '+(cont.label||(cont.kind==='nightstand'?'ТУМОЧКА':(cont.kind==='locker'?'ШКАФЧИК':'ШКАФ')));
  const hint=$('lockPuzzle').querySelector('.hint');
  if(hint) hint.textContent='Зажми ЛКМ на дверце и ТЯНИ её к себе (вниз): левую — вниз-влево, правую — вниз-вправо. Дверцы настоящие — распахнутся в стороны. Резко дёрнешь — заскрипит на весь коридор.';
  cabState={ cont, doors:[{open:0},{open:0}], drag:null, onDone, done:false };
  drawCab();
}
function drawCab(){
  const cv=$('lockCanvas'),g=cv.getContext('2d');
  const cs=cabState; if(!cs) return;
  g.clearRect(0,0,300,300);
  g.fillStyle='#0a0806'; g.fillRect(0,0,300,300);
  // корпус шкафа (вид спереди)
  g.fillStyle='#14100a'; g.fillRect(28,18,244,262);
  g.strokeStyle='#5a4a30'; g.lineWidth=3; g.strokeRect(28,18,244,262);
  // тёмный проём с полками
  g.fillStyle='#070503'; g.fillRect(40,26,220,246);
  g.strokeStyle='#2a2418'; g.lineWidth=2;
  for(const sy of [95,170]){ g.beginPath(); g.moveTo(45,sy); g.lineTo(255,sy); g.stroke(); }
  // содержимое проступает по мере открытия
  const o=(cs.doors[0].open+cs.doors[1].open)/2;
  if(o>.1){
    const has=cs.cont.contents&&cs.cont.contents.length;
    g.globalAlpha=Math.min(1,(o-.08)*2.2);
    if(has){
      cs.cont.contents.forEach((it,i)=>{
        const def=ITEMS[it.item];
        g.font='30px serif'; g.textAlign='center';
        g.fillText(def?def.icon:'📦',110+i*80,140);
      });
      g.font='italic 13px Georgia'; g.fillStyle='rgba(216,203,164,.9)';
      g.fillText('внутри что-то есть…',150,250);
    } else {
      g.font='italic 14px Georgia'; g.fillStyle='rgba(150,140,120,.8)'; g.textAlign='center';
      g.fillText('пусто…',150,150);
    }
    g.globalAlpha=1;
  }
  // НАСТОЯЩИЕ ДВЕРЦЫ: вращаются вокруг верхних петель (псевдо-3D перспективой)
  for(let i=0;i<2;i++){
    const op=cs.doors[i].open;
    const ang=op*Math.PI*.42;              // угол отворота
    const hingeX=i===0?40:260;             // петля у края корпуса
    const dir=i===0?-1:1;                  // левая открывается влево, правая — вправо
    const W0=110;                          // ширина дверцы в закрытом виде
    const cosA=Math.cos(ang), sinA=Math.sin(ang);
    const edgeX=hingeX+dir*W0*cosA;        // свободный край (по горизонтали ближе к оси)
    const drop=W0*sinA*.55;                // перспективное «приближение» — дверца ниже и крупнее
    const grd=g.createLinearGradient(hingeX,0,edgeX,0);
    grd.addColorStop(0,'#4a4034'); grd.addColorStop(.5,'#3a3226'); grd.addColorStop(1,'#55483a');
    g.fillStyle=grd;
    g.beginPath();
    g.moveTo(hingeX,26);
    g.lineTo(edgeX,26+drop);
    g.lineTo(edgeX,272+drop*1.3);
    g.lineTo(hingeX,272);
    g.closePath(); g.fill();
    g.strokeStyle='#6a5638'; g.lineWidth=2; g.stroke();
    // ручка на свободном крае
    g.fillStyle='#c8a24a'; g.beginPath(); g.arc(edgeX-dir*6,150+drop,5,0,7); g.fill();
    // зона хвата (невидимая) — для попаданий мыши
    cs.doors[i].hit={ x1:Math.min(hingeX,edgeX)-8, x2:Math.max(hingeX,edgeX)+8, y1:20, y2:280 };
  }
  const done=cs.doors.every(d=>d.open>=1);
  $('lockStatus').textContent=done?'Двери раскрыты.':
    `Открыто: ${cs.doors.filter(d=>d.open>=1).length}/2 — зажми ЛКМ на дверце и тяни ВНИЗ к себе`;
  if(done&&!cs.done){ cs.done=true;
    setTimeout(()=>{ $('lockPuzzle').classList.add('hidden');
      const cb=cs.onDone; cabState=null; state='play'; cb&&cb(); },350); }
}
function cabPos(e){ const r=$('lockCanvas').getBoundingClientRect();
  return {x:(e.clientX-r.left)*(300/r.width),y:(e.clientY-r.top)*(300/r.height)}; }
function cabDown(e){
  if(!cabState) return;
  const p=cabPos(e);
  for(let i=0;i<2;i++){
    const d=cabState.doors[i];
    if(d.open>=1) continue;
    const h=d.hit||{x1:i===0?40:150,x2:i===0?150:260,y1:20,y2:280};
    if(p.x>h.x1&&p.x<h.x2&&p.y>h.y1&&p.y<h.y2){
      cabState.drag={i,startX:p.x,startY:p.y}; $('lockCanvas').style.cursor='grabbing'; break;
    }
  }
}
function cabMove(e){
  if(!cabState||!cabState.drag) return;
  const p=cabPos(e), d=cabState.drag;
  const dx=p.x-d.startX, dy=p.y-d.startY;
  const pull=dy+Math.abs(dx)*.35; // тянем вниз (и немного в свою сторону)
  if(pull>0){
    cabState.doors[d.i].open=clamp(cabState.doors[d.i].open+pull*.008,0,1);
    d.startX=p.x; d.startY=p.y;
    if(Math.random()<.06){ SFX.cabinet(); noiseAlert(); }
  }
  drawCab();
}
function cabUp(e){
  if(!cabState) return;
  cabState.drag=null; $('lockCanvas').style.cursor='grab';
}

// ——— ботварь: оружие и одежда по всей больнице ———
function stockWorld(){
  const find=(pred)=>W.interactables.find(pred);
  const add=(item,n,x,z)=>addPickup(item,x,.5,z,n||1);
  // пистолет уже в шкафчике приёмной; добавим обвесы и одежду
  let c=find(o=>o.type==='container'&&o.kind==='locker'&&Math.abs(o.x-(-19))<.1&&Math.abs(o.z-(-1.15))<.1);
  if(c) c.contents.push({item:'baton',n:1});
  c=find(o=>o.type==='container'&&o.kind==='nightstand'&&Math.abs(o.x-3)<.1&&Math.abs(o.z-1.15)<.1);
  if(c) c.contents.push({item:'earplug_pick',n:2});
  c=find(o=>o.type==='container'&&o.kind==='locker'&&Math.abs(o.x-(-25.5))<.1&&Math.abs(o.z-5.4)<.1);
  if(c) c.contents.push({item:'ammo',n:6},{item:'earplug_pick',n:1});
  c=find(o=>o.type==='container'&&o.kind==='cabinet'&&Math.abs(o.x-(-25.5))<.1&&Math.abs(o.z+5.4)<.1);
  if(c) c.contents.push({item:'coat_winter',n:1}); // уже есть пальто — пусть будет ещё аптечка
  if(c) c.contents.push({item:'medkit',n:1});
  c=find(o=>o.type==='container'&&o.kind==='locker'&&Math.abs(o.x-(-24.8))<.1&&Math.abs(o.z-(-13.4))<.1);
  if(c) c.contents.push({item:'shells',n:4});
  c=find(o=>o.type==='container'&&o.kind==='locker'&&Math.abs(o.x-5.2)<.1&&Math.abs(o.z-(-11.3))<.1);
  if(c) c.contents.push({item:'earplug_pick',n:2},{item:'bandage',n:1});
  c=find(o=>o.type==='container'&&o.kind==='cabinet'&&Math.abs(o.x-15.2)<.1&&Math.abs(o.z-(-4))<.1);
  if(c) c.contents.push({item:'pants_cargo',n:1});
  c=find(o=>o.type==='container'&&o.kind==='locker'&&Math.abs(o.x-24.8)<.1&&Math.abs(o.z-(-5))<.1);
  if(c) c.contents.push({item:'shotgun',n:1}); // дробовик остаётся только здесь
  if(c) c.contents.push({item:'shells',n:8});
  c=find(o=>o.type==='container'&&o.kind==='cabinet'&&Math.abs(o.x-31.2)<.1&&Math.abs(o.z-5)<.1);
  if(c) c.contents.push({item:'medkit',n:1});
  c=find(o=>o.type==='container'&&o.kind==='cabinet'&&Math.abs(o.x-22)<.1&&Math.abs(o.z-(-7.6))<.1);
  if(c) c.contents.push({item:'armor',n:1});
  c=find(o=>o.type==='container'&&o.kind==='cabinet'&&Math.abs(o.x-17.5)<.1&&Math.abs(o.z-(-8.4))<.1);
  if(c) c.contents.push({item:'earplug_pick',n:2});
  c=find(o=>o.type==='container'&&o.kind==='cabinet'&&Math.abs(o.x-31.2)<.1&&Math.abs(o.z-7.5)<.1);
  if(c) c.contents.push({item:'earplug_pick',n:2});
  // палаты A — шкафчики у кроватей
  [[-13.65],[-9.65],[-5.65]].forEach((row,i)=>{
    const cc=find(o=>o.type==='container'&&o.kind==='locker'&&Math.abs(o.x-row[0])<.2&&o.z>1.9&&o.z<2.4);
    if(cc){ cc.contents.push([{item:'pill',n:1},{item:'bandage',n:2},{item:'battery',n:1}][i]); }
  });
  const nn=find(o=>o.type==='container'&&o.kind==='nightstand'&&Math.abs(o.x-(-12))<.6&&o.z>8);
  if(nn) nn.contents.push({item:'knife',n:1});
  // южные палаты
  const cc2=find(o=>o.type==='container'&&o.kind==='cabinet'&&Math.abs(o.x-(-15.6))<.3&&o.z<-8);
  if(cc2) cc2.contents.push({item:'earplug_pick',n:1},{item:'pill',n:1});
  const cc3=find(o=>o.type==='container'&&o.kind==='cabinet'&&Math.abs(o.x-(-11.6))<.3&&o.z<-8);
  if(cc3) cc3.contents.push({item:'sneakers',n:1});
  const cc4=find(o=>o.type==='container'&&o.kind==='cabinet'&&Math.abs(o.x-(-7.6))<.3&&o.z<-8);
  if(cc4) cc4.contents.push({item:'boots',n:1});
  // напольные подборки (часть перенесём в контейнеры — оставим атмосферные редкие)
  add('battery',-2.5,.35,2.2,1);
  add('ammo',10.5,.78,-7.2,6);
  add('mag357',25.2,.5,1.2,6);
  add('shells',30.5,.85,-3,8);
  add('revolver',24.6,.5,-.5);
  add('katana',29.4,.6,12.5);
  add('axe',-30.5,.5,-12.5);
  add('pipe',-13.5,.5,-6.5);
  add('gasmask',-12,.5,-5.2);
  add('beanie',13.5,1.0,-9.5);
  add('cap_nurse',-28.5,1.2,-2.5);
  add('medkit',2.5,.5,7.5);
  add('pill',-16.5,.5,6.5);
}

function newGame(){
  BOOT.step='three';
  initThree(); initFlashlight();
  BOOT.step='world';
  buildWorld(scene);
  player={pos:P.pos,flashOn:true,aimAt:()=>false};
  initHands();
  BOOT.step='items';
  addPickup('flashlight',-1.2,.8,8.0);
  addPickup('pill',1.2,.5,7.2);
  placeSpecialKeys();
  stockWorld();
  hookMorgNote();
  spawnNotes();
  applyWorn(); updateCharacterSvg();
  updateHUD();
  BOOT.step='ready'; gameReady=true; BOOT.done=true;
}
function bindHooksWorld(){ /* toast уже глобален */ }
function placeSpecialKeys(){
  addPickup('key_normal',5.2,1.05,-10.6);
}
function hookMorgNote(){
  // записка №3 спрятана в locker морга: переопределим contents
  const morgLocker=W.interactables.find(o=>o.type==='container'&&o.kind==='locker'&&o.x<-24&&o.z<-12);
  if(morgLocker){ morgLocker.contents.push({item:'note_n3',n:1}); }
}
function wireMenu(){
  if(menuWired) return; menuWired=true;
  const b=$('btnStart');
  b.onclick=()=>{
    if(b.disabled) return;
    b.disabled=true; b.textContent='…загружаемся…';
    try{
      SFX.init(); SFX.resume();
    }catch(e){ console.warn('звук недоступен',e); }
    try{
      $('menu').classList.add('hidden');
      $('cutscene').classList.remove('hidden');
      $('cineBars').classList.remove('hidden');
      state='cut';
      if(!csScene) buildCutscene();
      csT=0; csShown=-1;
      if(!loopStarted){ loopStarted=true; newGame(); }
      startLoop();
    }catch(e){
      bootFail('старт',e);
      $('menu').classList.remove('hidden');
      $('cutscene').classList.add('hidden');
      $('cineBars').classList.add('hidden');
      state='menu';
      showMenuError('Что-то сломалось при загрузке ('+(e&&e.message?e.message:e)+'). Попробуй ещё раз.');
      return;
    }
    b.disabled=false; b.textContent='► НАЧАТЬ СМЕНУ ПАМЯТИ';
  };
  b.onmouseenter=()=>SFX.puzzleTick&&safeCall(()=>SFX.puzzleTick(true),'snd');
}
// страховка: если модуль загрузился криво — кнопка всё равно оживает с подсказкой
try{ wireMenu(); }catch(e){ bootFail('wireMenu',e); showMenuError('Не удалось подготовить меню: '+(e&&e.message||e)); }
addEventListener('error',ev=>{ console.error('window error',ev.error||ev.message); });
