import { FolderOpen, HardDrive, ImageIcon, Upload } from "lucide-react"
import type { FormEvent, ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"

type MockFolder = {
  name: string
  fileCount: number
  totalSizeLabel: string
  hasLabels: boolean
}

type CreateProjectViewProps = {
  folder: MockFolder | null
  projectName: string
  projectDescription: string
  onChooseFolder: () => void
  onProjectNameChange: (value: string) => void
  onProjectDescriptionChange: (value: string) => void
  onCreateProject: () => void
}

export function CreateProjectView({
  folder,
  projectName,
  projectDescription,
  onChooseFolder,
  onProjectNameChange,
  onProjectDescriptionChange,
  onCreateProject,
}: CreateProjectViewProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onCreateProject()
  }

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
          컨테이너 이미지 폴더를 기준으로 증강 작업을 준비합니다.
        </p>
      </div>

      <form className="flex flex-1 flex-col" onSubmit={handleSubmit}>
        <div className="rounded-xl border bg-background p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold">이미지 폴더</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                현재 단계에서는 폴더 선택 상태를 목업으로 표시합니다.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={onChooseFolder}>
              <FolderOpen className="size-4" aria-hidden="true" />
              폴더 선택
            </Button>
          </div>

          <div className="mt-5 rounded-lg border border-dashed bg-muted/30 p-4">
            {folder ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-lg border bg-background text-muted-foreground">
                    <Upload className="size-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {folder.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      이미지 파일 목록을 불러온 상태의 예시입니다.
                    </p>
                  </div>
                </div>
                <Separator />
                <div className="grid gap-3 sm:grid-cols-3">
                  <FolderMetric
                    icon={<ImageIcon className="size-4" aria-hidden="true" />}
                    label="이미지 파일"
                    value={`${folder.fileCount.toLocaleString("ko-KR")}개`}
                  />
                  <FolderMetric
                    icon={<HardDrive className="size-4" aria-hidden="true" />}
                    label="전체 용량"
                    value={folder.totalSizeLabel}
                  />
                  <FolderMetric
                    icon={<FolderOpen className="size-4" aria-hidden="true" />}
                    label="라벨 포함"
                    value={folder.hasLabels ? "포함" : "미포함"}
                  />
                </div>
              </div>
            ) : (
              <div className="flex min-h-32 flex-col items-center justify-center text-center">
                <FolderOpen
                  className="mb-3 size-6 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium">선택된 폴더가 없습니다</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  폴더 선택 버튼을 눌러 프로젝트 입력 흐름을 확인하세요.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="project-name">프로젝트 이름</Label>
            <Input
              id="project-name"
              value={projectName}
              onChange={(event) => onProjectNameChange(event.target.value)}
              placeholder="예: 부산항 컨테이너 번호 데이터셋"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="project-description">설명</Label>
            <Textarea
              id="project-description"
              className="min-h-28 resize-none"
              value={projectDescription}
              onChange={(event) =>
                onProjectDescriptionChange(event.target.value)
              }
              placeholder="데이터 출처, 촬영 환경, 증강 목적 등을 간단히 입력하세요."
            />
          </div>
        </div>

        <div className="mt-auto flex justify-end pt-8">
          <Button type="submit" disabled={!folder || !projectName.trim()}>
            프로젝트 생성
          </Button>
        </div>
      </form>
    </section>
  )
}

function FolderMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  )
}
