# 셔플 모듈 실제 작업 플로우 통합 계획

## 요약

- 기존 copy-only runner를 `backend/app/augmentation/shuffle.py`의 `augment()` 기반 runner로 교체한다.
- `runOcrLabeling`은 당장은 호환용 저장 필드로 유지하고 실행 분기에는 사용하지 않는다. 작업은 항상 셔플을 시도한다.
- CRAFT/GLM reader 초기화 실패는 작업 전체 실패로 처리한다.
- 개별 이미지의 OCR/셔플 실패 또는 0개 생성은 해당 이미지만 실패로 집계하고 다음 이미지를 계속 처리한다.

## 구현 결정

- `AugmentationService.run_task()`는 작업 시작 후 reader를 한 번 준비하고, 스캔된 이미지마다 `shuffle.augment()`를 호출한다.
- 출력 폴더는 기존 상대 경로 보존 규칙을 따른다. 예: `source/nested/a.jpg` -> `output/nested/a_1.jpg`.
- `variantsPerImage`를 `augment(count=...)`로 전달한다.
- 셔플 조합 선택은 기존 기본값대로 랜덤 선택을 유지한다.
- 서비스 실행에서는 `debug=False`로 호출해 `temp/*.jpg` 디버그 파일을 생성하지 않는다.

## 카운팅 정책

- 성공한 원본 이미지 1개는 `processedCount += 1`, `failedCount += 0`, `generatedImageCount += 실제 저장 파일 수`로 집계한다.
- `augment()`가 빈 리스트를 반환하거나 이미지 처리 중 예외가 발생하면 `processedCount += 1`, `failedCount += 1`, `generatedImageCount += 0`으로 집계한다.
- `successCount`는 기존 API 계약대로 `processedCount - failedCount`이다.
- `generatedImageCount`는 원본 이미지 수가 아니라 실제 디스크에 생성된 셔플 결과 이미지 수이다.

## 테스트 계획

- 실제 GLM 모델을 로드하지 않도록 API/service 테스트에서 reader와 `shuffle.augment()`를 monkeypatch한다.
- 성공 이미지 2개, `variantsPerImage=3`이면 `processedCount=2`, `failedCount=0`, `generatedImageCount=6`을 검증한다.
- 한 이미지가 0개 생성되면 task는 `DONE`, 해당 이미지만 실패로 집계되는지 검증한다.
- reader 초기화 예외는 task가 `FAILED`로 종료되는지 검증한다.
- 기존 active task lock, stop, result, output folder validation 계약은 유지한다.
