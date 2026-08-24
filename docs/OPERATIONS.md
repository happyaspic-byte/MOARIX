# 운영 가이드

## 배포 전

1. 운영 PostgreSQL의 마이그레이션 소유자와 `NOSUPERUSER NOBYPASSRLS` 애플리케이션 계정을 분리합니다.
2. `SESSION_SECRET`을 비밀 관리 시스템에서 생성하고 환경별로 분리합니다.
3. HTTPS 종단과 `COOKIE_SECURE=true`를 확인합니다.
4. 마이그레이션을 스테이징 데이터 사본에 먼저 적용합니다.
5. 백업을 만들고 실제 복구 시간을 측정합니다.

## 헬스체크

`GET /api/health`는 인증 없이 DB 연결을 확인합니다.

- `200 { "status": "ok" }`: 요청 처리 가능
- `503 { "status": "error" }`: DB 연결 또는 초기화 확인 필요

응답에는 DB 주소, 자격증명, 내부 오류를 노출하지 않습니다.

## 마이그레이션

개발:

```bash
npm run db:migrate
```

Compose의 일회성 `migrate` 서비스는 DB 소유자로 `scripts/migrate-runtime.mjs`를 실행한 뒤 제한된 `moarix_app` 역할과 권한을 준비합니다. 앱 컨테이너에는 소유자 자격증명을 전달하지 않습니다. 적용된 파일은 `schema_migrations`에 기록되며 같은 마이그레이션을 다시 실행하지 않습니다. 이미 배포된 SQL 파일은 수정하지 말고 새 번호의 파일을 추가합니다.

배포 후 역할을 확인합니다.

```sql
SELECT rolname, rolsuper, rolbypassrls
FROM pg_roles
WHERE rolname = 'moarix_app';
```

두 보안 값이 모두 `false`여야 합니다. 실제 PostgreSQL 격리 검증은 `npm run test:rls`로 실행합니다.

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
- 문서 승인·재고 변동 실패, 지원 만료·미계약과 점검 기한 초과
- 디스크 사용량과 백업 성공 여부

로그에 비밀번호, 세션 토큰, `DATABASE_URL`, 고객 개인정보를 기록하지 않습니다.

## 장애 대응

1. 쓰기 오류가 데이터 정합성에 영향을 줄 수 있으면 변경 작업을 우선 차단합니다.
2. 앱 버전, 마이그레이션 버전, DB 상태와 최근 감사 로그를 보존합니다.
3. 재고 원장이나 감사 로그를 직접 수정하지 않습니다.
4. 복구는 검증된 백업 또는 명시적 역분개로 수행합니다.
5. 원인과 영향 범위, 수정·재발 방지 항목을 이슈에 기록합니다.

## 키 회전

`SESSION_SECRET`을 바꾸면 기존 세션은 모두 무효화됩니다. 점검 시간을 공지한 뒤 교체하고 재로그인을 안내하세요. DB 비밀번호 회전은 새 자격증명 배포, 연결 확인, 이전 자격증명 폐기 순서로 진행합니다.
