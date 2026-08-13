# 여행각 백엔드 — 카카오톡 AI 매니저 & 챗봇 & 백오피스 AI

지금은 API 키/카카오 채널이 없는 상태이므로, 아래 순서대로 준비되는 대로 하나씩 연결하면 됩니다.
코드는 이미 완성되어 있어서 **환경변수만 채우면 바로 동작**합니다.

## 0. 로컬에서 먼저 테스트

```bash
cd travel-gak-backend
npm install
cp .env.example .env
# .env 파일 열어서 GEMINI_API_KEY, ADMIN_PASSWORD 채우기
npm start
```

`http://localhost:3000` 접속했을 때 `{"ok":true,...}` 가 뜨면 정상입니다.

웹챗봇 테스트:
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"다낭 여행 얼마나 들어요?"}'
```

---

## 1. Gemini API 키 발급 (필수, 가장 먼저)

1. https://aistudio.google.com/apikey 접속 → 구글 계정으로 로그인 후 API 키 발급 (무료, 카드 등록 불필요)
2. `.env`의 `GEMINI_API_KEY`에 입력
3. 사용 모델은 `gemini-3.6-flash`(Interactions API)로 고정되어 있습니다(`src/aiClient.js`).

---

## 2. 서버 배포 (Render 기준, Railway도 거의 동일)

1. 이 `travel-gak-backend` 폴더를 별도 git 저장소로 만들어 GitHub에 올리기
2. https://render.com → New → Web Service → 방금 만든 저장소 연결
3. Build Command: `npm install` / Start Command: `npm start`
4. Environment 탭에서 `.env.example`에 있는 값들을 그대로 등록
   - `GEMINI_API_KEY`
   - `ADMIN_PASSWORD`
   - `ALLOWED_ORIGIN` (예: `https://travelgak.netlify.app`)
   - `ADMIN_ALERT_WEBHOOK_URL` (5번 참고, 나중에 채워도 됨)
5. 배포되면 `https://travel-gak-backend.onrender.com` 같은 URL이 생김 → 이후 단계에서 이 주소를 씀

---

## 3. 카카오톡 채널 + 챗봇 연결

기존 "오픈채팅방 봇"이 아니라 **카카오톡 채널(공식 챗봇)** 방식을 씁니다 — 훨씬 안정적이고 공식 지원됩니다.

1. **카카오톡 채널 개설**: https://center-pf.kakao.com 에서 비즈니스 채널 생성 (사업자 인증 필요할 수 있음)
2. **카카오 i 오픈빌더**: https://i.kakao.com 접속 → 새 챗봇 생성 → 1번에서 만든 카카오톡 채널과 연결
3. 오픈빌더 좌측 메뉴 **"스킬"** → "스킬 추가"
   - 스킬 URL: `https://<2번에서 배포한 주소>/kakao/webhook`
   - HTTP Method: POST (자동 지정됨)
4. **"시나리오" → 블록** 에서, 사용자가 뭘 물어보든 응답하게 하려면 "폴백 블록"에 방금 만든 스킬을 연결
   (특정 키워드에서만 AI가 응답하게 하려면 원하는 블록에만 연결해도 됨)
5. 우측 상단 **"배포"** 버튼을 눌러야 실제 채널에 반영됩니다 (임시저장만으로는 동작 안 함)
6. 카카오톡에서 채널 추가 후 아무 말이나 보내보면 AI가 답장합니다

### 페르소나
답변 톤은 `src/kb.js`의 `PERSONA_INTRO` (`"안녕하세요! 여행각 AI 매니저입니다 ✈️"`) 를 기준으로
`src/aiClient.js`의 시스템 프롬프트에 반영되어 있습니다. 문구를 바꾸고 싶으면 이 두 파일만 수정하면 됩니다.

### 지식베이스(KB) 수정
카카오/웹챗봇이 답변 근거로 삼는 정보는 전부 `src/kb.js` 한 파일에 있습니다.
가격 정책, 예약 절차, FAQ 등을 실제 상황에 맞게 이 파일만 고치면 두 채널 모두에 즉시 반영됩니다.

---

## 4. 웹사이트 챗봇 연결

`netlify-deploy/index.html`의 플로팅 챗봇은 기본적으로 **데모 응답**(백엔드 없이도 작동)으로 동작합니다.
실제 AI로 연결하려면 `index.html`에서 다음 상수를 백엔드 배포 주소로 바꾸면 됩니다:

```js
const CHAT_API_URL = 'https://<2번에서 배포한 주소>/api/chat'; // 비워두면 데모 모드로 동작
```

(정확한 위치는 `index.html` 안 `/* ---------- AI 챗봇 ---------- */` 주석 블록 참고)

---

## 5. 상담원 에스컬레이션 알림 (Slack 예시)

환불/컴플레인 키워드가 감지되면(`src/escalation.js`) AI가 답하지 않고 상담원 연결 문구를 보내면서,
`ADMIN_ALERT_WEBHOOK_URL`로 알림을 POST합니다.

**Slack으로 받는 방법**:
1. 슬랙 워크스페이스 → https://api.slack.com/apps → Create New App → Incoming Webhooks 활성화
2. 알림 받을 채널 선택 후 Webhook URL 복사 (`https://hooks.slack.com/services/...`)
3. `.env`의 `ADMIN_ALERT_WEBHOOK_URL`에 붙여넣기

Slack이 아니어도 POST 요청을 받는 어떤 서비스든(디스코드 웹훅, 자체 알림 서버 등) 연결 가능합니다 —
`src/escalation.js`의 `notifyAdmin()` 함수에서 payload 형식만 바꿔주면 됩니다.

에스컬레이션 감지 키워드 목록도 `src/escalation.js` 상단 `ESCALATION_KEYWORDS`에서 자유롭게 추가/수정하세요.

---

## 6. 백오피스 AI 매니저 (관리자 페이지)

`netlify-deploy/admin.html`에서 마케팅/정산/콘텐츠 3개 패널 UI를 미리 만들어뒀습니다.
백엔드 주소와 `ADMIN_PASSWORD`를 입력하면 실제 Claude 응답으로 동작합니다 (입력 전에는 데모 문구만 표시).

API 3개:
- `POST /api/admin/marketing-copy` — 공구 상품 홍보문구/캡션
- `POST /api/admin/settlement` — 파트너 리드 정산 요약
- `POST /api/admin/content-draft` — 매거진 팁글 초안

모두 헤더 `x-admin-password: <ADMIN_PASSWORD>` 필요.

---

## 7. 숙소 실시간 검색 (Agoda / Booking.com / HotelsCombined)

`netlify-deploy/index.html`의 "🏨 숙소 변경" 모달은 기본적으로 **로컬 예시 데이터**로 동작합니다.
실제 실시간 호텔 검색으로 바꾸려면:

1. 셋 중 실제로 파트너 승인을 받을 수 있는 곳 하나를 고릅니다.
   - **Agoda Partner Hub** (https://partners.agoda.com) — Affiliate API, 승인 비교적 수월한 편
   - **Booking.com Partner Hub** — Demand API, 심사가 까다롭고 시간이 걸림
   - **HotelsCombined / Skyscanner 제휴 프로그램**
2. 승인받은 곳의 API 키를 `.env`에 입력하고 `HOTEL_API_PROVIDER`를 해당 값으로 설정 (`agoda`/`booking`/`hotelscombined`)
3. `src/routes/hotels.js`의 해당 `search○○()` 함수 안 fetch 호출과 응답 필드 매핑을
   **그 회사의 실제 API 문서 기준으로 검증/수정**합니다. (지금 Agoda 쪽에 적어둔 엔드포인트·필드명은
   일반적인 호텔 API 형태를 참고한 추정 스켈레톤이라, 실제 문서 값으로 반드시 다시 확인해야 합니다)
4. `index.html`에서 `HOTEL_SEARCH_API_URL` 상수를 배포한 백엔드 주소로 교체
   (`/* ---------- 숙소(호텔) 직접 선택 모달 ---------- */` 주석 근처)

설정 전에는 `/api/hotels` 호출 시 503을 반환하고, 프론트엔드가 이를 감지해 자동으로 로컬 데모 데이터를 보여줍니다 —
그래서 이 단계를 건너뛰어도 사이트 자체는 항상 정상 작동합니다.

**응답 규격** (이 형태만 지키면 프론트엔드 수정 없이 어떤 제공사든 바로 연결됨):
```json
{ "hotels": [
  { "id": "...", "name": "...", "image": "https://...", "pricePerNight": 120000,
    "rating": 4.6, "reviews": 320, "area": "도톤보리", "partner": "아고다", "deepLink": "https://..." }
]}
```

---

## 8. 네이버 블로그/카페 AI 요약 피드

`netlify-deploy/index.html`의 "📸 실시간 여행자 현지 피드/정보" 섹션은 기본적으로 **다낭/나트랑 Mock Data**로 동작합니다.
실제 네이버 블로그·카페 검색 + AI 요약으로 바꾸려면:

1. **네이버 검색 API 키 발급**: https://developers.naver.com/apps 에서 애플리케이션 등록 → "검색" API 사용 설정 →
   Client ID / Client Secret 발급 → `.env`의 `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET`에 입력
   (블로그·카페글 검색과 함께 **"이미지" 검색 API도 같이 사용 설정**하면 카드 썸네일이 실제 검색 결과로 채워짐 — 아래 참고)
2. **OpenAI API 키 발급**: https://platform.openai.com 가입 후 API 키 발급 → `.env`의 `OPENAI_API_KEY`에 입력
   (모델은 기본 `gpt-4o-mini`, `OPENAI_MODEL`로 변경 가능)
3. `netlify-deploy/config.js`에서 `NAVER_FEED_API_URL` 값을 배포한 백엔드의 `/api/local-blog-feed` 주소로 교체

**동작 방식**:
- 네이버 검색 API로 블로그/카페 게시글의 제목·작성자·작성일·발췌문(description)·원본 URL을 가져옴
- 저작권 이슈 방지를 위해 원문 본문은 절대 스크래핑하지 않고, 네이버가 공식 제공하는 발췌문만 OpenAI에 전달해
  "핵심 꿀팁 3줄 요약" + 대표 키워드(`#가성비` 등)로 변환
- `NAVER_CLIENT_ID`/`SECRET`이 없으면 `/api/local-blog-feed`가 503을 반환 → 프론트엔드가 자동으로 Mock Data로 폴백
- `OPENAI_API_KEY`만 없으면 네이버 발췌문을 그대로 요약으로 보여주고 카드에 "AI 요약 준비중" 배지가 표시됨(서비스는 계속 동작)

**썸네일 이미지 (`thumbnail`)**: 네이버 블로그/카페 검색 API 자체에는 썸네일 필드가 없습니다(공식 문서 기준
title/link/description/postdate 등만 제공). 그래서 게시글 제목으로 **네이버 이미지 검색 API**를 별도 호출해서
관련 이미지를 붙입니다(`src/routes/localBlogFeed.js`의 `fetchNaverThumbnail()`) — "그 글의 실제 썸네일"이 아니라
"제목과 관련된 이미지"라는 점에 유의하세요. 네이버 개발자센터에서 "검색 > 이미지" API를 별도로 켜지 않았거나
검색에 실패하면 `thumbnail`이 `null`로 내려가고, 프론트엔드(`index.html`의 `getNaverFeedImage()`)가 카테고리별
사진 풀로 자동 대체하므로 이미지 API 미설정이 전체 기능을 막지 않습니다.

**응답 규격**:
```json
{ "items": [
  { "source": "네이버블로그", "title": "...", "author": "...", "date": "2026.07.02",
    "url": "https://blog.naver.com/...", "summaryLines": ["...", "...", "..."],
    "keywords": ["#가성비", "#인생샷"], "aiSummarized": true, "thumbnail": "https://... 또는 null" }
]}
```

---

## 9. 네이버/카카오 소셜 로그인 (지연 로그인 / Lazy Auth)

`index.html`은 둘러보기·AI 일정빌더 이용에는 로그인을 요구하지 않고, **예약하기·찜하기·마이페이지 저장·
후기 작성** 버튼을 누르는 순간에만 로그인 팝업을 띄웁니다(`requireAuth()` 함수 참고). 로그인 자체는
DB(SQLite, `data.sqlite`)에 유저를 저장하고 JWT로 세션을 발급하는 방식으로 이미 구현돼 있습니다.

1. **JWT_SECRET 발급**: 아무 무작위 문자열이나 사용 (예: `openssl rand -hex 32` 또는 그냥 긴 랜덤 문자열) → `.env`의 `JWT_SECRET`에 입력
2. **네이버 로그인 설정**: https://developers.naver.com/apps → 애플리케이션 등록 → "네이버 로그인" API 사용 설정
   - 서비스 URL: 배포한 사이트 주소
   - Callback URL: `{BACKEND_PUBLIC_URL}/auth/naver/callback` (예: `https://travel-gak-backend.onrender.com/auth/naver/callback`)
   - 발급된 Client ID / Client Secret → `.env`의 `NAVER_LOGIN_CLIENT_ID` / `NAVER_LOGIN_CLIENT_SECRET`
3. **카카오 로그인 설정**: https://developers.kakao.com/console/app → 앱 생성 → "카카오 로그인" 활성화
   - Redirect URI: `{BACKEND_PUBLIC_URL}/auth/kakao/callback`
   - "카카오 로그인" 동의항목에서 닉네임(profile_nickname)·이메일(account_email) 최소 동의 설정
   - 앱 설정의 REST API 키 → `.env`의 `KAKAO_LOGIN_CLIENT_ID` (Client Secret은 선택사항, 켰다면 `KAKAO_LOGIN_CLIENT_SECRET`에도 입력)
4. `.env`의 `BACKEND_PUBLIC_URL`(이 서버의 실제 배포 주소)과 `FRONTEND_ORIGIN`(사이트 주소, 팝업 postMessage 보안용)을 채웁니다.
5. `index.html`에서 `AUTH_API_URL` 상수를 배포한 백엔드 주소로 교체합니다 (`/* ---------- 지연 로그인 ---------- */` 주석 근처).

**동작 방식**: 로그인 버튼 → 팝업 창으로 `/auth/naver/login` 또는 `/auth/kakao/login` 오픈 → 동의 후
`/auth/:provider/callback`에서 유저 upsert + JWT 발급 → 팝업이 `window.opener`로 `postMessage` 후 자동으로 닫힘 →
프론트엔드가 토큰을 저장하고, 로그인 팝업을 띄우게 만든 원래 액션(예약/찜하기/저장/후기작성)을 이어서 실행합니다.

**주의**: `data.sqlite`는 서버가 실행되는 디스크에 그대로 저장됩니다. Render 무료 플랜처럼 재배포 시
디스크가 초기화되는 환경이면 로그인 유저/저장된 일정이 날아갈 수 있어요 — Render Disk(유료) 또는
외부 DB(Postgres 등)로 교체를 권장합니다. 지금 구성은 "로그인이 실제로 동작하는 것"을 우선한 최소 구성입니다.

---

## 10. 일일 자동 갱신 크론 (네이버 피드 + 외교부 여행경보)

`src/cron.js`가 서버 기동 시 자동으로 등록되어, 매일 00:00(KST)에 인기 여행지 10곳(다낭·오사카·방콕·
제주·도쿄·후쿠오카·타이베이·홍콩·발리·싱가포르)의 네이버 블로그/카페 인기글과 외교부 여행경보를
미리 갱신해서 `dest_info_cache` 테이블에 저장합니다.

- **네이버 피드 캐시**: `NAVER_CLIENT_ID`/`SECRET`이 있으면 자동으로 갱신됨. `/api/local-blog-feed`가
  카테고리 없이("전체") 호출되면 24시간 이내 캐시를 즉시 반환해서 응답 속도가 빨라지고 API 호출량도 줄어듦.
- **외교부 여행경보 캐시**: `MOFA_API_URL`/`MOFA_API_KEY` 필요 — 공공데이터포털
  (https://www.data.go.kr/data/15000827/openapi.do)에서 "외교부_여행경보제도" API 활용신청 후 발급되는
  값을 그대로 입력하면 됨. **정확한 서비스 URL은 신청 후 Swagger 문서에서 확인해야 하는 값이라
  미리 하드코딩해두지 않았습니다** — 신청 전에는 이 항목만 자동으로 건너뜁니다.
- **조회 API**: `GET /api/dest-info?dest=다낭` — 캐시된 블로그 피드 + 여행경보를 그대로 반환.
  아직 `index.html`의 정적 `DEST_QUICK_INFO`와 연결돼 있지는 않음(원하면 다음 단계로 연동 가능).
- 두 API 키 모두 없어도 서버는 정상 기동하고 크론도 등록되며, 갱신 작업만 조용히 건너뜁니다.

---

## 11. 행정안전부 착한가격업소 (국내 여행지 맛집/카페 탭)

`src/routes/goodPriceStores.js` — `GET /api/good-price-stores?city=제주` (제주/부산/강릉/경주/전주/여수/서울 지원).

- 공공데이터포털(https://www.data.go.kr/data/3045247/fileData.do)에서 "행정안전부_착한가격업소 현황"
  OpenAPI 활용신청 후 발급되는 서비스 URL/인증키를 `GOOD_PRICE_API_URL`/`GOOD_PRICE_API_KEY`에 입력.
- **주의**: 신청 전에는 정확한 응답 필드명을 확정할 수 없어(공공데이터 API는 기관마다 요청/응답 스펙이
  조금씩 다름), 코드의 필드 매핑은 data.go.kr에 공개된 컬럼 설명(업소명/업종/연락처/주소/메뉴1~4/
  가격1~4)을 기준으로 작성해둔 추정치입니다. 실제 신청 후 응답 샘플을 한 번 찍어보고
  `fetchGoodPriceStores()`의 필드명을 맞춰야 할 수 있습니다.
- 두 값이 비어있으면 503을 반환하고, 프론트엔드는 이를 감지해 국내 7개 여행지의 목데이터로 자동
  폴백합니다(라이브 데이터가 아님을 화면에 안내).
- 원본 데이터의 "연락처"는 개인정보 보호를 위해 공란인 경우가 많습니다 — 없는 값을 임의로 채워
  넣지 않고 그대로 비워둡니다.

---

## 폴더 구조

```
travel-gak-backend/
├── server.js              # 진입점, 라우트 연결, 보안 헤더(helmet), 크론 시작
├── package.json
├── .env.example            # 이 값들을 채운 .env 파일을 직접 만들어야 함 (git에 올리지 말 것)
├── data.sqlite              # 로그인 유저 + 저장된 일정 + 여행지 캐시 DB (git에 올리지 말 것, 자동 생성됨)
└── src/
    ├── kb.js                # 공유 지식베이스 (가격정책/예약절차/FAQ) + 챗봇 예약카드 생성
    ├── aiClient.js           # Claude API 호출 + 페르소나 시스템 프롬프트
    ├── escalation.js         # 상담원 전환 키워드 감지 + 관리자 알림
    ├── db.js                 # SQLite DB (유저, 저장된 일정, 여행지 캐시)
    ├── authMiddleware.js      # JWT 검증 미들웨어
    ├── mofaSafety.js          # 외교부 여행경보 캐시 갱신
    ├── cron.js                # 일일 00시 갱신 스케줄러
    └── routes/
        ├── kakao.js           # 카카오 스킬서버 웹훅
        ├── chat.js            # 웹사이트 챗봇 API (제휴 예약카드 포함)
        ├── admin.js           # 백오피스 AI 매니저 3종 API
        ├── hotels.js          # 숙소 실시간 검색 프록시
        ├── localBlogFeed.js   # 네이버 블로그/카페 검색 + OpenAI 요약 프록시 + 캐시
        ├── destInfo.js         # 여행지 캐시 조회 API
        ├── auth.js            # 네이버/카카오 소셜 로그인 (OAuth)
        └── itineraries.js     # 마이페이지 일정 저장/조회 (로그인 필요)
```

## 보안 체크리스트 (배포 전 꼭 확인)

- [ ] `.env` 파일이 `.gitignore`에 포함되어 있는지 (API 키가 git에 올라가면 안 됨)
- [ ] `ADMIN_PASSWORD`를 기본값(`change-me-please`)에서 반드시 변경
- [ ] `ALLOWED_ORIGIN`을 실제 사이트 도메인으로 좁혀서 아무 사이트나 이 API를 호출 못 하게 하기
- [ ] Claude/OpenAI/네이버 API 키는 절대 프론트엔드(`index.html`, `admin.html`) 코드에 직접 넣지 않기 — 반드시 이 백엔드를 경유
- [ ] `JWT_SECRET`을 충분히 긴 무작위 문자열로 설정 (기본값 없음 — 비워두면 로그인 자체가 500 에러로 막힘)
- [x] `helmet` 미들웨어로 HSTS/X-Frame-Options 등 보안 헤더 자동 적용 (2026-08-12 추가, server.js)
- [ ] **HTTPS는 코드가 아니라 배포 플랫폼이 제공**: Render/Railway 등에 배포하면 자동으로 HTTPS가 적용됨.
      직접 서버(VPS 등)에 올릴 경우에만 별도로 인증서(Let's Encrypt 등)를 설정해야 함
- [ ] `FRONTEND_ORIGIN`을 실제 사이트 도메인으로 설정 (비워두면 모든 사이트가 로그인 팝업의 메시지를 받을 수 있음)
- [ ] `data.sqlite`가 `.gitignore`에 포함되어 있는지 (로그인 유저 정보가 git에 올라가면 안 됨)
