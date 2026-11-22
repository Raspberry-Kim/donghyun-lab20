// 동현페 규약 시험: node qa/core-tests.cjs
// 예제 출력과 출전 규약 판정(개수·범위·기본값)을 확인한다. 엔진은 qa/engine-tests.cjs가 따로 본다.
const assert=require('assert'),fs=require('fs'),path=require('path');
const D=require('../src/donghyun.js');const {examples}=require('../src/examples.js');
// app.js는 브라우저용이므로 규약 부분(FIELDS·parseSortie)만 꺼내어 쓴다
const app=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
const part=app.slice(app.indexOf('const LAST=14;'),app.indexOf('const brickName='));
const {FIELDS,parseSortie,DEF}=new Function(part+'\nreturn {FIELDS,parseSortie,DEF};')();
let n=0;const check=(name,f)=>{f();n++;console.log('ok',name);};
const run=c=>D.run(c,{maxSteps:300000}).output;
check('규약 다섯 칸과 기본값 1 60 3 0 1',()=>{assert.deepEqual(FIELDS.map(f=>f.key),['l','t','h','b','m']);assert.deepEqual(Object.values(DEF),[1,60,3,0,1]);});
check('출력이 없으면 기본값으로 나선다',()=>{const p=parseSortie('');assert(!p.err);assert.deepEqual(p.set,DEF);assert(p.note);});
check('다섯 개가 아니면 오류',()=>{assert(parseSortie('1 60 3 0').err);assert(parseSortie('1 60 3 0 0 0').err);assert(parseSortie('7').err);});
check('범위: 시작 층 1–14, 남은 시간 1–60, 체력 칸 1–9, 벽돌색 0·1, 음악 0·1',()=>{
  const ok=s=>!parseSortie(s).err;
  assert(ok('1 1 1 0 0'));assert(ok('14 60 9 1 1'));
  for(const bad of ['0 60 3 0 0','15 60 3 0 0','1 0 3 0 0','1 61 3 0 0','1 60 0 0 0','1 60 10 0 0','1 60 3 2 0','1 60 3 -1 0','1 60 3 0 2'])assert(!ok(bad),bad);});
check('정수가 아니면 오류',()=>{assert(parseSortie('1 60.5 3 0 0').err);});
check('예제 여섯의 출력',()=>{const want={basic:[1,60,3,0,1],stroll:[1,60,9,0,1],palace:[4,45,3,1,1],music:[7,35,4,0,1],rush:[12,15,1,0,1],calc:[9,28,3,0,1]};
  assert.equal(examples.length,6);
  for(const e of examples){const p=parseSortie(run(e.code));assert(!p.err,e.id);assert.deepEqual(Object.values(p.set),want[e.id],e.id);}});
check('예제 06: 남은 시간 = 64 − 층 × 4',()=>{const p=parseSortie(run(examples.find(e=>e.id==='calc').code));assert.equal(p.set.t,64-p.set.l*4);});
check('시리즈 띠는 21칸이고 지금 여기는 동현페',()=>{const s=fs.readFileSync(path.join(__dirname,'../src/series.html'),'utf8');assert.equal((s.match(/class="series-item/g)||[]).length,21);assert(/is-current" data-series="pe"/.test(s));});
console.log(n+' passed');
