# MOARIX CLI 명령어 참조

MOARIX CLI는 브라우저 자동화 없이 운영 API를 호출하는 Node.js 20+ ESM 명령어입니다. 외부 런타임 의존성이 없고 성공 결과는 `stdout`, 오류는 `stderr`에 JSON으로 출력합니다. 정식 명령은 `moarix`, 짧은 별칭은 `mx`입니다. `--machine` 또는 `--agent`를 붙이면 한 줄 JSON이 됩니다.

## 준비

저장소 안에서는 다음과 같이 실행합니다.

```bash
export MOARIX_URL=http://localhost:3000
export MOARIX_TOKEN='secret-manager에서-주입한-토큰'
node bin/moarix.mjs capabilities --machine
```

패키지를 전역 링크한 개발 환경에서는 `moarix` 명령을 바로 사용할 수 있습니다.

```bash
npm link
moarix health
mx capabilities --machine
```

`MOARIX_TOKEN`은 셸 인자, JSON 데이터, 프롬프트 또는 로그에 넣지 않습니다. CLI는 `--token`, `--api-key`, `--authorization` 옵션을 의도적으로 거부합니다. 운영 환경에서는 셸 히스토리에 `export`하지 말고 프로세스 관리자나 비밀 관리 시스템에서 환경 변수로 주입하세요.

### AI 전용 토큰 발급

토큰은 DB 마이그레이션 소유자 연결을 사용할 수 있는 관리 환경에서만 발급합니다. 다음은 조회 전용 예시이며, 실제 회사·계정과 필요한 최소 scope로 바꿉니다.

```bash
npm run --silent api-token:issue -- \
  --company demo-company \
  --email operator@moarix.local \
  --name 'MOARIX AI read only' \
  --scopes 'context:read,master:read,assets:read,cases:read,inspections:read,quotes:read,trips:read,reports:read' \
  --expires-in-days 30
```

전체 토큰은 `stdout`에 한 번만 표시되고 DB에는 해시만 저장됩니다. 즉시 비밀 관리 시스템으로 옮기고 터미널 스크롤백을 정리하세요. 생성·수정용 에이전트는 필요한 리소스의 `:write` scope만 별도로 추가하고, 사람의 광범위한 토큰을 공유하지 않습니다. 견적 승인·확정·취소에는 `quotes:approve`, 운행일지 승인·무효화에는 `trips:approve`가 추가로 필요합니다. `resource:*`는 승인까지 포함하므로 승인 분리가 필요한 토큰에는 사용하지 않습니다. 토큰 발급·폐기와 업무 쓰기는 감사 로그에 남고, 인증 사용 시각은 `last_used_at`으로 추적됩니다.

발급 시 출력한 16자 prefix로 토큰을 폐기합니다.

```bash
npm run api-token:revoke -- --company demo-company --prefix mxk_XXXXXXXXXXXX
```

Compose 운영 배포에서는 관리자 도구가 포함된 일회성 `migrate` 서비스로 같은 명령을 실행합니다. 앱 컨테이너의 제한 DB 역할로는 토큰을 발급하거나 폐기할 수 없습니다.

```bash
docker compose run --rm migrate npm run --silent api-token:issue -- \
  --company company-slug \
  --email operator@example.com \
  --name 'MOARIX AI read only' \
  --scopes 'context:read,assets:read,cases:read' \
  --expires-in-days 30
```

## 공통 형식

```text
moarix health
moarix context
moarix capabilities
moarix schema
moarix command run <operation> [--data <JSON|@file|->] [--dry-run]
moarix <resource> <action> [id] [--data <JSON|@file|->] [--dry-run]
```

| 옵션 | 의미 |
|---|---|
| `--data '{"field":"value"}'` | 인라인 JSON 객체 |
| `--data @request.json` | UTF-8 JSON 파일 |
| `--data -` | 표준 입력의 JSON 객체 |
| `--dry-run` | 서버가 지원하면 쓰기를 검증만 하고 반영하지 않음 |
| `--idempotency-key <key>` | 동일 쓰기 재시도에 재사용할 키 |
| `--machine` | 공백 없는 한 줄 JSON 출력 |
| `--agent` | 한 줄 JSON 출력. 단독 사용 시 AI용 명령 스키마 출력 |

쓰기 operation에는 CLI가 `Idempotency-Key` UUID를 자동 생성합니다. 재시도 가능성이 있으면 처음부터 명시적 키를 사용하는 것이 가장 명확합니다. 자동 키를 사용한 쓰기에서 연결 끊김·timeout·잘린 응답이 발생하면 오류 JSON은 `meta.outcome: "unknown"`과 `meta.idempotencyKey`를 반환합니다. 입력을 바꾸지 말고 그 키를 `--idempotency-key`로 지정해 동일 요청을 재시도해야 중복 생성을 막을 수 있습니다.

Bearer 토큰 전송을 보호하기 위해 원격 `MOARIX_URL`은 HTTPS만 허용합니다. HTTP는 `localhost`, `127.0.0.1`, `::1` 같은 로컬 loopback에서만 사용할 수 있습니다.

## 탐색 명령

| 명령 | API | 인증 |
|---|---|---|
| `health` | `GET /api/health` | 불필요 |
| `context` | `GET /api/v1/context` | 필요 |
| `capabilities` | `GET /api/v1/capabilities` | 필요 |
| `schema`, `--agent` | 로컬 명령 스키마 | 불필요 |

AI는 먼저 `context`에서 회사·사용자 범위를 확인하고, `capabilities`에서 서버가 실제 허용하는 operation과 입력 스키마를 확인해야 합니다. 로컬 `schema`는 CLI 문법을 설명하며 서버 권한을 대신하지 않습니다.

## 업무 친화 명령

| 친화 명령 | 전송 operation | ID 필요 |
|---|---|---|
| `customer list` | `master.counterparties.list` | 아니요 |
| `customer create` | `master.counterparties.create` | 아니요 |
| `item list` | `master.items.list` | 아니요 |
| `item create` | `master.items.create` | 아니요 |
| `site list` | `sites.list` | 아니요 |
| `site create` | `sites.create` | 아니요 |
| `asset list` | `assets.list` | 아니요 |
| `asset get <id>` | `assets.get` | 예 |
| `asset create` | `assets.create` | 아니요 |
| `asset update <id>` | `assets.update` | 예 |
| `case list` | `cases.list` | 아니요 |
| `case get <id>` | `cases.get` | 예 |
| `case create` | `cases.create` | 아니요 |
| `case activity-add <id>` | `cases.activity.add` | 예 |
| `case attachment-add <id>` | `cases.attachment.add` | 예 |
| `case watcher-add <id>` | `cases.watcher.add` | 예 |
| `case transition <id>` | `cases.transition` | 예 |
| `inspection list|get|create|transition` | `inspections.*` | `get`, `transition`만 예 |
| `quote list|get|create|update|transition` | `quotes.*` | `get`, `update`, `transition`만 예 |
| `trip list|get|create|update|transition|summary` | `trips.*` | `get`, `update`, `transition`만 예 |
| `report run` | `reports.run` | 아니요 |

ID가 필요한 친화 명령은 위치 인자를 API 입력의 `input.id`로 합칩니다. `--data` 안에도 `id`를 넣었다면 위치 ID와 같아야 합니다.

목록 필터, 페이지 크기, 정렬, 생성·수정 필드는 서버가 반환하는 `capabilities` 스키마를 따릅니다.

```bash
moarix asset list --data '{"limit":20}' --machine

moarix asset get AST-0001 --machine

moarix case activity-add CS-DEMO-0001 \
  --data '{"kind":"comment","body":"현장 확인 일정을 조율 중입니다."}' \
  --dry-run

moarix report run \
  --data '{"report":"support-risk","format":"json"}' \
  --machine
```

`delete`는 감사 가능한 비활성화·보존 정책이 정해지기 전까지 친화 명령으로 제공하지 않습니다. 서버가 새 operation을 공개하면 `command run`으로 먼저 사용할 수 있습니다.

## 범용 operation

```bash
moarix command run assets.list --data '{"limit":10}' --machine

printf '%s' '{"id":"CS-DEMO-0001","nextStatus":"in_progress"}' | \
  moarix command run cases.transition \
    --data - \
    --dry-run \
    --idempotency-key ai-run-20260826-0001 \
    --agent
```

범용 operation 이름은 소문자 영숫자를 점(`.`)으로 구분해야 합니다. 최종 허용 여부와 입력 검증은 서버 capability와 역할 권한이 결정합니다.

## 출력과 종료 코드

API가 반환한 `moarix/v1` envelope를 보존하고 `meta.httpStatus`만 추가합니다.

```json
{
  "apiVersion": "moarix/v1",
  "data": {},
  "meta": {
    "httpStatus": 200,
    "requestId": "request_demo_001"
  },
  "ok": true
}
```

| 종료 코드 | 의미 |
|---:|---|
| `0` | 성공 |
| `2` | 명령 문법, 입력 JSON, 환경 설정 오류 |
| `3` | 인증 또는 권한 실패 |
| `4` | 리소스 또는 API 경로 없음 |
| `5` | API가 입력·상태 충돌 등으로 요청 거부 |
| `6` | 연결, 시간 초과, 서버 오류 |

자동화에서는 JSON의 `ok`와 프로세스 종료 코드를 함께 검사하세요. 오류 JSON은 `stderr`에만 출력되므로 성공 데이터 파이프라인과 섞이지 않습니다.

## API 계약

- `POST /api/v1/commands`
- 요청 본문: `{ "operation": string, "input": object, "dryRun": boolean }`
- 인증: `Authorization: Bearer $MOARIX_TOKEN`
- 쓰기 중복 방지: `Idempotency-Key: <key>`
- 컨텍스트: `GET /api/v1/context`
- 기능 탐색: `GET /api/v1/capabilities`
- 성공 envelope: `{ "apiVersion":"moarix/v1", "ok":true, "data":..., "meta":... }`

CLI timeout은 `MOARIX_TIMEOUT_MS`로 설정하며 허용 범위는 1,000~300,000ms입니다.
