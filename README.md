# DEAD SIGNAL · 격리구역

Babylon.js 기반 싱글플레이 3D 생존 FPS. 감염자 세 차례의 습격을 버틴 뒤 북쪽 EVAC 표지 아래 녹색 원으로 들어가면 탈출합니다.

## 실행 및 배포

별도 빌드나 패키지 설치가 없는 정적 사이트입니다. Vercel 프로젝트의 Framework Preset은 Other, 루트 디렉터리는 이 폴더, Build Command는 비워 둡니다. 기존 vercel.json을 사용합니다.

모바일은 배포된 HTTPS 주소를 Safari 또는 Chrome으로 열어 주세요. iOS에서 카톡 HTML 첨부파일 미리보기로 실행하는 방식은 지원하지 않습니다.

로컬 확인: `python3 -m http.server 8000` 실행 후 http://localhost:8000 접속.

## 조작

- PC: WASD 이동, 마우스 조준, 클릭을 누르고 있으면 연사, Shift 달리기
- R: 재장전 / E: 구급팩 / Esc 또는 Ⅱ: 일시정지
- 마우스 포인터 잠금을 사용할 수 없는 환경: 마우스를 누른 채 드래그하여 조준
- 모바일: 왼쪽 패드 이동, 오른쪽 영역 드래그 조준, 발사·재장전·회복 버튼
- 시작 화면 아래의 조작 방식 버튼으로 마우스와 터치를 전환할 수 있습니다.
- 녹색 보급 상자에 접근하면 탄약을 얻습니다. 습격 사이에도 탄약과 일부 체력을 보충합니다.

## 파일

- index.html: 게임 화면
- style.css: 화면 및 터치 조작 UI
- game.js: 3D 공간, 적 이동, 사격, 게임 진행
- vendor/babylon.js: 로컬로 포함한 Babylon.js 엔진
- vendor/LICENSE-babylon.txt: 엔진 라이선스
- star-dash.html: 기존 STAR DASH 게임 (이전 작업 보존)

오리지널 미니게임이며 Left 4 Dead의 코드·음악·모델은 사용하지 않았습니다. 협동 멀티플레이는 포함하지 않습니다. 실제 iOS 기기 검증은 별도로 필요합니다.
