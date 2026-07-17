(() => {
  const lab=document.getElementById('focusLab');
  if(!lab)return;
  const $=id=>document.getElementById(id);
  const massInput=$('focusMass'),modelInput=$('focusModel'),sourceInput=$('sourceDistance'),observerInput=$('observerDistance'),alignmentInput=$('alignment');
  const canvas=$('focusCanvas'),ctx=canvas.getContext('2d'),curve=$('curveCanvas'),curveCtx=curve.getContext('2d');
  const G=6.67430e-11,C=299792458,MSUN=1.98847e30,RSUN=6.957e8,AU=1.495978707e11,PC=3.085677581e16,MPC=PC*1e6;
  let solution=null;

  function superscript(n){return String(n).split('').map(c=>({'-':'⁻','0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹'}[c]||c)).join('')}
  function massLabel(m){const p=Math.log10(m);if(Math.abs(p-Math.round(p))<.03)return `10${superscript(Math.round(p))} M☉`;if(m<1000)return `${m.toPrecision(3)} M☉`;return `${(m/10**Math.floor(p)).toFixed(2)} × 10${superscript(Math.floor(p))} M☉`}
  function distanceLabel(m){if(!isFinite(m))return '∞';const a=m/AU,p=m/PC;if(a<.01)return `${(m/1000).toPrecision(3)} km`;if(a<1e4)return `${a.toPrecision(4)} AU`;if(p<1e3)return `${p.toPrecision(4)} pc`;if(p<1e6)return `${(p/1e3).toPrecision(4)} kpc`;return `${(p/1e6).toPrecision(4)} Mpc`}
  function angleLabel(rad){const arcsec=rad*206265;if(arcsec<.001)return `${(arcsec*1000).toPrecision(3)} mas`;if(arcsec<60)return `${arcsec.toPrecision(3)}″`;return `${(arcsec/60).toPrecision(3)}′`}
  function radiusFor(mass,model){const M=mass*MSUN;if(model==='blackhole')return 3*Math.sqrt(3)*G*M/C**2;if(model==='neutron')return 12000;return RSUN*Math.pow(mass,.8)}
  function distanceForAngle(A,source,theta){const root=Math.sqrt(source*source+4*A*source/(theta*theta));return (2*A*source/(theta*theta))/(source+root)}
  function modelWarning(mass,model){
    if(model==='star'&&(mass<.08||mass>150))return '当前质量超出主序恒星的演示范围（约 0.08–150 M☉）。';
    if(model==='neutron'&&(mass<1||mass>3))return '当前质量超出中子星的演示范围（约 1–3 M☉），更高质量应选择黑洞模型。';
    if(model==='blackhole'&&mass<3)return '当前质量低于恒星级黑洞的典型下限，结果仅作数学演示。';
    return '';
  }
  function solve(){
    const mass=10**(+massInput.value),M=mass*MSUN,model=modelInput.value,b=radiusFor(mass,model),strongField=model!=='star';
    const source=10**(+sourceInput.value)*MPC,observer=10**(+observerInput.value)*AU,total=source+observer,A=4*G*M/C**2;
    const weakFocus=b*b*C*C/(4*G*M),focalStart=source>weakFocus?1/(1/weakFocus-1/source):Infinity;
    // 三种天体共用同一观测设备：1 mas 分辨率，0.1″ 为最适合成像采样的环半径。
    const resolutionTheta=.001/206265,optimalTheta=.1/206265;
    const samplingDistance=distanceForAngle(A,source,optimalTheta),resolvableLimit=distanceForAngle(A,source,resolutionTheta);
    // 恒星必须位于不被光球遮挡的焦线之后；致密天体使用相同的远场成像尺度目标。
    const reference=model==='star'?Math.max(samplingDistance,focalStart):samplingDistance;
    const thetaE=Math.sqrt(A*source/(observer*total)),ring=thetaE*observer,deflection=4*G*M/(C*C*b);
    const logError=Math.log10(observer/reference),alignment=+alignmentInput.value,alignTerm=Math.exp(-(alignment*alignment)/1.7);
    const distanceTerm=Math.exp(-(logError*logError)/.16),resolutionTerm=Math.min(1,thetaE/resolutionTheta);
    const quality=Math.max(.01,Math.min(1,distanceTerm*resolutionTerm*alignTerm));
    solution={mass,M,model,b,source,observer,weakFocus,focalStart,resolutionTheta,optimalTheta,samplingDistance,resolvableLimit,reference,thetaE,ring,deflection,logError,alignment,quality,strongField,warning:modelWarning(mass,model)};
    updateOutputs();draw();drawCurve();
  }
  function updateOutputs(){
    const s=solution,delta=(s.observer/s.reference-1)*100,ratio=s.thetaE/s.resolutionTheta;
    $('focusMassOut').textContent=massLabel(s.mass);$('sourceOut').textContent=distanceLabel(s.source);$('observerOut').textContent=distanceLabel(s.observer);$('alignmentOut').textContent=`${s.alignment.toFixed(2)} θE`;
    $('bestDistance').textContent=distanceLabel(s.reference);$('einsteinAngle').textContent=angleLabel(s.thetaE);$('ringRadius').textContent=distanceLabel(s.ring);$('qualityOut').textContent=`${Math.round(s.quality*100)}%`;
    $('primaryMetricLabel').textContent='成像清晰度最优位置';
    $('distanceDelta').textContent=Math.abs(delta)<.05?'当前观察面位于最优位置':`当前距离偏差 ${delta>0?'+':''}${delta.toFixed(Math.abs(delta)>100?0:1)}%`;
    $('qualityLabel').textContent='成像清晰度';$('autoFocusLabel').textContent='移动到最清晰位置';$('curveTitle').textContent='距离清晰度响应';$('curveSubtitle').textContent='IMAGE CLARITY RESPONSE';
    const state=s.quality>.82?'OPTIMAL IMAGE':s.quality>.42?'PARTIAL CLARITY':'OUT OF FOCUS';$('focusState').textContent=state;
    $('focusCaption').textContent=s.alignment<.22&&s.quality>.82?'观察面接近统一求得的最优位置，星系细节形成清晰、连续的爱因斯坦环。':s.quality>.42?'环像仍可辨认；调整观察距离或减小光轴偏差可提高细节清晰度。':ratio<1?'爱因斯坦环小于设备分辨率，当前图像无法可靠分辨。':'观察距离或光轴偏差使环像展宽，细节对比度下降。';
    if(s.strongField){
      $('minFocusLabel').textContent='环可分辨距离上限';$('minFocus').textContent=distanceLabel(s.resolvableLimit);$('minFocusHint').textContent='统一采用 1 mas 分辨率';$('deflectionAngle').textContent='需 GR 求解';
      $('modelNote').textContent=`${s.model==='neutron'?'中子星':'黑洞'}与恒星共用 0.1″ 最优成像尺度和同一清晰度函数；近场偏折仍需完整 GR 光线追迹。${s.warning?' '+s.warning:''}`;
    }else{
      $('minFocusLabel').textContent='恒星焦线起点';$('minFocus').textContent=distanceLabel(s.focalStart);$('minFocusHint').textContent='光球遮挡约束';$('deflectionAngle').textContent=angleLabel(s.deflection);
      $('modelNote').textContent=`恒星也使用统一的 0.1″ 最优成像尺度；若该位置落在焦线起点以内，则自动移到焦线起点之外。${s.warning?' '+s.warning:''}`;
    }
  }
  function autoFocus(){if(!solution)solve();observerInput.value=Math.max(-1,Math.min(14,Math.log10(solution.reference/AU)));solve()}
  function resizeCanvas(){const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,1.7);canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.height*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);draw()}
  function galaxy(x,y,r,alpha=1){ctx.save();ctx.translate(x,y);ctx.globalCompositeOperation='screen';ctx.globalAlpha=alpha;const glow=ctx.createRadialGradient(0,0,0,0,0,r);glow.addColorStop(0,'#fff1bd');glow.addColorStop(.2,'rgba(114,219,255,.8)');glow.addColorStop(1,'transparent');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.lineCap='round';for(let arm=0;arm<3;arm++){ctx.strokeStyle=`rgba(${90+arm*20},${192+arm*15},255,${.72-arm*.12})`;ctx.lineWidth=Math.max(1,r*.09);ctx.beginPath();for(let i=0;i<28;i++){const rr=r*(.08+i/30),a=arm*Math.PI*2/3+i*.25,px=Math.cos(a)*rr,py=Math.sin(a)*rr*.62;i?ctx.lineTo(px,py):ctx.moveTo(px,py)}ctx.stroke()}ctx.restore()}
  function draw(){
    if(!solution||!lab.classList.contains('open'))return;const dpr=Math.min(devicePixelRatio||1,1.7),w=canvas.width/dpr,h=canvas.height/dpr,s=solution;ctx.clearRect(0,0,w,h);
    const bg=ctx.createRadialGradient(w*.55,h*.45,0,w*.55,h*.45,w*.65);bg.addColorStop(0,'#09182f');bg.addColorStop(1,'#02050c');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
    for(let i=0;i<90;i++){const x=(Math.sin(i*93.17)*.5+.5)*w,y=(Math.sin(i*47.91+2)*.5+.5)*h;ctx.fillStyle=`rgba(190,225,255,${.08+(i%7)*.025})`;ctx.fillRect(x,y,i%11===0?1.2:.6,i%11===0?1.2:.6)}
    const top=h*.54,sourceX=62,lensX=w*.49,observerX=w-58,axisY=top*.52;
    ctx.strokeStyle='rgba(113,151,194,.18)';ctx.setLineDash([3,6]);ctx.beginPath();ctx.moveTo(24,axisY);ctx.lineTo(w-24,axisY);ctx.stroke();ctx.setLineDash([]);
    galaxy(sourceX,axisY-3,22,.85);ctx.fillStyle='#71819b';ctx.font='8px Inter';ctx.fillText('GLX–042 / SOURCE',25,axisY+40);
    const lensR=13+Math.min(10,Math.log10(s.mass+1)*1.6),isBlack=s.model==='blackhole';ctx.save();ctx.translate(lensX,axisY);const halo=ctx.createRadialGradient(0,0,2,0,0,lensR*2.2);halo.addColorStop(0,isBlack?'#000':'#fff7c4');halo.addColorStop(.32,isBlack?'#000':'#ffc35e');halo.addColorStop(.46,isBlack?'#ff9e54':'rgba(255,174,68,.35)');halo.addColorStop(1,'transparent');ctx.fillStyle=halo;ctx.beginPath();ctx.arc(0,0,lensR*2.2,0,Math.PI*2);ctx.fill();ctx.restore();ctx.fillStyle='#71819b';ctx.fillText('LENS',lensX-14,axisY+40);
    const spread=28+Math.min(28,s.alignment*14);for(const sign of [-1,1]){const sy=axisY+sign*10,ly=axisY+sign*spread;ctx.strokeStyle=sign>0?'rgba(111,206,255,.6)':'rgba(116,142,255,.5)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(sourceX+20,sy);ctx.quadraticCurveTo(lensX-55,ly,lensX,ly);ctx.quadraticCurveTo(lensX+70,axisY+sign*4,observerX,axisY);ctx.stroke()}
    const planeShift=Math.max(-85,Math.min(85,s.logError*82)),planeX=observerX-planeShift;ctx.strokeStyle='rgba(91,225,255,.6)';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(planeX,axisY-55);ctx.lineTo(planeX,axisY+55);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#57b8cf';ctx.fillText('BEST IMAGE PLANE',planeX-38,axisY-65);
    ctx.strokeStyle='#f0d58e';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(observerX,axisY,6,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(observerX,axisY+6);ctx.lineTo(observerX,axisY+20);ctx.moveTo(observerX-8,axisY+12);ctx.lineTo(observerX+8,axisY+12);ctx.stroke();ctx.fillStyle='#92856d';ctx.fillText('OBSERVER',observerX-22,axisY+40);
    ctx.fillStyle='rgba(99,124,158,.5)';ctx.font='7px Inter';ctx.fillText(distanceLabel(s.source),sourceX+(lensX-sourceX)*.43,axisY-11);ctx.fillText(distanceLabel(s.observer),lensX+(observerX-lensX)*.42,axisY-11);
    const divider=top+3;ctx.strokeStyle='rgba(118,184,225,.12)';ctx.beginPath();ctx.moveTo(20,divider);ctx.lineTo(w-20,divider);ctx.stroke();
    const imageY=divider+(h-divider)*.52,leftX=w*.23,imageX=w*.7;ctx.fillStyle='#53627b';ctx.font='8px Inter';ctx.fillText('SOURCE PROFILE',leftX-36,divider+20);ctx.fillText('LENSED IMAGE / OBSERVATION PLANE',imageX-82,divider+20);galaxy(leftX,imageY,31,.86);
    ctx.save();ctx.filter=`blur(${Math.max(0,(1-s.quality)*6).toFixed(1)}px)`;ctx.translate(imageX,imageY);const R=43+Math.min(18,Math.log10(s.mass+1)*2),align=s.alignment;
    ctx.globalCompositeOperation='screen';ctx.lineCap='round';if(align<.22){for(let i=0;i<5;i++){ctx.strokeStyle=`rgba(${100+i*18},${176+i*12},255,${.22+s.quality*.12})`;ctx.lineWidth=2.2+i*.45;ctx.beginPath();ctx.arc(0,0,R+i*.7,0,Math.PI*2);ctx.stroke()}}else{const arc=Math.max(.32,1.48-align*.48);for(const side of [0,Math.PI]){for(let i=0;i<5;i++){ctx.strokeStyle=`rgba(${95+i*20},${174+i*13},255,${.22+s.quality*.13})`;ctx.lineWidth=2+i*.45;ctx.beginPath();ctx.arc(0,0,R+i*.7,side-arc/2,side+arc/2);ctx.stroke()}}}
    ctx.fillStyle='#000';ctx.beginPath();ctx.arc(0,0,13,0,Math.PI*2);ctx.fill();ctx.strokeStyle='rgba(255,179,91,.68)';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(0,0,14,0,Math.PI*2);ctx.stroke();ctx.restore();
    ctx.strokeStyle='rgba(105,205,255,.25)';ctx.setLineDash([3,4]);ctx.beginPath();ctx.arc(imageX,imageY,66,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#5d718e';ctx.fillText(`${angleLabel(s.thetaE)} EINSTEIN RADIUS`,imageX-48,imageY+82);
  }
  function drawCurve(){if(!solution)return;const w=curve.width,h=curve.height,s=solution;curveCtx.clearRect(0,0,w,h);curveCtx.strokeStyle='rgba(104,139,181,.16)';curveCtx.beginPath();curveCtx.moveTo(5,h-13);curveCtx.lineTo(w-5,h-13);curveCtx.stroke();const grad=curveCtx.createLinearGradient(0,0,w,0);grad.addColorStop(0,'#5b6de0');grad.addColorStop(.5,'#73eaff');grad.addColorStop(1,'#5b6de0');curveCtx.strokeStyle=grad;curveCtx.lineWidth=1.5;curveCtx.beginPath();for(let i=0;i<=w-10;i++){const x=-2.2+i/(w-10)*4.4,y=Math.exp(-(x*x)/.16),py=h-13-y*(h-25);i?curveCtx.lineTo(i+5,py):curveCtx.moveTo(i+5,py)}curveCtx.stroke();const min=-2.2,max=2.2,marker=5+(Math.max(min,Math.min(max,s.logError))-min)/(max-min)*(w-10);curveCtx.strokeStyle='#ffe0a2';curveCtx.beginPath();curveCtx.moveTo(marker,7);curveCtx.lineTo(marker,h-10);curveCtx.stroke();curveCtx.fillStyle='#ffe0a2';curveCtx.beginPath();curveCtx.arc(marker,10,2.5,0,Math.PI*2);curveCtx.fill()}
  function open(){lab.classList.add('open');lab.setAttribute('aria-hidden','false');const body=window.currentLensBody;if(body){massInput.value=Math.log10(body.mass);modelInput.value=body.type==='neutron'?'neutron':['blackhole','supermassive','custom'].includes(body.type)?'blackhole':'star'}solve();autoFocus();requestAnimationFrame(resizeCanvas)}
  function close(){lab.classList.remove('open');lab.setAttribute('aria-hidden','true')}
  [massInput,modelInput,sourceInput,observerInput,alignmentInput].forEach(el=>el.addEventListener('input',solve));$('openFocus').addEventListener('click',open);$('closeFocus').addEventListener('click',close);$('autoFocus').addEventListener('click',autoFocus);window.addEventListener('resize',()=>{if(lab.classList.contains('open'))resizeCanvas()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&lab.classList.contains('open'))close()});
  solve();
})();
