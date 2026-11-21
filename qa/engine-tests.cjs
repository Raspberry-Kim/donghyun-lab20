// 동현페 엔진 시험: node qa/engine-tests.cjs
// pe/ 폴더의 엔진을 화면 없이 돌린다. 아몰랑 그림은 투명한 가짜 판으로 바꿔 쓴다(그림 맞추기는 그대로 돈다).
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const P=n=>path.join(__dirname,'../pe',n);
const win={};vm.runInNewContext(fs.readFileSync(P('data.js'),'utf8')+fs.readFileSync(P('atlas.js'),'utf8'),{window:win});
const d=win.__PE_DATA,pk=Buffer.from(d.b64,'base64'),data=new Uint8Array(d.size);
for(let i=0,o=0;i<d.runs.length;i+=2){data.set(pk.subarray(o,o+d.runs[i+1]),d.runs[i]);o+=d.runs[i+1];}
const meta=win.__PE_ATLAS.meta,png=Buffer.from(win.__PE_ATLAS.png.split(',')[1],'base64'),W=png.readUInt32BE(16),H=png.readUInt32BE(20);
const atlas={rgba:new Uint8Array(W*H*4),w:W,h:H,frames:meta.frames};
const {makeCore}=require(P('core.js')),PE=require(P('game.js'));
let n=0;const check=(name,f)=>{f();n++;console.log('ok',name);};
const make=(opts)=>{const ev=[];const io=[];const g=PE.makeGame(makeCore,data,atlas,{...opts,onEvent:(t,i)=>ev.push([t,i]),onIo:(a,v)=>io.push(a)});return {g,ev,io};};
const run=(g,frames,keys)=>{let seed=5;const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};let k=0,left=0;
  for(let f=0;f<frames;f++){if(left--<=0){k=keys[(rnd()*keys.length)|0];left=6+((rnd()*40)|0);}if(g.dead())k=(f&16)?0x80:0;g.setKeys(k);if(!g.frame())break;}};
check('원작 자료는 228,169바이트, 아몰랑 그림은 578장',()=>{let s=0;for(let i=1;i<d.runs.length;i+=2)s+=d.runs[i];assert.equal(s,228169);assert.equal(Object.keys(meta.frames).length,578);});
check('1층에서 시작하고 그림 맞추기가 빠짐없이 된다',()=>{const {g}=make({});g.start({level:1,min:60,sec:0,hp:3});run(g,900,[1,1,2,2,4,8,16,0]);
  const s=g.snapshot();assert.equal(s.level,1);assert.equal(s.hpMax,3);assert(g.stat.hero>600);assert.equal(g.stat.miss,0);assert.equal(g.stat.wrong,0);});
check('시작 층·남은 시간·체력 칸이 듣는다',()=>{for(const [l,t,h] of [[4,45,9],[12,15,1],[14,1,5]]){const {g}=make({});g.start({level:l,min:t,sec:0,hp:h});run(g,120,[0]);
  const s=g.snapshot();assert.equal(s.level,l);assert.equal(s.hpMax,h);assert(s.min===t||s.min===t-1,'min '+s.min);}});
check('남은 시간이 다 되면 끝난다',()=>{const {g,ev}=make({});g.start({level:1,min:1,sec:0,hp:3});run(g,5000,[0]);assert(ev.some(e=>e[0]==='timeover'),'timeover');});
check('음악을 끄면 소리 장치에 쓰는 횟수가 준다(효과음은 남는다)',()=>{const a=make({music:true}),b=make({music:false});
  for(const x of [a,b]){x.g.start({level:1,min:60,sec:0,hp:3});run(x.g,600,[1,2,0]);}assert(b.io.length>0);assert(a.io.length>b.io.length,a.io.length+' '+b.io.length);});
check('기둥 뒤 가림: 원작이 감춘 자리에 아몰랑을 그리지 않는다',()=>{const {g}=make({});const at=g.atlas||atlas;at.rgba.fill(255);g.setBrick(false);g.start({level:1,min:60,sec:0,hp:3});
  const c=g.core,o=new Uint32Array(g.out.buffer,g.out.byteOffset,320*288);let seed=8;const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};let k=0,left=0,hid=0,leak=0;
  for(let f=0;f<2500;f++){if(left--<=0){k=[1,1,1,2,2,2,4,8,16,17,18,5,6,32,0][(rnd()*15)|0];left=6+((rnd()*50)|0);}if(g.dead())k=(f&16)?0x80:0;g.setKeys(k);if(!g.frame())break;const i=g.info;if(!i)continue;
    const gr=g.G[i.g],fr=gr.frames[i.k];for(let fy=0;fy<gr.H;fy++)for(let fx=0;fx<gr.W;fx++){if(!fr.px[fy*gr.W+fx])continue;const sx=i.x+(i.fl?gr.W-1-fx:fx),sy=i.y+fy;if(sx<0||sx>=160||sy<0||sy>=144)continue;const p=sy*160+sx;if(c.heroIx[p]||c.over[p])continue;hid++;const b=c.base[p],q=2*sy*320+2*sx;if(o[q]!==b||o[q+1]!==b||o[q+320]!==b||o[q+321]!==b)leak++;}}
  assert(hid>20000,'hid '+hid);assert(leak/hid<0.002,leak+'/'+hid);assert.equal(g.stat.wrong,0);});
console.log(n+' passed');
