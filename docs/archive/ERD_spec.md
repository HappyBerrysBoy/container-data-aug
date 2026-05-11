### 1. Project (프로젝트 관리)

- **테이블 설명:** 입력 데이터 그룹을 폴더 단위로 묶어 관리하는 최상위 테이블
- **컬럼 구조:**
    - **`id`** (Integer, PK): 프로젝트 고유 식별자
    - **`title`** (String): 프로젝트 제목
    - **`description`** (Text, Nullable): 프로젝트 상세 설명
    - **`target_spec`** (String, Nullable): 타겟 규격 (예: ISO 6346)
    - **`created_at`** (Timestamp): 프로젝트 생성 일시

### 2. Image (이미지 데이터 관리)

- **테이블 설명:** 원본 및 증강된 이미지 데이터를 저장하고 데이터 파생 계보(Lineage)를 추적하는 테이블입니다.
- **컬럼 구조:**
    - **`id`** (Integer, PK): 이미지 고유 식별자
    - **`project_id`** (Integer, FK): 이미지가 속한 프로젝트 ID
    - **`parent_id`** (Integer, FK, Nullable): 원본 이미지 ID. 이 값이 비어있으면 원본이며, 값이 있으면 파생된 원본의 ID를 참조하여 증강본임을 나타냅니다.
    - **`folder_name`** (String): 증강 옵션에 따라 매핑되는 소속 폴더명
    - **`file_path`** (String, Unique): 실제 물리적 또는 클라우드 파일 경로
    - **`is_valid_path`** (Boolean, Default True): 경로 내 실제 파일 존재 여부 (유효성 검사용)
    - **`width`** / **`height`** (Integer): 가로 및 세로 해상도 (해상도 분포 통계용)
    - **`created_at`** (Timestamp): 이미지 등록/생성 일시

### 3. Label (라벨 데이터 및 검증)

- **테이블 설명:** 컨테이너 번호 라벨링 현황 파악 및 품질 검수, 부분 증강을 위한 영역 좌표를 관리합니다.
- **컬럼 구조:**
    - **`id`** (Integer, PK): 라벨 고유 식별자
    - **`image_id`** (Integer, FK): 라벨이 속한 이미지 ID
    - **`text_value`** (String, Nullable): OCR 인식 또는 수동으로 입력된 텍스트 값
    - **`is_iso_valid`** (Boolean, Nullable): ISO 6346 체크 디지트 알고리즘 통과 여부
    - **`is_manual`** (Boolean, Default False): 사용자 수동 라벨링 여부
    - **`is_quality_passed`** (Boolean, Nullable): 증강 후 OCR 품질 검수 통과 여부 (라벨링 실패 데이터 분류용)
    - **`bbox`** (JSONB, Nullable): 번호가 위치한 영역의 Bounding Box 좌표. 이미지 전체가 아닌 번호 부분에만 손상 증강을 적용할 때 활용됩니다.

### 4. AugmentationTask (증강 비동기 작업 및 리소스 관리)

- **테이블 설명:** 병렬 증강 프로세스의 비동기 진행 상태와 시스템 리소스(CPU/RAM)를 모니터링합니다.
- **컬럼 구조:**
    - **`id`** (Integer, PK): 작업 고유 식별자
    - **`project_id`** (Integer, FK): 작업 대상 프로젝트 ID
    - **`model_id`** (Integer, FK, Nullable): 인식 및 검증에 사용된 OCR 모델 ID
    - **`status`** (String): 작업 상태 (PENDING, RUNNING, STOPPED, FAILED, DONE)
    - **`progress`** (Float, Default 0.0): 작업 처리 진행률 (0 ~ 100%)
    - **`resource_usage`** (JSONB, Nullable): 작업 수행 중 CPU, RAM 등 리소스 점유 현황 로그 (프론트엔드 대시보드 시각화 연계용)
    - **`started_at`** (Timestamp): 작업 시작 일시
    - **`completed_at`** (Timestamp, Nullable): 작업 완료 일시

### 5. AugmentationConfig (증강 옵션 설정 내역)

- **테이블 설명:** 특정 증강 작업에 적용된 세부 옵션 조합과 이로 인해 생성될 타겟 폴더명을 관리합니다.
- **컬럼 구조:**
    - **`id`** (Integer, PK): 설정 고유 식별자
    - **`task_id`** (Integer, FK): 연결된 비동기 증강 작업 ID
    - **`target_folder_name`** (String): 옵션 조합에 의해 프론트엔드에 표시되고 병합될 타겟 폴더명
    - **`applied_options`** (JSONB): 사용자가 선택한 다중 증강 옵션들(예: 해상도 조절, 가로/세로 반전 등)을 유연한 딕셔너리 형태로 저장합니다.

### 6. OcrModel (OCR 딥러닝 모델 관리)

- **테이블 설명:** 증강 전후의 이미지 데이터 인식에 사용될 다양한 버전의 딥러닝 모델을 관리합니다.
- **컬럼 구조:**
    - **`id`** (Integer, PK): 모델 고유 ID
    - **`name`** (String): 모델 명
    - **`version`** (String): 모델 버전 정보 (예: 사전학습, 학습1, 학습2 등)
    - **`weight_path`** (String): 실제 서버 환경에 존재하는 가중치 파일(.pt 파일) 경로

### 7. TaskLog (작업 이벤트 및 에러 핸들링 로그)

- **테이블 설명:** 프로세스 중간에 발생하는 에러와 상세 진행 상황을 타임스탬프와 함께 기록하여 작업을 역추적합니다.
- **컬럼 구조:**
    - **`id`** (Integer, PK): 로그 고유 식별자
    - **`task_id`** (Integer, FK): 이벤트가 발생한 작업 ID
    - **`log_level`** (String): 로그의 성격 (INFO, WARNING, ERROR)
    - **`message`** (Text): 에러 발생 메시지 및 상세 진행 상황 (작업 중단 시 실패 지점을 파악하고 에러 핸들링을 수행하는 데 사용됩니다.)
    - **`created_at`** (Timestamp): 로그 기록 일시

---

**테이블 간의 핵심 관계 요약:**

1. **Project (1) : (N) Image / AugmentationTask**
    - **Project (1) : (N) Image**
        - 하나의 프로젝트는 여러 개의 원본 및 증강 이미지 데이터를 소유합니다. (이미지가 `project_id`를 참조)
    - **Project (1) : (N) AugmentationTask**
        - 하나의 프로젝트 내에서 여러 번의 비동기 증강 프로세스 작업이 실행될 수 있습니다. (작업이 `project_id`를 참조)
2. **Image (1) : (N) Image** / **Label(**원본 1개가 여러 증강 이미지를 파생시킴)
    - **Image (1) : (N) Image (자기 참조 / 계보 추적)**
        - 하나의 원본 이미지는 다양한 옵션이 적용된 여러 개의 증강된 이미지(파생본)를 생성해 냅니다. (증강본이 원본의 `parent_id`를 참조)
    - **Image (1) : (N) Label**
        - 하나의 이미지는 컨테이너 번호 텍스트 및 Bounding Box 좌표를 담은 라벨 데이터를 가집니다. (라벨이 `image_id`를 참조)
3. **AugmentationTask (1) : (1) AugmentationConfig**
    - 실행되는 한 번의 증강 작업에는 정확히 하나의 증강 옵션 세트(해상도, 반전 여부 등 JSON 데이터)가 1:1로 연결됩니다. (설정이 `task_id`를 참조)
4. **AugmentationTask (1) : (N) TaskLog**
    - 하나의 증강 프로세스가 진행되는 동안 발생하는 다양한 상태 변화, 진행률, 그리고 에러 내역들이 여러 줄의 로그 기록으로 쌓이게 됩니다. (로그가 `task_id`를 참조)
5. **OcrModel (1) : (N) AugmentationTask**
    - 시스템에 등록된 하나의 특정 OCR 모델(예: 사전학습 V1)은 여러 번의 증강 작업에 반복적으로 호출 및 사용될 수 있습니다. (작업이 `model_id`를 참조)