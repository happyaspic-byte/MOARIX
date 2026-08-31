# MOARIX

MOARIX는 중소·중견 조직을 위한 멀티테넌트 영업·구매·재고 ERP이자 Stratus 고객 자산·지원·점검·장애 운영 시스템입니다. 특정 상용 제품의 소스나 화면을 복제하지 않고, 검증 가능한 업무 규칙과 감사 추적을 중심으로 독자 구현했습니다.

현재 릴리스(0.6.0)는 실제 데이터를 저장하고 역할별 권한·테넌트 경계를 검사하는 운영 코어입니다. 외부 세금계산서·결제·메일 연동처럼 사업자별 계약이 필요한 기능은 [로드맵](docs/ROADMAP.md)에 분리되어 있습니다.

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
- 고객사별 국내·해외 사업장과 현장 담당자·시간대
- Stratus Asset ID, everRun·ztC·ftServer, 버전·HA/FT·OS·지원 방식
- 자산 360° 워크스페이스와 Node0/Node1·CMA/CMB·A-Link·BMC·업무망·VM 토폴로지
- 고객 지원 계약과 Stratus/Penguin 벤더 백계약의 분리, 개정 이력과 D-90·60·30·0 위험 큐
- 영구·구독·OEM 라이선스와 Entitlement 만료 추적(전체 제품 키 저장 금지)
- Protection·Sync·Service와 자원 사용률을 기록하는 불변 정기점검 체크리스트
- 고객·자산 일치 검증, 외부 CS 번호, 심각도·SLA·다음 조치 우선순위
- 서비스 케이스 상세, 고객/지원 권한/자산 정보, Task Watch List, 추가 전용 활동·상태 타임라인
- 운행 거리·단가·통행료·주차·유류·일비 자동 합계, 작성 → 제출 → 독립 승인 → 무효 운행일지
- 고객 360° 화면과 고객 → 사업장 → 자산 → 점검·케이스 상호 이동
- 대용량 진단 자료를 위한 HTTPS 첨부 링크·크기 메타데이터와 외부 원문 열기
- 대시보드, 표준 실적·재고 평가·지원 계약·점검 운영 보고서
- 추가 전용 감사 로그, 합성 데이터 개인정보 차단 게이트와 운영 헬스체크
- `moarix`/`mx` AI 운영 CLI, 기능 탐색 JSON Schema, 최소 권한 API 토큰, dry-run과 멱등 쓰기
- 반응형 한국어 UI, Docker/PostgreSQL 운영 구성

## 기술 구성

- Next.js 16 App Router, React 19, TypeScript 6
- PostgreSQL 또는 로컬 개발용 PGlite
- Zod, Decimal.js, bcrypt
- Vitest, Playwright, axe-core

상세 설계는 [아키텍처](docs/ARCHITECTURE.md), 운영 절차는 [운영 가이드](docs/OPERATIONS.md), AI 자동화는 [CLI 가이드](docs/AI_CLI_GUIDE.md)와 [명령 참조](docs/CLI_REFERENCE.md)를 참고하세요.

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

## AI/자동화 CLI

브라우저 없이 반복 업무를 처리할 때는 의존성 없는 `moarix` 명령(짧은 별칭 `mx`)을 사용합니다. CLI는 DB에 직접 접속하지 않고 인증된 `/api/v1` 명령 API를 통해 기존 서비스·RLS·감사 경계를 그대로 통과합니다.

```bash
npm run --silent api-token:issue -- \
  --company moarix-demo \
  --email admin@moarix.local \
  --name 'Local AI CLI' \
  --scopes 'context:read,assets:read,cases:read,trips:read,reports:read' \
  --expires-in-days 30

MOARIX_URL=http://localhost:3000 \
MOARIX_TOKEN="$MOARIX_AUTOMATION_TOKEN" \
node bin/moarix.mjs capabilities --agent
```

토큰 발급·폐기는 마이그레이션 소유자 환경에서만 실행합니다. 전체 토큰은 발급 시 한 번만 표시되므로 프롬프트나 셸 인자에 넣지 말고 비밀 관리 시스템에서 프로세스 환경으로 주입하세요. 생성·수정·상태 전이는 먼저 `--dry-run`으로 스키마·권한을 확인하고, 실제 쓰기 재시도에는 같은 `--idempotency-key`를 사용합니다.

Compose 운영 환경에서는 소유자 DB 연결과 관리 도구가 분리된 일회성 `migrate` 이미지로 토큰을 발급합니다. 애플리케이션 이미지에는 `moarix`와 `mx`가 함께 설치됩니다.

```bash
docker compose run --rm migrate npm run --silent api-token:issue -- \
  --company company-slug \
  --email owner@example.com \
  --name 'Operations AI' \
  --scopes 'context:read,assets:read,cases:read,cases:write' \
  --expires-in-days 30

docker compose exec \
  -e MOARIX_URL=http://127.0.0.1:3000 \
  -e MOARIX_TOKEN="$MOARIX_AUTOMATION_TOKEN" \
  app moarix context --machine
```

## PostgreSQL 운영 실행

1. 충분히 긴 비밀값과 데이터베이스 비밀번호를 설정합니다.
2. 컨테이너를 빌드하고 실행합니다.
3. 최초 한 번 소유자 계정을 만듭니다.

```bash
export SESSION_SECRET="$(openssl rand -base64 48)"
export POSTGRES_PASSWORD="replace-with-a-strong-database-password"
export DATABASE_APP_PASSWORD="replace-with-a-different-strong-app-password"
export COOKIE_SECURE=false
export ALLOW_INSECURE_COOKIES=true # 로컬 HTTP 전용
docker compose up -d --build
```

로컬 HTTP에서는 `COOKIE_SECURE=false`와 `ALLOW_INSECURE_COOKIES=true`를 함께 사용합니다. `ALLOW_INSECURE_COOKIES`는 테스트·로컬 전용이며, HTTPS 리버스 프록시 뒤의 운영 환경에서는 반드시 제거하거나 `false`로 두고 `COOKIE_SECURE=true`를 사용하세요.

최초 소유자 생성:

```bash
docker compose run --rm \
  -e BOOTSTRAP_ADMIN_EMAIL="owner@example.com" \
  -e BOOTSTRAP_ADMIN_PASSWORD="replace-with-a-long-password" \
  -e BOOTSTRAP_COMPANY_NAME="회사명" \
  -e BOOTSTRAP_COMPANY_SLUG="company-slug" \
  --entrypoint node migrate scripts/bootstrap-admin.mjs
```

부트스트랩은 마이그레이션 소유자 연결이 있는 일회성 `migrate` 서비스에서만 실행합니다. 같은 이메일이나 회사 슬러그가 이미 있으면 중단됩니다. 실행 후 셸 히스토리와 배포 환경에서 평문 비밀번호를 제거하세요.

## 환경 변수

| 변수 | 용도 | 운영 기준 |
|---|---|---|
| `DATABASE_DRIVER` | `local` 또는 `postgres` | 운영은 `postgres` 권장 |
| `DATABASE_URL` | PostgreSQL 연결 문자열 | 비밀 저장소 사용 |
| `DATABASE_HOST` / `DATABASE_PORT` | PostgreSQL 호스트와 포트(`5432`) | Compose·비밀번호 특수문자 환경에서 `DATABASE_URL` 대신 사용 |
| `DATABASE_NAME` / `DATABASE_USER` / `DATABASE_PASSWORD` | PostgreSQL DB 이름·연결 역할·비밀번호 | 앱은 제한 역할, 마이그레이션은 소유자 역할 사용 |
| `DATABASE_APP_USER` | 마이그레이션 시 만들 제한 앱 역할 | Compose 기본 `moarix_app` |
| `DATABASE_APP_PASSWORD` | 제한 앱 역할 비밀번호 | DB 소유자 암호와 반드시 분리 |
| `LOCAL_DATABASE_PATH` | PGlite 저장 경로 | 로컬 개발 전용 |
| `SESSION_SECRET` | 세션 토큰 HMAC 키 | 최소 32자, 환경별 분리 |
| `COOKIE_SECURE` | Secure 쿠키 강제 여부 | HTTPS에서 `true` |
| `ALLOW_INSECURE_COOKIES` | production 빌드의 HTTP 쿠키 명시 허용 | 테스트·로컬 HTTP에서만 `true` |
| `DATABASE_POOL_MAX` | PostgreSQL 풀 크기 | 기본 10, 인스턴스 수와 함께 산정 |
| `SEED_DEMO_EMAIL` | 로컬 시드 계정 | 운영 사용 금지 |
| `SEED_DEMO_PASSWORD` | 로컬 시드 비밀번호 | 운영 사용 금지 |
| `MOARIX_URL` | CLI가 호출할 서버 기준 주소 | HTTPS 운영 주소 |
| `MOARIX_TOKEN` | AI/CLI Bearer 토큰 | 비밀 저장소에서 환경 주입 |
| `MOARIX_TIMEOUT_MS` | CLI 요청 제한 시간 | 기본 30,000ms |

## 검증

```bash
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm run test:privacy
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
# npm run build와 npm run db:setup이 먼저 완료되어 있어야 합니다.
E2E_PASSWORD="$SEED_DEMO_PASSWORD" npm run test:e2e
```

브라우저 검증은 정적 자산을 포함한 Next.js standalone 런타임을 직접 기동하여 운영 번들과 동일한 서버 경로를 검사합니다.

외부 지원 포털은 로그인 세션과 공급자 프레임 정책에 종속되므로 iframe으로 삽입하지 않습니다. MOARIX에는 필요한 케이스 내용을 독립적으로 보존하고, 원문은 검증된 HTTPS 주소를 새 창에서 여는 방식으로 연결합니다. 실제 파일 업로드는 객체 저장소의 서명 URL·악성코드 검사·보유 정책이 준비된 뒤 활성화해야 합니다.

CI는 개인정보·현실형 식별자 검사, 린트, 타입 검사, 커버리지, 마이그레이션, 프로덕션 빌드, 도메인/HTTP 스모크, 실제 CLI → API → 서비스 → DB 흐름, Playwright, Docker 빌드와 실제 PostgreSQL 17의 제한 역할·RLS·API 토큰 경계를 모두 검사합니다.

## 운영 전 필수 점검

- PostgreSQL 백업과 복구 리허설
- DB 소유자와 `NOSUPERUSER NOBYPASSRLS` 애플리케이션 역할 분리
- HTTPS, `COOKIE_SECURE=true`, 비밀 관리 시스템
- 메일·세금계산서·결제 등 외부 연동의 샌드박스 검증
- 회사별 역할·승인 정책과 개인정보 보유 기간
- 모니터링, 로그 마스킹, 장애 알림
- 실제 회계 처리에 맞춘 계정과목·세율·반올림 검토

## 보안 제보

민감한 취약점은 공개 이슈로 남기지 말고 [보안 정책](SECURITY.md)의 비공개 제보 절차를 이용하세요.

## 라이선스

저작권 보유. 명시적인 허가 없는 복제·배포·상업적 이용을 금지합니다. 자세한 내용은 [LICENSE](LICENSE)를 확인하세요.
