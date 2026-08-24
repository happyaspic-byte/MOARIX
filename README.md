# MOARIX

MOARIX는 중소·중견 조직을 위한 멀티테넌트 영업·구매·재고·고객자산·서비스 ERP입니다. 특정 상용 제품의 소스나 화면을 복제하지 않고, 검증 가능한 업무 규칙과 감사 추적을 중심으로 독자 구현했습니다.

현재 릴리스는 실제 데이터를 저장하고 역할별 권한을 검사하는 운영 코어입니다. 외부 세금계산서·결제·메일 연동처럼 사업자별 계약이 필요한 기능은 [로드맵](docs/ROADMAP.md)에 분리되어 있습니다.

## 구현 범위

- 회사 단위 데이터 격리와 PostgreSQL Row-Level Security 정책
- 불투명 세션 토큰, HttpOnly 쿠키, 로그인 실패 DB 기반 차단
- 소유자·관리자·매니저·실무자·조회자 역할 권한
- 거래처, 품목, 창고 기준정보
- 견적, 수주, 발주, 매출 청구, 매입 청구 문서
- 작성 → 제출 → 승인 → 확정/취소 상태 머신
- 정확한 Decimal 금액·할인·부가세 계산
- 창고별 재고, 입고·출고·실사 조정, 음수 재고 방지
- 중복 전송 방지 키와 추가 전용 재고 원장
- 고객 설치 자산, 보증·지원 만료, 서비스 케이스
- 대시보드, 표준 실적·재고 평가 보고서
- 추가 전용 감사 로그와 운영 헬스체크
- 반응형 한국어 UI, Docker/PostgreSQL 운영 구성

## 기술 구성

- Next.js 16 App Router, React 19, TypeScript 6
- PostgreSQL 또는 로컬 개발용 PGlite
- Zod, Decimal.js, bcrypt
- Vitest, Playwright, axe-core

상세 설계는 [아키텍처](docs/ARCHITECTURE.md), 운영 절차는 [운영 가이드](docs/OPERATIONS.md)를 참고하세요.

## 로컬 실행

Node.js 24를 권장합니다.

```bash
npm ci
cp .env.example .env.local
npm run db:setup
npm run dev
```

`.env.local`의 `SEED_DEMO_EMAIL`과 `SEED_DEMO_PASSWORD`를 원하는 로컬 계정으로 먼저 바꾸세요. 시드 비밀번호는 로그에 출력되지 않으며, 프로덕션에서는 시드가 기본 차단됩니다.

기본 주소는 `http://localhost:3000`입니다. 데이터는 기본적으로 `.data/pglite`에 저장됩니다.

## PostgreSQL 운영 실행

1. 충분히 긴 비밀값과 데이터베이스 비밀번호를 설정합니다.
2. 컨테이너를 빌드하고 실행합니다.
3. 최초 한 번 소유자 계정을 만듭니다.

```bash
export SESSION_SECRET="$(openssl rand -base64 48)"
export POSTGRES_PASSWORD="replace-with-a-strong-database-password"
export COOKIE_SECURE=false
docker compose up -d --build
```

로컬 HTTP에서는 `COOKIE_SECURE=false`를 사용합니다. HTTPS 리버스 프록시 뒤의 운영 환경에서는 반드시 `COOKIE_SECURE=true`로 바꾸세요.

최초 소유자 생성:

```bash
docker compose run --rm \
  -e BOOTSTRAP_ADMIN_EMAIL="owner@example.com" \
  -e BOOTSTRAP_ADMIN_PASSWORD="replace-with-a-long-password" \
  -e BOOTSTRAP_COMPANY_NAME="회사명" \
  -e BOOTSTRAP_COMPANY_SLUG="company-slug" \
  --entrypoint node app scripts/bootstrap-admin.mjs
```

같은 이메일이나 회사 슬러그가 이미 있으면 부트스트랩은 중단됩니다. 실행 후 셸 히스토리와 배포 환경에서 평문 비밀번호를 제거하세요.

## 환경 변수

| 변수 | 용도 | 운영 기준 |
|---|---|---|
| `DATABASE_DRIVER` | `local` 또는 `postgres` | 운영은 `postgres` 권장 |
| `DATABASE_URL` | PostgreSQL 연결 문자열 | 비밀 저장소 사용 |
| `LOCAL_DATABASE_PATH` | PGlite 저장 경로 | 로컬 개발 전용 |
| `SESSION_SECRET` | 세션 토큰 HMAC 키 | 최소 32자, 환경별 분리 |
| `COOKIE_SECURE` | Secure 쿠키 강제 여부 | HTTPS에서 `true` |
| `DATABASE_POOL_MAX` | PostgreSQL 풀 크기 | 기본 10, 인스턴스 수와 함께 산정 |
| `SEED_DEMO_EMAIL` | 로컬 시드 계정 | 운영 사용 금지 |
| `SEED_DEMO_PASSWORD` | 로컬 시드 비밀번호 | 운영 사용 금지 |

## 검증

```bash
npm run lint
npm run typecheck
npm run test:coverage
npm run build
```

격리된 테스트 DB를 준비한 뒤 런타임 스모크를 실행할 수 있습니다.

```bash
export LOCAL_DATABASE_PATH=/tmp/moarix-smoke/pglite
export SESSION_SECRET=smoke-only-secret-with-at-least-32-characters
export COOKIE_SECURE=false
export SEED_DEMO_PASSWORD='local-smoke-password-at-least-12-chars'
export SMOKE_PASSWORD="$SEED_DEMO_PASSWORD"
npm run db:setup
npm run build
npm run smoke
```

브라우저 테스트는 Chromium 설치 후 실행합니다.

```bash
npx playwright install chromium
E2E_PASSWORD="$SEED_DEMO_PASSWORD" npm run test:e2e
```

CI는 린트, 타입 검사, 커버리지, 마이그레이션, 프로덕션 빌드, 도메인/HTTP 스모크, Playwright, Docker 빌드를 모두 검사합니다.

## 운영 전 필수 점검

- PostgreSQL 백업과 복구 리허설
- HTTPS, `COOKIE_SECURE=true`, 비밀 관리 시스템
- 메일·세금계산서·결제 등 외부 연동의 샌드박스 검증
- 회사별 역할·승인 정책과 개인정보 보유 기간
- 모니터링, 로그 마스킹, 장애 알림
- 실제 회계 처리에 맞춘 계정과목·세율·반올림 검토

## 보안 제보

민감한 취약점은 공개 이슈로 남기지 말고 [보안 정책](SECURITY.md)의 비공개 제보 절차를 이용하세요.

## 라이선스

저작권 보유. 명시적인 허가 없는 복제·배포·상업적 이용을 금지합니다. 자세한 내용은 [LICENSE](LICENSE)를 확인하세요.
