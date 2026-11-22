/* 동현페: 동현랭으로 시작 층·남은 시간·체력 칸·색상·음악을 정하고, 아몰랑의 모험을 띄운다. */
(function(){
const $=s=>document.querySelector(s);

/* ---------- 화면 전환과 탭 ---------- */
$('#theme').onclick=()=>{const dark=document.documentElement.dataset.theme!=='dark';document.documentElement.dataset.theme=dark?'dark':'light';$('#theme').setAttribute('aria-pressed',String(dark));};
function showTab(name){
  document.querySelectorAll('.tabs button').forEach(b=>{const on=b.dataset.tab===name;b.classList.toggle('active',on);on?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current');});
  document.querySelectorAll('.tab-panel').forEach(p=>p.hidden=p.id!=='tab-'+name);
}
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
$('.brand').onclick=e=>{e.preventDefault();showTab('play');scrollTo({top:0,behavior:'smooth'});};

/* ---------- 동현랭 편집기(동현랭 시리즈와 같은 모양) ---------- */
for(const ex of examples){const o=document.createElement('option');o.value=ex.id;o.textContent=ex.title;$('#example').append(o);}
const DH_TOKEN=/(ㅋㅋ.*$)|(나는 동현이냐\?|동현이구나)|(오겡끼데스까)|(신중동역|신중동|뭉치)|(뿡뿡뿡|뿡뿡|포동이)|(꽥꽥)|(동+현아)|(동+현)|(도오*옹)|(ㅠ+)|(뚱띠|또치)/g;
const DH_CLS=[null,'t-cmt','t-frame','t-halt','t-ctl','t-out','t-in','t-assign','t-var','t-num','t-minus','t-op'];
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function dhLine(line){let html='',last=0;line.replace(DH_TOKEN,(m,...gr)=>{const idx=gr[gr.length-2];html+=esc(line.slice(last,idx));const k=gr.slice(0,11).findIndex(x=>x!==undefined)+1;html+=`<span class="${DH_CLS[k]}">${esc(m)}</span>`;last=idx+m.length;return m;});return html+esc(line.slice(last));}
const code=$('#code'), area=document.createElement('div'), hl=document.createElement('div');
area.className='code-area'; hl.id='hl'; hl.setAttribute('aria-hidden','true'); code.parentNode.insertBefore(area,code); area.append(hl,code);
function hlSync(){hl.scrollTop=code.scrollTop;hl.scrollLeft=code.scrollLeft;}
function hlMetrics(){const cs=getComputedStyle(code);for(const p of ['paddingTop','paddingRight','paddingBottom','paddingLeft','fontFamily','fontSize','lineHeight','tabSize','letterSpacing'])hl.style[p]=cs[p];}
function highlight(){hlMetrics();hl.innerHTML=code.value.split('\n').map(l=>`<span class="ln">${dhLine(l)||' '}</span>`).join('')+'<span class="ln"> </span>';hlSync();}
code.addEventListener('scroll',()=>{hlSync();$('#lines').scrollTop=code.scrollTop;});addEventListener('resize',highlight);
function codeChanged(e){if(!e?.isComposing)indent();const n=code.value.split('\n').length;$('#line-count').textContent=n+'줄';$('#lines').textContent=Array.from({length:n},(_,i)=>i+1).join('\n');highlight();}
// 동현랭 시리즈 들여쓰기: ㅋㅋ 주석 세 칸, 명령 두 칸, '나는 동현이냐?'·'동현이구나'는 들여 쓰지 않는다
function indent(){
  const text=code.value,lines=text.split('\n'),lead=l=>l.length-l.replace(/^[ \t]+/,'').length;
  const next=lines.map(l=>{const b=l.slice(lead(l));if(!b)return '';if(b.startsWith('ㅋㅋ'))return '   '+b;const s=b.split('~')[0].replace(/ㅋㅋ.*$/,'').trim();return (s==='나는 동현이냐?'||s==='동현이구나'?'':'  ')+b;});
  const {selectionStart:a,selectionEnd:b,selectionDirection:dir,scrollTop:y,scrollLeft:x}=code;
  const moved=p=>{let o=0,n=0;for(let i=0;i<lines.length;i++){const L=lines[i].length;if(p<=o+L){const c=p-o,ol=lead(lines[i]),nl=lead(next[i]);return n+Math.min(next[i].length,c<ol?nl:c-ol+nl);}o+=L+1;n+=next[i].length+1;}return n;};
  const value=next.join('\n'),na=moved(a),nb=moved(b);if(value===text&&na===a&&nb===b)return;if(value!==text)code.value=value;code.setSelectionRange(na,nb,dir);code.scrollTop=y;code.scrollLeft=x;
}
code.addEventListener('compositionend',()=>codeChanged());
// 커서가 들여쓰기 안에 놓이면 들여쓰기 뒤로 옮기고, 들여쓰기 바로 뒤에서 Backspace를 누르면 윗줄과 합친다
function codeLead(){const a=code.selectionStart,v=code.value,ls=v.lastIndexOf('\n',a-1)+1,le=v.indexOf('\n',ls);return {a,ls,lead:/^[ \t]*/.exec(v.slice(ls,le<0?v.length:le))[0].length};}
document.addEventListener('selectionchange',()=>{if(document.activeElement!==code||code.selectionStart!==code.selectionEnd)return;const {a,ls,lead}=codeLead();if(a-ls<lead)code.setSelectionRange(ls+lead,ls+lead);});
code.addEventListener('beforeinput',e=>{
  const {a,ls,lead}=codeLead();
  if(a!==code.selectionEnd)return;
  if(e.inputType==='deleteContentBackward'&&ls>0&&a>ls&&a-ls<=lead){e.preventDefault();code.setRangeText('',ls-1,a,'end');codeChanged();}
});
code.oninput=codeChanged;
code.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();start();}});
function selectExample(){const ex=examples.find(e=>e.id===$('#example').value);code.value=ex.code;$('#example-note').textContent=ex.note;codeChanged();}
$('#example').onchange=()=>{ selectExample(); previewCard(); }; selectExample();
$('#save').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([code.value+'\n'],{type:'text/plain;charset=utf-8'}));a.download='pe.dh';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
$('#open').onchange=async e=>{const f=e.target.files[0];if(!f)return;code.value=(await f.text()).replace(/\r/g,'').replace(/\n$/,'');codeChanged();e.target.value='';};
$('#run').onclick=()=>start();

/* ---------- 출전 규약 ---------- */
const LAST=14;
const FIELDS=[
  {key:'l',name:'시작 층',min:1,max:LAST,def:1},
  {key:'t',name:'남은 시간(분)',min:1,max:60,def:60},
  {key:'h',name:'체력 칸',min:1,max:9,def:3},
  {key:'b',name:'색상',min:0,max:3,def:0},
  {key:'m',name:'음악',min:0,max:1,def:1}
];
const DEF=Object.fromEntries(FIELDS.map(f=>[f.key,f.def]));
function parseSortie(out){
  const tok=out.split(/\s+/).filter(Boolean).map(Number);
  if(!tok.length) return {set:{...DEF},note:'출력이 없어 기본값 1 60 3 0 1로 나선다.'};
  if(tok.length!==FIELDS.length) return {err:`정수를 ${tok.length}개 출력했다. 시작 층 · 남은 시간 · 체력 칸 · 색상 · 음악, 다섯 개를 차례로 출력하자.`};
  const set={};
  for(let i=0;i<FIELDS.length;i++){const f=FIELDS[i],v=tok[i];
    if(!Number.isInteger(v)||v<f.min||v>f.max) return {err:`${i+1}번째 값 ${f.name} ${v}은 쓸 수 없다. ${f.min}부터 ${f.max}까지만 된다.`};
    set[f.key]=v;}
  return {set};
}
const colorName=v=>['그레이스케일','컬러','본래 색','연필'][v]||'그레이스케일', musicName=v=>v?'켬':'끔';
const SAVE_KEY='donghyunpe.save.v1';
function readSave(){ try{ const s=JSON.parse(localStorage.getItem(SAVE_KEY)||'null'); return s&&s.level>=1&&s.level<=LAST&&s.min>=1&&s.min<=60&&s.hp>=1&&s.hp<=9?s:null; }catch(e){ return null; } }
function setCard(s){
  $('#set-card').innerHTML=[['시작 층',s.l+'층'],['남은 시간',s.t+'분'],['체력 칸',s.h+'칸'],['색상',colorName(s.b)],['음악',musicName(s.m)]]
    .map(([a,b])=>`<div><span>${a}</span><strong title="${String(b).replace(/"/g,'&quot;')}">${b}</strong></div>`).join('');
  $('#stamp-map').innerHTML=`${s.l}층 <span>시작 층</span>`;$('#stamp-skill').innerHTML=`${s.t}분 <span>남은 시간</span>`;
  $('#poster-map').textContent=`${s.l}층 · ${s.t}분 · 체력 ${s.h}칸`; $('#screen').dataset.color=s.b;
}
function contButton(){ const sv=readSave(), b=$('#poster-cont'); b.hidden=!sv; if(sv) b.textContent=`이어하기 · ${sv.level}층 · ${sv.min}분 남음`; }
const result=(t,kind)=>{const r=$('#result');r.textContent=t;r.dataset.kind=kind||'';};
const status=(t,kind)=>{const s=$('#status');s.textContent=t;s.dataset.kind=kind||'';};

/* ---------- 휴대폰·태블릿: 게임 화면 아래에 화면 버튼이 붙으므로 화면 칸을 세로로 늘린다 ---------- */
const TOUCH_ONLY=matchMedia('(pointer:coarse)').matches&&!matchMedia('(any-pointer:fine)').matches;
document.documentElement.classList.toggle('touch-only',TOUCH_ONLY);

/* ---------- 게임 틀 ---------- */
let frame=null, current=null, bundle=null, live=false, sound='', padNote='', menu=null, snapWait=null;
const screen=$('#screen'), poster=$('#poster'), pill=$('#focus-pill');
function setFocus(on){pill.dataset.on=String(on);pill.textContent=on?'키보드: 게임':'키보드: 코드';}
const cmd=(name,more)=>{ if(!frame)return; try{ frame.contentWindow.postMessage({type:'dh-pe-cmd',cmd:name,...more},'*'); }catch(e){} };
/* cont: 층을 넘을 때 적힌 이어하기에서 잇는다 · pack: 저장 묶음(칸이나 .dhsave 파일)을 그대로 되살린다 */
function launch(s,cont,pack){
  stop(true);
  current=s; bundle=pack||null; sound='';
  const hash=FIELDS.map(f=>f.key+'='+s[f.key]).join('&')+(pack?'&s=1':cont?'&c=1':'');
  frame=document.createElement('iframe');
  frame.className='game-frame'; frame.title='동현페 게임 화면';
  frame.setAttribute('allow','autoplay; fullscreen; gamepad');
  frame.src='./pe/game.html#'+hash;
  frame.addEventListener('load',()=>giveFocus());
  poster.hidden=true; screen.append(frame);
  ['#stop','#full','#game-save'].forEach(id=>$(id).disabled=false);
  status('게임 자료(약 1MB)를 불러오는 중');
  /* 출전 버튼이 화면 아래에 있는 좁은 기기에서는 게임 화면을 눈앞으로 가져온다 */
  const r=screen.getBoundingClientRect(); if(r.top<0||r.bottom>innerHeight) screen.scrollIntoView({block:'center',behavior:'auto'});
}
function giveFocus(){ if(!frame||menu)return; try{frame.contentWindow.focus();const c=frame.contentDocument&&frame.contentDocument.getElementById('screen');if(c)c.focus();}catch(e){frame.focus();} }
function stop(silent){
  if(isFull()) exitFull();
  if(snapWait) snapWait(null);
  if(frame){frame.remove();frame=null;}
  live=false; poster.hidden=false; setFocus(false); contButton();
  ['#stop','#full','#game-save'].forEach(id=>$(id).disabled=true);
  if(!silent) status('끝냈다 · 다시 출전할 수 있다');
}
/* 바깥 페이지에서의 진짜 사용자 동작(클릭·키)을 게임 틀에 알려 잠든 소리를 깨운다 */
['pointerdown','keydown'].forEach(ev=>addEventListener(ev,e=>{ if(e.isTrusted&&frame){ try{ frame.contentWindow.postMessage({type:'dh-wake'},'*'); }catch(_){} } },true));
const soundNote=()=>sound==='off'?' · 소리가 잠들어 있다(게임 화면을 한 번 누르면 켜진다)':sound==='mute'?' · 소리 끔(M)':'';
function statLine(d){ status(`${d.level}층 · ${d.min}분 남음 · 체력 ${d.hp}/${d.hpMax}${soundNote()}`); }
addEventListener('message',e=>{
  if(!frame||e.source!==frame.contentWindow||!e.data||e.data.type!=='dh-pe')return;
  const d=e.data;
  if(d.state==='started'){ live=true; statLine(d.detail); }
  else if(d.state==='stat') statLine(d.detail);
  else if(d.state==='need-load') cmd('load-data',{data:bundle?bundle.data:''});
  else if(d.state==='loaded'){ live=true; statLine(d.detail); const u=(bundle&&bundle.summary)||{}; toast(`저장한 판을 불러왔다 · ${[u.title,u.date].filter(Boolean).join(' · ')}. 색상과 음악도 저장할 때 그대로이고, 편집기의 코드는 바뀌지 않는다.`,'ok'); }
  else if(d.state==='loadfail'){ live=false; toast('불러오기 실패: 저장한 판을 게임이 읽지 못했다. 다른 판에서 만든 파일일 수 있다.','error'); }
  else if(d.state==='snap'){ if(snapWait) snapWait(d.detail); }
  else if(d.state==='focus') setFocus(true);
  else if(d.state==='blur') setFocus(false);
  else if(d.state==='sound'){ sound=d.detail; if(sound==='off') status('소리가 잠들어 있다 · 게임 화면을 한 번 클릭하거나 키보드를 한 번 누르면 켜진다'); }
  else if(d.state==='pause') status(d.detail?'일시 정지 · P를 다시 누르면 계속':'계속');
  else if(d.state==='pad') status(d.detail);
  else if(d.state==='ending'){ live=false; status(`모험 끝 · 남은 시간 ${d.detail.min}분`); }
  else if(d.state==='timeover'){ live=false; status('시간이 다 됐다'); }
  else if(d.state==='error'){ live=false; status('게임 오류: '+d.detail,'error'); }
});
code.addEventListener('focus',()=>setFocus(false));
$('#stop').onclick=()=>stop(false);
/* 전체 화면: 게임 틀이 아니라 화면 칸 전체를 띄워 '닫기' 버튼을 함께 보인다. */
const fullEl=()=>document.fullscreenElement||document.webkitFullscreenElement;
/* iPhone Safari처럼 요소 전체 화면을 못 쓰는 곳에서는 화면 칸을 창 가득 채운다(유사 전체 화면). */
const canNativeFull=!!((document.fullscreenEnabled||document.webkitFullscreenEnabled)&&(screen.requestFullscreen||screen.webkitRequestFullscreen));
const isPseudo=()=>screen.classList.contains('pseudo-full');
const isFull=()=>fullEl()===screen||isPseudo();
function setPseudo(on){ screen.classList.toggle('pseudo-full',on); document.documentElement.classList.toggle('pseudo-full-on',on); onFull(); }
function exitFull(){ if(isPseudo()) return setPseudo(false); (document.exitFullscreen||document.webkitExitFullscreen||(()=>{})).call(document); }
let hintTimer=0;
/* 전체 화면의 도구 줄 자리: 게임 화면 오른쪽의 검은 띠가 줄보다 좁으면 세로로 세워 게임 화면을 가리지 않게 한다.
   세운 줄도 들어가지 않으면(세로로 든 휴대폰) 본래대로 오른쪽 위에 둔다. */
function placeTools(){
  const t=$('#full-tools'); if(t.hidden)return;
  t.className='full-tools';
  let band=Infinity;
  try{ const c=frame&&frame.contentDocument&&frame.contentDocument.getElementById('screen'); if(c){ const r=c.getBoundingClientRect(), f=frame.getBoundingClientRect(), b=screen.getBoundingClientRect(); if(r.width>0){ const dw=Math.min(r.width,r.height*320/288); band=b.right-(f.left+r.left+(r.width+dw)/2); } } }catch(e){}
  if(band>=t.offsetWidth+16) return;
  t.classList.add('column','tight');
  if(band<t.offsetWidth+16) t.className='full-tools';
}
addEventListener('resize',()=>placeTools());
function onFull(){ const on=isFull(); $('#full-tools').hidden=!on; if(!on) $('#fs-note').hidden=true; placeTools(); setTimeout(placeTools,150); setTimeout(placeTools,600); $('#full').textContent=on?'전체 화면 닫기':'전체 화면';
  clearTimeout(hintTimer); $('#full-hint').hidden=!on; if(on) hintTimer=setTimeout(()=>$('#full-hint').hidden=true,5000);
  setTimeout(giveFocus,50); }
document.addEventListener('fullscreenchange',onFull); document.addEventListener('webkitfullscreenchange',onFull);
$('#exit-full').onclick=exitFull;
$('#full').onclick=()=>{ if(!frame)return; if(isFull()) return exitFull();
  if(!canNativeFull) return setPseudo(true);
  try{ const r=screen.requestFullscreen?screen.requestFullscreen():screen.webkitRequestFullscreen();
    if(r&&r.catch) r.catch(()=>setPseudo(true)); }catch(e){ setPseudo(true); } };

/* ---------- 저장 · 불러오기(동현삼 · 동현전과 같은 규칙): 브라우저 칸 3개 + .dhsave 파일 ----------
   메뉴는 화면 가운데 뜨고(전체 화면에서도), 떠 있는 동안 게임은 멎는다. 칸은 이 기기의 이 브라우저에만 남는다.
   저장 묶음에는 그 순간 게임의 기억 장치가 들어간다. 불러올 때는 게임 틀을 새로 띄우고 그 묶음을 그대로 되살린다.
   층을 넘을 때 저절로 적히는 '이어하기'(donghyunpe.save.v1)와는 따로 둔다. */
const SAVE={format:'donghyunpe-save-1',slot:'donghyunpe.slot.',file:'donghyunpe',name:'동현페'};
const SLOTS=3, menuBack=$('#menu-back'), menuEl=$('#menu');
let snap=null, busy=false, noteTimer=0;
const el=(tag,text)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;return e;};
const clip=(v,n=40)=>String(v??'').slice(0,n);
const eul=n=>(n===2?'를':'을');                // 칸 1을 · 칸 2를 · 칸 3을
const valid=d=>!!d&&typeof d==='object'&&d.format===SAVE.format&&typeof d.data==='string'&&d.data.length>1000&&d.data.length<4e5;
/* 저장할 때의 설정. 범위를 벗어난 값이 섞여 있으면 기본값으로 바꾼다 */
/* v0.40부터 넷째 값이 벽돌색(0 노랑 · 1 본래 색)에서 색상(0 그레이스케일 · 1 컬러 · 2 본래 색)으로 바뀌었다.
   그 전 판에서 저장한 묶음은 노랑을 컬러로, 본래 색을 본래 색으로 옮겨 읽는다 */
const oldSave=d=>{ const v=parseFloat(d&&d.lab); return v>0&&v<0.4; };
const setOf=d=>{ const o={}, s=(d&&d.set)||{}; for(const f of FIELDS){ const v=s[f.key]; o[f.key]=Number.isInteger(v)&&v>=f.min&&v<=f.max?v:f.def; }
  if(oldSave(d)) o.b=s.b===1?2:1; return o; };
/* 옛 묶음의 요약 글도 지금 말로 바꿔 보인다 */
const lineOf=d=>{ const t=(d&&d.summary&&d.summary.line)||''; return oldSave(d)?t.replace('벽돌색 노랑','색상 컬러').replace('벽돌색 본래 색','색상 본래 색'):t; };
/* 결과 알림: 상태 줄과 코드 아래 글에 적고, 전체 화면에서는 화면 위쪽에 4초 동안 띄운다 */
function toast(text,kind){ if(kind==='error') status(text,'error'); result(text,kind==='error'?'error':''); const n=$('#fs-note'); clearTimeout(noteTimer);
  if(isFull()){ $('#full-hint').hidden=true; n.textContent=text; n.dataset.kind=kind||''; n.hidden=false; noteTimer=setTimeout(()=>n.hidden=true,4000); } else n.hidden=true; }
const hold=on=>cmd('hold',{on:!!on});
function cannotSave(){ if(!frame) return '아직 판을 시작하지 않았다. 출전을 누르면 시작한다.'; if(!live) return '지금은 저장할 판이 없다. 게임이 진행 중일 때 저장하자.'; return ''; }
/* 게임에 지금 판을 묶어 달라고 하고, 받은 것에 설정과 요약을 붙인다 */
function snapshot(){ return new Promise((ok,no)=>{
  const t=setTimeout(()=>{ if(snapWait) snapWait(undefined); },4000);
  snapWait=d=>{ clearTimeout(t); snapWait=null;
    if(d===undefined) return no(new Error('게임이 답하지 않는다. 잠시 뒤에 다시 해 보자.'));
    if(!d||!d.ok||typeof d.data!=='string') return no(new Error('지금은 저장할 판이 없다. 게임이 진행 중일 때 저장하자.'));
    const i=d.info||{}, s=current||DEF;
    ok({format:SAVE.format,lab:(/v([\d.]+)/.exec($('.edition').textContent)||[])[1]||'',savedAt:new Date().toISOString(),set:{...s},
      summary:{title:`${i.level}층`,date:`남은 시간 ${i.min}분 ${i.sec}초`,line:`체력 ${i.hp}/${i.hpMax} · 색상 ${colorName(s.b)} · 음악 ${musicName(s.m)}`},data:d.data}); };
  cmd('save'); }); }
function readSlot(n){ try{ const t=localStorage.getItem(SAVE.slot+n), d=t?JSON.parse(t):null; return valid(d)?d:null; }catch(e){ return null; } }
function slotNote(d){
  if(!d) return '비어 있음';
  const u=d.summary||{}, t=new Date(d.savedAt), pad=v=>String(v).padStart(2,'0'), when=isNaN(t)?'':` · ${t.getMonth()+1}/${t.getDate()} ${pad(t.getHours())}:${pad(t.getMinutes())} 저장`;
  return [u.title,u.date,lineOf(d)].filter(Boolean).map(x=>clip(x)).join(' · ')+when;
}
function saveToSlot(n){
  const d=snap; if(!d)return;
  try{ localStorage.setItem(SAVE.slot+n,JSON.stringify(d)); }catch(e){ return toast('브라우저 칸에 적지 못했다. 파일로 내려받아 저장하자.','error'); }
  toast(`브라우저 칸 ${n}에 저장했다 · ${d.summary.title} · ${d.summary.date}`,'ok'); renderSlotList();
}
function saveToFile(){
  const d=snap; if(!d)return;
  const a=document.createElement('a'), name=`${SAVE.file}-${d.summary.title}-${d.summary.date}`.replace(/[\\/:*?"<>|\s]+/g,'');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(d)],{type:'application/json'})); a.download=name+'.dhsave'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  toast(`.dhsave 파일로 내려받았다 · ${d.summary.title} · ${d.summary.date}`,'ok');
}
/* 저장 묶음으로 판을 연다. 게임 틀을 새로 띄우므로 하던 판은 사라진다 */
function loadFrom(d){
  if(!valid(d)) return toast(`불러오기 실패: ${SAVE.name} 저장 파일이 아니다.`,'error');
  const s=setOf(d); setCard(s); result('저장한 판을 여는 중이다.'); launch(s,false,d);
}
const playing=()=>!!frame&&live;
async function loadFile(input,back){
  const f=input.files[0]; input.value=''; if(!f)return;
  let d=null; try{ if(f.size<=1e6) d=JSON.parse(await f.text()); }catch(e){ d=null; }
  if(!valid(d)) return toast(`불러오기 실패: ${SAVE.name} 저장 파일이 아니다.`+(playing()?' 하던 판은 그대로 두었다.':''),'error');
  if(!playing()) return loadFrom(d);
  confirmMenu(`${slotNote(d)}\n지금 판을 두고 이 파일을 불러올까? 저장하지 않은 진행은 사라진다.`,[['불러온다',()=>loadFrom(d)],['그만둔다',back||null]],back||null);
}
/* 메뉴: items = [{label, note, off, fn}] 또는 [label, fn]. 고르면 닫히고 fn을 부른다. Esc와 바깥 누르기는 onCancel(없으면 그냥 닫기) */
function openMenu(title,items,onCancel,text){
  hold(true);
  menu={items:items.map(it=>(Array.isArray(it)?{label:it[0],fn:it[1]}:it)),onCancel};
  const h=el('h4',title); h.id='menu-title'; menuEl.replaceChildren(h);
  if(text){ const q=el('p',text); q.className='menu-text'; menuEl.append(q); }
  menu.items.forEach((it,i)=>{ const b=el('button'); b.type='button'; b.className='mi'; b.dataset.i=i; b.disabled=!!it.off; b.append(el('span',it.label)); if(it.note) b.append(el('small',it.note)); menuEl.append(b); });
  menuBack.hidden=false;
  const first=menuEl.querySelector('.mi:not(:disabled)'); if(first) first.focus({preventScroll:true});
}
/* 닫고 fn을 부른다. fn이 다음 메뉴를 열지 않았을 때만 게임이 이어지고 키보드가 다시 게임에 듣는다(다음 메뉴가 뜨면 계속 멎어 있다) */
function closeMenu(fn){ if(!menu)return; menu=null; menuBack.hidden=true; if(fn) fn(); if(!menu){ hold(false); giveFocus(); } }
function cancelMenu(){ closeMenu(menu&&menu.onCancel); }
function confirmMenu(q,opts,back){ const [title,...rest]=q.split('\n'); openMenu(rest.length?rest.join(' '):title,opts,back,rest.length?title:''); }
menuEl.addEventListener('click',e=>{ const b=e.target.closest('.mi'); if(!b||!menu)return; const it=menu.items[+b.dataset.i]; if(!it||it.off)return; closeMenu(it.fn); });
menuBack.addEventListener('click',e=>{ if(e.target===menuBack) cancelMenu(); });
menuBack.addEventListener('keydown',e=>{
  if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); return cancelMenu(); }
  const list=[...menuEl.querySelectorAll('.mi:not(:disabled)')], i=list.indexOf(document.activeElement), d=e.key==='ArrowDown'?1:e.key==='ArrowUp'?-1:0;
  if(d&&list.length){ e.preventDefault(); list[(i+d+list.length)%list.length].focus(); }
  else if(e.key==='Tab'&&list.length){ e.preventDefault(); list[(i+(e.shiftKey?-1:1)+list.length)%list.length].focus(); }      // 메뉴 밖으로 나가지 않는다
});
/* 저장: 먼저 게임을 멈추고 지금 판을 받아 둔 다음, 어디에 둘지 묻는다 */
async function saveMenu(){
  if(menu||busy)return;
  const why=cannotSave(); if(why) return openMenu('지금은 저장할 수 없다',[['돌아가기',null]],null,why);
  busy=true; hold(true);
  try{ snap=await snapshot(); }catch(e){ busy=false; return openMenu('저장하지 못했다',[['돌아가기',null]],null,e.message); }
  busy=false; saveItems();
}
function saveItems(){
  const d0=snap; if(!d0)return; const items=[];
  for(let n=1;n<=SLOTS;n++){ const d=readSlot(n); items.push({label:`브라우저 칸 ${n}`,note:slotNote(d),fn:()=>(d?confirmMenu(`칸 ${n}에 덮어쓸까?`,[['덮어쓴다',()=>saveToSlot(n)],['그만둔다',saveItems]],saveItems):saveToSlot(n))}); }
  items.push({label:'파일로 내려받기',note:'.dhsave',fn:saveToFile},{label:'칸 지우기',fn:deleteMenu},['돌아가기',null]);
  openMenu('저장',items,null,`${d0.summary.title} · ${d0.summary.date} · ${d0.summary.line}. 칸은 이 기기의 이 브라우저에만 남는다. 다른 기기로 옮기려면 파일로 내려받는다.`);
}
function deleteMenu(){
  const items=[];
  for(let n=1;n<=SLOTS;n++){ const d=readSlot(n); items.push({label:`브라우저 칸 ${n}`,note:slotNote(d),off:!d,
    fn:()=>confirmMenu(`칸 ${n}${eul(n)} 지울까? 되돌릴 수 없다.`,[['지운다',()=>{ try{localStorage.removeItem(SAVE.slot+n);}catch(e){} toast(`브라우저 칸 ${n}${eul(n)} 지웠다`); renderSlotList(); deleteMenu(); }],['그만둔다',deleteMenu]],deleteMenu)}); }
  items.push(['돌아가기',saveItems]); openMenu('칸 지우기',items,saveItems);
}
function loadMenu(){
  if(menu||busy)return; const items=[], on=playing();
  for(let n=1;n<=SLOTS;n++){ const d=readSlot(n); items.push({label:`브라우저 칸 ${n}`,note:slotNote(d),off:!d,
    fn:()=>(on?confirmMenu(`지금 판을 두고 칸 ${n}${eul(n)} 불러올까? 저장하지 않은 진행은 사라진다.`,[['불러온다',()=>loadFrom(readSlot(n))],['그만둔다',loadMenu]],loadMenu):loadFrom(readSlot(n)))}); }
  items.push({label:'파일에서 불러오기',note:'.dhsave',fn:()=>$('#load-file').click()},['돌아가기',null]);
  openMenu('불러오기',items,null,'불러오면 저장한 그 순간부터 이어 한다. 색상과 음악도 저장할 때 그대로이고, 편집기의 코드는 바뀌지 않는다.');
}
for(const id of ['#game-save','#fs-save']) $(id).onclick=saveMenu;
for(const id of ['#game-load','#fs-load']) $(id).onclick=loadMenu;
$('#load-file').onchange=e=>loadFile(e.target,loadMenu);
/* 동현랭 코드 칸 아래의 목록: 브라우저 칸 셋과 파일. 하던 판이 없으면 누르면 바로 열고, 있으면 한 번 묻는다. 지우기는 두 번 눌러야 지운다 */
$('#load-file-setup').onchange=e=>loadFile(e.target,null);
document.querySelector('.load-head label').addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); $('#load-file-setup').click(); } });
function renderSlotList(){
  const box=$('#slot-list'); if(!box)return; box.replaceChildren();
  for(let n=1;n<=SLOTS;n++){
    const d=readSlot(n), b=el('button'), row=el('div'), u=(d&&d.summary)||{}; b.type='button'; b.className='slot-btn'; b.disabled=!d; row.className='slot-row';
    b.append(el('b',`칸 ${n}`),el('span',d?slotNote({...d,summary:{title:u.title,date:u.date}}):slotNote(null))); if(d&&u.line) b.append(el('small',clip(lineOf(d))));
    b.onclick=()=>{ const s=readSlot(n); if(!s) return renderSlotList(); if(!playing()) loadFrom(s); else confirmMenu(`지금 판을 두고 칸 ${n}${eul(n)} 불러올까? 저장하지 않은 진행은 사라진다.`,[['불러온다',()=>loadFrom(readSlot(n))],['그만둔다',null]]); };
    row.append(b);
    if(d){ const x=el('button','지우기'); x.type='button'; x.className='slot-del'; x.setAttribute('aria-label',`칸 ${n} 지우기`); let t=0;
      x.onclick=()=>{ if(!x.classList.contains('armed')){ x.classList.add('armed'); x.textContent='정말 지운다'; t=setTimeout(()=>{ x.classList.remove('armed'); x.textContent='지우기'; },4000); return; }
        clearTimeout(t); try{localStorage.removeItem(SAVE.slot+n);}catch(e){} renderSlotList(); status(`브라우저 칸 ${n}${eul(n)} 지웠다.`); };
      row.append(x); }
    box.append(row);
  }
}
addEventListener('storage',e=>{ if(!e.key||e.key.startsWith(SAVE.slot)) renderSlotList(); });      // 다른 창에서 저장하거나 지운 것도 따라 보인다
renderSlotList();

function start(cont){
  let out;
  try{ out=Donghyun.run(code.value,{maxSteps:300000}).output; }
  catch(e){ result(`동현랭 오류${e.line?` (${e.line}줄)`:''}: ${e.message}`,'error'); status('동현랭 오류','error'); return; }
  const p=parseSortie(out);
  if(p.err){ result('동현페 규약 오류: '+p.err,'error'); status('규약 오류','error'); return; }
  const s=p.set, sv=cont?readSave():null; setCard(s);
  result((p.note?p.note+' ':'')+(sv?`저장한 ${sv.level}층 · ${sv.min}분 · 체력 ${sv.hp}칸에서 잇는다. 색상 ${colorName(s.b)} · 음악 ${musicName(s.m)}은 지금 코드 값을 따른다.`:`${s.l}층 · 남은 시간 ${s.t}분 · 체력 ${s.h}칸 · 색상 ${colorName(s.b)} · 음악 ${musicName(s.m)}. 이 설정으로 나선다.`)+(TOUCH_ONLY?' 게임 화면 아래의 화면 단추로 움직인다.':' 게임 화면을 누르면 키보드가 게임으로 간다.'));
  launch(s,!!sv);
}
$('#poster-run').onclick=()=>start(false);
$('#poster-cont').onclick=()=>start(true);

/* 첫 화면: 예제 01의 값을 보여 주고, 게임은 출전을 누를 때 불러온다 */
/* 예제를 고르면, 하고 있는 판이 없을 때 그 값을 설정 카드와 시작 카드에 미리 보인다(색상에 따라 시작 카드의 색도 바뀐다) */
function previewCard(){ if(frame) return; try{ const p=parseSortie(Donghyun.run(code.value,{maxSteps:300000}).output); if(p.set) setCard(p.set); }catch(e){} }
(function preview(){try{const p=parseSortie(Donghyun.run(code.value,{maxSteps:300000}).output);if(p.set)setCard(p.set);}catch(e){setCard(DEF);}contButton();})();
if(typeof window!=='undefined') window.PeLab={parseSortie,FIELDS,SAVE,readSlot,setOf,colorName};
})();
