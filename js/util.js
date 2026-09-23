// util.js — генерация текстур и звуков (без внешних файлов)
import * as THREE from 'three';

export const rand = (a,b)=>a+Math.random()*(b-a);
export const randi = (a,b)=>Math.floor(rand(a,b+1));
export const pick = arr=>arr[Math.floor(Math.random()*arr.length)];
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

const cache = {};
export function makeCanvasTex(key, w, h, draw, opts={}){
  if(cache[key]) return cache[key];
  const c=document.createElement('canvas'); c.width=w; c.height=h;
  const g=c.getContext('2d'); draw(g,w,h);
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  if(opts.repeat) t.repeat.set(opts.repeat[0],opts.repeat[1]);
  if(opts.anisotropy) t.anisotropy=opts.anisotropy;
  t.colorSpace = opts.data? THREE.NoColorSpace : THREE.SRGBColorSpace;
  cache[key]=t; return t;
}
export function clearTexCache(){ for(const k in cache) { try{cache[k].dispose();}catch(e){} delete cache[k]; } }

function noise(g,w,h,alpha,cols=['#000','#fff']){
  for(let i=0;i<w*h*0.35;i++){
    g.fillStyle=pick(cols); g.globalAlpha=rand(0.01,alpha);
    const x=Math.random()*w, y=Math.random()*h, s=rand(1,3);
    g.fillRect(x,y,s,s);
  }
  g.globalAlpha=1;
}
function grungeStains(g,w,h,n,color){
  for(let i=0;i<n;i++){
    const x=Math.random()*w,y=Math.random()*h,r=rand(8,60);
    const grd=g.createRadialGradient(x,y,1,x,y,r);
    grd.addColorStop(0,color.replace('%A%',rand(0.15,0.4)));
    grd.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=grd; g.beginPath(); g.arc(x,y,r,0,7); g.fill();
  }
}

/* ---------- ТЕКСТУРЫ ---------- */
export const TEX = {
  floorTile(){ return makeCanvasTex('floorTile',256,256,(g,w,h)=>{
    g.fillStyle='#4a4f46'; g.fillRect(0,0,w,h);
    const s=64;
    for(let y=0;y<h;y+=s)for(let x=0;x<w;x+=s){
      g.fillStyle=`rgb(${70+rand(-8,8)},${76+rand(-8,8)},${66+rand(-8,8)})`;
      g.fillRect(x+1,y+1,s-2,s-2);
      g.strokeStyle='rgba(0,0,0,.45)'; g.strokeRect(x,y,s,s);
    }
    noise(g,w,h,.12,['#2c2f28','#6a6f62']);
    grungeStains(g,w,h,6,'rgba(30,20,10,%A%)');
    grungeStains(g,w,h,3,'rgba(60,8,8,%A%)');
  }, {repeat:[8,8]});},

  wallPaint(){ return makeCanvasTex('wallPaint',256,256,(g,w,h)=>{
    g.fillStyle='#6d6f5e'; g.fillRect(0,0,w,h);
    for(let i=0;i<40;i++){ g.fillStyle=`rgba(${90+rand(-25,25)},${95+rand(-25,25)},${75+rand(-25,25)},.25)`;
      g.fillRect(Math.random()*w,Math.random()*h,rand(20,90),rand(20,90)); }
    // подтёкшая краска вниз
    for(let i=0;i<26;i++){ const x=Math.random()*w; g.fillStyle='rgba(50,55,42,.4)';
      g.fillRect(x,Math.random()*h*.5,rand(2,6),rand(20,120)); }
    grungeStains(g,w,h,8,'rgba(25,22,12,%A%)');
    grungeStains(g,w,h,4,'rgba(70,10,10,%A%)');
    noise(g,w,h,.1,['#3a3d30','#8a8d78']);
  },{repeat:[4,2]});},

  wallTiles(){ return makeCanvasTex('wallTiles',256,256,(g,w,h)=>{
    g.fillStyle='#2e322c'; g.fillRect(0,0,w,h);
    const s=32;
    for(let y=0;y<h;y+=s)for(let x=0;x<w;x+=s){
      g.fillStyle=`rgb(${150+rand(-14,14)},${152+rand(-14,14)},${138+rand(-14,14)})`;
      g.fillRect(x+1,y+1,s-2,s-2);
    }
    grungeStains(g,w,h,10,'rgba(40,35,15,%A%)');
    // тёмные разводы "крови"
    for(let i=0;i<3;i++){ const x=Math.random()*w; g.strokeStyle='rgba(70,8,8,.5)'; g.lineWidth=rand(2,7);
      g.beginPath(); g.moveTo(x,0); g.bezierCurveTo(x+rand(-20,20),h*.4,x+rand(-30,30),h*.7,x+rand(-10,10),h); g.stroke(); }
    noise(g,w,h,.08,['#554','#aa9']);
  },{repeat:[6,3]});},

  ceiling(){ return makeCanvasTex('ceil',256,256,(g,w,h)=>{
    g.fillStyle='#8d8f80'; g.fillRect(0,0,w,h);
    const s=128;
    for(let y=0;y<h;y+=s)for(let x=0;x<w;x+=s){
      g.fillStyle=`rgb(${135+rand(-10,10)},${137+rand(-10,10)},${120+rand(-10,10)})`;
      g.fillRect(x+2,y+2,s-4,s-4); g.strokeStyle='rgba(0,0,0,.4)'; g.strokeRect(x,y,s,s);
    }
    grungeStains(g,w,h,7,'rgba(45,35,10,%A%)');
    grungeStains(g,w,h,2,'rgba(20,20,25,%A%)');
    noise(g,w,h,.07,['#443','#bb9']);
  },{repeat:[8,8]});},

  wood(){ return makeCanvasTex('wood',256,256,(g,w,h)=>{
    g.fillStyle='#5a4227'; g.fillRect(0,0,w,h);
    for(let i=0;i<60;i++){ g.strokeStyle=`rgba(${40+rand(-15,15)},${28+rand(-10,10)},${12},${rand(.15,.5)})`;
      g.lineWidth=rand(1,4); g.beginPath(); const y=Math.random()*h; g.moveTo(0,y);
      g.bezierCurveTo(w*.3,y+rand(-8,8),w*.6,y+rand(-8,8),w,y+rand(-6,6)); g.stroke(); }
    grungeStains(g,w,h,4,'rgba(15,8,2,%A%)');
    noise(g,w,h,.08,['#2a1a0a','#7a5c34']);
  });},

  metal(){ return makeCanvasTex('metal',256,256,(g,w,h)=>{
    g.fillStyle='#6a6e72'; g.fillRect(0,0,w,h);
    for(let i=0;i<120;i++){ g.strokeStyle=`rgba(${rand(60,140)},${rand(62,142)},${rand(66,148)},.25)`;
      g.beginPath(); const y=Math.random()*h; g.moveTo(0,y); g.lineTo(w,y+rand(-2,2)); g.stroke(); }
    grungeStains(g,w,h,8,'rgba(70,40,10,%A%)'); // ржавчина
    noise(g,w,h,.1,['#2a2d30','#9aa0a6']);
  });},

  concrete(){ return makeCanvasTex('concrete',256,256,(g,w,h)=>{
    g.fillStyle='#57534a'; g.fillRect(0,0,w,h);
    grungeStains(g,w,h,14,'rgba(25,22,16,%A%)');
    for(let i=0;i<8;i++){ g.strokeStyle='rgba(20,18,14,.6)'; g.lineWidth=rand(1,2.5); g.beginPath();
      let x=Math.random()*w,y=Math.random()*h; g.moveTo(x,y);
      for(let j=0;j<6;j++){ x+=rand(-40,40); y+=rand(-40,40); g.lineTo(x,y);} g.stroke(); }
    noise(g,w,h,.12,['#2e2c26','#7a756a']);
  },{repeat:[6,6]});},

  mattress(){ return makeCanvasTex('mattress',128,128,(g,w,h)=>{
    g.fillStyle='#a8a28e'; g.fillRect(0,0,w,h);
    grungeStains(g,w,h,10,'rgba(60,45,20,%A%)');
    grungeStains(g,w,h,3,'rgba(80,10,10,%A%)');
    noise(g,w,h,.1,['#4a4436','#c8c2ae']);
  });},

  bloodWall(){ return makeCanvasTex('bloodWall',256,256,(g,w,h)=>{
    g.clearRect(0,0,w,h);
    for(let i=0;i<9;i++){ const x=rand(20,w-20); g.strokeStyle=`rgba(${randi(90,140)},${randi(4,14)},${randi(4,12)},${rand(.5,.9)})`;
      g.lineWidth=rand(3,10); g.beginPath(); g.moveTo(x,0);
      g.bezierCurveTo(x+rand(-14,14),h*.3,x+rand(-20,20),h*.6,x+rand(-8,8),h); g.stroke(); }
    for(let i=0;i<30;i++){ g.fillStyle=`rgba(110,8,8,${rand(.3,.8)})`;
      g.beginPath(); g.arc(Math.random()*w,Math.random()*h,rand(2,7),0,7); g.fill(); }
  });},

  poster(key){ return makeCanvasTex('poster'+key,256,256,(g,w,h)=>{
    g.fillStyle='#cfc7ad'; g.fillRect(0,0,w,h);
    g.fillStyle='#3a3a30'; g.font='bold 26px Georgia'; g.textAlign='center';
    const titles={warning:'ОСТОРОЖНО', rules:'ПРАВИЛА', doctor:'ВРАЧ', escape:'ЭВАКУАЦИЯ', mirror:'НЕ СМОТРИ'};
    g.fillText(titles[key]||'БОЛЬНИЦА', w/2, 40);
    g.strokeStyle='#7a2020'; g.lineWidth=4; g.strokeRect(12,12,w-24,h-24);
    g.font='15px Georgia'; g.fillStyle='#4a4638';
    const lines={ warning:['Не оставляйте пациентов','одних в коридоре.','Свет должен гореть','всегда.'],
      rules:['1. Ложись до отбоя','2. Не смотри в зеркала','3. Верь врачу Тамикy','4. Забудь всё'],
      doctor:['Д-р ТАМИК','главный врач','«Мы вылечим вас','от памяти»'],
      escape:['Запасной выход','— блок Б.','Ключ у того,','кто смеётся первым'],
      mirror:['НЕ СМОТРИ','В Отражения','оно смотрит','В ОТВЕТ'] };
    (lines[key]||['']).forEach((t,i)=>g.fillText(t,w/2,90+i*30));
    grungeStains(g,w,h,5,'rgba(40,30,10,%A%)');
    noise(g,w,h,.08,['#554','#aa9']);
  });},

  notePaper(){ return makeCanvasTex('noteP',128,128,(g,w,h)=>{
    g.fillStyle='#d8cba4'; g.fillRect(0,0,w,h);
    g.strokeStyle='rgba(90,70,40,.5)';
    for(let i=0;i<7;i++){ const y=24+i*14; g.beginPath(); g.moveTo(12,y);
      let x=12; while(x<w-14){ x+=rand(4,10); g.lineTo(x,y+rand(-1.5,1.5)); } g.stroke(); }
    grungeStains(g,w,h,3,'rgba(90,60,20,%A%)');
  });},
};

/* ---------- ЗВУК ---------- */
class AudioSys{
  constructor(){ this.ctx=null; this.master=null; this.ambGain=null; this.enabled=false; this._hum=null; }
  init(){
    if(this.ctx) return;
    try{ this.ctx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return; }
    this.master=this.ctx.createGain(); this.master.gain.value=.6; this.master.connect(this.ctx.destination);
    this.enabled=true;
  }
  resume(){ if(this.ctx&&this.ctx.state==='suspended') this.ctx.resume(); }
  noiseBuf(sec=1){
    const sr=this.ctx.sampleRate, b=this.ctx.createBuffer(1,sr*sec,sr), d=b.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1; return b;
  }
  playNoise(dur,freq,type='lowpass',vol=.3,q=1){
    if(!this.enabled)return;
    const s=this.ctx.createBufferSource(); s.buffer=this.noiseBuf(Math.max(.1,dur));
    const f=this.ctx.createBiquadFilter(); f.type=type; f.frequency.value=freq; f.Q.value=q;
    const g=this.ctx.createGain(); g.gain.setValueAtTime(vol,this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001,this.ctx.currentTime+dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(); s.stop(this.ctx.currentTime+dur);
  }
  tone(freq,dur,type='sine',vol=.2,slide=0){
    if(!this.enabled)return;
    const o=this.ctx.createOscillator(), g=this.ctx.createGain();
    o.type=type; o.frequency.setValueAtTime(freq,this.ctx.currentTime);
    if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(20,freq+slide),this.ctx.currentTime+dur);
    g.gain.setValueAtTime(vol,this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001,this.ctx.currentTime+dur);
    o.connect(g); g.connect(this.master); o.start(); o.stop(this.ctx.currentTime+dur);
  }
  step(running){ this.playNoise(running?.09:.13, running?500:320,'lowpass',running?.16:.09); }
  heartbeat(rate){ this.tone(55,.12,'sine',rate); setTimeout(()=>this.tone(48,.16,'sine',rate*.8),140); }
  pickup(){ this.tone(660,.08,'triangle',.15); this.tone(990,.12,'triangle',.1); }
  doorOpen(){ this.playNoise(.5,300,'lowpass',.2); this.tone(120,.4,'sawtooth',.05,-60); }
  cabinet(){ this.playNoise(.25,800,'bandpass',.15); }
  hit(){ this.playNoise(.12,250,'lowpass',.4); this.tone(90,.1,'square',.2,-40); }
  slash(){ this.playNoise(.15,2400,'highpass',.3); }
  gunshot(){ this.playNoise(.25,1800,'lowpass',.7,.8); this.tone(160,.2,'sawtooth',.4,-120); }
  reload(){ this.tone(300,.05,'square',.15); setTimeout(()=>this.tone(420,.05,'square',.15),180); }
  emptyClick(){ this.tone(700,.04,'square',.12); }
  monsterGrowl(){ this.tone(rand(60,110),.9,'sawtooth',.12,-30); this.playNoise(.8,200,'lowpass',.1); }
  monsterDie(){ this.tone(220,1.2,'sawtooth',.25,-190); this.playNoise(1,400,'lowpass',.2); }
  whisper(){ this.playNoise(1.4,1200,'bandpass',.06,3); }
  puzzleTick(ok){ this.tone(ok?880:180,.06,'square',ok?.18:.1); }
  unlock(){ this.tone(520,.1,'square',.15); setTimeout(()=>this.tone(780,.15,'square',.15),120); }
  thunder(){ this.playNoise(1.6,140,'lowpass',.5); }
  pluck(){ this.playNoise(.4,600,'lowpass',.25); this.tone(150,.3,'triangle',.15,-80); }
  startAmbience(){
    if(!this.enabled||this._hum) return;
    const o=this.ctx.createOscillator(), g=this.ctx.createGain(), f=this.ctx.createBiquadFilter();
    o.type='sawtooth'; o.frequency.value=48; f.type='lowpass'; f.frequency.value=90;
    g.gain.value=.03; o.connect(f); f.connect(g); g.connect(this.master); o.start();
    const lfo=this.ctx.createOscillator(), lg=this.ctx.createGain();
    lfo.frequency.value=.07; lg.gain.value=6; lfo.connect(lg); lg.connect(o.frequency); lfo.start();
    const s=this.ctx.createBufferSource(); s.buffer=this.noiseBuf(4); s.loop=true;
    const sf=this.ctx.createBiquadFilter(); sf.type='bandpass'; sf.frequency.value=5200; sf.Q.value=.4;
    const sg=this.ctx.createGain(); sg.gain.value=.012;
    s.connect(sf); sf.connect(sg); sg.connect(this.master); s.start();
    this._hum={o,g,s,sg};
  }
}
export const SFX = new AudioSys();
