# Frontend Layout Spec

## Objective

Container Image Augmentation Framework의 초기 UI 골격을 구성한다. 사용자는 왼쪽의 접이식 사이드바에서 프로젝트를 만들거나 선택하고, 오른쪽 메인 영역에서 초기 화면, 프로젝트 생성 화면, 프로젝트 상세 화면을 확인한다.

이번 범위는 디자인과 화면 전환에 한정한다. 실제 로컬 폴더 분석, 파일 용량 계산, 백엔드 프로젝트 저장, 증강 프로세스 실행은 구현하지 않는다.

## Screens

### 1. Initial Screen

- 왼쪽에는 공통 사이드바가 표시된다.
- 오른쪽 메인 영역 중앙에는 `새 프로젝트 생성하기` 버튼이 표시된다.
- 버튼을 누르면 프로젝트 생성 화면으로 전환된다.

### 2. Project Creation Screen

- 상단에 폴더 선택 버튼이 있다.
- 폴더 선택 버튼은 현재 단계에서 목업 선택 상태만 표시한다.
- 선택된 목업 폴더의 이미지 파일 개수와 전체 용량을 요약한다.
- 프로젝트 이름 입력란과 설명 입력란이 있다.
- 하단 `프로젝트 생성` 버튼을 누르면 목업 프로젝트가 생성되고 프로젝트 상세 화면으로 전환된다.

### 3. Project Detail Screen

- 선택된 프로젝트의 이름과 설명을 표시한다.
- 파일 개수, 전체 용량, 라벨 포함 여부를 표시한다.
- `증강 프로세스 시작` 버튼을 표시한다.
- 버튼은 현재 단계에서 실제 증강 작업을 시작하지 않는다.

## Common Layout

- 전체 레이아웃은 ChatGPT/Codex처럼 단순한 좌측 사이드바와 우측 작업 영역으로 구성한다.
- 사이드바 상단에는 `새 프로젝트 생성` 버튼을 둔다.
- 사이드바 하단 영역에는 대화 기록처럼 프로젝트 목록을 표시한다.
- 사이드바는 접고 펼 수 있어야 한다.
- 접힌 상태에서도 새 프로젝트 생성과 펼침 버튼은 접근 가능해야 한다.

## Tech Stack

- Next.js App Router
- React Client Component for interactive shell state
- TypeScript
- Tailwind CSS
- shadcn UI components
- lucide-react icons

## Commands

- Dev: `pnpm dev`
- Lint: `pnpm lint`
- Build: `pnpm build`
- Add shadcn components: `pnpm dlx shadcn@latest add <component>`

## Project Structure

- `apps/frontend/src/app/page.tsx`: page entry
- `apps/frontend/src/app/layout.tsx`: metadata and root layout
- `apps/frontend/src/components/app-shell.tsx`: sidebar/main shell and screen state
- `apps/frontend/src/components/project-sidebar.tsx`: collapsible project sidebar
- `apps/frontend/src/components/views/empty-project-view.tsx`: initial screen
- `apps/frontend/src/components/views/create-project-view.tsx`: project creation form
- `apps/frontend/src/components/views/project-detail-view.tsx`: project detail screen
- `apps/frontend/src/types/project.ts`: project data type

## Boundaries

- Always: keep UI keyboard-accessible, use existing shadcn/Tailwind conventions, verify with lint/build.
- Ask first: introduce real backend integration, persistent storage, new routing strategy, or large dependency additions.
- Never: implement real local file analysis in this layout-only pass, store user file paths permanently, or add unrelated backend/database changes.

## Success Criteria

- The app opens to the initial screen with the shared sidebar.
- Sidebar `새 프로젝트 생성` and main `새 프로젝트 생성하기` both navigate to the creation screen.
- Project creation screen shows folder selection placeholder, file count, total size, name input, description textarea, and submit button.
- Creating a mock project adds it to the sidebar and navigates to detail.
- Detail screen shows file count, total size, label status, and augmentation start CTA.
- Sidebar can collapse and expand without breaking the main layout.
- `pnpm lint` passes.
- `pnpm build` passes or any failure is documented.
