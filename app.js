(() => {
  const canvas = document.getElementById('spaceCanvas');
  const ctx = canvas.getContext('2d');
  const panelWidth = () => document.getElementById('controlPanel').classList.contains('collapsed') ? 44 : Math.min(360, innerWidth < 760 ? 300 : 360);
  let w = 0, h = 0, dpr = 1, stars = [], galaxies = [], dust = [], bodies = [], draggingBody = null, selectedBody = null;
  let motionPaused = false;
  let mouse = { x: -1000, y: -1000 }, time = 0, last = performance.now();
  let dragPayload = null;

  const types = {
    sun: { label: '恒星', color: '#ffc85c', core: '#fff7c7' },
    giant: { label: '蓝巨星', color: '#71a8ff', core: '#f2fbff' },
    neutron: { label: '中子星', color: '#75e7ff', core: '#ffffff' },
    blackhole: { label: '恒星级黑洞', color: '#ff8c45', core: '#000000' },
    supermassive: { label: '超大质量黑洞', color: '#779dff', core: '#000000' },
    custom: { label: '自定义黑洞', color: '#61dfff', core: '#000000' }
  };

  function mulberry32(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 1.75); w = innerWidth; h = innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); makeSpace();
  }

  function makeGalaxySamples(g,rnd){
    const samples=[],count=115,arms=g.type==='barred'?2:3;
    for(let i=0;i<count;i++){
      let dx=0,dy=0,radial=0;
      if(g.type==='spiral'||g.type==='barred'){
        radial=g.size*(.1+.9*Math.sqrt(rnd()));
        const arm=i%arms,angle=arm*Math.PI*2/arms+(radial/g.size)*4.7+(rnd()-.5)*.32;
        dx=Math.cos(angle)*radial;dy=Math.sin(angle)*radial*.62;
        if(g.type==='barred'&&rnd()<.2){dx=(rnd()*2-1)*g.size*.64;dy=(rnd()-.5)*g.size*.13;radial=Math.abs(dx)}
      }else if(g.type==='elliptical'){
        const angle=rnd()*Math.PI*2;radial=g.size*Math.pow(rnd(),.72);dx=Math.cos(angle)*radial;dy=Math.sin(angle)*radial*.58;
      }else{
        dx=(rnd()*2-1)*g.size*1.28;dy=(rnd()-.5)*g.size*.22*(1-Math.abs(dx)/(g.size*1.4));radial=Math.abs(dx);
      }
      const core=radial<g.size*.22,hue=core?45:g.hue,light=core?88:68+rnd()*12;
      samples.push({dx,dy,r:core?.7:.32+rnd()*.42,a:core?.92:.3+rnd()*.5,color:`hsla(${hue},88%,${light}%,1)`});
    }
    for(let i=0;i<10;i++)samples.push({dx:(rnd()-.5)*g.size*.18,dy:(rnd()-.5)*g.size*.11,r:.75+rnd()*.55,a:.9,color:'rgba(255,239,194,1)'});
    return samples;
  }
  function makeSpace() {
    const rnd = mulberry32(71423 + Math.round(w));
    const count = Math.floor(w * h / 2400);
    stars = Array.from({ length: count }, (_, i) => ({
      x: rnd() * w, y: rnd() * h, r: .25 + rnd() * (rnd() > .94 ? 1.8 : .75),
      a: .18 + rnd() * .8, hue: rnd() > .83 ? (rnd() > .5 ? 205 : 35) : 220,
      tw: rnd() * Math.PI * 2, depth: .5 + rnd() * .9, id: i
    }));
    galaxies = Array.from({ length: Math.max(42, Math.floor(w * h / 18000)) }, (_, i) => ({
      x: 30 + rnd() * Math.max(1, w - panelWidth() - 60), y: 30 + rnd() * Math.max(1, h - 60),
      size: 4.5 + rnd() * 8 + (rnd() > .9 ? 5 : 0), type: ['spiral','elliptical','barred','edge'][Math.floor(rnd()*4)],
      rotation: rnd() * Math.PI, hue: rnd() > .72 ? 34 + rnd()*18 : 190 + rnd()*45,
      a: .34 + rnd() * .55, spin: (rnd()-.5)*.00008, id: i
    }));
    galaxies.forEach(g=>g.samples=makeGalaxySamples(g,rnd));
    dust = Array.from({length: 7}, () => ({x:rnd()*w,y:rnd()*h,rx:100+rnd()*300,ry:30+rnd()*100,h:190+rnd()*80,a:.012+rnd()*.02}));
  }

  function lensRadius(mass) { return 22 + Math.log10(Math.max(1, mass)) * 15; }
  function bodyRadius(body) {
    if (body.type === 'sun') return 16;
    if (body.type === 'giant') return 23;
    if (body.type === 'neutron') return 8;
    return 10 + Math.log10(Math.max(1, body.mass)) * 1.9;
  }

  function lensedPoint(star) {
    let x = star.x, y = star.y, magnify = 1, tangential = 0;
    for (const b of bodies) {
      const dx = x - b.x, dy = y - b.y, r2 = dx*dx + dy*dy, r = Math.sqrt(r2) || .1;
      const er = lensRadius(b.mass);
      const influence = Math.min(1, (er * er) / Math.max(80, r2));
      if (r < er * 5) {
        const shift = Math.min(er * 1.35, er * er / Math.max(r, er * .18)) * .42;
        x += dx / r * shift; y += dy / r * shift;
        magnify += influence * 2.2; tangential += influence;
      }
    }
    return { x, y, magnify, tangential };
  }

  function drawBackground() {
    const g = ctx.createRadialGradient(w*.47,h*.43,10,w*.47,h*.43,Math.max(w,h)*.75);
    g.addColorStop(0,'#0b1730'); g.addColorStop(.35,'#060b19'); g.addColorStop(1,'#010208');
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    ctx.save();ctx.globalCompositeOperation='screen';
    for(const d of dust){const dg=ctx.createRadialGradient(d.x,d.y,0,d.x,d.y,d.rx);dg.addColorStop(0,`hsla(${d.h},70%,48%,${d.a})`);dg.addColorStop(1,'transparent');ctx.fillStyle=dg;ctx.save();ctx.translate(d.x,d.y);ctx.scale(1,d.ry/d.rx);ctx.beginPath();ctx.arc(0,0,d.rx,0,Math.PI*2);ctx.fill();ctx.restore();}
    ctx.restore();
  }

  function dominantLens(g){
    let nearest=null,score=Infinity;
    for(const b of bodies){const er=lensRadius(b.mass),value=Math.hypot(g.x-b.x,g.y-b.y)/er;if(value<score){score=value;nearest=b}}
    return score<5.2?nearest:null;
  }

  function paintGalaxyPoint(x,y,s,magnification=1,alpha=1){
    if(x<1||x>w-panelWidth()-1||y<1||y>h-1)return;
    const radius=Math.min(2.8,s.r*Math.sqrt(Math.min(10,Math.max(.2,magnification))));
    ctx.globalAlpha=s.a*alpha;ctx.fillStyle=s.color;
    if(radius<.7)ctx.fillRect(x-radius*.5,y-radius*.5,Math.max(.55,radius),Math.max(.55,radius));
    else{ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill()}
  }

  function drawGalaxies(){
    ctx.save();ctx.globalCompositeOperation='screen';
    for(const g of galaxies){
      const lens=dominantLens(g),cos=Math.cos(g.rotation+time*g.spin),sin=Math.sin(g.rotation+time*g.spin);
      for(const s of g.samples){
        const sx=g.x+s.dx*cos-s.dy*sin,sy=g.y+s.dx*sin+s.dy*cos;
        if(!lens){paintGalaxyPoint(sx,sy,s);continue}
        const dx=sx-lens.x,dy=sy-lens.y,beta=Math.max(.12,Math.hypot(dx,dy)),er=lensRadius(lens.mass);
        const root=Math.sqrt(beta*beta+4*er*er),thetaPlus=(beta+root)*.5,thetaMinus=(beta-root)*.5;
        const factor=(beta*beta+2*er*er)/(2*beta*root),muPlus=.5+factor,muMinus=Math.abs(.5-factor);
        paintGalaxyPoint(lens.x+dx/beta*thetaPlus,lens.y+dy/beta*thetaPlus,s,muPlus,1);
        paintGalaxyPoint(lens.x+dx/beta*thetaMinus,lens.y+dy/beta*thetaMinus,s,muMinus,.82);
      }
    }
    ctx.globalAlpha=1;ctx.restore();
  }
  function drawStars() {
    for (const s of stars) {
      const p = lensedPoint(s); if (p.x < 0 || p.x > w-panelWidth() || p.y<0 || p.y>h) continue;
      const blink = .77 + Math.sin(time*.0012*s.depth+s.tw)*.23;
      const rr = Math.min(4.5, s.r * Math.sqrt(p.magnify));
      ctx.save(); ctx.translate(p.x,p.y);
      if(p.tangential>.12){
        let nearest=bodies[0],dist=Infinity;for(const b of bodies){const dd=(p.x-b.x)**2+(p.y-b.y)**2;if(dd<dist){dist=dd;nearest=b}}
        if(nearest) ctx.rotate(Math.atan2(p.y-nearest.y,p.x-nearest.x)+Math.PI/2);
        ctx.scale(1+Math.min(4,p.tangential*3.5),1);
      }
      ctx.fillStyle=`hsla(${s.hue},75%,${s.hue===35?78:88}%,${s.a*blink})`;
      ctx.beginPath();ctx.arc(0,0,rr,0,Math.PI*2);ctx.fill();
      if(rr>1.25){ctx.globalAlpha=.25;ctx.fillRect(-rr*3,-.25,rr*6,.5);ctx.fillRect(-.25,-rr*3,.5,rr*6)}
      ctx.restore();
      // secondary image in the strong-lensing zone
      for(const b of bodies){const dx=s.x-b.x,dy=s.y-b.y,r=Math.hypot(dx,dy),er=lensRadius(b.mass);if(r>er*.45&&r<er*1.6){const ang=Math.atan2(dy,dx)+Math.PI;const ir=er*er/r*.72;ctx.globalAlpha=s.a*.34;ctx.fillStyle='#c8efff';ctx.beginPath();ctx.arc(b.x+Math.cos(ang)*ir,b.y+Math.sin(ang)*ir,Math.max(.4,s.r*.7),0,Math.PI*2);ctx.fill();ctx.globalAlpha=1}}
    }
  }

  function drawLensField(b) {
    const er=lensRadius(b.mass), compact=['blackhole','supermassive','custom'].includes(b.type);
    ctx.save();ctx.translate(b.x,b.y);ctx.globalCompositeOperation='screen';
    const field=ctx.createRadialGradient(0,0,er*.15,0,0,er*4.5);field.addColorStop(0,'rgba(130,225,255,.07)');field.addColorStop(.2,'rgba(80,170,255,.025)');field.addColorStop(1,'transparent');ctx.fillStyle=field;ctx.beginPath();ctx.arc(0,0,er*4.5,0,Math.PI*2);ctx.fill();
    // animated spacetime contours
    for(let i=1;i<=5;i++){const pulse=(time*.008+i*17)%(er*3.2);ctx.strokeStyle=`rgba(99,195,255,${.05*(1-pulse/(er*3.2))})`;ctx.lineWidth=.7;ctx.beginPath();ctx.arc(0,0,er*.55+pulse,0,Math.PI*2);ctx.stroke()}
    // Einstein ring, with broken brighter arcs
    const ring=ctx.createRadialGradient(0,0,er*.88,0,0,er*1.11);ring.addColorStop(0,'transparent');ring.addColorStop(.47,'rgba(111,203,255,.08)');ring.addColorStop(.5,'rgba(220,249,255,.7)');ring.addColorStop(.54,'rgba(71,143,255,.1)');ring.addColorStop(1,'transparent');ctx.fillStyle=ring;ctx.beginPath();ctx.arc(0,0,er*1.14,0,Math.PI*2);ctx.fill();
    ctx.lineCap='round';for(let i=0;i<3;i++){ctx.strokeStyle=`rgba(${i?120:224},${i?191:244},255,${.3-i*.07})`;ctx.lineWidth=1.1+i*.5;ctx.beginPath();ctx.arc(0,0,er*(1+i*.018),-.5+i*1.8,.65+i*1.8);ctx.stroke()}
    // lensed accretion-disk contour echoes
    if(compact){for(let i=1;i<=4;i++){ctx.strokeStyle=`rgba(${100+i*22},${148+i*16},255,${.12/i})`;ctx.lineWidth=.7;ctx.beginPath();ctx.ellipse(0,0,er*(1.18+i*.18),er*(.28+i*.05),-.17,0,Math.PI*2);ctx.stroke()}}
    ctx.restore();
  }

  function drawBody(b) {
    const style=types[b.type]||types.custom,r=bodyRadius(b),compact=['blackhole','supermassive','custom'].includes(b.type);
    drawLensField(b);ctx.save();ctx.translate(b.x,b.y);
    if(compact){
      ctx.save();ctx.rotate(-.17);ctx.scale(1,.25);const disk=ctx.createRadialGradient(0,0,r*.3,0,0,r*3.3);disk.addColorStop(0,'#fff');disk.addColorStop(.12,style.color);disk.addColorStop(.3,'rgba(255,102,48,.78)');disk.addColorStop(.55,'rgba(91,116,255,.22)');disk.addColorStop(1,'transparent');ctx.fillStyle=disk;ctx.beginPath();ctx.arc(0,0,r*3.3,0,Math.PI*2);ctx.fill();ctx.restore();
      const halo=ctx.createRadialGradient(0,0,r*.55,0,0,r*1.5);halo.addColorStop(0,'#000');halo.addColorStop(.64,'#000');halo.addColorStop(.73,style.color);halo.addColorStop(.78,'rgba(255,255,255,.55)');halo.addColorStop(1,'transparent');ctx.fillStyle=halo;ctx.beginPath();ctx.arc(0,0,r*1.5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#000';ctx.beginPath();ctx.arc(0,0,r*.83,0,Math.PI*2);ctx.fill();
    } else {
      const glow=ctx.createRadialGradient(-r*.25,-r*.25,0,0,0,r*2.5);glow.addColorStop(0,style.core);glow.addColorStop(.22,style.color);glow.addColorStop(.45,style.color+'55');glow.addColorStop(1,'transparent');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,r*2.5,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=style.core;ctx.globalAlpha=.9;ctx.beginPath();ctx.arc(-r*.2,-r*.2,r*.22,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
      if(b.type==='neutron'){ctx.rotate(.62);const beam=ctx.createLinearGradient(0,-r*9,0,r*9);beam.addColorStop(0,'transparent');beam.addColorStop(.45,'rgba(130,239,255,.12)');beam.addColorStop(.5,'rgba(238,253,255,.9)');beam.addColorStop(.55,'rgba(130,239,255,.12)');beam.addColorStop(1,'transparent');ctx.fillStyle=beam;ctx.fillRect(-1.2,-r*9,2.4,r*18)}
    }
    ctx.restore();
    // label
    ctx.save();ctx.translate(b.x,b.y);ctx.strokeStyle='rgba(150,220,255,.26)';ctx.beginPath();ctx.moveTo(r+12,r+8);ctx.lineTo(r+30,r+26);ctx.lineTo(r+88,r+26);ctx.stroke();ctx.fillStyle='#a6b7d3';ctx.font='10px Inter, sans-serif';ctx.fillText(style.label,r+34,r+20);ctx.fillStyle='#64dff7';ctx.font='9px Georgia, serif';ctx.fillText(formatMass(b.mass),r+34,r+34);ctx.restore();
    if(selectedBody===b){ctx.save();ctx.translate(b.x,b.y);ctx.setLineDash([4,5]);ctx.lineDashOffset=-time*.02;ctx.strokeStyle='rgba(131,237,255,.85)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,Math.max(r*2.2,32),0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#bdf5ff';ctx.beginPath();ctx.arc(0,-Math.max(r*2.2,32),2.2,0,Math.PI*2);ctx.fill();ctx.restore()}
  }

  function formatMass(m){if(m>=1e6)return `${(m/1e6).toFixed(m>=1e7?0:1)}×10⁶ M☉`;if(m>=1000)return `${(m/1000).toFixed(m>=10000?0:1)}×10³ M☉`;return `${m.toFixed(m%1?1:0)} M☉`}
  function updateBodies(dt){
    if(motionPaused)return;
    const right=w-panelWidth()-36;
    for(const b of bodies){
      if(b===draggingBody)continue;
      b.x+=b.vx*dt/16.67;b.y+=b.vy*dt/16.67;
      if(b.x<36){b.x=36;b.vx=Math.abs(b.vx)}else if(b.x>right){b.x=right;b.vx=-Math.abs(b.vx)}
      if(b.y<48){b.y=48;b.vy=Math.abs(b.vy)}else if(b.y>h-52){b.y=h-52;b.vy=-Math.abs(b.vy)}
    }
  }
  function render(now){const dt=Math.min(32,now-last);last=now;time+=dt;updateBodies(dt);drawBackground();drawGalaxies();drawStars();bodies.forEach(drawBody);requestAnimationFrame(render)}

  function addBody(type,mass,x,y){const angle=Math.random()*Math.PI*2,speed=Math.max(.12,.42-Math.log10(Math.max(1,mass))*.025);const body={id:Date.now()+Math.random(),type,mass,x:Math.max(45,Math.min(w-panelWidth()-40,x)),y:Math.max(55,Math.min(h-55,y)),vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed};bodies.push(body);selectBody(body);document.getElementById('bodyCount').textContent=bodies.length;document.getElementById('heroCopy').classList.add('hidden');flash(`${types[type]?.label||'天体'}已进入视场 · 正在自动移动`)}
  function selectBody(body){selectedBody=body;const actions=document.getElementById('selectionActions');actions.classList.toggle('show',!!body);if(body)document.getElementById('selectedName').textContent=`${types[body.type]?.label||'天体'} · ${formatMass(body.mass)}`}
  function removeSelected(){if(!selectedBody)return;const index=bodies.indexOf(selectedBody);if(index>=0)bodies.splice(index,1);selectBody(null);document.getElementById('bodyCount').textContent=bodies.length;flash('天体已移出观测视场')}
  function flash(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(flash.timer);flash.timer=setTimeout(()=>t.classList.remove('show'),1700)}

  document.querySelectorAll('.object-card').forEach(card=>{
    card.addEventListener('dragstart',e=>{dragPayload={type:card.dataset.type,mass:+card.dataset.mass};e.dataTransfer.setData('text/plain',JSON.stringify(dragPayload));e.dataTransfer.effectAllowed='copy';setTimeout(()=>document.getElementById('toast').classList.add('show'),30)});
    card.addEventListener('dragend',()=>{dragPayload=null;document.getElementById('toast').classList.remove('show')});
    card.addEventListener('click',()=>addBody(card.dataset.type,+card.dataset.mass,(w-panelWidth())*.64,h*.48));
  });
  canvas.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy'});
  canvas.addEventListener('drop',e=>{e.preventDefault();let p=dragPayload;try{p=JSON.parse(e.dataTransfer.getData('text/plain'))}catch{}if(p)addBody(p.type,+p.mass,e.clientX,e.clientY);dragPayload=null});
  canvas.addEventListener('pointerdown',e=>{mouse={x:e.clientX,y:e.clientY};draggingBody=null;for(let i=bodies.length-1;i>=0;i--){if(Math.hypot(bodies[i].x-mouse.x,bodies[i].y-mouse.y)<Math.max(30,lensRadius(bodies[i].mass)*.55)){draggingBody=bodies[i];selectBody(draggingBody);canvas.setPointerCapture(e.pointerId);break}}if(!draggingBody)selectBody(null)});
  canvas.addEventListener('pointermove',e=>{mouse={x:e.clientX,y:e.clientY};if(draggingBody){draggingBody.x=Math.max(30,Math.min(w-panelWidth()-30,e.clientX));draggingBody.y=Math.max(35,Math.min(h-35,e.clientY))}});
  canvas.addEventListener('pointerup',e=>{draggingBody=null;try{canvas.releasePointerCapture(e.pointerId)}catch{}});
  canvas.addEventListener('dblclick',e=>{const body=bodies.find(b=>Math.hypot(b.x-e.clientX,b.y-e.clientY)<Math.max(28,bodyRadius(b)*2));if(body){selectBody(body);removeSelected()}});

  const slider=document.getElementById('massSlider'),out=document.getElementById('massOutput');
  slider.addEventListener('input',()=>out.textContent=`10${'⁰¹²³⁴⁵⁶⁷⁸'[Math.round(+slider.value)]} M☉`);
  document.getElementById('addCustom').addEventListener('click',()=>addBody('custom',10**(+slider.value),(w-panelWidth())*.62,h*.52));
document.getElementById('collapseBtn').addEventListener('click',()=>{const panel=document.getElementById('controlPanel'),button=document.getElementById('collapseBtn');panel.classList.toggle('collapsed');const collapsed=panel.classList.contains('collapsed');button.setAttribute('aria-label',collapsed?'展开面板':'收起面板');button.title=collapsed?'展开天体质量库':'收起天体质量库'});
  document.getElementById('deleteBody').addEventListener('click',removeSelected);
  document.addEventListener('keydown',e=>{if((e.key==='Delete'||e.key==='Backspace')&&selectedBody){e.preventDefault();removeSelected()}});
  document.getElementById('motionToggle').addEventListener('click',()=>{motionPaused=!motionPaused;const button=document.getElementById('motionToggle');button.classList.toggle('paused',motionPaused);document.getElementById('motionText').textContent=motionPaused?'动态已暂停':'动态运行中';button.lastChild.textContent=motionPaused?' · 点击继续':' · 点击暂停';flash(motionPaused?'天体运动已暂停':'天体运动已继续')});
  window.addEventListener('resize',resize);resize();requestAnimationFrame(render);
  setTimeout(()=>flash('提示：单击也可快速放置 · 双击移除'),1200);
})();
