// 동현페 규약 시험: node qa/core-tests.cjs
// 예제 출력과 출전 규약 판정(개수·범위·기본값)을 확인한다. 엔진은 qa/engine-tests.cjs가 따로 본다.
const assert=require('assert'),fs=require('fs'),path=require('path');
const D=require('../src/donghyun.js');const {examples,MODES,SPARE}=require('../src/examples.js');
// app.js는 브라우저용이므로 규약 부분(FIELDS·parseSortie)만 꺼내어 쓴다
const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
const part=app.slice(app.indexOf('const LAST=14;'),app.indexOf('const colorName='));
const {FIELDS,parseSortie,DEF}=new Function(part+'\nreturn {FIELDS,parseSortie,DEF};')();
// 옛 저장 묶음의 설정 읽기(setOf)도 꺼낸다
const part2=app.slice(app.indexOf('const oldSave='),app.indexOf('/* 결과 알림'));
const {setOf}=new Function('FIELDS',part2+'\nreturn {setOf};')(FIELDS);
let n=0;const check=(name,f)=>{f();n++;console.log('ok',name);};
const run=c=>D.run(c,{maxSteps:300000}).output;
check('규약 다섯 칸과 기본값 1 60 3 0 1(색상의 기본은 0 그레이스케일)',()=>{assert.deepEqual(FIELDS.map(f=>f.key),['l','t','h','b','m']);assert.deepEqual(Object.values(DEF),[1,60,3,0,1]);});
check('출력이 없으면 기본값으로 나선다',()=>{const p=parseSortie('');assert(!p.err);assert.deepEqual(p.set,DEF);assert(p.note);});
check('다섯 개가 아니면 오류',()=>{assert(parseSortie('1 60 3 0').err);assert(parseSortie('1 60 3 0 0 0').err);assert(parseSortie('7').err);});
check('범위: 시작 층 1–14, 남은 시간 1–60, 체력 칸 1–9, 색상 0–3, 음악 0·1',()=>{
  const ok=s=>!parseSortie(s).err;
  assert(ok('1 1 1 0 0'));assert(ok('14 60 9 2 1'));assert(ok('1 60 3 1 0'));assert(ok('1 60 3 3 1'));
  for(const bad of ['0 60 3 0 0','15 60 3 0 0','1 0 3 0 0','1 61 3 0 0','1 60 0 0 0','1 60 10 0 0','1 60 3 4 0','1 60 3 -1 0','1 60 3 0 2'])assert(!ok(bad),bad);});
check('정수가 아니면 오류',()=>{assert(parseSortie('1 60.5 3 0 0').err);});
check('예제 열둘의 출력: 여섯 가지 출전을 그레이스케일(0) · 컬러(1)의 둘씩 묶었다',()=>{const want={basic:[1,60,3,1],stroll:[1,60,9,1],palace:[4,45,3,1],music:[7,35,4,1],rush:[12,15,1,1],calc:[9,28,3,1]};
  assert.equal(examples.length,12);assert.equal(new Set(examples.map(e=>e.id)).size,12);
  examples.forEach((e,i)=>{const base=e.id.replace(/-color$/,''),j=i%2,c=[0,1][j],w=want[base];assert(w,e.id);assert.equal(e.id,base+['','-color'][j]);
    assert(e.title.startsWith(String(i+1).padStart(2,'0')+' · '),e.title);assert(e.title.includes(['그레이스케일','컬러'][j]),e.title);
    const p=parseSortie(run(e.code));assert(!p.err,e.id);assert.deepEqual(Object.values(p.set),[w[0],w[1],w[2],c,w[3]],e.id);});});
check('연필(3)은 예제에 없고, 설정 번호와 자료는 남아 있다',()=>{
  assert.deepEqual(MODES.map(m=>m.v),[0,1]);assert.deepEqual(SPARE.map(m=>[m.v,m.name,m.tail]),[[3,'연필','-pencil']]);assert(SPARE[0].tone.includes('연필(3)'));
  for(const e of examples){assert(!/pencil/.test(e.id),e.id);assert(!e.title.includes('연필'),e.title);assert.notEqual(parseSortie(run(e.code)).set.b,3,e.id);}
  const p=parseSortie('1 60 3 3 1');assert(!p.err);assert.equal(p.set.b,3);assert.equal(FIELDS[3].max,3);assert(app.includes("['그레이스케일','컬러','본래 색','연필']"));});
check('예제 11–12: 남은 시간 = 64 − 층 × 4',()=>{for(const id of ['calc','calc-color']){const p=parseSortie(run(examples.find(e=>e.id===id).code));assert.equal(p.set.t,64-p.set.l*4);}});
check('옛 저장 묶음(v0.40 전)은 노랑을 컬러로, 본래 색을 본래 색으로 옮겨 읽는다',()=>{
  assert.deepEqual(setOf({lab:'0.33',set:{l:4,t:45,h:3,b:0,m:1}}),{l:4,t:45,h:3,b:1,m:1});
  assert.deepEqual(setOf({lab:'0.32',set:{l:4,t:45,h:3,b:1,m:0}}),{l:4,t:45,h:3,b:2,m:0});
  assert.deepEqual(setOf({lab:'0.40',set:{l:4,t:45,h:3,b:0,m:1}}),{l:4,t:45,h:3,b:0,m:1});
  assert.deepEqual(setOf({lab:'0.40',set:{l:4,t:45,h:3,b:2,m:1}}),{l:4,t:45,h:3,b:2,m:1});
  assert.deepEqual(setOf({lab:'0.40',set:{l:4,t:45,h:3,b:3,m:1}}),{l:4,t:45,h:3,b:3,m:1});
  assert.deepEqual(setOf({lab:'0.50',set:{l:4,t:45,h:3,b:3,m:0}}),{l:4,t:45,h:3,b:3,m:0});
  assert.deepEqual(setOf({lab:'0.50',set:{l:4,t:45,h:3,b:1,m:1}}),{l:4,t:45,h:3,b:1,m:1});
  assert.deepEqual(setOf({lab:'0.60',set:{l:7,t:30,h:5,b:3,m:1}}),{l:7,t:30,h:5,b:3,m:1});
  assert.deepEqual(setOf({lab:'0.63',set:{l:7,t:30,h:5,b:3,m:1}}),{l:7,t:30,h:5,b:3,m:1});
  assert.deepEqual(setOf({lab:'',set:{l:4,t:45,h:3,b:1,m:1}}),{l:4,t:45,h:3,b:1,m:1});
  assert.deepEqual(setOf({lab:'0.40',set:{l:99,t:45,h:3,b:5,m:1}}),{l:1,t:45,h:3,b:0,m:1});});
check('시리즈 띠는 24칸이고 지금 여기는 동현페',()=>{const s=fs.readFileSync(path.join(__dirname,'../src/series.html'),'utf8');assert.equal((s.match(/class="series-item/g)||[]).length,24);assert(/is-current" data-series="pe"/.test(s));});
console.log(n+' passed');
