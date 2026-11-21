/* 동현페 예제. 동현랭이 출력한 정수 다섯 개가 차례로 시작 층 · 남은 시간(분) · 체력 칸 · 벽돌색 · 음악이다. */
function expression(n){
  if(n===0)return '도옹ㅠ';
  if(n<0)return 'ㅠ '+expression(-n);
  if(n<=10)return '도'+'오'.repeat(n-1)+'옹';
  for(let a=10;a>=2;a--)if(n%a===0)return expression(a)+' '+expression(n/a);
  return '도'+'오'.repeat(n-1)+'옹';
}
const output=n=>'뿡뿡 '+expression(n)+'~뿡뿡뿡';
const wrap=a=>['나는 동현이냐?',...a,'동현이구나'].join('\n');
const LABELS=['시작 층','남은 시간(분)','체력 칸','벽돌색(0 노랑 · 1 본래 색)','음악(0 끔 · 1 켬)'];
const sortie=(label,v)=>wrap(['ㅋㅋ '+label,...v.flatMap((n,i)=>['ㅋㅋ '+LABELS[i]+' '+n,output(n)])]);
const examples=[
 {id:'basic',title:'01 · 기본 (1층 · 60분)',note:'1층에서 60분, 체력 세 칸으로 시작한다. 벽돌은 노랑, 음악은 끈다. 효과음은 늘 난다.',code:sortie('기본 출전',[1,60,3,0,0])},
 {id:'stroll',title:'02 · 느긋한 산책 (체력 9칸)',note:'체력 아홉 칸으로 1층부터 걷는다. 가시와 높은 곳은 체력과 상관없이 위험하다.',code:sortie('느긋한 산책',[1,60,9,0,0])},
 {id:'palace',title:'03 · 궁전 구경 (4층 · 본래 색)',note:'4층에서 시작하고, 벽돌색은 층마다 다른 본래 색으로 둔다. 노랑(0)과 견주어 보자.',code:sortie('궁전 구경 · 본래 색',[4,45,3,1,0])},
 {id:'music',title:'04 · 음악과 함께 (7층)',note:'7층에서 음악을 켜고 시작한다. 음악은 원작의 곡이다.',code:sortie('음악 켜기',[7,35,4,0,1])},
 {id:'rush',title:'05 · 15분 돌파 (12층 · 체력 1칸)',note:'12층에서 15분, 체력 한 칸. 한 번만 다쳐도 쓰러진다. 쓰러지면 Enter로 그 층을 다시 시작하지만 시간은 돌아오지 않는다.',code:sortie('15분 돌파',[12,15,1,0,0])},
 {id:'calc',title:'06 · 계산해서 정하기',note:'남은 시간을 직접 계산한다. 남은 시간 = 64 − 층 × 4. 9층이라면 28분이다. 변수 동현(층)에 −4를 곱해 동동현에, 64를 동동동현에 담고, 둘을 붙여 써서 더한다.',
  code:['나는 동현이냐?','ㅋㅋ 시작 층 9를 동현에 담는다','동현아 '+expression(9),'ㅋㅋ 시작 층','뿡뿡 동현~뿡뿡뿡','ㅋㅋ 남은 시간 = 64 − 층 × 4','동동현아 ㅠ 동현 '+expression(4),'동동동현아 '+expression(64),'ㅋㅋ 붙여 쓰면 더한다','뿡뿡 동동현동동동현~뿡뿡뿡','ㅋㅋ 체력 칸 3',output(3),'ㅋㅋ 벽돌색 0 · 음악 0',output(0),output(0),'동현이구나'].join('\n')}
];
if(typeof module!=='undefined')module.exports={examples,expression,LABELS};
