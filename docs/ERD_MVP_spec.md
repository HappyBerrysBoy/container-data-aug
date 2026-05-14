# MVP Database Schema 명세서

## 1. 개요

이 데이터베이스는 로컬 이미지 증강 MVP를 위한 메타데이터 관리 DB이다.

실제 이미지 파일은 DB에 저장하지 않는다.  
이미지 파일과 증강 결과물은 로컬 디스크에 저장하고, DB에는 프로젝트 정보와 증강 작업 상태만 저장한다.

사용 테이블은 다음 2개이다.

```text
projects
augmentation_tasks
```

---

## 2. `projects`

### 2.1 목적

`projects` 테이블은 사용자가 등록한 로컬 이미지 폴더 기반 프로젝트 정보를 저장한다.

프로젝트 생성 시 백엔드는 사용자가 OS 폴더 선택 창에서 선택해 전달한 `sourceFolderPath`를 스캔해서 이미지 개수, 전체 용량, 라벨 존재 여부를 계산한 뒤 저장한다.

---

### 2.2 주요 컬럼

| 컬럼 | 설명 |
|---|---|
| `id` | 프로젝트 ID |
| `title` | 프로젝트 이름 |
| `description` | 프로젝트 설명 |
| `source_folder_path` | 원본 이미지 폴더 절대경로 |
| `target_spec` | 타겟 규격. 예: `ISO 6346` |
| `file_count` | 스캔된 이미지 파일 수 |
| `total_size_bytes` | 스캔된 이미지 파일 전체 용량 |
| `has_labels` | 라벨 파일 존재 여부 |
| `created_at` | 프로젝트 생성 시간 |

---

### 2.3 API 응답 매핑

| DB 컬럼 | API 필드 |
|---|---|
| `source_folder_path` | `sourceFolderPath` |
| `target_spec` | `targetSpec` |
| `file_count` | `fileCount` |
| `total_size_bytes` | `totalSizeBytes` |
| `has_labels` | `hasLabels` |
| `created_at` | `createdAt` |

---

### 2.4 예시 응답

```json
{
  "id": 1,
  "title": "부산항 컨테이너 번호 데이터셋",
  "description": "촬영 환경 A 기준 데이터셋",
  "sourceFolderPath": "/Users/name/datasets/container-images",
  "targetSpec": "ISO 6346",
  "fileCount": 148,
  "totalSizeBytes": 642147123,
  "hasLabels": true,
  "createdAt": "2026-05-05T08:00:00Z"
}
```

---

## 3. `augmentation_tasks`

### 3.1 목적

`augmentation_tasks` 테이블은 프로젝트별 증강 작업의 실행 상태, 옵션, 진행률, 결과 집계를 저장한다.

하나의 프로젝트는 여러 개의 증강 작업 이력을 가질 수 있다.  
다만 MVP 정책상 `PENDING` 또는 `RUNNING` 상태의 작업은 전체 DB에서 1개만 허용한다.

---

### 3.2 주요 컬럼

| 컬럼 | 설명 |
|---|---|
| `id` | 작업 ID |
| `project_id` | 연결된 프로젝트 ID |
| `status` | 작업 상태 |
| `progress` | 진행률. 0~100 |
| `worker_count` | 요청된 작업 워커 수. MVP runner는 값을 저장만 하고 단일 실행 흐름으로 처리 |
| `run_ocr_labeling` | 호환용 저장 필드. 현재 runner 실행 여부를 제어하지 않음 |
| `variants_per_image` | 원본 이미지 1장당 생성할 증강 결과 수 옵션 |
| `output_folder_name` | 출력 폴더 이름 |
| `output_folder_path` | 출력 폴더 절대경로 |
| `processed_count` | 처리된 원본 이미지 수 |
| `failed_count` | 실패한 원본 이미지 수 |
| `total_image_count` | 전체 대상 원본 이미지 수 |
| `generated_image_count` | 실제 디스크에 생성된 증강 이미지 파일 수 |
| `resource_usage` | 리소스 사용량 정보 |
| `started_at` | 작업 시작 시간 |
| `completed_at` | 작업 완료/중단/실패 시간 |
| `created_at` | 작업 생성 시간 |

---

### 3.3 상태 값

`status`는 다음 값만 허용한다.

```text
PENDING
RUNNING
STOPPED
FAILED
DONE
```

---

### 3.4 API 응답 매핑

| DB 컬럼 | API 필드 |
|---|---|
| `project_id` | `projectId` |
| `worker_count` | `workerCount` |
| `run_ocr_labeling` | `runOcrLabeling` |
| `variants_per_image` | `variantsPerImage` |
| `processed_count` | `processedCount` |
| `failed_count` | `failedCount` |
| `total_image_count` | `totalImageCount` |
| `output_folder_path` | `outputFolderPath` |
| `started_at` | `startedAt` |
| `completed_at` | `completedAt` |

---

### 3.5 예시 응답

```json
{
  "id": 10,
  "projectId": 1,
  "status": "RUNNING",
  "progress": 45,
  "workerCount": 4,
  "runOcrLabeling": true,
  "variantsPerImage": 3,
  "processedCount": 67,
  "failedCount": 2,
  "totalImageCount": 148,
  "outputFolderPath": "/Users/name/datasets/container-images-augmented",
  "startedAt": "2026-05-05T08:10:00Z",
  "completedAt": null
}
```

---

## 4. 증강 결과 응답

증강 결과는 별도 테이블을 만들지 않고 `augmentation_tasks` 테이블에서 계산한다.

### 4.1 매핑

| API 필드 | DB 기준 |
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

`generatedImageCount`는 실제 디스크에 생성된 파일 수다. 현재 shuffle runner는
정상 처리된 원본 이미지마다 `variantsPerImage`개까지 셔플 결과 생성을 시도한다.

---

### 4.2 예시 응답

```json
{
  "taskId": 10,
  "projectId": 1,
  "totalImageCount": 148,
  "successCount": 142,
  "failedCount": 6,
  "variantsPerImage": 3,
  "generatedImageCount": 142,
  "runOcrLabeling": true,
  "outputFolderPath": "/Users/name/datasets/container-images-augmented",
  "completedAt": "2026-05-05T08:20:00Z"
}
```

---

## 5. 테이블 관계

```text
projects 1 : N augmentation_tasks
```

하나의 프로젝트는 여러 개의 증강 작업을 가질 수 있다.

```sql
project_id BIGINT NOT NULL
    REFERENCES projects(id)
    ON DELETE CASCADE
```

프로젝트가 삭제되면 연결된 증강 작업 메타데이터도 함께 삭제된다.
단, `PENDING` 또는 `RUNNING` 작업이 있는 프로젝트 삭제는 API 계층에서
`409 PROJECT_HAS_ACTIVE_TASK`로 거부한다.

단, 실제 로컬 원본 이미지 파일과 증강 결과 폴더는 삭제하지 않는다.

---

## 6. 주요 제약 조건

### 6.1 `projects`

| 제약 | 설명 |
|---|---|
| `title` not empty | 프로젝트 제목은 비어 있으면 안 됨 |
| `source_folder_path` not empty | 원본 폴더 경로는 비어 있으면 안 됨 |
| `file_count >= 0` | 이미지 개수는 음수 불가 |
| `total_size_bytes >= 0` | 전체 파일 크기는 음수 불가 |

---

### 6.2 `augmentation_tasks`

| 제약 | 설명 |
|---|---|
| `status` enum check | 허용된 상태값만 저장 |
| `progress BETWEEN 0 AND 100` | 진행률 범위 제한 |
| `worker_count >= 1` | 요청 워커 수는 1 이상. MVP runner의 실제 병렬도는 항상 1 |
| `variants_per_image BETWEEN 1 AND 90` | 원본 1장당 증강 결과 수 옵션은 1 이상 90 이하 |
| `processed_count >= 0` | 처리 수 음수 불가 |
| `failed_count >= 0` | 실패 수 음수 불가 |
| `total_image_count >= 0` | 전체 이미지 수 음수 불가 |
| `generated_image_count >= 0` | 실제 생성 이미지 수 음수 불가 |
| `failed_count <= processed_count` | 실패 수는 처리 수보다 클 수 없음 |
| `processed_count <= total_image_count` | 처리 수는 전체 수보다 클 수 없음 |

---

## 7. 인덱스

| 인덱스 | 목적 |
|---|---|
| `idx_projects_created_at` | 프로젝트 목록 최신순 조회 |
| `idx_augmentation_tasks_project_id_created_at` | 프로젝트별 최근 작업 조회, `latestTask` 조회 |
| `idx_augmentation_tasks_status` | 상태별 작업 조회 |
| `uq_only_one_active_augmentation_task` | 전역 active task 1개 제한 |

---

### 7.1 Active Task 제한

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_only_one_active_augmentation_task
    ON augmentation_tasks ((true))
    WHERE status IN ('PENDING', 'RUNNING');
```

이 인덱스는 전체 DB에서 `PENDING` 또는 `RUNNING` 상태의 작업이 1개만 존재하도록 제한한다.

가능한 경우:

```text
프로젝트 1 작업 A DONE
프로젝트 1 작업 B DONE
프로젝트 1 작업 C RUNNING
```

불가능한 경우:

```text
프로젝트 1 작업 A RUNNING
프로젝트 2 작업 B RUNNING
```

---

## 8. 저장 책임

DB가 자동으로 폴더를 스캔하거나 파일 수를 계산하지 않는다.  
백엔드가 계산해서 DB에 저장해야 한다.

### 8.1 프로젝트 생성 시

```text
POST /api/projects
→ sourceFolderPath 검증
→ 폴더 스캔
→ fileCount 계산
→ totalSizeBytes 계산
→ hasLabels 계산
→ projects INSERT
```

### 8.2 증강 작업 생성 시

```text
POST /api/projects/{projectId}/augmentation-tasks
→ outputFolderName 검증
→ outputFolderPath 생성
→ totalImageCount 저장
→ augmentation_tasks INSERT
```

### 8.3 작업 실행 중

```text
progress 업데이트
processedCount 업데이트
failedCount 업데이트
generatedImageCount 업데이트
```

### 8.4 작업 완료/중단/실패 시

```text
status 업데이트
completedAt 업데이트
```

---

## 9. 전체 DDL

```sql
CREATE TABLE IF NOT EXISTS projects (
    id BIGSERIAL PRIMARY KEY,

    title TEXT NOT NULL,
    description TEXT,

    source_folder_path TEXT NOT NULL,
    target_spec TEXT,

    file_count INTEGER NOT NULL DEFAULT 0,
    total_size_bytes BIGINT NOT NULL DEFAULT 0,
    has_labels BOOLEAN NOT NULL DEFAULT false,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT projects_title_not_empty_check
        CHECK (length(trim(title)) > 0),

    CONSTRAINT projects_source_folder_path_not_empty_check
        CHECK (length(trim(source_folder_path)) > 0),

    CONSTRAINT projects_file_count_check
        CHECK (file_count >= 0),

    CONSTRAINT projects_total_size_bytes_check
        CHECK (total_size_bytes >= 0)
);

CREATE TABLE IF NOT EXISTS augmentation_tasks (
    id BIGSERIAL PRIMARY KEY,

    project_id BIGINT NOT NULL
        REFERENCES projects(id)
        ON DELETE CASCADE,

    status TEXT NOT NULL DEFAULT 'PENDING',
    progress INTEGER NOT NULL DEFAULT 0,

    worker_count INTEGER NOT NULL DEFAULT 1,
    run_ocr_labeling BOOLEAN NOT NULL DEFAULT false,
    variants_per_image INTEGER NOT NULL DEFAULT 1,

    output_folder_name TEXT NOT NULL,
    output_folder_path TEXT NOT NULL,

    processed_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    total_image_count INTEGER NOT NULL DEFAULT 0,
    generated_image_count INTEGER NOT NULL DEFAULT 0,

    resource_usage JSONB,

    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT augmentation_tasks_status_check
        CHECK (status IN ('PENDING', 'RUNNING', 'STOPPED', 'FAILED', 'DONE')),

    CONSTRAINT augmentation_tasks_progress_check
        CHECK (progress >= 0 AND progress <= 100),

    CONSTRAINT augmentation_tasks_worker_count_check
        CHECK (worker_count >= 1),

    CONSTRAINT augmentation_tasks_variants_per_image_check
        CHECK (variants_per_image >= 1 AND variants_per_image <= 90),

    CONSTRAINT augmentation_tasks_output_folder_name_not_empty_check
        CHECK (length(trim(output_folder_name)) > 0),

    CONSTRAINT augmentation_tasks_output_folder_path_not_empty_check
        CHECK (length(trim(output_folder_path)) > 0),

    CONSTRAINT augmentation_tasks_counts_check
        CHECK (
            processed_count >= 0
            AND failed_count >= 0
            AND total_image_count >= 0
            AND generated_image_count >= 0
            AND failed_count <= processed_count
            AND processed_count <= total_image_count
        )
);

CREATE INDEX IF NOT EXISTS idx_projects_created_at
    ON projects(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_augmentation_tasks_project_id_created_at
    ON augmentation_tasks(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_augmentation_tasks_status
    ON augmentation_tasks(status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_only_one_active_augmentation_task
    ON augmentation_tasks ((true))
    WHERE status IN ('PENDING', 'RUNNING');
```
