# GLM-OCR Transformers 전환 결정 요약

## 배경

컨테이너 번호 셔플 증강은 글자별 bbox와 문자 인식 결과를 필요로 한다. 기존 증강 모듈은 외부 데몬 기반 GLM 호출을 전제로 했지만, 배포와 테스트 환경을 단순화하기 위해 Python 프로세스 안에서 Hugging Face Transformers 모델을 직접 로드하는 방식으로 전환한다.

## 결정 사항

- 기본 모델은 Hugging Face Hub의 `zai-org/GLM-OCR`를 사용한다.
- 기본 OCR 전략은 CRAFT로 글자 bbox를 잡고, 각 crop 이미지를 GLM-OCR로 단일 문자 인식하는 `CRAFT+GLM` 방식이다.
- 전체 이미지 OCR 리더는 유지하지 않는다. 셔플 품질에 필요한 단위는 글자별 bbox이기 때문이다.
- 모델은 lazy singleton으로 로드한다. 첫 crop OCR 호출 때 로드하고 같은 프로세스 안에서 재사용한다.
- 기본 device는 `cuda`이며, CUDA를 사용할 수 없으면 경고를 남기고 CPU로 fallback한다.
- 모델 소스는 기본 Hugging Face model id와 로컬 모델 경로를 모두 지원한다.
- 앱 서비스에서 실제 셔플 증강을 호출하도록 연결하는 작업은 이번 범위에서 제외한다.

## 실행 및 테스트 정책

- 일반 테스트는 모델 다운로드 없이 fake backend와 monkeypatch로 검증한다.
- 실제 GLM-OCR 모델 로드 테스트는 `BACKEND_RUN_REAL_MODEL_TESTS=1` 환경변수로 opt-in 실행한다.
- 모델 로드/다운로드 실패는 예외로 드러낸다.
- 개별 crop 인식 실패는 빈 문자로 처리해 해당 이미지가 skip될 수 있게 한다.

## 대안 검토

- MLX 4/8bit 모델은 Apple Silicon 실행에는 유리하지만 서버/CI 호환성과 테스트 분기가 커져 제외했다.
- 전체 이미지 GLM OCR은 구현이 단순하지만 bbox fallback이 이미지 전체 또는 균등 분할에 의존해 셔플 품질이 흔들릴 수 있어 제외했다.
- API 서비스 연결까지 한 번에 구현하는 선택지는 변경 범위가 커져 별도 작업으로 분리했다.
