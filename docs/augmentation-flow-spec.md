# Spec: Frontend Augmentation Flow

## Objective

프로젝트 상세 화면 이후의 4~6단계 프론트엔드 흐름을 구현한다. 사용자는 프로젝트 상세에서 증강 옵션을 설정하고, 더미 증강 진행 상태를 확인한 뒤, 더미 결과 요약을 볼 수 있어야 한다.

이번 범위는 전체 동작 프로세스 확인용 프론트엔드 목업이다. 실제 백엔드 API 호출, 로컬 폴더 접근, 이미지 증강, OCR 실행, 파일 저장은 구현하지 않는다.

## Tech Stack

- Next.js App Router
- React Client Component state
- TypeScript
- Tailwind CSS
- shadcn/base-nova style UI components
- Base UI primitives
- lucide-react icons

## Commands

- Dev: `cd frontend && pnpm dev`
- Lint: `cd frontend && pnpm lint`
- Build: `cd frontend && pnpm build`

## Project Structure

- `frontend/src/components/app-shell.tsx`: 전체 화면 상태, 더미 증강 진행, 결과 데이터 계산
- `frontend/src/components/views/project-detail-view.tsx`: 증강 옵션 모달 진입 버튼
- `frontend/src/components/views/augmentation-progress-view.tsx`: 5단계 증강 수행 화면
- `frontend/src/components/views/augmentation-result-view.tsx`: 6단계 결과 시각화 화면
- `frontend/src/components/augmentation-options-dialog.tsx`: 4단계 증강 옵션 설정 모달
- `frontend/src/components/ui/*`: 필요한 최소 shadcn 스타일 UI primitive
- `frontend/src/types/project.ts`: 프로젝트, 증강 설정, 결과 타입

## Code Style

기존 컴포넌트 구조를 유지한다. 화면 컴포넌트는 presentation 중심으로 두고, 상태 전환과 더미 진행 로직은 `AppShell`에서 관리한다.

```tsx
<AugmentationProgressView
  config={augmentationConfig}
  progress={augmentationProgress}
  processedCount={processedCount}
  failedCount={failedCount}
  onCancel={cancelAugmentation}
/>
```

## Testing Strategy

- 정적 검증: `pnpm lint`
- 빌드 검증: `pnpm build`
- 수동 플로우 검증:
  - 프로젝트 생성 후 상세 화면에서 `증강 프로세스 시작` 클릭
  - 옵션 모달에서 워커 수와 OCR 라벨 생성 여부 조정
  - `증강 시작` 클릭 후 진행 화면 자동 증가 확인
  - `중단` 클릭 시 프로젝트 상세로 복귀 확인
  - 완료 후 결과 화면 자동 전환 확인
  - 저장 폴더 열기 클릭 시 목업 안내 표시 확인

## Boundaries

- Always: 기존 상태 기반 화면 전환 구조를 유지하고, UI는 shadcn/base-nova 토큰과 기존 컴포넌트 스타일을 따른다.
- Ask first: URL 라우팅 도입, 백엔드 API 연동, 실제 파일 시스템 접근, 새 런타임 의존성 추가.
- Never: 실제 이미지 증강/OCR 수행, 사용자 로컬 경로 저장, 백엔드/DB 스키마 변경.

## Success Criteria

- 프로젝트 상세의 `증강 프로세스 시작` 버튼이 4단계 옵션 설정 모달을 연다.
- 옵션 모달에는 워커 수 입력, OCR 라벨 생성 체크박스, 현재 프로젝트 이미지 수, 증강 시작 버튼이 있다.
- 워커 수 기본값은 4이며 허용 범위는 1~8이다.
- 증강 시작 시 5단계 증강 수행 화면으로 이동하고, 진행률이 더미 타이머로 자동 증가한다.
- 진행 화면은 전체 워커 수, 진행률, 처리/실패 카운트만 미니멀하게 보여준다.
- 진행 중 `중단` 버튼을 누르면 더미 작업이 멈추고 프로젝트 상세 화면으로 돌아간다.
- 진행률이 100%가 되면 6단계 결과 시각화 화면으로 자동 전환한다.
- 결과 화면은 전체 이미지 수, 정상 처리 수, 실패 수, 라벨링 적용 여부, 저장 폴더 열기 버튼을 표시한다.
- 결과 수치는 현재 프로젝트 이미지 수 기반으로 계산한다.
- 저장 폴더 열기는 실제 OS 동작 대신 목업 경로 안내 메시지를 표시한다.
- 결과 화면의 주요 액션은 프로젝트 상세로 돌아가기이다.

## Open Questions

없음. 현재 구현은 더미 프론트엔드 흐름으로 고정한다.
