# API Spec: Local Container Image Augmentation

## 1. 목적

이 문서는 Container Image Augmentation Framework의 프론트엔드와 백엔드 사이 API Contract를 정의한다.

현재 UI mockup은 프로젝트 생성, 프로젝트 상세, 증강 옵션 설정, 증강 수행, 결과 시각화 흐름까지 구현되어 있다. 다음 단계에서는 더미 상태를 실제 FastAPI 백엔드 API 호출로 교체해야 하므로, 이 문서는 해당 연동을 위한 v1 API 기준으로 사용한다.

## 2. 핵심 결정사항

- 백엔드는 사용자의 로컬 환경에서 실행되는 FastAPI 서버다.
- 프론트엔드는 브라우저에서 로컬 폴더 경로를 입력하거나 선택하고, 백엔드는 해당 절대경로를 참조해 이미지를 스캔한다.
- 이미지 파일 업로드 방식은 v1 범위에 포함하지 않는다.
- 증강 결과물은 백엔드가 로컬 출력 폴더에 저장한다.
- 작업 진행 상태는 프론트엔드가 일정 주기로 polling하여 조회한다.
- 증강 작업은 전역 1개만 동시에 실행 가능하다.
- v1 증강 옵션은 현재 프론트 UI에 있는 옵션만 포함한다:
  - `workerCount`
  - `runOcrLabeling`
  - `outputFolderName`
  - `modelId` optional
- 로컬 앱 전제이므로 v1에서는 모든 절대경로를 허용한다.
- 경로 접근 제한, ZIP 다운로드, WebSocket/SSE, 세부 증강 옵션은 v2 이후로 미룬다.

## 3. 필요한 API 기능

### 3.1 프로젝트 관리

- 프로젝트 목록 조회
- 프로젝트 생성
- 프로젝트 상세 조회
- 프로젝트 삭제
- 프로젝트 생성 시 입력 폴더 스캔
  - 이미지 파일 수
  - 전체 용량
  - 라벨 존재 여부
  - 이미지 해상도 메타데이터

### 3.2 이미지 인벤토리

- 프로젝트별 이미지 목록 조회
- 원본 이미지와 증강 이미지 구분
- 증강 이미지의 원본 `parentId` 추적
- 이미지별 라벨 조회

### 3.3 증강 작업

- 프로젝트 기준 증강 작업 생성
- 실행 중 작업 상태 조회
- 실행 중 작업 중단 요청
- 작업 로그 조회
- 완료된 작업 결과 조회

### 3.4 OCR 모델

- 사용 가능한 OCR 모델 목록 조회
- 증강 작업 시작 시 OCR 모델 선택은 optional

### 3.5 로컬 결과 확인

- 완료된 작업의 출력 폴더 경로 제공
- 전체 이미지 수, 성공 수, 실패 수, 라벨링 적용 여부 제공

## 4. 공통 API 규약

### 4.1 Base URL

```text
/api
```

예시:

```text
GET /api/projects
```

### 4.2 Naming

- URL path: plural noun 사용
- JSON field: `camelCase`
- enum value: `UPPER_SNAKE_CASE`
- 날짜/시간: ISO 8601 string
- ID: integer 또는 string 중 하나로 통일한다. ERD가 Integer PK를 기준으로 하므로 v1 문서에서는 integer로 표기한다.

### 4.3 공통 에러 응답

모든 에러 응답은 아래 형식을 따른다.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "details": {}
  }
}
```

### 4.4 주요 HTTP status

| Status | 의미 | 예시 |
| --- | --- | --- |
| `200` | 조회/요청 성공 | 프로젝트 상세 조회 |
| `201` | 생성 성공 | 프로젝트 생성, 작업 생성 |
| `204` | 응답 body 없는 성공 | 프로젝트 삭제 |
| `400` | 잘못된 요청 | 알 수 없는 status filter |
| `404` | 리소스 없음 | 없는 프로젝트 조회 |
| `409` | 충돌 | 이미 실행 중인 증강 작업 존재 |
| `422` | 검증 실패 | 존재하지 않는 폴더 경로 |
| `500` | 서버 내부 오류 | 예외 처리되지 않은 증강 실패 |

### 4.5 Pagination 응답

목록 API는 pagination wrapper를 사용한다.

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 148,
    "totalPages": 3
  }
}
```

## 5. 상태 enum

### 5.1 AugmentationTaskStatus

```text
PENDING
RUNNING
STOPPED
FAILED
DONE
```

의미:

- `PENDING`: 작업 생성 후 아직 실행 전
- `RUNNING`: 증강 처리 중
- `STOPPED`: 사용자 요청으로 중단됨
- `FAILED`: 오류로 실패함
- `DONE`: 정상 완료됨

### 5.2 TaskLogLevel

```text
INFO
WARNING
ERROR
```

### 5.3 ImageKind

```text
ORIGINAL
AUGMENTED
```

## 6. Data Contracts

### 6.1 ProjectSummary

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

### 6.2 ProjectDetail

`ProjectSummary`에 최근 작업 상태를 포함한다.

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

### 6.3 ImageItem

```json
{
  "id": 100,
  "projectId": 1,
  "parentId": null,
  "kind": "ORIGINAL",
  "folderName": "container-images",
  "filePath": "/Users/name/datasets/container-images/001.jpg",
  "isValidPath": true,
  "width": 1920,
  "height": 1080,
  "createdAt": "2026-05-05T08:00:00Z"
}
```

### 6.4 LabelItem

```json
{
  "id": 50,
  "imageId": 100,
  "textValue": "MSCU1234567",
  "isIsoValid": true,
  "isManual": false,
  "isQualityPassed": true,
  "bbox": {
    "x": 120,
    "y": 80,
    "width": 360,
    "height": 90
  },
  "confidenceScore": 0.97
}
```

### 6.5 AugmentationTask

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

### 6.6 AugmentationResult

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

### 6.7 TaskLog

```json
{
  "id": 900,
  "taskId": 10,
  "logLevel": "INFO",
  "message": "Worker 1 processed 001.jpg",
  "createdAt": "2026-05-05T08:10:05Z"
}
```

### 6.8 OcrModel

```json
{
  "id": 1,
  "name": "Container OCR",
  "version": "pretrained-v1",
  "weightPath": "/Users/name/models/container-ocr-v1.pt",
  "createdAt": "2026-05-05T08:00:00Z"
}
```

## 7. Endpoints

### 7.1 Projects

### GET `/api/projects`

프로젝트 목록을 조회한다.

Query params:

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `page` | number | no | `1` | 페이지 번호 |
| `pageSize` | number | no | `20` | 페이지 크기 |

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
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

### POST `/api/projects`

로컬 폴더 경로를 기반으로 프로젝트를 생성한다. 백엔드는 `sourceFolderPath`를 스캔해 이미지와 라벨 메타데이터를 등록한다.

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
- `sourceFolderPath`는 백엔드 프로세스가 읽을 수 있어야 한다.
- 폴더가 존재하지 않으면 `422 PATH_NOT_FOUND`.
- 읽기 권한이 없으면 `422 PATH_NOT_READABLE`.

Response `201`:

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

### GET `/api/projects/{projectId}`

프로젝트 상세와 최근 작업 요약을 조회한다.

Response `200`: `ProjectDetail`

### DELETE `/api/projects/{projectId}`

프로젝트 메타데이터를 삭제한다.

주의:

- v1에서는 실제 원본 이미지 파일이나 증강 결과 파일을 삭제하지 않는다.
- DB에 저장된 프로젝트, 이미지, 라벨, 작업 참조 데이터만 삭제 대상으로 한다.

Response `204`: body 없음

### 7.2 Images

### GET `/api/projects/{projectId}/images`

프로젝트에 등록된 이미지 목록을 조회한다.

Query params:

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `page` | number | no | `1` | 페이지 번호 |
| `pageSize` | number | no | `50` | 페이지 크기 |
| `kind` | string | no | `ALL` | `ALL`, `ORIGINAL`, `AUGMENTED` |

Response `200`:

```json
{
  "data": [
    {
      "id": 100,
      "projectId": 1,
      "parentId": null,
      "kind": "ORIGINAL",
      "folderName": "container-images",
      "filePath": "/Users/name/datasets/container-images/001.jpg",
      "isValidPath": true,
      "width": 1920,
      "height": 1080,
      "createdAt": "2026-05-05T08:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 148,
    "totalPages": 3
  }
}
```

### GET `/api/images/{imageId}`

이미지 상세와 라벨 정보를 조회한다.

Response `200`:

```json
{
  "image": {
    "id": 100,
    "projectId": 1,
    "parentId": null,
    "kind": "ORIGINAL",
    "folderName": "container-images",
    "filePath": "/Users/name/datasets/container-images/001.jpg",
    "isValidPath": true,
    "width": 1920,
    "height": 1080,
    "createdAt": "2026-05-05T08:00:00Z"
  },
  "labels": [
    {
      "id": 50,
      "imageId": 100,
      "textValue": "MSCU1234567",
      "isIsoValid": true,
      "isManual": false,
      "isQualityPassed": true,
      "bbox": {
        "x": 120,
        "y": 80,
        "width": 360,
        "height": 90
      },
      "confidenceScore": 0.97
    }
  ]
}
```

### 7.3 Augmentation Tasks

### POST `/api/projects/{projectId}/augmentation-tasks`

프로젝트 기준 증강 작업을 생성하고 실행을 시작한다.

전역에서 이미 `PENDING` 또는 `RUNNING` 상태 작업이 있으면 새 작업을 생성하지 않고 `409 TASK_ALREADY_RUNNING`을 반환한다.

Request:

```json
{
  "workerCount": 4,
  "runOcrLabeling": true,
  "outputFolderName": "container-images-augmented",
  "modelId": null
}
```

Validation:

- `workerCount`: `1` 이상
- `outputFolderName`: 비어 있으면 안 된다.
- `modelId`: `null`이거나 존재하는 OCR 모델 ID여야 한다.
- 출력 폴더 최종 경로는 백엔드가 프로젝트 입력 폴더의 parent 경로와 `outputFolderName`을 조합해 만든다.

Response `201`:

```json
{
  "id": 10,
  "projectId": 1,
  "status": "PENDING",
  "progress": 0,
  "workerCount": 4,
  "runOcrLabeling": true,
  "processedCount": 0,
  "failedCount": 0,
  "totalImageCount": 148,
  "outputFolderPath": "/Users/name/datasets/container-images-augmented",
  "startedAt": null,
  "completedAt": null
}
```

### GET `/api/augmentation-tasks/{taskId}`

작업 진행 상태를 조회한다. 프론트엔드는 증강 수행 화면에서 이 API를 polling한다.

권장 polling interval:

```text
1000ms
```

Response `200`:

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

### POST `/api/augmentation-tasks/{taskId}/stop`

실행 중 작업 중단을 요청한다.

Response `200`:

```json
{
  "id": 10,
  "projectId": 1,
  "status": "STOPPED",
  "progress": 45,
  "workerCount": 4,
  "runOcrLabeling": true,
  "processedCount": 67,
  "failedCount": 2,
  "totalImageCount": 148,
  "outputFolderPath": "/Users/name/datasets/container-images-augmented",
  "startedAt": "2026-05-05T08:10:00Z",
  "completedAt": "2026-05-05T08:12:00Z"
}
```

상태 규칙:

- `PENDING`, `RUNNING` 작업만 중단할 수 있다.
- `DONE`, `FAILED`, `STOPPED` 작업에 중단 요청을 보내면 `409 TASK_NOT_RUNNING`.

### GET `/api/augmentation-tasks/{taskId}/logs`

작업 로그를 조회한다.

Query params:

| Name | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `limit` | number | no | `100` | 최신 로그 개수 |

Response `200`:

```json
{
  "data": [
    {
      "id": 900,
      "taskId": 10,
      "logLevel": "INFO",
      "message": "Worker 1 processed 001.jpg",
      "createdAt": "2026-05-05T08:10:05Z"
    }
  ]
}
```

### GET `/api/augmentation-tasks/{taskId}/result`

작업 결과를 조회한다.

Response `200`:

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

상태 규칙:

- `DONE`, `FAILED`, `STOPPED` 상태에서 조회 가능하다.
- `PENDING`, `RUNNING` 상태에서 조회하면 `409 TASK_NOT_FINISHED`.

### 7.4 OCR Models

### GET `/api/ocr-models`

사용 가능한 OCR 모델 목록을 조회한다.

Response `200`:

```json
{
  "data": [
    {
      "id": 1,
      "name": "Container OCR",
      "version": "pretrained-v1",
      "weightPath": "/Users/name/models/container-ocr-v1.pt",
      "createdAt": "2026-05-05T08:00:00Z"
    }
  ]
}
```

## 8. 프론트엔드 연동 흐름

### 8.1 프로젝트 생성

1. 사용자가 프로젝트 생성 화면에서 로컬 폴더 경로와 프로젝트 정보를 입력한다.
2. 프론트엔드가 `POST /api/projects` 호출.
3. 백엔드가 폴더를 스캔하고 프로젝트/이미지/라벨 메타데이터를 저장.
4. 프론트엔드는 응답으로 받은 `ProjectSummary`를 사이드바와 상세 화면에 반영.

### 8.2 증강 시작

1. 사용자가 프로젝트 상세에서 `증강 프로세스 시작` 클릭.
2. 옵션 모달에서 `workerCount`, `runOcrLabeling`, `outputFolderName` 입력.
3. 프론트엔드가 `POST /api/projects/{projectId}/augmentation-tasks` 호출.
4. 백엔드가 전역 실행 중 작업이 없는지 확인.
5. 작업 생성 성공 시 프론트엔드는 증강 수행 화면으로 이동.

### 8.3 진행 상태 polling

1. 프론트엔드는 `GET /api/augmentation-tasks/{taskId}`를 1초 간격으로 호출.
2. `status=RUNNING`이면 진행률, 처리 수, 실패 수를 업데이트.
3. `status=DONE`이면 `GET /api/augmentation-tasks/{taskId}/result` 호출 후 결과 화면으로 이동.
4. `status=FAILED`이면 결과 화면 또는 오류 상태 화면에서 실패 정보를 표시.
5. 사용자가 중단하면 `POST /api/augmentation-tasks/{taskId}/stop` 호출.

### 8.4 결과 확인

1. 프론트엔드는 `AugmentationResult`를 표시.
2. `outputFolderPath`를 저장 폴더 경로로 보여준다.
3. v1에서는 브라우저가 OS 폴더를 직접 열지 않는다.

## 9. DB 매핑

| API Contract | ERD Table |
| --- | --- |
| `ProjectSummary`, `ProjectDetail` | `Project`, 집계된 `Image`, 최근 `AugmentationTask` |
| `ImageItem` | `Image` |
| `LabelItem` | `Label` |
| `AugmentationTask` | `AugmentationTask`, `AugmentationConfig` |
| `AugmentationResult` | `AugmentationTask`, 생성된 `Image`, `Label` 집계 |
| `TaskLog` | `TaskLog` |
| `OcrModel` | `OcrModel` |

## 10. 에러 코드

| Code | HTTP status | 의미 |
| --- | --- | --- |
| `VALIDATION_ERROR` | `422` | 요청 body 또는 query validation 실패 |
| `PROJECT_NOT_FOUND` | `404` | 프로젝트 없음 |
| `IMAGE_NOT_FOUND` | `404` | 이미지 없음 |
| `TASK_NOT_FOUND` | `404` | 작업 없음 |
| `MODEL_NOT_FOUND` | `404` | OCR 모델 없음 |
| `PATH_NOT_FOUND` | `422` | 로컬 경로가 존재하지 않음 |
| `PATH_NOT_READABLE` | `422` | 로컬 경로 읽기 권한 없음 |
| `PATH_NOT_WRITABLE` | `422` | 출력 경로 쓰기 권한 없음 |
| `TASK_ALREADY_RUNNING` | `409` | 전역 실행 중 작업 존재 |
| `TASK_NOT_RUNNING` | `409` | 중단할 수 없는 작업 상태 |
| `TASK_NOT_FINISHED` | `409` | 결과 조회 가능한 상태가 아님 |
| `INTERNAL_SERVER_ERROR` | `500` | 서버 내부 오류 |

## 11. 테스트 기준

### 11.1 API Contract 테스트

- `POST /api/projects`
  - 정상 폴더 경로로 프로젝트 생성 성공.
  - 존재하지 않는 경로는 `422 PATH_NOT_FOUND`.
  - 읽기 불가능한 경로는 `422 PATH_NOT_READABLE`.
- `GET /api/projects`
  - pagination 형식 유지.
- `POST /api/projects/{projectId}/augmentation-tasks`
  - 실행 중 작업이 없으면 `201`.
  - 실행 중 작업이 있으면 `409 TASK_ALREADY_RUNNING`.
- `GET /api/augmentation-tasks/{taskId}`
  - 작업 상태와 진행률 반환.
- `POST /api/augmentation-tasks/{taskId}/stop`
  - 실행 중 작업 중단 성공.
- `GET /api/augmentation-tasks/{taskId}/result`
  - 완료 작업 결과 조회 성공.
  - 실행 중 작업 결과 조회는 `409 TASK_NOT_FINISHED`.

### 11.2 Backend 단위 테스트

- 로컬 폴더 스캔 로직:
  - 이미지 확장자 필터링.
  - 전체 용량 합산.
  - 라벨 파일 존재 여부 판단.
  - 이미지 width/height 추출.
- 전역 작업 락:
  - `RUNNING` 작업 존재 시 새 작업 생성 차단.
- 결과 집계:
  - 성공/실패 이미지 수 계산.
  - OCR 라벨링 적용 여부 반영.

### 11.3 Frontend 연동 테스트

- 프로젝트 생성 화면에서 API 응답을 사이드바와 상세 화면에 반영.
- 증강 시작 후 task ID 저장.
- polling으로 진행률 업데이트.
- `DONE` 상태 수신 후 결과 조회.
- `STOPPED`, `FAILED` 상태 수신 시 사용자가 이해 가능한 상태 표시.

## 12. v2 이후 고려사항

- 허용 루트 기반 경로 제한.
- WebSocket 또는 SSE 기반 실시간 진행률 push.
- ZIP 다운로드 API.
- 세부 증강 옵션:
  - shuffle
  - resize
  - flip
  - rotate
  - brightness
  - noise
  - bbox 기반 부분 손상 증강
- 수동 라벨 수정 API.
- 작업 재시도 API.
- 결과 파일 삭제 API.
- 여러 작업 동시 실행 정책.
