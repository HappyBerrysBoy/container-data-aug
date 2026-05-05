# MVP API Spec: Local Container Image Augmentation

## 1. 목적

이 문서는 MVP 구현에 필요한 최소 기능과 API만 정의한다. 목표는 실제 로컬 폴더를 프로젝트로 등록하고, 증강 작업을 실행하며, 프론트엔드가 진행 상태와 결과를 확인할 수 있는 한 사이클을 먼저 완성하는 것이다.

전체 API 설계는 `docs/API-spec.md`를 기준으로 하되, MVP에서는 아래 범위만 구현한다.

## 2. MVP 범위

### 포함

- 로컬 폴더 경로 기반 프로젝트 생성
- 프로젝트 목록 조회
- 프로젝트 상세 조회
- 프로젝트 삭제
- 증강 작업 시작
- 실행 중인 증강 작업 조회
- 증강 작업 상태 polling
- 증강 작업 중단
- 증강 결과 조회
- 공통 에러 응답 형식

### 제외

- 이미지 목록/상세 조회 API
- 라벨 상세 조회 API
- 작업 로그 조회 API
- OCR 모델 목록/관리 API
- 세부 증강 옵션 API
- ZIP 다운로드 API
- WebSocket/SSE 실시간 progress push
- 사용자 인증/권한
- 로컬 경로 허용 루트 제한

## 3. MVP 핵심 정책

- 백엔드는 로컬에서 실행되는 FastAPI 서버다.
- 프론트엔드는 로컬 폴더 절대경로를 백엔드에 전달한다.
- 백엔드는 전달받은 폴더를 스캔해 프로젝트 메타데이터를 생성한다.
- v1 MVP에서는 모든 절대경로를 허용한다.
- 증강 결과물은 로컬 출력 폴더에 저장한다.
- 동시에 실행 가능한 증강 작업은 전역 1개다.
- 프론트엔드는 1초 간격 polling으로 작업 상태를 조회한다.
- MVP 증강 옵션은 아래 3개만 지원한다:
  - `workerCount`
  - `runOcrLabeling`
  - `outputFolderName`

## 4. 공통 규약

### 4.1 Base URL

```text
/api
```

### 4.2 JSON naming

- Request/response field는 `camelCase`를 사용한다.
- enum 값은 `UPPER_SNAKE_CASE`를 사용한다.
- 날짜/시간은 ISO 8601 string을 사용한다.
- ID는 integer를 사용한다.

### 4.3 공통 에러 응답

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": {}
  }
}
```

### 4.4 MVP 에러 코드

| Code | HTTP status | 의미 |
| --- | --- | --- |
| `VALIDATION_ERROR` | `422` | 요청 값 검증 실패 |
| `PROJECT_NOT_FOUND` | `404` | 프로젝트 없음 |
| `TASK_NOT_FOUND` | `404` | 작업 없음 |
| `PATH_NOT_FOUND` | `422` | 로컬 경로가 존재하지 않음 |
| `PATH_NOT_READABLE` | `422` | 로컬 경로 읽기 권한 없음 |
| `PATH_NOT_WRITABLE` | `422` | 출력 경로 쓰기 권한 없음 |
| `TASK_ALREADY_RUNNING` | `409` | 이미 실행 중인 전역 작업 존재 |
| `TASK_NOT_RUNNING` | `409` | 중단할 수 없는 작업 상태 |
| `TASK_NOT_FINISHED` | `409` | 결과 조회 가능한 상태가 아님 |
| `INTERNAL_SERVER_ERROR` | `500` | 서버 내부 오류 |

## 5. 상태 enum

### 5.1 AugmentationTaskStatus

```text
PENDING
RUNNING
STOPPED
FAILED
DONE
```

## 6. 최소 데이터 모델

### 6.1 Project

MVP에서는 프로젝트 단위 집계 정보만 저장한다. 이미지별 row 저장은 선택 사항이며, 첫 구현에서는 생략해도 된다.

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

필드:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | number | yes | 프로젝트 ID |
| `title` | string | yes | 프로젝트 이름 |
| `description` | string | no | 프로젝트 설명 |
| `sourceFolderPath` | string | yes | 원본 이미지 폴더 절대경로 |
| `targetSpec` | string | no | 타겟 규격. 예: `ISO 6346` |
| `fileCount` | number | yes | 스캔된 이미지 파일 수 |
| `totalSizeBytes` | number | yes | 스캔된 이미지 파일 전체 용량 |
| `hasLabels` | boolean | yes | 라벨 파일 존재 여부 |
| `createdAt` | string | yes | 생성 시간 |

### 6.2 AugmentationTask

MVP에서는 별도 `AugmentationConfig` 테이블을 만들지 않고 작업 row에 옵션을 직접 저장해도 된다.

```json
{
  "id": 10,
  "projectId": 1,
  "status": "RUNNING",
  "progress": 45,
  "workerCount": 4,
  "runOcrLabeling": true,
  "processedCount": 67,
  "failedCount": 2,
  "totalImageCount": 148,
  "outputFolderPath": "/Users/name/datasets/container-images-augmented",
  "startedAt": "2026-05-05T08:10:00Z",
  "completedAt": null
}
```

필드:

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | number | yes | 작업 ID |
| `projectId` | number | yes | 프로젝트 ID |
| `status` | string | yes | `PENDING`, `RUNNING`, `STOPPED`, `FAILED`, `DONE` |
| `progress` | number | yes | 0~100 진행률 |
| `workerCount` | number | yes | 워커 수 |
| `runOcrLabeling` | boolean | yes | OCR 라벨링 수행 여부 |
| `processedCount` | number | yes | 처리된 이미지 수 |
| `failedCount` | number | yes | 실패한 이미지 수 |
| `totalImageCount` | number | yes | 전체 대상 이미지 수 |
| `outputFolderPath` | string | yes | 결과 저장 폴더 절대경로 |
| `startedAt` | string \| null | yes | 시작 시간 |
| `completedAt` | string \| null | yes | 완료/중단/실패 시간 |

### 6.3 AugmentationResult

```json
{
  "taskId": 10,
  "projectId": 1,
  "totalImageCount": 148,
  "successCount": 142,
  "failedCount": 6,
  "runOcrLabeling": true,
  "outputFolderPath": "/Users/name/datasets/container-images-augmented",
  "completedAt": "2026-05-05T08:20:00Z"
}
```

## 7. MVP Endpoints

### 7.1 Health Check

#### GET `/api/health`

백엔드 서버가 실행 중인지 확인한다.

Response `200`:

```json
{
  "status": "ok"
}
```

## 7.2 Projects

### GET `/api/projects`

프로젝트 목록을 조회한다.

MVP에서는 pagination 없이 전체 목록을 반환해도 된다. 프로젝트 수가 많아지는 시점에 pagination을 추가한다.

Response `200`:

```json
{
  "data": [
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
  ]
}
```

### POST `/api/projects`

로컬 폴더 경로를 스캔해 프로젝트를 생성한다.

Request:

```json
{
  "title": "부산항 컨테이너 번호 데이터셋",
  "description": "촬영 환경 A 기준 데이터셋",
  "sourceFolderPath": "/Users/name/datasets/container-images",
  "targetSpec": "ISO 6346"
}
```

Validation:

- `title`은 비어 있으면 안 된다.
- `sourceFolderPath`는 절대경로여야 한다.
- `sourceFolderPath`는 존재하는 디렉터리여야 한다.
- 백엔드 프로세스가 `sourceFolderPath`를 읽을 수 있어야 한다.

Response `201`: `Project`

### GET `/api/projects/{projectId}`

프로젝트 상세를 조회한다.

Response `200`:

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
  "createdAt": "2026-05-05T08:00:00Z",
  "latestTask": {
    "id": 10,
    "status": "DONE",
    "progress": 100
  }
}
```

`latestTask`가 없으면 `null`을 반환한다.

### DELETE `/api/projects/{projectId}`

프로젝트 메타데이터를 삭제한다.

MVP 정책:

- 실제 원본 이미지 파일은 삭제하지 않는다.
- 증강 결과 폴더도 삭제하지 않는다.
- DB 또는 로컬 저장소의 프로젝트 메타데이터만 삭제한다.

Response `204`: body 없음

## 7.3 Augmentation Tasks

### POST `/api/projects/{projectId}/augmentation-tasks`

증강 작업을 생성하고 실행을 시작한다.

전역에서 `PENDING` 또는 `RUNNING` 작업이 이미 있으면 `409 TASK_ALREADY_RUNNING`을 반환한다.

Request:

```json
{
  "workerCount": 4,
  "runOcrLabeling": true,
  "outputFolderName": "container-images-augmented"
}
```

Validation:

- `workerCount`는 1 이상이어야 한다.
- `outputFolderName`은 비어 있으면 안 된다.
- 백엔드가 출력 폴더를 생성하거나 쓸 수 있어야 한다.

Response `201`: `AugmentationTask`

### GET `/api/augmentation-tasks/active`

현재 전역 실행 중 작업을 조회한다.

Response `200` when active task exists:

```json
{
  "task": {
    "id": 10,
    "projectId": 1,
    "status": "RUNNING",
    "progress": 45,
    "workerCount": 4,
    "runOcrLabeling": true,
    "processedCount": 67,
    "failedCount": 2,
    "totalImageCount": 148,
    "outputFolderPath": "/Users/name/datasets/container-images-augmented",
    "startedAt": "2026-05-05T08:10:00Z",
    "completedAt": null
  }
}
```

Response `200` when no active task:

```json
{
  "task": null
}
```

### GET `/api/augmentation-tasks/{taskId}`

작업 진행 상태를 조회한다.

프론트엔드는 증강 수행 화면에서 1초 간격으로 이 API를 polling한다.

Response `200`: `AugmentationTask`

### POST `/api/augmentation-tasks/{taskId}/stop`

작업 중단을 요청한다.

상태 규칙:

- `PENDING`, `RUNNING` 상태만 중단 가능하다.
- 이미 `DONE`, `FAILED`, `STOPPED`이면 `409 TASK_NOT_RUNNING`.

Response `200`: 중단된 `AugmentationTask`

### GET `/api/augmentation-tasks/{taskId}/result`

작업 결과를 조회한다.

상태 규칙:

- `DONE`, `FAILED`, `STOPPED` 상태에서 조회 가능하다.
- `PENDING`, `RUNNING` 상태면 `409 TASK_NOT_FINISHED`.

Response `200`: `AugmentationResult`

## 8. MVP 프론트엔드 연동 흐름

### 8.1 앱 초기 실행

1. 프론트엔드 앱이 시작되면 `GET /api/health`를 호출해 백엔드 연결 상태를 확인한다.
2. 백엔드가 정상 응답하면 `GET /api/projects`를 호출해 기존 프로젝트 목록을 불러온다.
3. 프로젝트 목록이 비어 있으면 초기 화면을 표시한다.
4. 프로젝트 목록이 있으면 사이드바에 프로젝트 목록을 표시한다.
5. MVP 기본 동작은 자동 선택하지 않는 것이다. 사용자가 프로젝트를 클릭하면 `GET /api/projects/{projectId}`를 호출해 상세 화면을 표시한다.
6. 백엔드 연결 실패 시 프로젝트 목록 영역 또는 메인 화면에 연결 실패 상태와 재시도 액션을 표시한다.

### 8.2 프로젝트 생성

1. 사용자가 프로젝트 생성 화면에서 로컬 폴더 경로, 이름, 설명을 입력한다.
2. 프론트엔드가 `POST /api/projects`를 호출한다.
3. 백엔드는 폴더를 스캔하고 프로젝트를 생성한다.
4. 프론트엔드는 응답을 사이드바 목록과 프로젝트 상세 화면에 반영한다.

### 8.3 증강 시작

1. 사용자가 프로젝트 상세에서 `증강 프로세스 시작`을 누른다.
2. 옵션 모달에서 `workerCount`, `runOcrLabeling`, `outputFolderName`을 입력한다.
3. 프론트엔드가 `POST /api/projects/{projectId}/augmentation-tasks`를 호출한다.
4. 성공하면 task ID를 저장하고 증강 수행 화면으로 이동한다.

### 8.4 진행 polling

1. 프론트엔드가 `GET /api/augmentation-tasks/{taskId}`를 1초마다 호출한다.
2. `RUNNING`이면 progress와 count를 갱신한다.
3. `DONE`이면 `GET /api/augmentation-tasks/{taskId}/result`를 호출하고 결과 화면으로 이동한다.
4. 사용자가 중단하면 `POST /api/augmentation-tasks/{taskId}/stop`을 호출한다.

### 8.5 결과 표시

1. 프론트엔드가 `AugmentationResult`를 표시한다.
2. `outputFolderPath`를 저장 폴더 경로로 보여준다.
3. MVP에서는 브라우저가 OS 폴더를 직접 열지 않는다.

## 9. MVP 구현 순서

1. FastAPI 앱 골격 생성
   - `GET /api/health`
2. 프로젝트 저장소 구현
   - 처음에는 인메모리 또는 JSON 파일 저장으로 시작 가능
   - DB 도입 시 `Project`, `AugmentationTask`부터 생성
3. 폴더 스캔 로직 구현
   - 이미지 파일 개수
   - 전체 용량
   - 라벨 존재 여부
4. 프로젝트 API 구현
   - `GET /api/projects`
   - `POST /api/projects`
   - `GET /api/projects/{projectId}`
   - `DELETE /api/projects/{projectId}`
5. 증강 작업 API 구현
   - 전역 작업 lock
   - `POST /api/projects/{projectId}/augmentation-tasks`
   - `GET /api/augmentation-tasks/active`
   - `GET /api/augmentation-tasks/{taskId}`
   - `POST /api/augmentation-tasks/{taskId}/stop`
   - `GET /api/augmentation-tasks/{taskId}/result`
6. 최소 증강 처리 구현
   - MVP 첫 구현은 원본 이미지 복사와 출력 폴더 생성만으로 시작 가능
   - 이후 실제 augmentation/OCR 처리로 교체
7. 프론트엔드 더미 상태 제거
   - 프로젝트 생성/목록/상세 API 연동
   - 작업 시작/진행 polling/결과 API 연동

## 10. MVP 검증 기준

- 존재하는 로컬 이미지 폴더 경로로 프로젝트를 생성할 수 있다.
- 앱 초기 실행 시 기존 프로젝트 목록을 불러와 사이드바에 표시할 수 있다.
- 프로젝트 목록과 상세 조회가 동작한다.
- 프로젝트 상세에서 증강 작업을 시작할 수 있다.
- 실행 중 작업이 있을 때 새 작업 시작은 `409 TASK_ALREADY_RUNNING`을 반환한다.
- 프론트엔드 polling으로 진행률이 갱신된다.
- 작업 완료 후 결과 화면에서 전체/성공/실패 수와 출력 폴더 경로를 볼 수 있다.
- 작업 중단 시 상태가 `STOPPED`가 된다.
- 원본 이미지 파일은 프로젝트 삭제로 삭제되지 않는다.

## 11. 다음 단계로 미룰 기능

- 이미지별 상세 목록과 lineage 저장
- 라벨 상세 조회와 수동 수정
- OCR 모델 등록/선택 UI
- 작업 로그 화면
- WebSocket/SSE 기반 실시간 진행
- 세부 증강 옵션
- 결과 ZIP 다운로드
- 허용 루트 기반 경로 제한
