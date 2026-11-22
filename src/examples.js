/* 동현페 예제. 동현랭이 출력한 정수 다섯 개가 차례로 시작 층 · 남은 시간(분) · 체력 칸 · 색상 · 음악이다.
   여섯 가지 출전을 색상만 바꾸어 그레이스케일(0)과 컬러(1)로 짝지었다. 홀수 번호가 그레이스케일, 짝수 번호가 컬러다. */
function expression(n){
  if(n===0)return '도옹ㅠ';
  if(n<0)return 'ㅠ '+expression(-n);
  if(n<=10)return '도'+'오'.repeat(n-1)+'옹';
  for(let a=10;a>=2;a--)if(n%a===0)return expression(a)+' '+expression(n/a);
  return '도'+'오'.repeat(n-1)+'옹';
}
const output=n=>'뿡뿡 '+expression(n)+'~뿡뿡뿡';
const wrap=a=>['나는 동현이냐?',...a,'동현이구나'].join('\n');
const LABELS=['시작 층','남은 시간(분)','체력 칸','색상(0 그레이스케일 · 1 컬러 · 2 본래 색)','음악(0 끔 · 1 켬)'];
const COLORS=['그레이스케일','컬러'];
const sortie=(label,v)=>wrap(['ㅋㅋ '+label,...v.flatMap((n,i)=>['ㅋㅋ '+LABELS[i]+' '+n,output(n)])]);
const calc=c=>['나는 동현이냐?','ㅋㅋ 시작 층 9를 동현에 담는다','동현아 '+expression(9),'ㅋㅋ 시작 층','뿡뿡 동현~뿡뿡뿡','ㅋㅋ 남은 시간 = 64 − 층 × 4','동동현아 ㅠ 동현 '+expression(4),'동동동현아 '+expression(64),'ㅋㅋ 붙여 쓰면 더한다','뿡뿡 동동현동동동현~뿡뿡뿡','ㅋㅋ 체력 칸 3',output(3),'ㅋㅋ 색상 '+c+' · 음악 1',output(c),output(1),'동현이구나'].join('\n');
/* 여섯 가지 출전. note는 색상 값마다 끝에 붙는 말(tone)과 함께 쓴다 */
const BASE=[
 {id:'basic',name:'기본',tag:'1층 · 60분',set:[1,60,3,1],note:'1층에서 60분, 체력 세 칸으로 시작한다. 음악은 켠다. 효과음은 음악 값과 상관없이 늘 난다.'},
 {id:'stroll',name:'느긋한 산책',tag:'체력 9칸',set:[1,60,9,1],note:'체력 아홉 칸으로 1층부터 걷는다. 가시와 높은 곳은 체력과 상관없이 위험하다.'},
 {id:'palace',name:'궁전 구경',tag:'4층',set:[4,45,3,1],note:'4층 궁전에서 45분으로 시작한다. 넷째 값을 2로 바꾸면 원작의 본래 색으로 볼 수 있다.'},
 {id:'music',name:'일곱째 층에서',tag:'7층 · 체력 4칸',set:[7,35,4,1],note:'7층에서 35분, 체력 네 칸으로 시작한다. 마지막 값(음악)을 0으로 바꾸면 원작의 짧은 곡은 나지 않고 효과음만 난다.'},
 {id:'rush',name:'15분 돌파',tag:'12층 · 체력 1칸',set:[12,15,1,1],note:'12층에서 15분, 체력 한 칸. 한 번만 다쳐도 쓰러진다. 쓰러지면 Enter로 그 층을 다시 시작하지만 시간은 돌아오지 않는다.'},
 {id:'calc',name:'계산해서 정하기',tag:'9층 · 28분',set:[9,28,3,1],note:'남은 시간을 직접 계산한다. 남은 시간 = 64 − 층 × 4. 9층이라면 28분이다. 변수 동현(층)에 −4를 곱해 동동현에, 64를 동동동현에 담고, 둘을 붙여 써서 더한다.'}
];
const TONE=['색상은 그레이스케일(0)이다. 흰 형광체 모니터에 띄운 네 단계 회색으로 그린다.','색상은 컬러(1)다. 버터빛 벽돌과 짙은 남보라 바탕의 파스텔로 그린다.'];
const examples=BASE.flatMap((b,k)=>[0,1].map(c=>{
  const v=[b.set[0],b.set[1],b.set[2],c,b.set[3]], no=String(k*2+c+1).padStart(2,'0');
  return {id:b.id+(c?'-color':''),title:`${no} · ${b.name} · ${COLORS[c]} (${b.tag})`,note:b.note+' '+TONE[c],code:b.id==='calc'?calc(c):sortie(b.name+' · '+COLORS[c],v)};
}));
if(typeof module!=='undefined')module.exports={examples,expression,LABELS};
