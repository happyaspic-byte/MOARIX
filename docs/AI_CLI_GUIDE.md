# AI 에이전트용 MOARIX CLI 가이드

이 문서는 AI가 화면을 클릭하는 대신 MOARIX의 공개 command API를 안전하고 빠르게 사용하는 절차입니다. CLI는 대화형 질문을 하지 않으며 입력과 출력을 JSON으로 고정합니다. `moarix`와 짧은 별칭 `mx`는 같은 명령입니다.

## 에이전트 시작 절차

매 작업 세션에서 다음 순서를 지킵니다.

1. `moarix health --agent`로 서버 연결을 확인합니다.
2. `moarix context --agent`로 현재 회사, 사용자, 역할 범위를 확인합니다.
3. `moarix capabilities --agent`로 허용 operation과 최신 입력 스키마를 읽습니다.
4. 조회 명령으로 대상 ID와 현재 상태를 확인합니다.
5. 쓰기는 먼저 `--dry-run`으로 검증합니다.
6. 사용자 의도와 dry-run 결과가 맞으면 같은 입력으로 실제 쓰기를 실행합니다.
7. 같은 쓰기를 재시도할 가능성이 있으면 처음부터 명시적인 idempotency key를 만들고 재사용합니다.
8. 성공 envelope의 `requestId`, 대상 ID와 변경 결과를 사용자에게 보고합니다.

CLI 자체 문법은 네트워크 없이 확인할 수 있습니다.

```bash
moarix --agent
```

## AI에 제공할 실행 원칙

다음 내용을 에이전트 시스템 지침이나 저장소 작업 지침에 넣을 수 있습니다.

```text
MOARIX 업무를 수행할 때 브라우저 조작보다 `moarix` CLI를 우선한다.
항상 health → context → capabilities 순서로 실행하고, capability에 없는 operation을 추측하지 않는다.
조회로 대상을 식별한 뒤 쓰기를 수행한다. 생성·수정·상태 전이는 먼저 --dry-run으로 검증한다.
한 작업의 재시도에는 동일한 --idempotency-key를 사용한다.
MOARIX_TOKEN을 명령 인자, --data, 프롬프트, 출력, 로그에 절대 넣지 않는다.
원격 MOARIX_URL은 반드시 HTTPS를 사용한다.
stdout JSON의 ok와 프로세스 종료 코드를 검사한다. stderr 오류를 숨기지 않는다.
삭제 operation은 호출하지 않는다. 서버가 명시한 상태 전이·비활성화 정책을 사용한다.
견적·운행일지 승인은 일반 쓰기 토큰과 분리된 approve scope 및 승인 역할로만 수행한다.
완료 보고에는 operation, 대상 ID, 결과 상태, requestId를 포함하고 토큰과 개인정보는 제외한다.
```

## 비밀값 주입

AI 프롬프트에 토큰을 복사하지 않습니다. 에이전트 프로세스를 시작하는 런타임이 `MOARIX_URL`과 `MOARIX_TOKEN`을 환경 변수로 주입해야 합니다. CLI는 토큰용 argv 옵션을 제공하지 않으며 오류 메시지에도 토큰을 출력하지 않습니다.

```bash
MOARIX_URL=http://localhost:3000 \
MOARIX_TOKEN="$MOARIX_AUTOMATION_TOKEN" \
moarix context --agent
```

운영 토큰은 사용자 토큰을 공유하지 말고 AI 전용 서비스 계정에 최소 역할과 만료를 부여합니다. 회사별 토큰을 분리하고 읽기 전용 에이전트와 쓰기 에이전트도 분리하는 것이 좋습니다.

## 업무 패턴

### 자산 조회 후 수정

```bash
moarix asset list --data '{"query":"합성 테스트"}' --agent
moarix asset get AST-0001 --agent

moarix asset update AST-0001 \
  --data '{"status":"maintenance","environment":"production","configurationSource":"manual"}' \
  --dry-run \
  --idempotency-key asset-demo-001-support-01 \
  --agent

moarix asset update AST-0001 \
  --data '{"status":"maintenance","environment":"production","configurationSource":"manual"}' \
  --idempotency-key asset-demo-001-support-01 \
  --agent
```

### 서비스 케이스 기록

```bash
moarix case get CS-DEMO-0001 --agent

moarix case activity-add CS-DEMO-0001 \
  --data '{"kind":"comment","body":"고객과 다음 점검 일정을 조율했습니다."}' \
  --dry-run \
  --idempotency-key case-demo-001-comment-01 \
  --agent
```

### 운행일지 생성

운행일지는 시작·종료 날짜, 출발·도착, 거리, 목적을 구조화해 전송합니다. 필드명과 필수값은 반드시 현재 `capabilities` 결과를 따릅니다.

```bash
moarix trip create \
  --data @trip-request.json \
  --dry-run \
  --idempotency-key trip-demo-20260826-01 \
  --agent
```

검증 후 같은 파일과 키에서 `--dry-run`만 제거합니다. 월별 집계는 다음과 같이 요청합니다.

```bash
moarix trip summary --data '{"month":"2026-08"}' --agent
```

### 견적서 생성과 상태 전이

```bash
moarix quote create \
  --data @quote-request.json \
  --dry-run \
  --idempotency-key quote-demo-001-create \
  --agent

moarix quote transition Q-2026-0001 \
  --data '{"nextStatus":"submitted"}' \
  --dry-run \
  --idempotency-key quote-demo-001-submit \
  --agent
```

견적 상태 전이는 조회 → dry-run → 반영 순서로 실행합니다. 승인 역할이 필요한 전이는 API가 거부할 수 있으며, AI가 권한을 우회해서는 안 됩니다.

### 보고서 조회

```bash
moarix report run \
  --data '{"report":"support-risk","format":"json"}' \
  --agent
```

## 대량 입력

긴 JSON을 셸 인라인으로 만들지 말고 검토 가능한 임시 파일 또는 표준 입력을 사용합니다.

```bash
moarix inspection create \
  --data @inspection-request.json \
  --dry-run \
  --idempotency-key inspection-demo-001 \
  --agent
```

CLI는 한 번에 JSON 객체 하나만 받습니다. 여러 건을 처리할 때 각 건에 별도 idempotency key를 부여하고 개별 성공 여부를 기록합니다. 한 건이 실패했다고 검증 없이 전체 배치를 반복하지 않습니다.

## 오류 복구

- 종료 `2`: 명령 문법, JSON, 환경 변수를 수정합니다. 같은 요청을 그대로 반복하지 않습니다.
- 종료 `3`: 토큰 만료와 역할 권한을 확인합니다. 권한 우회를 시도하지 않습니다.
- 종료 `4`: 목록 조회로 ID와 operation을 다시 확인합니다.
- 종료 `5`: 오류 code와 현재 리소스 상태를 읽고 입력 또는 상태 전이를 수정합니다.
- 종료 `6`: 서버 health와 네트워크를 확인합니다. 쓰기 결과가 불명확하면 반드시 같은 idempotency key로만 재시도합니다.

CLI가 자동 생성한 쓰기 키를 사용하던 중 연결 끊김이나 timeout이 발생하면 오류 JSON의 `meta.idempotencyKey`와 `meta.outcome: "unknown"`을 확인합니다. 새 키를 만들지 말고, 입력을 바꾸지 않은 동일 요청에 그 키를 `--idempotency-key`로 지정해 재시도합니다.

상세 문법과 operation 매핑은 [CLI 참조](CLI_REFERENCE.md)를 확인하세요.
