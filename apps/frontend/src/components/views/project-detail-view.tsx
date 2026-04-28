import {
  FileText,
  HardDrive,
  ImageIcon,
  ImagePlus,
  Play,
  Tags,
  Trash2,
} from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import type { ProjectSummary } from "@/types/project"

type ProjectDetailViewProps = {
  project: ProjectSummary
}

export function ProjectDetailView({ project }: ProjectDetailViewProps) {
  return (
    <section className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-6 py-10 md:px-10">
      <div className="mb-8">
        <p className="text-sm font-medium text-muted-foreground">
          프로젝트 상세
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {project.name}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {project.description || "프로젝트 설명이 아직 입력되지 않았습니다."}
        </p>
      </div>

      <div className="rounded-xl border bg-background">
        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
                <FileText className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {project.folderName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {project.createdAtLabel} 생성
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap md:justify-end">
            <Button type="button" variant="outline">
              <ImagePlus className="size-4" aria-hidden="true" />
              이미지 추가
            </Button>
            <Button type="button" variant="outline">
              <Trash2 className="size-4" aria-hidden="true" />
              이미지 삭제
            </Button>
            <Button type="button">
              <Play className="size-4" aria-hidden="true" />
              증강 프로세스 시작
            </Button>
            <Button type="button" variant="destructive">
              <Trash2 className="size-4" aria-hidden="true" />
              프로젝트 삭제
            </Button>
          </div>
        </div>

        <Separator />

        <div className="grid gap-4 p-5 md:grid-cols-3">
          <ProjectMetric
            icon={<ImageIcon className="size-4" aria-hidden="true" />}
            label="파일 갯수"
            value={`${project.fileCount.toLocaleString("ko-KR")}개`}
          />
          <ProjectMetric
            icon={<HardDrive className="size-4" aria-hidden="true" />}
            label="전체 용량"
            value={project.totalSizeLabel}
          />
          <ProjectMetric
            icon={<Tags className="size-4" aria-hidden="true" />}
            label="라벨 포함 여부"
            value={project.hasLabels ? "라벨 포함" : "라벨 미포함"}
          />
        </div>
      </div>
    </section>
  )
}

function ProjectMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-xl font-semibold tracking-tight">{value}</p>
    </div>
  )
}
