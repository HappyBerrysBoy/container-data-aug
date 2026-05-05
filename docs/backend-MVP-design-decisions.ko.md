# 백엔드 MVP 설계 결정 사항

## 상태

MVP 구현용으로 채택됨.

## 우선순위 출처

`docs/API-MVP-spec.md`가 백엔드 MVP 동작에 대한 최우선 순위 출처입니다. `docs/API-spec.md` 또는 `docs/ERD_spec.md`와 같은 더 광범위한 문서와 충돌하는 경우, 첫 번째 구현에서는 MVP 스펙이 우선합니다.

## 목표

로컬 컨테이너 이미지 증강을 위한 첫 번째 FastAPI 백엔드 사이클 구축:

1. 로컬 소스 폴더를 프로젝트로 등록한다.
2. 프로젝트 수준의 이미지 메타데이터를 스캔한다.
3. 하나의 증강 작업을 시작한다.
4. 작업 진행 상황을 폴링한다.
5. 요청 시 작업을 중지한다.
6. 완료, 실패 또는 중지 후 결과를 읽는다.

프론트엔드 통합은 백엔드 API가 구현 및 검증된 이후로 의도적으로 연기됩니다.

## 결정 사항

### 1. 영속성 (Persistence)

MVP에서는 JSON 파일 저장소를 사용합니다.

- 기본 상태 파일: `backend/data/app_state.json`
- `projects`, `tasks`, `nextIds`를 하나의 파일에 저장합니다.
- 추후 PostgreSQL이 JSON 저장소를 대체할 수 있도록 리포지토리 경계를 유지합니다.
- 이번 단계에서는 데이터베이스 테이블을 생성하지 않습니다.

근거: 서버 재시작 간 영속성은 프론트엔드 시작 흐름에 유용하지만, PostgreSQL 마이그레이션과 스키마 설계는 첫 번째 백엔드 스켈레톤에서 다루기에는 부담이 큽니다.

### 2. 백엔드 구조

작은 계층형 FastAPI 구조를 사용합니다:

```text
backend/
  app/
    main.py
    api/
      routes/
        health.py
        projects.py
        augmentation_tasks.py
    core/
      config.py
      errors.py
    schemas/
      projects.py
      augmentation_tasks.py
      errors.py
    repositories/
      json_store.py
    services/
      folder_scanner.py
      project_service.py
      augmentation_service.py
  tests/
```

라우트는 HTTP 관련 사항을 처리하고, 서비스는 정책과 상태 전이를 담당하며, 리포지토리는 저장소를 캡슐화합니다. MVP에서는 `augmentation_service.py`가 내부 runner까지 포함하고, 실제 증강/OCR 작업이 커지면 runner를 별도 모듈로 분리합니다.

### 3. 증강 러너 (Augmentation Runner)

MVP 러너는 실제 파일 출력을 수행하지만, 실제 이미지 증강은 수행하지 않습니다.

- 출력 폴더를 생성합니다.
- 원본 이미지 파일을 출력 폴더로 복사합니다.
- 상대 디렉터리 구조를 유지합니다.
- 동일한 상대 경로의 기존 출력 파일을 덮어씁니다.
- 복사 실패 건수를 `failedCount`로 카운트합니다.
- 복사 성공 건수를 `processedCount`로 카운트합니다.
- 진행률은 `(processedCount + failedCount) / totalImageCount * 100`으로 계산합니다.
- `runOcrLabeling`은 저장만 하고, 아직 OCR을 실행하지 않습니다.

### 4. 작업 실행 (Task Execution)

증강은 FastAPI 프로세스 내에서 백그라운드 작업으로 실행합니다.

- MVP에서는 Celery, RQ 또는 별도의 워커 프로세스를 사용하지 않습니다.
- 전역적으로 단 하나의 작업만 `PENDING` 또는 `RUNNING` 상태일 수 있습니다.
- `POST /api/projects/{projectId}/augmentation-tasks`는 작업을 생성하고 러너를 시작합니다.
- `POST /api/augmentation-tasks/{taskId}/stop`은 중지 플래그를 설정합니다.
- 러너는 각 파일을 처리하기 전에 중지 플래그를 확인합니다.

### 5. 재시작 복구 (Restart Recovery)

앱 시작 시, 오래된 `PENDING` 또는 `RUNNING` 작업을 `FAILED`로 표시합니다.

- 마지막 `processedCount`, `failedCount`, `progress`를 보존합니다.
- `completedAt`을 시작 시간으로 설정합니다.
- 이는 죽은 인-프로세스 작업이 향후 작업 생성을 차단하는 것을 방지합니다.

### 6. 출력 폴더 검증

`outputFolderName`은 경로가 아닌 폴더 이름이어야 합니다.

- 허용: `container-images-augmented`
- 거부: 빈 문자열, 절대 경로, `../out`, `a/b`
- 최종 출력 경로: `Path(project.sourceFolderPath).parent / outputFolderName`
- 폴더를 생성하거나 쓸 수 없는 경우 `PATH_NOT_WRITABLE`을 반환합니다.

### 7. 폴더 스캔 정책

소스 폴더를 재귀적으로 스캔합니다.

- 이미지 확장자: `.jpg`, `.jpeg`, `.png`, `.bmp`, `.webp`
- 라벨 후보 확장자: `.txt`, `.json`, `.xml`, `.csv`
- 숨김 파일과 숨김 디렉터리는 무시됩니다.
- 심볼릭 링크는 따라가지 않습니다.
- `fileCount`와 `totalSizeBytes`는 이미지 파일만 기준으로 합니다.
- 라벨 후보 파일이 하나라도 존재하면 `hasLabels`는 true입니다.

### 8. API 문서화

FastAPI에 내장된 OpenAPI 지원을 사용합니다.

- Swagger UI: `/docs`
- ReDoc: `/redoc`
- OpenAPI JSON: `/openapi.json`
- API 제목: `Container Image Augmentation API`
- API 버전: `0.1.0`
- 라우트 태그: `health`, `projects`, `augmentation-tasks`
- 응답 모델과 공통 에러 응답 스키마를 선언합니다.

### 9. CORS

기본적으로 로컬 프론트엔드 오리진을 허용합니다.

- `http://localhost:3000`
- `http://127.0.0.1:3000`
- 추가 오리진은 `BACKEND_CORS_ORIGINS`로 구성할 수 있습니다.
- 인증이 범위에서 제외되므로 MVP에서는 자격 증명(credentials)을 비활성화합니다.

### 10. 도구 및 테스트

백엔드 의존성 관리와 명령에는 `uv`를 사용합니다.

- 개발 서버: `uv run uvicorn app.main:app --reload`
- 테스트: `uv run pytest`
- `pytest`를 개발 의존성으로 추가합니다.
- API 계약 테스트에는 FastAPI `TestClient`를 사용합니다.

## 연기됨 (Deferred)

- 프론트엔드 API 통합
- PostgreSQL 영속성
- 이미지 행 및 라벨 행 저장
- OCR 모델 관리
- 작업 로그 API
- 실제 증강 알고리즘
- 실제 OCR 라벨링
- WebSocket/SSE 진행 상황 푸시
- ZIP 다운로드
- 경로 허용 목록(allow-list) 제한

## 인수 기준 (Acceptance Criteria)

- `GET /api/health`는 `{ "status": "ok" }`를 반환합니다.
- 유효한 로컬 이미지 폴더로 프로젝트를 생성할 수 있습니다.
- 프로젝트 목록/상세/삭제 API는 `docs/API-MVP-spec.md`를 따릅니다.
- 증강 작업을 시작하면 출력 폴더가 생성되고 이미지가 복사됩니다.
- 두 번째 활성 작업은 `TASK_ALREADY_RUNNING`으로 거부됩니다.
- 폴링은 작업 진행 상황을 반환합니다.
- 대기 중이거나 실행 중인 작업을 중지하면 `STOPPED`를 반환합니다.
- 결과는 `DONE`, `FAILED`, `STOPPED` 상태에서만 사용 가능합니다.
- Swagger/OpenAPI를 사용할 수 있습니다.
- `uv run pytest`가 통과합니다.
