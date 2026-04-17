# Container Data Augmentation Framework

## Description

컨테이너 이미지와 레이블(OCR) 쌍 데이터셋이 주어졌을 때, 다양한 증강 기법을 파이프라인으로 적용해 데이터셋 규모를 확장하고, 이를 관리·다운로드할 수 있는 프레임워크.

## 기술 스택

| Layer | Stack |
| --- | --- |
| Frontend | Next.js |
| Backend | FastAPI (Python) |
| Database | PostgreSQL |
| GPU | CUDA 12.6 |
| Infra | Docker Compose |
| API Spec | Swagger |

---

## TO-DO
`완료한 내용의 경우: 최상단으로 이동 → 해당 내용 관련 링크 추가 → ☑︎ 마크로 수정`
- ☑ **역할 분담 상세** - 가급적 FE/BE로만 구성 [Roles](#roles)
- ◻︎ **기능명세서 작성** - 테이블 형태로 대분류/요구사항ID/기능명/설명/담당자(FE/BE) 명세
- ◻︎ **와이어 프레임** - 레이아웃 이해를 위한 와이어 프레임 그리기
- ◻︎ **시스템 아키텍처 구조도** - 흐름 파악 및 파이프라인 구조 이해를 위한 아키텍처 설계
- ◻︎ **ERD** - Database 설계를 위한 초기 구조 구상

---

## Roles
- **송원호** - Frontend
- **손원빈** - Frontend
- **최규문** - Backend
- **서준일** - Backend

---

## Project Guidelines
### Conventional Commits
`type(scope): subject`
- type: 변경 작업 종류
- scope: 영향 범위 (생략 가능)
- subject: 변경 내용 요약 설명
- 예시: `docs: update readme` → "문서(docs) 수정", "readme파일 업데이트"