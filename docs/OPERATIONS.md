# 운영 가이드

## 배포 전

1. 운영 PostgreSQL의 마이그레이션 소유자와 `NOSUPERUSER NOBYPASSRLS` 애플리케이션 계정을 분리합니다.
2. `SESSION_SECRET`을 비밀 관리 시스템에서 생성하고 환경별로 분리합니다.
3. HTTPS 종단과 `COOKIE_SECURE=true`를 확인하고 `ALLOW_INSECURE_COOKIES`는 비활성화합니다.
4. 마이그레이션을 스테이징 데이터 사본에 먼저 적용합니다.
5. 백업을 만들고 실제 복구 시간을 측정합니다.

## 헬스체크

`GET /api/health`는 인증 없이 DB 연결·업무 테이블 읽기 권한·PostgreSQL 런타임 역할을 확인합니다. PostgreSQL에서는 `rolsuper=false`, `rolbypassrls=false`가 아니거나 마이그레이션된 업무 테이블 권한이 빠져 있으면 의도적으로 `503`을 반환합니다.

- `200 { "status": "ok" }`: 요청 처리 가능
- `503 { "status": "error" }`: DB 연결 또는 초기화 확인 필요

기존 `deploy/synology` 브랜치처럼 앱 컨테이너가 PostgreSQL 소유자/슈퍼유저로 연결되면 헬스체크가 실패합니다. 해당 배포를 계속 사용해야 한다면 먼저 최신 `main`의 `migrate`/`app` 분리 구성으로 전환하고, 데이터 백업·복구 리허설과 `npm run test:rls`를 완료하세요. 소유자 연결을 앱에 직접 전달하지 않습니다.

응답에는 DB 주소, 자격증명, 내부 오류를 노출하지 않습니다.

로그인 후 메뉴 이동 시 다시 로그인 화면으로 돌아가면 세션 쿠키 전송 방식을 확인합니다. 사설망 HTTP 직접 접속은 `COOKIE_SECURE=false`와 `ALLOW_INSECURE_COOKIES=true`, HTTPS 리버스 프록시는 `COOKIE_SECURE=true`와 `ALLOW_INSECURE_COOKIES=false`를 사용합니다. 이외 조합은 헬스체크가 `503`을 반환합니다. 환경 변수 변경 후 앱 컨테이너를 다시 생성하고 기존 사이트 쿠키를 지운 뒤 로그인합니다.

## 마이그레이션

개발:

```bash
npm run db:migrate
```

Compose의 일회성 `migrate` 서비스는 DB 소유자로 `scripts/migrate-runtime.mjs`를 실행한 뒤 제한된 `moarix_app` 역할과 권한을 준비합니다. 기본 애플리케이션 이미지 명령은 서버만 시작하며 마이그레이션을 실행하지 않습니다. 앱 컨테이너에는 소유자 자격증명을 전달하지 않습니다. 적용된 파일은 `schema_migrations`에 기록되며 같은 마이그레이션을 다시 실행하지 않습니다. 이미 배포된 SQL 파일은 수정하지 말고 새 번호의 파일을 추가합니다.

`020_settlement_integrity.sql`은 정산 배부를 문서·거래처·입출금 방향과 연결하고, 문서 및 정산 금액을 초과하는 배부를 거부합니다. 기존 정산 데이터를 업그레이드할 때는 실패한 배부가 없는지 먼저 확인한 뒤 스테이징에서 마이그레이션을 실행합니다.

배포 후 역할을 확인합니다.

```sql
SELECT rolname, rolsuper, rolbypassrls
FROM pg_roles
WHERE rolname = 'moarix_app';
```

두 보안 값이 모두 `false`여야 합니다. 실제 PostgreSQL 격리 검증은 `npm run test:rls`로 실행합니다.

모든 배포 후보에서 `npm run test:privacy`를 실행합니다. 이 검사는 저장소에 들어오면 안 되는 현실형 외부 케이스/자산 식별자, 알려진 고객·인물 토큰, 사설 운영 IP와 압축·덤프·인증서 파일을 차단합니다. 운영 데이터는 Git이나 데모 시드에 복사하지 말고 승인된 운영 PostgreSQL과 비공개 객체 저장소에서만 관리합니다.

## 백업·복구

PostgreSQL 예시:

```bash
pg_dump --format=custom --no-owner --file=moarix.dump "$DATABASE_URL"
createdb moarix_restore_test
pg_restore --clean --if-exists --no-owner --dbname=moarix_restore_test moarix.dump
```

복구 후 회사 수, 사용자 수, 문서 합계, 재고 잔량과 원장 합계, 감사 로그 수를 원본과 대조합니다. 백업 파일을 암호화하고 접근·보유 기간을 제한하세요.

## 모니터링

- HTTP 5xx와 `/api/health` 실패율
- DB 연결 포화, 장기 트랜잭션, 잠금 대기
- 로그인 차단 증가율과 비정상 IP 패턴
- 문서 승인·재고 변동 실패, 고객 지원 만료·벤더 지원 공백·라이선스 만료와 점검 기한 초과
- 디스크 사용량과 백업 성공 여부

로그에 비밀번호, 세션 토큰, `DATABASE_URL`, 고객 개인정보를 기록하지 않습니다.

서비스 케이스의 진단 파일은 애플리케이션 DB나 Git 저장소에 넣지 않습니다. HTTPS 첨부 링크는 최소 권한과 만료가 적용된 비공개 객체 저장소를 사용하고, 실제 고객 케이스 원문·내부 IP·운영 로그를 공개 이슈나 데모 시드에 복사하지 마세요.

## 장애 대응

1. 쓰기 오류가 데이터 정합성에 영향을 줄 수 있으면 변경 작업을 우선 차단합니다.
2. 앱 버전, 마이그레이션 버전, DB 상태와 최근 감사 로그를 보존합니다.
3. 재고 원장이나 감사 로그를 직접 수정하지 않습니다.
4. 복구는 검증된 백업 또는 명시적 역분개로 수행합니다.
5. 원인과 영향 범위, 수정·재발 방지 항목을 이슈에 기록합니다.

## 키 회전

`SESSION_SECRET`을 바꾸면 기존 웹 세션과 이 비밀값으로 해시된 모든 API 토큰이 함께 무효화됩니다. 점검 시간을 공지하고 필요한 AI/CLI 토큰을 새 비밀값으로 재발급한 뒤 애플리케이션을 교체하세요. 사용자는 다시 로그인해야 하며, 기존 API 토큰은 복구할 수 없으므로 새 토큰 배포를 확인한 다음 폐기된 자격증명을 비밀 관리 시스템에서 제거합니다. DB 비밀번호 회전은 새 자격증명 배포, 연결 확인, 이전 자격증명 폐기 순서로 진행합니다.

## AI/CLI API 토큰

API 토큰은 마이그레이션 소유자 연결이 있는 관리 작업에서만 발급·폐기합니다. 앱 컨테이너의 제한 DB 역할은 `api_tokens` 테이블을 직접 읽거나 토큰을 만들 수 없습니다.

```bash
npm run --silent api-token:issue -- \
  --company company-slug \
  --email operator@example.com \
  --name 'Operations AI' \
  --scopes 'context:read,assets:read,cases:read,cases:write' \
  --expires-in-days 30

npm run api-token:revoke -- \
  --company company-slug \
  --prefix mxk_XXXXXXXXXXXX
```

발급 결과의 전체 토큰은 한 번만 출력됩니다. 비밀 관리 시스템으로 즉시 옮기고 AI 프롬프트, 명령 인자, 로그, Git에 남기지 않습니다. 업무별로 읽기/쓰기 토큰을 분리하고 `context:read`와 필요한 리소스 scope만 부여합니다. `quotes:approve`와 `trips:approve`는 일반 쓰기 토큰에서 제외하고 별도 승인 계정·토큰에만 부여합니다. 리소스 `:*`는 승인 권한도 포함합니다. 만료일과 `last_used_at`을 정기 검토하고 작업 종료·담당자 변경·의심 활동 시 즉시 폐기합니다.

Compose 배포에서는 제한 앱 컨테이너가 아닌 일회성 관리자 이미지에서 실행합니다. `migrate` 서비스는 DB 소유자 연결과 토큰 해시에 필요한 동일한 `SESSION_SECRET`을 사용합니다.

```bash
docker compose run --rm migrate npm run --silent api-token:issue -- \
  --company company-slug \
  --email operator@example.com \
  --name 'Operations AI' \
  --scopes 'context:read,assets:read,cases:read,cases:write' \
  --expires-in-days 30

docker compose run --rm migrate npm run --silent api-token:revoke -- \
  --company company-slug \
  --prefix mxk_XXXXXXXXXXXX
```
