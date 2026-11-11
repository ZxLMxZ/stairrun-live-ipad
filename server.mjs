/** STAIRRUN 3D TikTok bridge + shared server-side challenge state.
 *  Node.js 20+. This is an UNOFFICIAL connector, not TikTok's official API.
 *  WARNING: on internet hosting set ADMIN_PIN in environment variables.
 */
import http from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const DIR=dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT)||3000;
const ADMIN_PIN=String(process.env.ADMIN_PIN||'');
const STORAGE=join(DIR,'saved-progress.json');
const GOAL=10000;
const clients=new Set();
const follows=new Map(),recentGifts=new Map();
const LIMIT=2500;
const game={steps:0,speed:8,paused:false,finished:false,lost:0,count:0};
let username='',status='test',message='Server bereit. LIVE-Name verbinden.',connection=null,session=0;
let lastTick=Date.now(),lastSave=Date.now();
try{const saved=JSON.parse(await readFile(STORAGE,'utf8'));for(const key of ['steps','speed','lost','count','paused','finished'])if(typeof saved[key]===(key==='paused'||key==='finished'?'boolean':'number'))game[key]=saved[key];game.steps=Math.max(0,Math.min(GOAL,game.steps));game.speed=Math.max(1,Math.min(30,game.speed));}catch{}
const safeError=x=>String(x?.info||x?.message||x||'Unbekannter Fehler').slice(0,180);
function snap(){return{server:true,state:{...game},status,message,username}}
function emit(kind,data){const s=`event: ${kind}\ndata: ${JSON.stringify(data)}\n\n`;for(const c of clients){try{c.write(s)}catch{clients.delete(c)}}}
function update(){emit('snapshot',snap())}
function setStatus(s,m){status=s;message=m;console.log('[STAIRRUN]',s,m);update()}
async function save(){try{await writeFile(STORAGE,JSON.stringify(game),'utf8')}catch(e){console.warn('[STAIRRUN] Fortschritt nicht gespeichert:',safeError(e))}}
function event(type,loss,user,label){if(game.finished)return;loss=Math.round(Math.min(LIMIT,Math.max(1,Number(loss)||1)));game.steps=Math.max(0,game.steps-loss);game.lost+=loss;game.count++;
emit('gameevent',{type,loss,user:String(user||'Zuschauer').slice(0,52),label:String(label||'Geschenk').slice(0,60)});update();void save();}
const userLabel=x=>String(x?.user?.displayId||x?.user?.nickname||x?.uniqueId||'Zuschauer').slice(0,52);
function handleGift(d){
 const gift=d?.gift||d?.extendedGiftInfo||{},id=String(d?.giftId||gift?.id||'unbekannt');
 const isStreak=Number(gift?.type??d?.giftType)===1;
 if(isStreak&&d?.repeatEnd!==1&&d?.repeatEnd!==true)return;
 const count=Math.min(100,Math.max(1,Math.trunc(Number(d?.repeatCount)||1)));
 const now=Date.now(),user=userLabel(d),group=String(d?.groupId||d?.common?.msgId||'');
 // Deduplicate final streak callbacks, but do not swallow distinct single gifts.
 if(group){const key=[String(d?.user?.id||user),id,group].join(':');if(recentGifts.has(key)&&now-recentGifts.get(key)<6000)return;recentGifts.set(key,now)}
 let value=Number(gift?.diamondCount||d?.diamondCount||1);if(!Number.isFinite(value)||value<1)value=1;
 let per=value<=1?15:value<=5?35:value<=49?70:value<=199?150:value<=999?350:700;
 let name=String(gift?.name||'TikTok Geschenk').slice(0,50);
 const isRose=/rose|🌹/i.test(name); // TikTok gift names vary by language.
 const type=isRose?'rose':value<=5?'heart':value>=100?'galaxy':'gift';
 event(type,per*count,user,name+(count>1?' ×'+count:''));
 if(recentGifts.size>300){for(const [k,t] of recentGifts)if(now-t>180000)recentGifts.delete(k)}
}
async function disconnect(){const old=connection;connection=null;session++;if(old)try{await old.disconnect()}catch{}setStatus('test','TikTok getrennt. Spiel läuft im Testmodus weiter.')}
async function connect(uniqueId){const current=++session;const old=connection;connection=null;if(old)try{await old.disconnect()}catch{};username=uniqueId;follows.clear();recentGifts.clear();setStatus('connecting',`Verbinde @${uniqueId} …`);
let library;
try{library=await import('tiktok-live-connector')}catch(e){if(current===session)setStatus('error','LIVE-Modul nicht installiert. Bitte npm install ausführen.');return}
if(current!==session)return;
const {TikTokLiveConnection,WebcastEvent,ControlEvent}=library;
const conn=new TikTokLiveConnection(uniqueId);
connection=conn;
conn.on(ControlEvent.CONNECTED,()=>{if(current===session)setStatus('connected',`Verbunden mit @${uniqueId} · LIVE-Ereignisse aktiv.`)});
conn.on(ControlEvent.DISCONNECTED,()=>{if(current===session)setStatus('disconnected','TikTok-Verbindung wurde getrennt. Erneut verbinden.')});
conn.on(ControlEvent.ERROR,e=>{if(current===session)setStatus('error','TikTok: '+safeError(e))});
if(WebcastEvent.STREAM_END)conn.on(WebcastEvent.STREAM_END,()=>{if(current===session)setStatus('disconnected','Der Livestream wurde beendet.')});
conn.on(WebcastEvent.FOLLOW,d=>{if(current!==session)return;const uid=String(d?.user?.id||userLabel(d)),now=Date.now();if(now-(follows.get(uid)||0)<10000)return;follows.set(uid,now);event('follow',25,userLabel(d),'Neuer Follower');if(follows.size>250)for(const [k,t] of follows)if(now-t>120000)follows.delete(k)});
conn.on(WebcastEvent.GIFT,d=>{if(current===session)handleGift(d)});
try{await conn.connect();if(current===session&&status==='connecting')setStatus('connected',`Verbunden mit @${uniqueId}. Warte auf Events.`)}
catch(e){if(current===session){connection=null;setStatus('error',`Keine Verbindung zu @${uniqueId}: ${safeError(e)}`)}}
}
const json=(res,code,obj)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj))};
function isLocal(req){const ip=req.socket.remoteAddress||'';return ip==='127.0.0.1'||ip==='::1'||ip==='::ffff:127.0.0.1'}
function authorized(req,pin){if(ADMIN_PIN)return String(pin)===ADMIN_PIN;return isLocal(req)}
async function action(req,res){let s='';try{for await(const c of req){s+=c;if(s.length>2000){json(res,413,{error:'Anfrage zu groß'});return}}const o=JSON.parse(s);if(!authorized(req,o.pin)){json(res,403,{error:ADMIN_PIN?'Admin-PIN falsch oder fehlt.':'Server braucht online eine ADMIN_PIN-Umgebungsvariable.'});return}
let cmd=String(o.command||'');switch(cmd){
 case 'connect':{const name=String(o.username||'').replace(/^@/,'').trim();if(!/^[a-zA-Z0-9._]{2,30}$/.test(name)){json(res,400,{error:'Ungültiger TikTok-Nutzername.'});return}void connect(name);json(res,202,{ok:true,message:'Verbinde mit TikTok LIVE …'});return}
 case 'disconnect':void disconnect();json(res,200,{ok:true});return;
 case 'test':{const type=String(o.type);const vals={follow:25,rose:15,heart:70,galaxy:350};if(!Object.hasOwn(vals,type)){json(res,400,{error:'Unbekannter Test.'});return}event(type,vals[type],'Test-Zuschauer','Test-Ereignis');json(res,200,{ok:true});return}
 case 'speed':{const v=Number(o.speed);if(!Number.isFinite(v)){json(res,400,{error:'Ungültiges Tempo.'});return}game.speed=Math.min(30,Math.max(1,Math.round(v)));update();void save();json(res,200,{ok:true});return}
 case 'pause':game.paused=!game.paused;if(game.finished)game.paused=true;update();void save();json(res,200,{ok:true});return;
 case 'reset':Object.assign(game,{steps:0,paused:false,finished:false,lost:0,count:0});update();void save();json(res,200,{ok:true});return;
 default:json(res,400,{error:'Unbekannter Befehl.'});return;
}}
catch(e){json(res,400,{error:safeError(e)})}}
const contentTypes={'/':'text/html; charset=utf-8','/index.html':'text/html; charset=utf-8','/game.js':'application/javascript; charset=utf-8','/icon.svg':'image/svg+xml; charset=utf-8'};
const filenames={'/':'index.html','/index.html':'index.html','/game.js':'game.js','/icon.svg':'icon.svg'};
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
 if(req.method==='GET'&&url.pathname==='/api/state'){json(res,200,snap());return}
 if(req.method==='POST'&&url.pathname==='/api/action'){await action(req,res);return}
 if(req.method==='GET'&&url.pathname==='/api/events'){
 res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no','Connection':'keep-alive'});
 res.write(': hi\n\n');clients.add(res);res.write(`event: snapshot\ndata: ${JSON.stringify(snap())}\n\n`);
 const ping=setInterval(()=>{try{res.write(': ping\n\n')}catch{}},15000);
 req.on('close',()=>{clients.delete(res);clearInterval(ping)});return
 }
 if(req.method==='GET'&&Object.hasOwn(filenames,url.pathname)){
 try{const file=await readFile(join(DIR,filenames[url.pathname]));res.writeHead(200,{'Content-Type':contentTypes[url.pathname],'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(file)}catch{json(res,500,{error:'Datei fehlt'})}return
 }
 json(res,404,{error:'Nicht gefunden'})
});
setInterval(()=>{const now=Date.now(),dt=Math.min(2,(now-lastTick)/1000);lastTick=now;if(!game.paused&&!game.finished){game.steps=Math.min(GOAL,game.steps+game.speed*dt);if(game.steps>=GOAL){game.steps=GOAL;game.finished=true;game.paused=true;emit('gameevent',{type:'info',loss:0,user:'STAIRRUN',label:'🏆 Ziel erreicht!'})}}if(now-lastSave>15000){lastSave=now;void save()}},200);
setInterval(update,750);
server.listen(PORT,'0.0.0.0',()=>console.log(`\n🏃 STAIRRUN 3D: http://localhost:${PORT}\nAdmin-Schutz: ${ADMIN_PIN?'PIN gesetzt':'NUR lokale Bedienung (ADMIN_PIN für Online-Hosting setzen)'}\n`));
process.on('SIGINT',()=>{void save().then(()=>server.close(()=>process.exit(0)))});
process.on('SIGTERM',()=>{void save().then(()=>server.close(()=>process.exit(0)))});
