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
check('기둥 뒤 가림: 원작이 감춘 자리에 아몰랑을 그리지 않는다(색상 0·1·2)',()=>{atlas.rgba.fill(255);for(const mode of [0,1,2]){const {g}=make({});g.setColor(mode);g.start({level:1,min:60,sec:0,hp:3});
  const c=g.core,o=new Uint32Array(g.out.buffer,g.out.byteOffset,320*288);let seed=8;const rnd=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};let k=0,left=0,hid=0,leak=0;
  for(let f=0;f<2500;f++){if(left--<=0){k=[1,1,1,2,2,2,4,8,16,17,18,5,6,32,0][(rnd()*15)|0];left=6+((rnd()*50)|0);}if(g.dead())k=(f&16)?0x80:0;g.setKeys(k);if(!g.frame())break;const i=g.info;if(!i)continue;
    const gr=g.G[i.g],fr=gr.frames[i.k];for(let fy=0;fy<gr.H;fy++)for(let fx=0;fx<gr.W;fx++){if(!fr.px[fy*gr.W+fx])continue;const sx=i.x+(i.fl?gr.W-1-fx:fx),sy=i.y+fy;if(sx<0||sx>=160||sy<0||sy>=144)continue;const p=sy*160+sx;if(c.heroIx[p]||c.over[p])continue;hid++;const b=c.base[p],q=2*sy*320+2*sx;if(o[q]!==b||o[q+1]!==b||o[q+320]!==b||o[q+321]!==b)leak++;}}
  assert(hid>20000,'색상 '+mode+' hid '+hid);assert(leak/hid<0.002,'색상 '+mode+' '+leak+'/'+hid);assert.equal(g.stat.wrong,0);}});
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
const hue=v=>{const r=v&255,g=(v>>8)&255,b=(v>>16)&255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;if(d<24)return -1;return 60*(mx===r?((g-b)/d+6)%6:mx===g?(b-r)/d+2:(r-g)/d+4);};
const at200=(lv,mode)=>{const {g}=make({});if(mode!==undefined)g.setColor(mode);g.start({level:lv,min:60,sec:0,hp:3});run(g,200,[0]);return g;};
check('색상의 기본은 0 그레이스케일이고, 0·1·2·3 밖의 값은 0으로 본다',()=>{const {g}=make({});assert.equal(g.color,0);assert.equal(g.pencil(),null);g.setColor(1);assert.equal(g.color,1);g.setColor(2);assert.equal(g.color,2);g.setColor(3);assert.equal(g.color,3);g.setColor(7);assert.equal(g.color,0);g.setColor(true);assert.equal(g.color,0);});
check('색상 0 그레이스케일: 1–14층의 색표와 화면이 네 단계만 쓴다',()=>{const G4=new Set(PE.GRAY);assert.equal(G4.size,4);const seen=new Set();
  for(let lv=1;lv<=14;lv++){const g=at200(lv,0),c=g.core;for(let k=0;k<32;k++){assert(G4.has(c.bgRGB[k]),lv+'층 배경 색 '+k);assert(G4.has(c.objRGB[k]),lv+'층 스프라이트 색 '+k);}
    const o=new Uint32Array(g.out.buffer,g.out.byteOffset,320*288);for(let i=0;i<o.length;i++){if(!G4.has(o[i]))assert.fail(lv+'층 화면 '+i+'번째 점 '+o[i].toString(16));seen.add(o[i]);}}
  assert.equal(seen.size,4,'네 단계가 모두 쓰인다');});
check('색상 1 컬러: 금색(c0a800)은 벽돌로 칠하지 않고, 벽돌은 색상 46° 둘레로 모인다(1–14층)',()=>{const got=[];
  for(let lv=1;lv<=14;lv++){const g=at200(lv,1),c=g.core,t=PE.makeTone();t.theme(c.bgRaw);let gold=0,brick=0;
    for(let k=0;k<32;k++){const raw=c.bgRaw[k],pi=k>>2;if(raw===PE.GOLD){gold++;assert.equal(c.bgRGB[k],PE.pastelOf(raw,false),lv+'층 금색 '+k);}
      else if(pi!==4&&t.isBrick(raw)){brick++;const h=hue(c.bgRGB[k]);assert(h<0||Math.abs(h-46)<=4,lv+'층 벽돌 색 '+k+' 색상 '+h);}
      else assert.equal(c.bgRGB[k],PE.pastelOf(raw,false),lv+'층 색 '+k);
      const v=c.bgRGB[k];assert(Math.max(v&255,(v>>8)&255,(v>>16)&255)>=14,lv+'층 색 '+k+': 순검정은 없다');}
    assert(brick>0,lv+'층에서 벽돌로 칠한 색이 없다');got.push(gold);}
  assert(got[3]>0&&got[10]>0,'4층·11층의 금색 '+got);});
check('색상 2 본래 색: 색표가 원작 값 그대로다(1–14층)',()=>{for(let lv=1;lv<=14;lv++){const c=at200(lv,2).core;for(let k=0;k<32;k++){assert.equal(c.bgRGB[k],c.bgRaw[k],lv+'층 배경 '+k);assert.equal(c.objRGB[k],c.objRaw[k],lv+'층 스프라이트 '+k);}}});
check('색상을 바꾸어도 판의 진행과 저장 묶음은 같고, 게임 중에 바꾸면 화면이 곧 따른다',()=>{const gs=[0,1,2,3].map(m=>{const g=make({}).g;g.setColor(m);g.start({level:4,min:45,sec:0,hp:3});for(let f=0;f<600;f++){press(g,f);g.frame();}return g;});
  assert.deepEqual(gs[1].snapshot(),gs[0].snapshot());assert.deepEqual(gs[2].snapshot(),gs[0].snapshot());assert.deepEqual(gs[3].snapshot(),gs[0].snapshot());
  const st=gs.map(g=>Buffer.from(g.saveState()));assert.equal(Buffer.compare(st[0],st[1]),0);assert.equal(Buffer.compare(st[0],st[2]),0);assert.equal(Buffer.compare(st[0],st[3]),0);
  assert.notEqual(fnv(gs[0]),fnv(gs[1]));assert.notEqual(fnv(gs[1]),fnv(gs[2]));assert.equal(fnv(gs[3]),fnv(gs[0]),'연필의 S.out은 그레이스케일 화면이다');
  gs[2].setColor(0);press(gs[0],600);press(gs[2],600);gs[0].frame();gs[2].frame();assert.equal(fnv(gs[2]),fnv(gs[0]));});
const penHash=p=>{let h=2166136261;const o=new Uint32Array(p.out.buffer,p.out.byteOffset,p.w*p.h);for(let i=0;i<o.length;i++){h^=o[i];h=Math.imul(h,16777619);}return h>>>0;};
check('색상 3 연필: 화면은 960×864이고 종이색과 흑연색 사이의 색만 쓴다. 넓은 어둠은 종이로 남는다(1–14층)',()=>{
  for(let lv=1;lv<=14;lv++){const g=at200(lv,3),p=g.pencil();assert.equal(p.w,960);assert.equal(p.h,864);assert.equal(p.out.length,960*864*4);
    let sum=0,dark=0;const o=p.out;
    for(let i=0;i<o.length;i+=4){for(let k=0;k<3;k++){const v=o[i+k];if(v<PE.LEAD[k]||v>PE.PAPER[k]+9)assert.fail(lv+'층 '+(i>>2)+'번째 점 '+[o[i],o[i+1],o[i+2]]);}assert.equal(o[i+3],255);sum+=o[i+1];if(o[i+1]<150)dark++;}
    const mean=sum/(o.length/4);assert(mean>185,lv+'층 평균 밝기 '+mean.toFixed(1));assert(dark>2000,lv+'층 짙은 점 '+dark);
    let vd=0;for(let i=0;i<p.voidN.length;i++)vd+=p.voidN[i];assert(vd>1500,lv+'층 빈 곳 '+vd);
    /* 아래 띠(y ≥ 124)는 뒤집어 그린다: 바탕(검정)은 종이(갈래 3), 글자(흰색)는 짙은 빗금(갈래 0) */
    const G=new Uint32Array(g.out.buffer,g.out.byteOffset,320*288);let ink=0;
    for(let i=248*320;i<288*320;i++){const lev=PE.GRAY.indexOf(G[i]);assert.equal(p.cls[i],3-lev,lv+'층 띠 '+i);if(p.cls[i]===0)ink++;}
    assert(ink>100,lv+'층 띠의 글자 '+ink);}});
check('색상 3 연필: 바뀐 조각만 다시 그려도 모두 다시 그린 것과 같고, 같은 판은 같은 그림이 된다',()=>{
  const play=(lv)=>{const g=make({}).g;g.setColor(3);g.start({level:lv,min:60,sec:0,hp:3});return g;};
  for(const lv of [1,4,12]){const a=play(lv),b=play(lv);let few=0,some=0;
    for(let f=0;f<700;f++){press(a,f);press(b,f);a.frame();b.frame();const p=a.pencil();if(f>0&&p.n<60)few++;if(p.n>0)some++;
      if(f%100===99){const inc=penHash(p),full=penHash(b.pencil(true));assert.equal(inc,full,lv+'층 '+f+'번째 화면');assert.equal(penHash(a.pencil(true)),inc);}}
    assert(few>500,lv+'층: 조각 60개 미만으로 그린 화면 '+few);assert(some>50,lv+'층: 바뀐 화면 '+some);
    const again=a.pencil();assert.equal(again.n,0,'바뀐 것이 없으면 다시 그리지 않는다');}
  const g=play(4);for(let f=0;f<200;f++)g.frame();const h3=penHash(g.pencil());g.setColor(0);assert.equal(g.pencil(),null);g.frame();g.setColor(3);g.frame();assert.equal(g.pencil().n,360,'색상을 연필로 바꾸면 모두 다시 그린다');
  const g2=play(4);for(let f=0;f<202;f++)g2.frame();assert.equal(penHash(g.pencil()),penHash(g2.pencil()));assert.notEqual(h3,0);});
console.log(n+' passed');
