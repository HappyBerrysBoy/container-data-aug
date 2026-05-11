# 백엔드 ↔ DB 연결 명세서 (MVP)

## 1. 이 문서의 목적

현재 백엔드는 JSON 파일(`backend/data/app_state.json`)에 모든 상태를 저장한다.
이 문서는 그 저장소를 PostgreSQL로 이전하기 위한 사양서다.

구체적으로 다음을 엔드포인트별로 정의한다.

> 프론트엔드가 어떤 API를 호출했을 때, 백엔드가 어떤 SQL을 어떤 순서로
> 실행하고, 어떤 응답을 만드는가.

이 문서만 보고 백엔드 코드를 다시 작성할 수 있는 수준을 목표로 한다.

### 1.1 전제 문서

- `docs/ERD_MVP_spec.md` — 테이블 / 컬럼 / 인덱스 정의. DDL의 단일 출처.
- `docs/API-MVP-spec.md` — 엔드포인트 계약 (요청 / 응답 형태).

두 문서와 충돌이 있으면, 백엔드의 실제 동작에 한해 본 문서가 우선한다.

### 1.2 본 문서 채택의 부수효과

- `docs/backend-MVP-design-decisions.ko.md` §1 ("JSON 파일 저장소")은 본 문서로
  대체된다.
- `backend/app/repositories/json_store.py`는 삭제 대상이다.
- `backend/data/app_state.json`은 폐기한다. `backend/data/`는 `.gitignore`
  처리한다.

---

## 2. 용어 정리

본 문서 전반에서 사용되는 용어를 먼저 정의한다.

| 용어 | 정의 |
|---|---|
| **active task** | `PENDING` 또는 `RUNNING` 상태의 증강 작업. 전역에 1개만 허용된다. |
| **partial unique index** | 조건을 만족하는 행끼리만 유일성을 강제하는 PostgreSQL 인덱스. 본 시스템에서는 "active 상태의 task 행은 전 DB에 1개만 존재 가능"을 강제하는 데 사용한다. |
| **UniqueViolation** | psycopg가 unique 제약 위반 시 던지는 예외. 본 문서에서는 이 예외를 잡아 `409 TASK_ALREADY_RUNNING`으로 매핑한다. |
| **runner** | 증강 작업을 실제로 수행하는 백그라운드 스레드. FastAPI 프로세스 내에서 동작하며 별도 워커 프로세스 / Celery 등을 사용하지 않는다. |
| **idempotent** | 여러 번 실행해도 결과가 동일한 연산. DDL을 `IF NOT EXISTS`로 정의하면 그러하다. |
| **race** | 둘 이상의 흐름이 거의 동시에 같은 자원을 변경할 때 발생하는 충돌. 본 시스템에서는 partial unique index로 backstop한다. |

---

## 3. 인프라 결정

### 3.1 드라이버

- `psycopg 3`을 사용한다. (`pyproject.toml`에 `psycopg[binary]>=3.3.3`이
  이미 명시되어 있다.)
- 결과 row는 `dict_row` 팩토리로 받아 dict로 다룬다.
- ORM은 사용하지 않는다. 모든 SQL은 본 문서에 명시된 raw SQL이다.

### 3.2 동기 / 비동기

- 동기(sync) 인터페이스만 사용한다. FastAPI 라우트도 `def` 기반이며 `async`
  를 사용하지 않는다.
- 증강 작업은 `threading.Thread`로 백엔드 프로세스 내에서 실행한다.

### 3.3 Connection 관리

- API 요청당 connection 1개를 새로 열고 응답 후 닫는다. Connection pool은
  도입하지 않는다.
- Runner 스레드는 작업 시작 시 connection 1개를 받아 작업 종료까지 유지한다.
  이미지마다 새 connection을 여는 비용을 회피하기 위함이다.

### 3.4 트랜잭션 모드

psycopg 3 기본 모드(`autocommit=False`)를 그대로 사용한다. 즉, `with conn:`
블록 1개가 1 트랜잭션이며, 블록 종료 시 commit되고 예외 시 rollback된다.

예외: runner connection은 `conn.autocommit = True`로 설정한다. Runner는 매
이미지마다 UPDATE 1건을 실행하며, statement 단위로 즉시 commit되는 것이
의미상 자연스럽다.

### 3.5 환경변수

- `DATABASE_URL`이 필수다. 예: `postgresql://user:pass@localhost:5432/container_data_aug`
- 미설정 시 앱은 startup 단계에서 실패한다.

### 3.6 스키마 부트스트랩

- DDL의 단일 출처는 `docs/ERD_MVP_spec.md` §9다.
- 동일 내용을 `backend/sql/schema.sql`로 둔다. 두 파일은 수동으로 동기화한다.
- 앱 startup 시 `schema.sql`을 1회 실행한다. 모든 DDL이 `IF NOT EXISTS`
  형태이므로 idempotent하다.
- Alembic 등 마이그레이션 도구는 MVP 단계에서 도입하지 않는다. 스키마가
  안정화된 이후 도입한다.

### 3.7 코드 영향 요약

본 문서 채택 시 백엔드에서 발생하는 변경 사항이다.

| 항목 | 변경 |
|---|---|
| `repositories/json_store.py` | 삭제 |
| `repositories/postgres.py` | 유지. `connect()` 그대로 사용 |
| `repositories/projects_repo.py` | 신규. 본 문서의 SQL을 메서드로 래핑 |
| `repositories/tasks_repo.py` | 신규 |
| `services/project_service.py` | JSON 호출을 repo 호출로 교체 |
| `services/augmentation_service.py` | JSON 호출 교체 + `threading.Event` 제거 |
| `main.py` startup | `schema.sql` 실행, stale task 정리 |
| `backend/data/` | 사용 안 함. `.gitignore` |

---

## 4. 공용 규약

### 4.1 컬럼 ↔ JSON 필드 변환

- DB는 snake_case(`file_count`), API는 camelCase(`fileCount`)를 사용한다.
- 변환은 응답 직렬화 직전 단계에서 수행한다. 내부 코드는 snake_case로 흐른다.
- 구체 매핑 표는 `docs/ERD_MVP_spec.md` §2.3, §3.4, §4.1을 참조한다.

### 4.2 `processed_count`의 의미

`processed_count`는 다음과 같이 정의한다.

- `processed_count` = 성공 + 실패 합계 (처리된 원본 이미지 수)
- `failed_count` = 그 중 실패한 수
- API 응답의 `successCount` = `processed_count - failed_count`
- `progress` = `processed_count * 100 / total_image_count`

이 정의 하에서 ERD의 `failed_count <= processed_count` CHECK 제약이 자연스럽게
성립한다.

> 기존 `augmentation_service.py:82-84`는 `processed_count`를 성공 시에만 증가
> 시키나, 본 명세 기준에서는 성공 / 실패 모두 증가시켜야 한다.

### 4.3 Active task 단일성

"전 DB에 PENDING / RUNNING 상태 task는 1개만 존재한다"는 규칙은 ERD의
partial unique index로 강제된다.

```sql
CREATE UNIQUE INDEX uq_only_one_active_augmentation_task
    ON augmentation_tasks ((true))
    WHERE status IN ('PENDING', 'RUNNING');
```

백엔드는 이 인덱스를 backstop으로 신뢰하되, 사용자에게 친절한 에러 메시지를
제공하기 위해 INSERT 전에 사전 SELECT를 수행한다. 사전 SELECT 결과를 통해
응답의 `details`에 기존 active task의 `id`를 포함시킨다.

거의 동시에 두 흐름이 INSERT를 시도하는 race가 발생하면, 한 쪽은 인덱스에
의해 `UniqueViolation`을 받는다. 해당 예외도 동일하게 `409
TASK_ALREADY_RUNNING`으로 매핑한다.

### 4.4 에러 매핑

| 상황 | 감지 위치 | API 에러코드 | HTTP |
|---|---|---|---|
| 요청 값 검증 실패 | 백엔드 코드 | `VALIDATION_ERROR` | 422 |
| 프로젝트 조회 SELECT 0 row | SELECT 결과 | `PROJECT_NOT_FOUND` | 404 |
| 작업 조회 SELECT 0 row | SELECT 결과 | `TASK_NOT_FOUND` | 404 |
| 로컬 경로 없음 | OS-level | `PATH_NOT_FOUND` | 422 |
| 로컬 경로 읽기 불가 | OS-level | `PATH_NOT_READABLE` | 422 |
| 출력 경로 쓰기 불가 | OS-level | `PATH_NOT_WRITABLE` | 422 |
| 이미 active task 존재 | 사전 SELECT 또는 `UniqueViolation` | `TASK_ALREADY_RUNNING` | 409 |
| Active task 있는 project DELETE | 사전 SELECT | **`PROJECT_HAS_ACTIVE_TASK`** | 409 |
| 종료 불가 상태의 task에 stop | 상태 확인 | `TASK_NOT_RUNNING` | 409 |
| 결과 조회 가능 상태 아님 | 상태 확인 | `TASK_NOT_FINISHED` | 409 |
| 그 외 DB 오류 | psycopg 예외 일반 | `INTERNAL_SERVER_ERROR` | 500 |

`PROJECT_HAS_ACTIVE_TASK`는 본 문서에서 신설되는 에러 코드다.
`docs/API-MVP-spec.md` §4.4 표에도 동일한 행이 추가되어야 한다.

### 4.5 SQL 파라미터 바인딩

모든 SQL은 `%s` 또는 `%(name)s` placeholder를 사용한다. 문자열 포맷팅으로
값을 직접 결합하는 것은 금지한다 (SQL injection 방어).

---

## 5. 공용 SQL 블록

여러 엔드포인트에서 재사용되는 SQL은 본 섹션에서 한 번만 정의하고, §6 이하는
이름으로 참조한다.

### 5.1 `Q_PROJECT_BY_ID`

id로 프로젝트 1건을 조회한다.

```sql
SELECT id, title, description, source_folder_path, target_spec,
       file_count, total_size_bytes, has_labels, created_at
FROM projects
WHERE id = %(project_id)s;
```

0 row이면 `PROJECT_NOT_FOUND`로 매핑한다.

### 5.2 `Q_PROJECT_LIST`

프로젝트 전체 목록을 최신 순으로 반환한다. MVP는 pagination 없이 전체 반환
한다.

```sql
SELECT id, title, description, source_folder_path, target_spec,
       file_count, total_size_bytes, has_labels, created_at
FROM projects
ORDER BY id DESC;
```

### 5.3 `Q_LATEST_TASK_SUMMARY`

특정 프로젝트의 가장 최근 task 요약을 조회한다. `GET /api/projects/{id}` 응답의
`latestTask` 필드 생성에 사용한다.

```sql
SELECT id, status, progress
FROM augmentation_tasks
WHERE project_id = %(project_id)s
ORDER BY id DESC
LIMIT 1;
```

0 row이면 응답의 `latestTask`는 `null`이다.

### 5.4 `Q_ACTIVE_TASK`

현재 전역에서 실행 중인 작업을 조회한다.

```sql
SELECT id, project_id, status, progress, worker_count, run_ocr_labeling,
       variants_per_image, processed_count, failed_count, total_image_count,
       generated_image_count, output_folder_path, started_at, completed_at
FROM augmentation_tasks
WHERE status IN ('PENDING', 'RUNNING')
ORDER BY id DESC
LIMIT 1;
```

Partial unique index에 의해 결과는 0 또는 1 row다.

### 5.5 `Q_ACTIVE_TASK_FOR_PROJECT`

특정 프로젝트에 active task가 존재하는지 확인한다. `DELETE
/api/projects/{id}`의 사전 체크에 사용한다.

```sql
SELECT id, status
FROM augmentation_tasks
WHERE project_id = %(project_id)s
  AND status IN ('PENDING', 'RUNNING')
LIMIT 1;
```

### 5.6 `Q_TASK_BY_ID`

id로 task 1건을 조회한다.

```sql
SELECT id, project_id, status, progress, worker_count, run_ocr_labeling,
       variants_per_image, processed_count, failed_count, total_image_count,
       generated_image_count, output_folder_path, started_at, completed_at
FROM augmentation_tasks
WHERE id = %(task_id)s;
```

0 row이면 `TASK_NOT_FOUND`로 매핑한다.

### 5.7 `Q_INSERT_PROJECT`

새 프로젝트를 생성하고 생성된 row를 반환한다.

```sql
INSERT INTO projects
    (title, description, source_folder_path, target_spec,
     file_count, total_size_bytes, has_labels)
VALUES
    (%(title)s, %(description)s, %(source_folder_path)s, %(target_spec)s,
     %(file_count)s, %(total_size_bytes)s, %(has_labels)s)
RETURNING id, title, description, source_folder_path, target_spec,
          file_count, total_size_bytes, has_labels, created_at;
```

### 5.8 `Q_UPDATE_PROJECT_SCAN`

재스캔 결과로 프로젝트의 카운트 필드만 갱신한다.

```sql
UPDATE projects
SET file_count = %(file_count)s,
    total_size_bytes = %(total_size_bytes)s,
    has_labels = %(has_labels)s
WHERE id = %(project_id)s
RETURNING id, title, description, source_folder_path, target_spec,
          file_count, total_size_bytes, has_labels, created_at;
```

0 row 반환은 사전 SELECT 사이에 삭제된 경우이며 `PROJECT_NOT_FOUND`로 매핑
한다.

### 5.9 `Q_DELETE_PROJECT`

프로젝트를 삭제한다. FK가 `ON DELETE CASCADE`이므로 종료된 task 행이 함께
삭제된다.

```sql
DELETE FROM projects WHERE id = %(project_id)s;
```

호출 전에 `Q_ACTIVE_TASK_FOR_PROJECT`로 active task 부재를 보장해야 한다.

### 5.10 `Q_INSERT_TASK`

새 증강 작업을 PENDING 상태로 생성한다.

```sql
INSERT INTO augmentation_tasks
    (project_id, status, progress,
     worker_count, run_ocr_labeling, variants_per_image,
     output_folder_name, output_folder_path,
     processed_count, failed_count, total_image_count, generated_image_count)
VALUES
    (%(project_id)s, 'PENDING', 0,
     %(worker_count)s, %(run_ocr_labeling)s, %(variants_per_image)s,
     %(output_folder_name)s, %(output_folder_path)s,
     0, 0, %(total_image_count)s, 0)
RETURNING id, project_id, status, progress, worker_count, run_ocr_labeling,
          variants_per_image, processed_count, failed_count, total_image_count,
          generated_image_count, output_folder_path, started_at, completed_at;
```

Partial unique index 위반 시 psycopg는 `psycopg.errors.UniqueViolation`을
던진다. 호출 측은 이 예외를 잡아 `409 TASK_ALREADY_RUNNING`으로 매핑한다.

### 5.11 `Q_MARK_TASK_RUNNING`

Runner가 작업 시작 시점에 호출한다.

```sql
UPDATE augmentation_tasks
SET status = 'RUNNING',
    started_at = now()
WHERE id = %(task_id)s
  AND status = 'PENDING'
RETURNING status;
```

`WHERE ... status = 'PENDING'` 절은 사용자가 INSERT 직후 즉시 stop을 호출해
이미 STOPPED로 전이된 경우를 처리한다. 이 경우 0 row가 반환되며 runner는
즉시 종료한다.

### 5.12 `Q_INCREMENT_TASK_COUNTS`

Runner의 메인 루프에서 매 이미지 처리 후 1회 호출한다. 한 statement 안에서
카운터 증가, progress 재계산, stop 신호 감지를 모두 수행한다.

```sql
UPDATE augmentation_tasks
SET processed_count = processed_count + 1,
    failed_count = failed_count + %(failed_delta)s,
    generated_image_count = generated_image_count + %(generated_delta)s,
    progress = LEAST(100,
        FLOOR(((processed_count + 1) * 100.0)
              / GREATEST(total_image_count, 1))::INTEGER)
WHERE id = %(task_id)s
  AND status = 'RUNNING'
RETURNING status;
```

파라미터:

| 인자 | 성공 시 | 실패 시 |
|---|---|---|
| `failed_delta` | 0 | 1 |
| `generated_delta` | `variants_per_image` | 0 |

> `generated_delta`는 MVP runner가 실제로는 이미지 1장만 복사하더라도 약속된
> 결과물 수로 계산한다. 백엔드 결정사항 §3 동작과 일관한다.

반환 해석:

- `RETURNING status = 'RUNNING'` — 정상. 다음 이미지로 진행한다.
- 0 row 반환 — status가 `RUNNING`이 아니라는 의미다. Stop이 호출되었거나
  외부에서 종료되었다. Runner는 즉시 루프를 break한다.

`WHERE ... AND status = 'RUNNING'` 절에 의해 별도의 `threading.Event` 없이
DB의 `status` 컬럼이 stop 신호의 단일 진실원이 된다.

### 5.13 `Q_FINISH_TASK`

작업을 종료 상태로 전이한다.

```sql
UPDATE augmentation_tasks
SET status = %(status)s,
    completed_at = now(),
    progress = COALESCE(%(progress)s, progress)
WHERE id = %(task_id)s
  AND status IN ('PENDING', 'RUNNING')
RETURNING id, project_id, status, progress, worker_count, run_ocr_labeling,
          variants_per_image, processed_count, failed_count, total_image_count,
          generated_image_count, output_folder_path, started_at, completed_at;
```

파라미터:

- `status`: `'DONE'`, `'FAILED'`, `'STOPPED'` 중 하나
- `progress`: DONE 시 `100`, 그 외 `NULL` (NULL이면 기존 값을 유지한다)

0 row 반환은 이미 다른 경로에서 종료된 경우이며, 호출자가 상태별로 분기한다.

### 5.14 `Q_RECOVER_STALE_TASKS`

앱 startup 시 1회 실행한다. 직전 실행에서 RUNNING 상태로 멈춘 task를 정리
한다.

```sql
UPDATE augmentation_tasks
SET status = 'FAILED',
    completed_at = now()
WHERE status IN ('PENDING', 'RUNNING');
```

Partial unique index가 active task를 0개로 만들므로 다음 task 생성이 가능해
진다.

---

## 6. 엔드포인트별 흐름

각 엔드포인트는 다음 공통 패턴을 따른다.

1. 입력 검증 (Python 코드, DB 접근 없음).
2. 외부 I/O (필요 시) — 폴더 스캔, mkdir 등. 트랜잭션 밖에서 수행한다.
3. `with db.connect() as conn:` 블록 내에서 SQL 실행. 블록 종료 시 자동
   commit된다.
4. 응답 매핑 (snake_case → camelCase).

본 섹션은 각 엔드포인트에서 위 흐름 중 달라지는 부분만 기술한다.

### 6.1 `GET /api/health`

- 동작: 서버 생존 확인.
- DB 접근 없음. `{"status": "ok"}`를 즉시 반환한다.

### 6.2 `GET /api/projects`

- 동작: 프로젝트 목록 반환.
- SQL: `Q_PROJECT_LIST` 1회.
- 응답: `{"data": [Project, ...]}` (id 내림차순).

### 6.3 `POST /api/projects`

새 프로젝트를 생성한다.

1. 검증:
   - `title`이 비어 있지 않다.
   - `sourceFolderPath`가 절대경로다.
   - 해당 경로가 디렉터리로 존재한다 (없으면 `PATH_NOT_FOUND`).
   - 해당 경로에 읽기 권한이 있다 (없으면 `PATH_NOT_READABLE`).
2. `services/folder_scanner.scan_folder(source_folder)`로 `file_count`,
   `total_size_bytes`, `has_labels`를 계산한다. **트랜잭션 밖**에서 수행
   한다. 스캔이 느리므로 connection을 점유하지 않는다.
3. `Q_INSERT_PROJECT`.
4. `201`과 함께 생성된 `Project`를 반환한다.

### 6.4 `GET /api/projects/{projectId}`

프로젝트 상세 + 최근 task 요약을 반환한다.

1. `Q_PROJECT_BY_ID`. 0 row이면 `404 PROJECT_NOT_FOUND`.
2. `Q_LATEST_TASK_SUMMARY` (같은 connection / 트랜잭션 내).
3. `Project`에 `latestTask` (없으면 `null`)를 추가하여 반환한다.

> 두 SELECT 사이에 새 task가 INSERT되어도 의미적으로 무해하다. Latest task는
> 단조 증가하며 다음 polling에서 반영된다.

### 6.5 `DELETE /api/projects/{projectId}`

프로젝트 메타데이터를 삭제한다. **Active task가 있으면 거부한다.**

1. `Q_PROJECT_BY_ID`. 0 row이면 `404 PROJECT_NOT_FOUND`.
2. `Q_ACTIVE_TASK_FOR_PROJECT`. 1 row 반환 시 `409 PROJECT_HAS_ACTIVE_TASK`
   를 반환한다. `details`에 `{projectId, taskId, status}`를 포함한다.
3. `Q_DELETE_PROJECT`.
4. `204` (body 없음).

세 statement는 같은 트랜잭션에 묶인다.

> Active task가 있는 project를 CASCADE로 즉시 삭제하면, runner 스레드가 자기
> task row가 사라진 사실을 모르고 디스크에 결과 파일을 계속 생성하는 좀비
> 상태가 발생한다. 본 규칙으로 이를 방지한다.

### 6.6 `POST /api/projects/{projectId}/rescan`

저장된 `source_folder_path`를 다시 스캔해 카운트 필드만 갱신한다. 다른
메타데이터(`title` 등)와 task 이력은 보존한다.

1. `Q_PROJECT_BY_ID`. 0 row이면 `404 PROJECT_NOT_FOUND`.
2. 저장된 `source_folder_path`가 여전히 디렉터리이고 읽기 가능한지 확인한다
   (실패 시 `PATH_NOT_FOUND` / `PATH_NOT_READABLE`).
3. `scan_folder()` 호출 (트랜잭션 밖).
4. `Q_UPDATE_PROJECT_SCAN`.
5. 갱신된 `Project`를 반환한다.

### 6.7 `POST /api/projects/{projectId}/augmentation-tasks`

새 증강 작업을 생성하고 즉시 백그라운드 실행을 시작한다.

1. 검증:
   - `workerCount >= 1`.
   - `1 <= variantsPerImage <= 90`.
   - `outputFolderName`이 비어 있지 않으며, 폴더 이름이어야 한다(경로 X).
     `/`, `\\`, `.`, `..` 등은 거부한다.
2. `Q_PROJECT_BY_ID`. 0 row이면 `404 PROJECT_NOT_FOUND`.
3. `Q_ACTIVE_TASK`. 1 row 반환 시 `409 TASK_ALREADY_RUNNING`을 반환한다.
   `details`에 `{taskId}`를 포함한다 (사전 SELECT 경로의 친절한 메시지).
4. 출력 경로 계산: `output_folder_path = parent(source_folder_path) /
   output_folder_name`.
5. `output_folder_path`에 대해 mkdir + 쓰기 가능 확인 (실패 시
   `PATH_NOT_WRITABLE`). 트랜잭션 밖에서 수행한다.
6. `Q_INSERT_TASK`.
   - `UniqueViolation`이 발생하면 동일한 `409 TASK_ALREADY_RUNNING`으로
     매핑한다. (3번과 6번 사이에 다른 흐름이 INSERT한 race.)
7. 트랜잭션 commit 후 runner 스레드를 시작한다 (§7).
8. `201`과 함께 생성된 `AugmentationTask`를 반환한다.

### 6.8 `GET /api/augmentation-tasks/active`

- 동작: 현재 active task 조회.
- SQL: `Q_ACTIVE_TASK` 1회.
- 응답: 1 row이면 `{"task": ...}`, 0 row이면 `{"task": null}`.

### 6.9 `GET /api/augmentation-tasks/{taskId}`

- 동작: 작업 상태 / 진행률 조회. **프론트엔드가 1초마다 polling하는 hot
  path**다.
- SQL: `Q_TASK_BY_ID` 1회. 0 row이면 `404 TASK_NOT_FOUND`.

### 6.10 `POST /api/augmentation-tasks/{taskId}/stop`

작업 중단을 요청한다.

1. `Q_TASK_BY_ID`. 0 row이면 `404 TASK_NOT_FOUND`.
2. `status`가 `PENDING` / `RUNNING`이 아니면 `409 TASK_NOT_RUNNING`.
3. `Q_FINISH_TASK` (`status='STOPPED'`, `progress=NULL`).
   - 0 row 반환 시 runner가 직전에 자기 일을 완료한 경우다.
     `Q_TASK_BY_ID`로 현재 상태를 재조회하여 그 행을 응답한다.
4. 응답: `AugmentationTask`.

Runner는 §5.12의 `Q_INCREMENT_TASK_COUNTS`에서 0 row를 받고 자체 종료한다.
별도 신호 전달 메커니즘이 없다.

### 6.11 `GET /api/augmentation-tasks/{taskId}/result`

결과를 조회한다. 종료된 상태에서만 가능하다.

1. `Q_TASK_BY_ID`. 0 row이면 `404 TASK_NOT_FOUND`.
2. `status NOT IN ('DONE','FAILED','STOPPED')`이면 `409 TASK_NOT_FINISHED`.
3. `AugmentationResult` 매핑:

| API 필드 | 계산 |
|---|---|
| `taskId` | `id` |
| `projectId` | `project_id` |
| `totalImageCount` | `total_image_count` |
| `successCount` | `processed_count - failed_count` |
| `failedCount` | `failed_count` |
| `variantsPerImage` | `variants_per_image` |
| `generatedImageCount` | `generated_image_count` |
| `runOcrLabeling` | `run_ocr_labeling` |
| `outputFolderPath` | `output_folder_path` |
| `completedAt` | `completed_at` |

---

## 7. Runner 동작

`POST /api/projects/{projectId}/augmentation-tasks`가 201을 반환한 직후,
백엔드는 새 `threading.Thread`로 runner를 시작한다. 전체 흐름은 다음과 같다.

1. Runner 스레드는 자기 connection 1개를 `db.connect()`로 받는다.
   `conn.autocommit = True`로 설정한다 (statement 단위 commit).
2. `Q_MARK_TASK_RUNNING`을 실행한다.
   - `RETURNING status = 'RUNNING'`이면 진행.
   - 0 row이면 즉시 종료 (사용자가 이미 stop을 호출했음).
3. `scan_folder()`로 이미지 목록을 확보한다.
   - `total_image_count == 0`이면 `Q_FINISH_TASK('DONE', 100)` 후 종료.
4. 이미지 루프: 각 이미지에 대해
   - 출력 폴더에 `shutil.copy2`로 복사한다. (MVP는 복사만 수행하며 실제
     이미지 증강은 수행하지 않는다.)
   - 성공 / 실패에 따라 `Q_INCREMENT_TASK_COUNTS`를 호출한다.
   - 0 row 반환 시 status가 `RUNNING`이 아니므로 루프를 break한다.
5. 정상 종료: `Q_FINISH_TASK('DONE', 100)`.
6. 예외 발생: `Q_FINISH_TASK('FAILED', NULL)`.
7. `finally`에서 connection을 close한다.

> `run_ocr_labeling`은 저장만 하고 실제 동작은 수행하지 않는다. 백엔드
> 결정사항 §3과 일관한다.
>
> `threading.Event` 기반 stop 메커니즘은 본 문서로 제거된다. DB의 `status`
> 컬럼이 stop 신호의 단일 진실원이다.

---

## 8. Startup / Shutdown

### 8.1 Startup

`main.py`의 lifespan / startup hook에서 다음 순서로 실행한다.

1. `DATABASE_URL` 환경변수를 읽는다. 미설정 시 즉시 실패한다.
2. `db.ping()`으로 DB 연결을 검증한다.
3. `schema.sql`을 1회 실행한다 — 테이블 / 인덱스 / 제약 / partial unique
   index를 생성한다. `IF NOT EXISTS`이므로 반복 실행에 안전하다.
4. `Q_RECOVER_STALE_TASKS`를 1회 실행한다.

### 8.2 Shutdown

MVP는 별도 처리를 두지 않는다. Runner 스레드는 daemon이거나 자연 종료되며,
잔재는 다음 startup의 4번 단계에서 정리된다.

---

## 9. 트랜잭션 / 동시성 정리

| 엔드포인트 | 트랜잭션 구성 | 비고 |
|---|---|---|
| `GET /api/projects` | 단일 SELECT | |
| `POST /api/projects` | 단일 INSERT | 스캔은 트랜잭션 밖 |
| `GET /api/projects/{id}` | 2 SELECT | 같은 트랜잭션 |
| `DELETE /api/projects/{id}` | 3 statement | 1 트랜잭션. 사전 active 체크 포함 |
| `POST .../rescan` | 단일 UPDATE | 스캔은 트랜잭션 밖 |
| `POST .../augmentation-tasks` | SELECT + INSERT | 1 트랜잭션. race는 UniqueViolation으로 처리 |
| `GET .../active` | 단일 SELECT | |
| `GET .../{taskId}` | 단일 SELECT | polling hot path |
| `POST .../stop` | UPDATE [+ SELECT 재조회] | |
| `GET .../result` | 단일 SELECT | |
| Runner | 다중 statement | autocommit=True, statement당 트랜잭션 |
| Startup | 2 statement | schema 적용 + stale 정리 |

격리 수준은 psycopg 3 기본인 `READ COMMITTED`를 그대로 사용한다.
`SERIALIZABLE` 등 상위 격리 수준은 사용하지 않는다.

---

## 10. 본 문서가 다루지 않는 것 (Deferred)

- Alembic 또는 그 외 마이그레이션 도구.
- `resource_usage` 컬럼의 실제 사용 (MVP에서는 항상 NULL이며 API 응답에도
  노출하지 않는다).
- Runner의 실제 이미지 증강 / OCR 라벨링.
- 이미지 / 라벨 단위 row 저장.
- 작업 로그 테이블 / API.
- 멀티 사용자 격리, 인증.
- Connection pool (`psycopg_pool.ConnectionPool`).
- 결과 ZIP 다운로드.

---

## 11. 인수 기준

- `DATABASE_URL`이 설정된 상태에서 앱이 startup하면 `projects`,
  `augmentation_tasks` 테이블과 모든 인덱스 / 제약 / partial unique index가
  존재한다 (없었으면 생성, 있었으면 유지).
- §6의 11개 엔드포인트가 본 문서의 SQL과 일치하게 호출하며,
  `API-MVP-spec.md`의 응답 형태를 반환한다.
- `POST /api/projects/{projectId}/augmentation-tasks`를 거의 동시에 두 번
  호출하면 한 쪽은 `201`을 받고 다른 쪽은 `409 TASK_ALREADY_RUNNING`을 받는다
  (사전 SELECT 경로 또는 `UniqueViolation` 경로).
- Active task가 있는 project에 `DELETE`를 호출하면 `409
  PROJECT_HAS_ACTIVE_TASK`을 받는다.
- Runner 실행 중 사용자가 `POST .../stop`을 호출하면 DB의 `status`가 즉시
  `STOPPED`로 전이되고, runner는 다음 이미지 UPDATE에서 0 row를 받고 자연
  종료한다.
- 앱을 강제 종료한 뒤 재기동하면 직전에 `RUNNING`이던 task가 `FAILED`로
  정리되고 다음 task 생성이 가능해진다.
- `uv run pytest`가 통과한다.
