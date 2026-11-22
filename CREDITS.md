# 출처와 권리

## 원작
- Prince of Persia 게임보이 컬러판(1999). 개발 Ed Magnin and Associates, 배급 Red Orb Entertainment. 원작자 Jordan Mechner. 음악 Francis Mechner·Tommy Tallarico.
  - https://www.mobygames.com/game/196/prince-of-persia/releases/
  - https://www.nintendolife.com/reviews/2012/01/prince_of_persia_3dsvc
  - https://www.vgmpf.com/Wiki/index.php?title=Prince_of_Persia_(GB)
- `pe/data.js`: 원작 롬에서 게임이 실제로 읽는 228,169바이트(층 자료, 배경 그림, 소리 자료, 표)만 담았다. 나머지 자리는 비웠다.
- `pe/core.js`의 프로그램 부분: 원작 프로그램에서 실제로 쓰이는 명령 7,582개를 36덩어리의 자바스크립트로 옮긴 것이다.
- 위 두 가지의 권리는 원작 권리자에게 있다. 나는 허락을 받지 않았다. 원작 권리자가 원하면 저장소와 페이지를 바로 내린다. 릴리스 묶음과 Zenodo 보관본에는 이 두 파일(`pe/core.js`, `pe/data.js`)을 넣지 않았다. Prince of Persia는 Ubisoft의 상표다. 동현페는 Ubisoft·Jordan Mechner·Red Orb Entertainment·Ed Magnin and Associates·Nintendo와 관계가 없고 승인도 받지 않은 비상업 취미 작품이다.

## 동현페가 만든 것 (MIT)
- 아몰랑 그림 578장(`pe/atlas.js`, `engine/assets/`): 원작 주인공 그림의 자리와 자세에 맞춰 새로 그렸다.
- 화면·소리 장치(`engine/src/core.tpl.js`의 틀, `engine/src/apu.js`), 그림 바꾸기·기둥 뒤 가림·색상(그레이스케일·파스텔 컬러)·저장(`engine/src/game.js`), 게임 화면(`pe/game.html`), 페이지와 규약·예제.
- 동현랭 실행기 `src/donghyun.js`: 동현랭(https://github.com/Raspberry-Kim/donghyun-lang)을 고치지 않고 썼다. MIT.

## 포동이
- 머리글 그림과 파비콘은 동현랭의 포동이다. 포동이는 내 강아지이고, 포동이의 이름과 모습에 대한 권리는 MIT 라이선스와 별개로 나에게 있다.

## 글꼴 (SIL OFL 1.1)
- Black Han Sans, Nanum Gothic Coding, Pretendard — `licenses/`
