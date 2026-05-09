"use client"

import { AlertCircle, FolderOpen, Loader2 } from "lucide-react"
import type { FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type CreateProjectViewProps = {
  sourceFolderPath: string
  projectName: string
  projectDescription: string
  targetSpec: string
  isCreating: boolean
  errorMessage: string | null
  onSourceFolderPathChange: (value: string) => void
  onProjectNameChange: (value: string) => void
  onProjectDescriptionChange: (value: string) => void
  onTargetSpecChange: (value: string) => void
  onCreateProject: () => void
}

/**
 * Project creation form. Submits to `POST /api/projects` via AppShell, which
 * delegates the actual folder scan to the backend. On success the new
 * `Project` is added to the sidebar and AppShell switches to the detail view.
 */
export function CreateProjectView({
  sourceFolderPath,
  projectName,
  projectDescription,
  targetSpec,
  isCreating,
  errorMessage,
  onSourceFolderPathChange,
  onProjectNameChange,
  onProjectDescriptionChange,
  onTargetSpecChange,
  onCreateProject,
}: CreateProjectViewProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isCreating) return
    onCreateProject()
  }

  const canSubmit =
    !isCreating &&
    sourceFolderPath.trim().length > 0 &&
    projectName.trim().length > 0

  return (
    <section className="mx-auto flex min-h-full w-full max-w-3xl flex-col px-6 py-10 md:px-10">
      <div className="mb-8">
        <p className="text-sm font-medium text-muted-foreground">
          새 프로젝트
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          프로젝트 생성
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          백엔드가 폴더를 스캔하여 이미지 개수, 용량, 라벨 포함 여부를 자동으로
          파악합니다.
        </p>
      </div>

      <form className="flex flex-1 flex-col gap-5" onSubmit={handleSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="source-folder-path">
            <FolderOpen className="size-4" aria-hidden="true" />
            이미지 폴더 절대경로
          </Label>
          <Input
            id="source-folder-path"
            value={sourceFolderPath}
            onChange={(event) => onSourceFolderPathChange(event.target.value)}
            placeholder="예: E:\datasets\container-images"
            disabled={isCreating}
            autoComplete="off"
            required
          />
          <p className="text-xs text-muted-foreground">
            로컬 디스크의 절대경로를 입력하세요. 백엔드가 해당 폴더를 읽을 수
            있어야 합니다.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="project-name">프로젝트 이름</Label>
          <Input
            id="project-name"
            value={projectName}
            onChange={(event) => onProjectNameChange(event.target.value)}
            placeholder="예: 부산항 컨테이너 번호 데이터셋"
            disabled={isCreating}
            required
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="project-description">설명 (선택)</Label>
          <Textarea
            id="project-description"
            className="min-h-28 resize-none"
            value={projectDescription}
            onChange={(event) =>
              onProjectDescriptionChange(event.target.value)
            }
            placeholder="데이터 출처, 촬영 환경, 증강 목적 등을 간단히 입력하세요."
            disabled={isCreating}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="target-spec">타겟 규격 (선택)</Label>
          <Input
            id="target-spec"
            value={targetSpec}
            onChange={(event) => onTargetSpecChange(event.target.value)}
            placeholder="예: ISO 6346"
            disabled={isCreating}
          />
        </div>

        {errorMessage ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900"
          >
            <AlertCircle
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <div>
              <p className="font-medium">프로젝트 생성 실패</p>
              <p className="mt-1 text-xs opacity-90">{errorMessage}</p>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex justify-end pt-4">
          <Button type="submit" disabled={!canSubmit}>
            {isCreating ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                생성 중…
              </>
            ) : (
              "프로젝트 생성"
            )}
          </Button>
        </div>
      </form>
    </section>
  )
}
