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
const fnv=g=>{const b=new Uint8Array(g.out.buffer,g.out.byteOffset,g.out.byteLength);let h=2166136261;for(let i=0;i<b.length;i++){h^=b[i];h=Math.imul(h,16777619);}return h>>>0;};
const keysAt=f=>[1,1,2,2,4,8,16,17,18,0][(f*7919>>3)%10];
const press=(g,f)=>g.setKeys(g.dead()?((f&16)?0x80:0):keysAt(f));
check('저장한 판을 되살리면 같은 입력에서 1500화면이 똑같이 이어진다(1·4·12층)',()=>{for(const [lv,at] of [[1,700],[4,333],[12,1500]]){
  const a=make({}).g;a.start({level:lv,min:40,sec:0,hp:3});for(let f=0;f<at;f++){press(a,f);a.frame();}
  const st=a.saveState();assert.equal(st.length,33198);const b=make({}).g;b.start({level:1,min:60,sec:0,hp:3});for(let f=0;f<50;f++)b.frame();assert.equal(b.loadState(PE.unpack(PE.pack(st))),true);
  assert.deepEqual(b.snapshot(),a.snapshot());
  for(let f=at;f<at+1500;f++){press(a,f);press(b,f);a.frame();b.frame();assert.equal(fnv(b),fnv(a),lv+'층 '+f+'번째 화면');}
  assert.deepEqual(b.snapshot(),a.snapshot());assert.equal(b.stat.miss,0);assert.equal(b.stat.wrong,0);}});
check('저장 묶음은 글자로 바꿨다 되돌려도 같고, 깨진 묶음은 받지 않는다',()=>{const a=make({}).g;a.start({level:7,min:35,sec:0,hp:4});for(let f=0;f<400;f++){press(a,f);a.frame();}
  const st=a.saveState(),txt=PE.pack(st),back=PE.unpack(txt);assert.equal(typeof txt,'string');assert(txt.length<st.length,'묶음 '+txt.length+'글자');assert.equal(Buffer.compare(Buffer.from(st),Buffer.from(back)),0);
  const bad=Uint8Array.from(back);bad[5000]^=1;const b=make({}).g;b.start({level:2,min:60,sec:0,hp:3});for(let f=0;f<60;f++)b.frame();const before=b.snapshot();
  assert.equal(b.loadState(bad),false);assert.equal(b.loadState(back.subarray(0,100)),false);assert.deepEqual(b.snapshot(),before);assert.equal(PE.unpack('abc'),null);});
check('노란 벽돌색에서도 금색(c0a800)은 그대로다(1–14층의 배경 색표)',()=>{const GOLD=0xFF00A8C0;const got=[];
  for(let lv=1;lv<=14;lv++){const {g}=make({});g.start({level:lv,min:60,sec:0,hp:3});run(g,200,[0]);const c=g.core;let gold=0,painted=0;
    for(let k=0;k<32;k++){if(c.bgRaw[k]===GOLD){gold++;assert.equal(c.bgRGB[k],GOLD,lv+'층 색 '+k);}else if(c.bgRGB[k]!==c.bgRaw[k])painted++;}
    assert(painted>0,lv+'층에서 칠한 색이 없다');got.push(gold);}
  assert(got[3]>0&&got[10]>0,'4층·11층의 금색 '+got);});
console.log(n+' passed');
