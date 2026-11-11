/* STAIRRUN 3D — browser-only WebGL1 renderer + optional LIVE backend.
   No external JavaScript, font, texture or API dependencies in the browser. */
(()=>{'use strict';
const $=id=>document.getElementById(id),GOAL=10000;
const RULES={follow:25,rose:15,heart:70,galaxy:350,gift:100};
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const fmt=n=>Math.floor(n).toLocaleString('de-DE');
let G={steps:0,speed:8,paused:false,finished:false,lost:0,count:0,status:'test',username:'',isServer:false,hasPin:false};
let lastSync=performance.now(),displaySteps=0,hitPower=0,lastFrame=performance.now(),lastUi=0;
let elapsed=0,frame=0,toastTimer=0,saveTimer=0;
function getLocal(){try{const o=JSON.parse(localStorage.getItem('stairrun3d-local')||'null');if(o&&typeof o==='object')for(const k of ['steps','speed','lost','count','paused','finished'])if(typeof o[k]===(k==='paused'||k==='finished'?'boolean':'number'))G[k]=o[k];G.steps=clamp(G.steps,0,GOAL);G.speed=clamp(G.speed,1,30);displaySteps=G.steps;const user=localStorage.getItem('stairrun3d-user');if(user)$('username').value=user;const stream=localStorage.getItem('stairrun3d-stream')==='1';document.body.classList.toggle('stream',stream);$('streamBtn').textContent=stream?'🛠 Bedienelemente anzeigen':'📱 Stream-Ansicht aktivieren';}catch{}}
getLocal();
function save(){if(G.isServer)return;try{localStorage.setItem('stairrun3d-local',JSON.stringify({steps:G.steps,speed:G.speed,paused:G.paused,finished:G.finished,lost:G.lost,count:G.count}))}catch{}}
function makeNotice(type,title,subtitle){const icons={follow:'👤',rose:'🌹',heart:'💗',galaxy:'🌌',gift:'🎁',info:'💎'};const card=document.createElement('div');card.className='notice'+(type==='info'?' good':'');const i=document.createElement('span');i.className='e-icon';i.textContent=icons[type]||icons.gift;const t=document.createElement('span');const b=document.createElement('b');b.textContent=String(title).slice(0,60);const small=document.createElement('small');small.textContent=String(subtitle).slice(0,80);t.append(b,small);card.append(i,t);$('events').prepend(card);while($('events').children.length>4)$('events').lastElementChild.remove();setTimeout(()=>{card.remove()},9000)}
function applyHit(data){const loss=clamp(Math.round(data.loss||1),1,2500);hitPower=1.1;const type=data.type||'gift';const user=data.user||'Test';const label=data.label||({follow:'Neuer Follower',rose:'Rose',heart:'Herz',galaxy:'Galaxy'}[type]||'Geschenk');makeNotice(type,user,`${label}  →  −${fmt(loss)} Stufen`);const toast=$('centerEvent');toast.textContent=`↓ −${fmt(loss)} STUFEN!`;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),1350);if(navigator.vibrate)try{navigator.vibrate([40,25,40])}catch{}}
function manual(type){if(G.finished)return;const loss=RULES[type]||RULES.gift;G.steps=Math.max(0,G.steps-loss);G.lost+=loss;G.count++;applyHit({type,loss,user:'Test-Zuschauer',label:'Demo-Ereignis'});save()}
function setMode(status,info){G.status=status;document.body.classList.toggle('connected',status==='connected');document.body.classList.toggle('error',status==='error'||status==='disconnected');$('modeText').textContent=status==='connected'?'TIKTOK LIVE':status==='connecting'?'VERBINDET …':status==='error'?'LIVE-FEHLER':status==='disconnected'?'GETRENNT':G.isServer?'LIVE BEREIT':'TESTMODUS';if(info)$('statusLine').textContent=info}
function authoritative(data){const state=data.state||data;if(typeof state.steps!=='number')return;for(const key of ['steps','speed','paused','finished','lost','count'])if(state[key]!==undefined)G[key]=state[key];if(typeof data.username==='string')G.username=data.username;lastSync=performance.now();setMode(data.status||G.status,data.message);if(!document.activeElement||document.activeElement.id!=='speedSlider'){$('speedSlider').value=G.speed;$('speedValue').textContent=G.speed+' Stufen/s'}}
function ui(ts){if(ts-lastUi<70)return;lastUi=ts;const p=clamp(displaySteps/GOAL,0,1);$('stepDisplay').textContent=fmt(displaySteps);$('progressFill').style.width=(p*100)+'%';$('percentText').textContent=(p*100).toFixed(1).replace('.',',')+' %';$('remainingText').textContent='Noch '+fmt(Math.max(0,GOAL-displaySteps));$('victory').classList.toggle('visible',G.finished);$('pauseBtn').textContent=G.paused?'▶ Weiter':'⏸ Pause'}
function localTick(dt){if(!G.paused&&!G.finished){G.steps=Math.min(GOAL,G.steps+G.speed*dt);if(G.steps>=GOAL){G.finished=true;G.paused=true;makeNotice('info','🏆 10.000 geschafft!','Challenge beendet');save()}}saveTimer+=dt;if(saveTimer>1.5){saveTimer=0;save()}}
async function send(command,fields={}){const pin=$('pin').value.trim();const r=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command,...fields,pin})});let result;try{result=await r.json()}catch{throw Error('Der Server hat keine gültige Antwort gesendet.')}if(!r.ok)throw Error(result.error||'Anfrage abgelehnt');return result}
async function doTest(type){if(!G.isServer){manual(type);return}try{await send('test',{type})}catch(e){$('statusLine').textContent=e.message;openSettings()}}
for(const b of document.querySelectorAll('[data-event]'))b.addEventListener('click',()=>doTest(b.dataset.event));
function openSettings(){ $('settings').classList.add('open');$('configToggle').textContent='✕'}
function closeSettings(){$('settings').classList.remove('open');$('configToggle').textContent='⚙'}
$('configToggle').addEventListener('click',()=>{$('settings').classList.contains('open')?closeSettings():openSettings()});
$('speedSlider').value=G.speed;$('speedValue').textContent=G.speed+' Stufen/s';$('speedSlider').addEventListener('input',e=>{$('speedValue').textContent=e.target.value+' Stufen/s';if(!G.isServer){G.speed=+e.target.value;save()}});
$('speedSlider').addEventListener('change',async e=>{if(G.isServer)try{await send('speed',{speed:+e.target.value})}catch(ex){$('statusLine').textContent=ex.message; e.target.value=G.speed}});
$('pauseBtn').addEventListener('click',async()=>{if(G.isServer){try{await send('pause')}catch(ex){$('statusLine').textContent=ex.message}}else{G.paused=!G.paused;save()}});
$('resetBtn').addEventListener('click',async()=>{if(!confirm('Die Challenge wirklich auf 0 Stufen zurücksetzen?'))return;if(G.isServer){try{await send('reset')}catch(ex){$('statusLine').textContent=ex.message}}else{G.steps=0;displaySteps=0;G.paused=false;G.finished=false;G.lost=0;G.count=0;save()}makeNotice('info','Neue Runde','Start bei Stufe 0')});
$('streamBtn').addEventListener('click',()=>{const next=!document.body.classList.contains('stream');document.body.classList.toggle('stream',next);$('streamBtn').textContent=next?'🛠 Bedienelemente anzeigen':'📱 Stream-Ansicht aktivieren';try{localStorage.setItem('stairrun3d-stream',next?'1':'0')}catch{}closeSettings()});
$('connectBtn').addEventListener('click',async()=>{let username=$('username').value.trim().replace(/^@/,'');if(!/^[a-zA-Z0-9._]{2,30}$/.test(username)){$('statusLine').textContent='Bitte einen gültigen TikTok-Namen eingeben.';return}if(!G.isServer){$('statusLine').textContent='Für TikTok LIVE muss dieses Spiel zuerst auf einem Node.js-Server gehostet werden. Hier läuft der Testmodus.';return}try{localStorage.setItem('stairrun3d-user',username);setMode('connecting','Verbindung wird aufgebaut …');await send('connect',{username})}catch(e){setMode('error',e.message)}});
$('disconnectBtn').addEventListener('click',async()=>{if(!G.isServer){$('statusLine').textContent='Derzeit nur Testmodus.';return}try{await send('disconnect')}catch(e){$('statusLine').textContent=e.message}});
async function detectServer(){if(!/^https?:$/.test(location.protocol)){setMode('test','Testmodus aktiv. Für echte LIVE-Events Online-Server verwenden.');return}try{const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),2200);const res=await fetch('/api/state',{signal:ctrl.signal,cache:'no-store'});clearTimeout(timer);if(!res.ok)throw Error('Ohne Server');const state=await res.json();if(!state.server)throw Error('Ohne Server');G.isServer=true;authoritative(state);displaySteps=G.steps;$('serverNote').textContent='LIVE-Server erkannt. Trage deinen TikTok-Namen und die Admin-PIN ein. Die Challenge läuft auf dem Server weiter, auch wenn du zwischen TikTok und Safari wechselst.';const evt=new EventSource('/api/events');evt.addEventListener('snapshot',e=>{try{authoritative(JSON.parse(e.data))}catch{}});evt.addEventListener('gameevent',e=>{try{applyHit(JSON.parse(e.data))}catch{}});evt.onerror=()=>{$('statusLine').textContent='Serververbindung unterbrochen – automatischer Wiederverbindungsversuch.'};}catch{G.isServer=false;setMode('test','Lokaler Testmodus – ein LIVE-Server wurde nicht erkannt.')}}

// ----------------------------------------------------------------------
// Compact custom WebGL renderer: actual 3D vertex meshes, perspective
// camera, depth testing, animated runner and looping staircase geometry.
// ----------------------------------------------------------------------
const canvas=$('game');let gl=null,engine=null;
try{gl=canvas.getContext('webgl',{alpha:true,antialias:true,preserveDrawingBuffer:false,powerPreference:'default'})||canvas.getContext('experimental-webgl',{alpha:true,antialias:true})}catch{}
if(!gl){$('webglFallback').style.display='block'}else{
try{engine=create3D(gl)}catch(err){console.error('3D engine failed:',err);$('webglFallback').style.display='block'}
}
function create3D(gl){
const vs=`attribute vec3 aPos;attribute vec3 aNormal;uniform mat4 uMVP;uniform mat4 uModel;uniform mat4 uView;varying vec3 vNorm;varying float vDepth;void main(){vec4 world=uModel*vec4(aPos,1.0);vec4 view=uView*world;gl_Position=uMVP*vec4(aPos,1.0);vNorm=mat3(uModel)*aNormal;vDepth=-view.z;}`;
const fs=`precision mediump float;uniform vec3 uColor;uniform float uEmissive;varying vec3 vNorm;varying float vDepth;void main(){float diffuse=max(0.0,dot(normalize(vNorm),normalize(vec3(-0.4,0.92,0.65))));float light=0.53+diffuse*0.55;vec3 col=uColor*(light+uEmissive*0.66);float fog=clamp((vDepth-40.0)/145.0,0.0,0.83);col=mix(col,vec3(0.65,0.76,0.93),fog);gl_FragColor=vec4(col,1.0);}`;
function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
const prog=gl.createProgram();gl.attachShader(prog,shader(gl.VERTEX_SHADER,vs));gl.attachShader(prog,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog));gl.useProgram(prog);
const L={pos:gl.getAttribLocation(prog,'aPos'),nor:gl.getAttribLocation(prog,'aNormal'),mvp:gl.getUniformLocation(prog,'uMVP'),model:gl.getUniformLocation(prog,'uModel'),view:gl.getUniformLocation(prog,'uView'),color:gl.getUniformLocation(prog,'uColor'),em:gl.getUniformLocation(prog,'uEmissive')};
gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
const I=()=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
function mul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o}
function mat(x,y,z,sx,sy,sz,rx=0,ry=0,rz=0){const S=I();S[0]=sx;S[5]=sy;S[10]=sz;const X=I(),Y=I(),Z=I();X[5]=Math.cos(rx);X[6]=Math.sin(rx);X[9]=-Math.sin(rx);X[10]=Math.cos(rx);Y[0]=Math.cos(ry);Y[2]=-Math.sin(ry);Y[8]=Math.sin(ry);Y[10]=Math.cos(ry);Z[0]=Math.cos(rz);Z[1]=Math.sin(rz);Z[4]=-Math.sin(rz);Z[5]=Math.cos(rz);const T=I();T[12]=x;T[13]=y;T[14]=z;return mul(T,mul(Y,mul(X,mul(Z,S))))}
function perspective(fovy,aspect,near,far){const f=1/Math.tan(fovy/2),o=new Float32Array(16);o[0]=f/aspect;o[5]=f;o[10]=(far+near)/(near-far);o[11]=-1;o[14]=(2*far*near)/(near-far);return o}
const sub=(a,b)=>a.map((n,i)=>n-b[i]);const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];const norm=a=>{const l=Math.hypot(...a)||1;return a.map(x=>x/l)};
function lookAt(eye,target){const z=norm(sub(eye,target)),x=norm(cross([0,1,0],z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1])}
function upload(positions,normals,indices){const b=gl.createBuffer(),n=gl.createBuffer(),i=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(positions),gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,n);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(normals),gl.STATIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,i);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);return{b,n,i,count:indices.length}}
function box(){const p=[],n=[],idx=[];const fs=[[[1,0,0],[[.5,-.5,-.5],[.5,-.5,.5],[.5,.5,.5],[.5,.5,-.5]]],[[-1,0,0],[[-.5,-.5,.5],[-.5,-.5,-.5],[-.5,.5,-.5],[-.5,.5,.5]]],[[0,1,0],[[-.5,.5,-.5],[.5,.5,-.5],[.5,.5,.5],[-.5,.5,.5]]],[[0,-1,0],[[-.5,-.5,.5],[.5,-.5,.5],[.5,-.5,-.5],[-.5,-.5,-.5]]],[[0,0,1],[[-.5,-.5,.5],[-.5,.5,.5],[.5,.5,.5],[.5,-.5,.5]]],[[0,0,-1],[[.5,-.5,-.5],[.5,.5,-.5],[-.5,.5,-.5],[-.5,-.5,-.5]]]];for(let f=0;f<6;f++){const [nor,verts]=fs[f];for(const v of verts){p.push(...v);n.push(...nor)}const o=f*4;idx.push(o,o+1,o+2,o,o+2,o+3)}return upload(p,n,idx)}
function sphere(lat=13,lon=20){const p=[],n=[],ix=[];for(let j=0;j<=lat;j++){const t=j/lat*Math.PI;for(let k=0;k<=lon;k++){const a=k/lon*Math.PI*2;const x=Math.sin(t)*Math.cos(a),y=Math.cos(t),z=Math.sin(t)*Math.sin(a);p.push(x,y,z);n.push(x,y,z)}}for(let j=0;j<lat;j++)for(let k=0;k<lon;k++){const a=j*(lon+1)+k,b=a+lon+1;ix.push(a,b,a+1,b,b+1,a+1)}return upload(p,n,ix)}
function cyl(rings=18){const p=[],n=[],ix=[];for(let q=0;q<rings;q++){const a=q*2*Math.PI/rings,co=Math.cos(a),si=Math.sin(a);for(const y of [-.5,.5]){p.push(co,y,si);n.push(co,0,si)}}for(let q=0;q<rings;q++){const a=q*2,b=((q+1)%rings)*2;ix.push(a,a+1,b,b,a+1,b+1)}for(const top of [-.5,.5]){const base=p.length/3;p.push(0,top,0);n.push(0,top>0?1:-1,0);for(let q=0;q<rings;q++){const a=q*2*Math.PI/rings;p.push(Math.cos(a),top,Math.sin(a));n.push(0,top>0?1:-1,0)}for(let q=0;q<rings;q++){if(top>0)ix.push(base,base+1+q,base+1+(q+1)%rings);else ix.push(base,base+1+(q+1)%rings,base+1+q)}}return upload(p,n,ix)}
function cone(rings=14){const p=[],n=[],ix=[];for(let q=0;q<rings;q++){const a=q*2*Math.PI/rings,c=Math.cos(a),s=Math.sin(a);p.push(c,-.5,s);n.push(c,-.45,s)}p.push(0,.5,0);n.push(0,1,0);for(let q=0;q<rings;q++)ix.push(q,(q+1)%rings,rings);return upload(p,n,ix)}
function torus(rings=24,tubes=8){const p=[],n=[],ix=[];for(let a=0;a<=rings;a++){const u=a/rings*Math.PI*2;for(let b=0;b<=tubes;b++){const v=b/tubes*Math.PI*2;const co=Math.cos(v),si=Math.sin(v),d=1+.075*co;p.push(d*Math.cos(u),d*Math.sin(u),.075*si);n.push(co*Math.cos(u),co*Math.sin(u),si)}}for(let a=0;a<rings;a++)for(let b=0;b<tubes;b++){const q=a*(tubes+1)+b,r=q+tubes+1;ix.push(q,r,q+1,r,r+1,q+1)}return upload(p,n,ix)}
const meshes={box:box(),sphere:sphere(),cyl:cyl(),cone:cone(),torus:torus()};
let PV=I(),view=I(),W=1,H=1;
const C={step:[.28,.40,.67],step2:[.25,.35,.60],edge:[.21,.94,1.0],neon:[.42,.99,1.0],rail:[.18,.36,.70],railGlow:[.13,.82,1],runner:[.048,.47,1],runnerLight:[.09,.63,1],hand:[.045,.39,.88],shoe:[.85,.95,1],green:[.21,.75,.57],rock:[.41,.45,.68],purple:[.83,.33,1],gold:[1,.86,.55]};
function draw(mesh,color,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0,em=0){const m=meshes[mesh];const model=mat(x,y,z,sx,sy,sz,rx,ry,rz),mvp=mul(PV,model);gl.uniformMatrix4fv(L.mvp,false,mvp);gl.uniformMatrix4fv(L.model,false,model);gl.uniform3fv(L.color,color);gl.uniform1f(L.em,em);gl.bindBuffer(gl.ARRAY_BUFFER,m.b);gl.vertexAttribPointer(L.pos,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,m.n);gl.vertexAttribPointer(L.nor,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,m.i);gl.drawElements(gl.TRIANGLES,m.count,gl.UNSIGNED_SHORT,0)}
const colors=[C.step,C.step2,[.33,.44,.70]];
function resize(){const rect=canvas.getBoundingClientRect();const dpr=Math.min(1.75,window.devicePixelRatio||1);W=rect.width;H=rect.height;canvas.width=Math.max(1,Math.floor(W*dpr));canvas.height=Math.max(1,Math.floor(H*dpr));gl.viewport(0,0,canvas.width,canvas.height)}
resize();addEventListener('resize',resize);gl.enableVertexAttribArray(L.pos);gl.enableVertexAttribArray(L.nor);
function render(t,stairs,impact,running){gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);const aspect=W/Math.max(1,H),portrait=aspect<.85;
const shake=impact>0?(Math.random()-.5)*impact*.75:0;
const camera=portrait?[shake,4.2,12.9]:[shake,5.4,16.5];const point=portrait?[0,5.7,-18]:[0,6,-21];view=lookAt(camera,point);const p=perspective((portrait?67:64)*Math.PI/180,aspect,.1,320);PV=mul(p,view);gl.uniformMatrix4fv(L.view,false,view);
const phase=((stairs%1)+1)%1;
// Golden finish light at far end of the endless road.
draw('sphere',C.gold,0,26,-138,6,6,6,0,0,0,.7);
draw('torus',C.purple,0,19,-121,17,14,1,0,0,0,.95);
// Floating islands, rocks and glowing halos.
for(const [x,y,z,r] of [[-19,1,-49,7],[21,7,-75,9],[-26,13,-111,8]]){
 draw('cone',C.rock,x,y-5,z,r,11,r,Math.PI,0,0,0);
 draw('cyl',C.green,x,y,z,r,1.6,r,0,0,0,.07);
 draw('torus',C.purple,x,y+3,z,r*1.4,r*0.95,1,0,.15,0,.8);
 for(let k=0;k<3;k++)draw('sphere',[.22,.69,.53],x+(k-1)*r*.42,y+2.1,z-1.3,r*.21,r*.33,r*.22);
 draw('box',C.edge,x+r*.48,y-4,z,r*.12,6.5,r*.18,0,0,0,.55);
}
// Long luminous ramps along the stair edges.
const railRot=Math.atan(.34/1.55);const railLength=120;
for(const side of [-1,1]){
 draw('box',C.rail,side*5.0,12.6,-53, .32,.42,railLength,railRot,0,0,0);
 draw('box',C.railGlow,side*4.92,13.03,-53,.11,.11,railLength,railRot,0,0,.75);
}
// Infinite tread loop, moving below the running player.
for(let i=-6;i<76;i++){
 const d=i-phase,y=d*.34-.44,z=2-d*1.55;
 draw('box',colors[((i%3)+3)%3],0,y,z,9.3,.63,1.57);
 if(i>-3){draw('box',C.edge,0,y+.33,z+.70,9.25,.065,.115,0,0,0,.48)}
 if(i%6===0&&i>1){for(const s of [-1,1])draw('box',C.neon,s*.32,y+.36,z, .12,.045,.7,0,s*.43,0,.8)}
 if(i%4===0&&i>-3&&i<60)for(const s of [-1,1]){
   draw('box',C.rail, s*5.1,y+1.1,z,.23,2.3,.22);
   draw('sphere',C.neon,s*5.1,y+2.17,z,.24,.24,.24,0,0,0,.7)
 }
}
// Runner: fully 3D sphere / capsule mascot, viewed from behind.
const stride=running?Math.sin(t*9.0):0;const bob=running?Math.abs(Math.sin(t*9.0))*.13:0;
const zz=3.10;const cy=.14+bob;
draw('sphere',[.05,.19,.49],0,.04,zz,.7,.045,.44);
// legs (swing forward/backward)
for(const side of [-1,1]){
 const swing=stride*side*.55;
 draw('sphere',C.runner,side*.26,cy+.60,zz+swing*.22,.265,.59,.28,swing,0,0);
 draw('sphere',C.shoe,side*.26,cy+.17,zz+.19+swing*.58,.285,.22,.42,swing*.4,0,0);
}
draw('sphere',C.runner,0,cy+1.24,zz,.59,.78,.48,0,0,0,.13);
draw('sphere',C.runnerLight,0,cy+1.64,zz-.08,.43,.32,.34);
// arms swing opposite to the legs
for(const side of [-1,1]){
 const sw=-stride*side*.65;
 draw('sphere',C.hand,side*.69,cy+1.14,zz+sw*.55,.22,.58,.24,sw,0,side*.18);
 draw('sphere',C.runnerLight,side*.71,cy+.79,zz+sw*.68,.25,.27,.25)
}
draw('sphere',C.runner,0,cy+2.45,zz,.76,.76,.76,0,0,0,.13);
// subtle glossy reflections at the back of the round head
 draw('sphere',[.18,.71,1],-.24,cy+2.76,zz+.62,.16,.23,.047,0,0,-.4,.15);
 draw('sphere',[.28,.79,1],.14,cy+1.49,zz+.44,.15,.23,.055,0,0,.2,.12);
}
return{render};
}
function tick(now){const dt=clamp((now-lastFrame)/1000,0,.065);lastFrame=now;elapsed+=dt;frame++;
if(!G.isServer)localTick(dt);
const predicted=G.isServer&&(!G.paused&&!G.finished)?G.steps+G.speed*clamp((now-lastSync)/1000,0,2):G.steps;
const target=clamp(predicted,0,GOAL);
// Stepping back visibly after a gift while keeping the animation stable.
displaySteps+=(target-displaySteps)*Math.min(1,dt*(target<displaySteps?4.5:10));
if(Math.abs(displaySteps-target)<.06)displaySteps=target;
if(hitPower>0)hitPower=Math.max(0,hitPower-dt*1.5);
if(engine)engine.render(elapsed,displaySteps,hitPower,!G.paused&&!G.finished);
ui(now);requestAnimationFrame(tick)}
requestAnimationFrame(tick);detectServer();
})();
