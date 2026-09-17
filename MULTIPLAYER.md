# LAST FIELD v3.1 — Vercel 멀티플레이

## 플레이

1. **친구와 플레이**에서 닉네임을 입력하고 **새 방 만들기**를 누릅니다.
2. **초대 링크 복사**로 링크를 보내거나 영문·숫자 6자리 코드를 공유합니다.
3. 참가자 2~8명이 **준비 완료**를 누르면 방장이 경기를 시작합니다.
4. 모두 다른 위치에서 맨손으로 시작합니다. 가까운 소총·탄약·구급팩·방탄복을 획득하세요.
5. 최후의 생존자가 승리합니다. 방장은 **다음 경기 준비**로 같은 방에서 다시 시작할 수 있습니다.

PC와 모바일은 같은 방에 들어갑니다. 모바일은 기존 터치 버튼 및 배치 설정을 사용합니다. 온라인에서 메뉴를 열거나 다른 탭으로 이동해도 전투와 자기장은 계속됩니다. 탈락자는 해당 경기에서 다시 살아나지 않습니다.

## 로컬 실행

Node.js 22 이상에서:

```sh
npm ci
npm start
```

`http://127.0.0.1:8780/`을 브라우저 두 창에서 열어 방 생성·입장을 테스트할 수 있습니다. 로컬은 메모리 저장소를 사용하므로 별도 가입 없이 실행됩니다. 로컬 서버를 재시작하면 방은 없어집니다.

같은 Wi-Fi의 휴대폰에서 테스트하려면:

```sh
HOST=0.0.0.0 npm start
```

휴대폰은 `http://<Mac의 Wi-Fi IP>:8780/`으로 접속합니다. `127.0.0.1`은 다른 기기에서 사용할 수 없습니다. 파일을 열거나 Python 정적 서버로 실행할 때는 싱글플레이만 됩니다.

## Vercel 배포 설정

**Vercel 화면 + Vercel WebSocket Function + Redis** 구성입니다. Redis Cloud 같은 일반 `redis://` 엔드포인트와 Upstash REST 중 하나를 고르면 됩니다. 별도 장기 실행 Node 서버를 관리할 필요가 없습니다. Colyseus 런타임은 사용하지 않습니다. Vercel의 서로 다른 함수 인스턴스 사이에서 경기 상태를 공유하도록 구현했습니다.

1. Redis 데이터베이스를 준비합니다. 게임은 지속적으로 상태를 갱신하므로 Redis 요청 사용량이 발생합니다. 플랜과 요금은 생성 화면에서 확인하세요.
2. 다음 **서버 환경 변수**를 Production에 설정합니다. Preview도 사용할 때는 Preview에도 설정합니다.

   **A. Redis Cloud 등 일반 Redis (권장)** — 콘솔의 Connect 화면에서 연결 문자열을 복사합니다.
   - `REDIS_URL` = `redis://default:<password>@<host>:<port>` (TLS를 켰다면 `rediss://`)

   `KV_URL` / `REDIS_URI` 이름도 자동 인식합니다.

   **B. Upstash REST**
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

   Vercel이 `KV_REST_API_URL` / `KV_REST_API_TOKEN` 쌍으로 생성한 경우도 자동 인식합니다. 두 이름 체계를 섞지 마세요. `KV_REST_API_READ_ONLY_TOKEN`은 사용할 수 없습니다. REST URL은 `https://`로 시작합니다.

   `REDIS_URL`이 있으면 A를, 없으면 B를 사용합니다. 둘 다 없으면 Vercel에서는 멀티플레이가 비활성화됩니다.

3. Runtime은 Node.js 22 이상, Framework Preset은 **Other**, Build Command는 `npm run build`, Output Directory는 `dist`입니다. 저장소의 `vercel.json`에 설정돼 있습니다. 기존 프로젝트에서 별도로 지정한 빌드 설정이 있으면 맞춰 주세요.
4. Vercel Function과 Redis는 가능한 가까운 지역으로 설정하세요. 저장소 왕복 지연이 전투 반응 속도에 영향을 줍니다.
5. 변경사항을 배포합니다. `/api/health`가 HTTP 200, `storage: "redis"`를 반환하는지 확인합니다. 실제 Redis PING 결과를 검사합니다(15초 캐시). 쓰기·Lua·WebSocket 경로는 아래 배포 검증 명령으로 확인합니다.
6. 브라우저 두 대로 방 생성 → 입장 → 준비 → 사격·파밍 → 재접속을 확인합니다.

**연결 문자열과 토큰은 채팅이나 프런트엔드 코드에 넣지 않습니다.** `REDIS_URL`에는 비밀번호가 그대로 들어 있습니다. 노출됐다면 콘솔에서 비밀번호를 교체하세요. 서버 함수에서만 읽습니다. Redis 미설정 상태의 Vercel에서는 멀티플레이 설정 안내를 표시하고, 싱글플레이는 계속 사용할 수 있습니다.

Vercel 네이티브 WebSocket 지원은 현재 Beta입니다. 사용 계정에서 이 기능이 제공되어야 합니다. `/api/ws`는 일반 브라우저 탐색이 아닌 WebSocket 연결용 경로이며, HTTP로 열면 426을 반환합니다.

## 구현

- `shared/world.js`: 클라이언트·서버가 함께 사용하는 맵 배치, 충돌 및 사격 차폐 형상.
- `server/simulation.cjs`: 이동 속도, 탄약, 발사 간격, 피격, 치료, 파밍, 자기장, 승패를 서버에서 판정합니다. 클라이언트 위치·피격 대상·체력 값을 신뢰하지 않습니다.
- `server/room-state.cjs`: 닉네임·준비·방장 교체·재접속 세션과 경기 상태 저장/복구.
- `server/store.cjs`: Redis Lua로 한 서버 인스턴스만 경기 진행을 확정하게 하고, 이전 인스턴스의 늦은 쓰기를 거절합니다. 같은 Redis 슬롯을 쓰는 키를 사용합니다.
- `server/transport.cjs` / `api/ws.js`: 같은 출처의 보안 WebSocket 연결, 메시지 제한, 방 참가 및 주기적 상태 전송.
- `online.js`: 초대 코드 UI, 연결 상태 및 자동 재접속. 재접속 토큰은 해당 탭의 sessionStorage에 저장합니다.
- `game.js`: 상대 캐릭터, 이동 보간, 로컬 이동 예측, 서버가 확정한 인벤토리·전투 결과 표시.

물리 계산은 최대 50ms 간격, 상태 전송과 입력 갱신은 기본 100ms 간격입니다. 함수 연결이 종료되면 클라이언트가 재접속하고 Redis에 저장된 경기를 이어받습니다. 재접속 유예는 끊김 감지 후 15초이며, 연결이 끊긴 캐릭터도 피격·자기장 피해를 받습니다. 게임 데이터는 마지막 갱신 후 15분 만료됩니다.

## 검증과 현재 범위

```sh
npm test
npm run build
```

검사에는 방 정원·준비/방장 권한, 두 서버 인스턴스 간 상태 공유, 실제 WebSocket 파밍·이동·사격·승패, 재접속 토큰 및 이전 연결 차단, 사격/이동 속도 검증, 벽 차폐, 중복 파밍 방지, 재장전·치료·자기장, 서버 소유권 변경 및 오래된 상태 쓰기 거부가 포함됩니다.

기본 두 서버 테스트는 공유 메모리 저장소를 사용합니다. 추가로 `TEST_REDIS_URL`을 지정하면 실제 Redis에 대해 두 가지 경로를 검증합니다: 로컬 HTTP REST 어댑터를 통한 Upstash 경로와, `redis://` 소켓 저장소 직접 경로. 두 경우 모두 같은 Lua 스크립트·방 공유·사격·승패·재접속을 확인합니다. Upstash 자체의 HTTP 서비스 검증과는 구분됩니다. 실제 Vercel/Upstash 배포와 iPhone 하드웨어에서는 아직 검증하지 않았습니다. 경쟁 FPS용 과거 시점 명중 보정, 회원가입·순위 DB, 음성 채팅은 포함하지 않은 소규모 개인전 프로토타입입니다.

공식 참고:
- https://vercel.com/docs/functions/websockets
- https://upstash.com/docs/redis/features/restapi

## MongoDB 화면을 보고 있다면

서비스 이름이 `redis-test`여도 공급자가 **MongoDB Atlas**이면 이 게임의 Redis 저장소가 아닙니다. Redis Cloud를 쓴다면 Vercel Storage를 거치지 않고 Settings → Environment Variables에 `REDIS_URL`만 직접 넣으면 됩니다.

- Redis Cloud 콘솔 → Databases → 대상 DB → Connect → 연결 문자열 복사
- Vercel 프로젝트 → Settings → Environment Variables → `REDIS_URL` 추가 (Production, 필요하면 Preview)
- Upstash를 쓸 경우에만: Storage → Create Database → Upstash Redis → Connect to Project
- 이 저장소의 v3.1 변경사항 전체를 커밋·푸시 → 새 배포 확인
- 환경 변수만 바꿨다면 Deployments → 해당 배포 메뉴 → Redeploy

`/api/health`가 **404**면 아직 API가 포함된 코드가 배포되지 않은 것입니다. **503**이면 Redis 설정 또는 연결 문제입니다. **200**과 `storage: "redis"`가 나와야 클라우드 연결이 확인됩니다.

## 배포 후 자동 검증

```sh
npm run verify:deployment -- https://vercel-test-cyan-nine.vercel.app/
```

임시 방에서 두 테스트 클라이언트로 참가·시작·파밍·재접속·사격·승패를 검사한 뒤 나갑니다. 그래픽 파일도 검사합니다. Redis 토큰은 필요하지 않습니다. 방 코드는 사용자 방과 별도로 생성합니다.

실제 Redis를 이용한 로컬 통합 테스트:

```sh
docker run --rm -d --name last-field-redis-test -p 127.0.0.1:16379:6379 redis:7-alpine
TEST_REDIS_URL=redis://127.0.0.1:16379 npm test
docker stop last-field-redis-test
```

실제 iPhone에서는 Safari로 HTTPS 배포 주소를 열고, 가로/세로 전환 → 이동하면서 조준·발사 → 획득·재장전 → 앱 전환 후 복귀를 확인해야 합니다. 데스크톱의 가벼운 모드 및 터치 버튼 테스트로 iPhone GPU·메모리 검증을 대신할 수 없습니다.
