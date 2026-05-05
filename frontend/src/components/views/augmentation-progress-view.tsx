import { Cpu, Images, Play, RotateCcw, XCircle } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import type { AugmentationConfig, ProjectSummary } from "@/types/project"

type AugmentationProgressViewProps = {
  project: ProjectSummary
  config: AugmentationConfig
  progress: number
  processedCount: number
  failedCount: number
  onCancel: () => void
}

export function AugmentationProgressView({
  project,
  config,
  progress,
  processedCount,
  failedCount,
  onCancel,
}: AugmentationProgressViewProps) {
  return (
    <section className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-6 py-10 md:px-10">
      <div className="mb-8">
        <p className="text-sm font-medium text-muted-foreground">
          증강 수행
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {project.name}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          더미 워커가 프로젝트 이미지를 처리하는 상태를 표시합니다.
        </p>
      </div>

      <div className="rounded-xl border bg-background">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
              <RotateCcw className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold">증강 작업 진행 중</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {project.folderName}
              </p>
            </div>
          </div>
          <Button type="button" variant="outline" onClick={onCancel}>
            <XCircle className="size-4" aria-hidden="true" />
            중단
          </Button>
        </div>

        <Separator />

        <div className="grid gap-6 p-5">
          <div>
            <div className="mb-3 flex items-center justify-between gap-4">
              <p className="text-sm font-medium">현재 진행률</p>
              <p className="text-sm font-semibold">{progress}%</p>
            </div>
            <Progress value={progress} aria-label="증강 진행률" />
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <ProgressMetric
              icon={<Cpu className="size-4" aria-hidden="true" />}
              label="전체 워커"
              value={`${config.workerCount}개`}
            />
            <ProgressMetric
              icon={<Images className="size-4" aria-hidden="true" />}
              label="전체 이미지"
              value={`${config.totalImageCount.toLocaleString("ko-KR")}개`}
            />
            <ProgressMetric
              icon={<Play className="size-4" aria-hidden="true" />}
              label="처리된 이미지"
              value={`${processedCount.toLocaleString("ko-KR")}개`}
            />
            <ProgressMetric
              icon={<XCircle className="size-4" aria-hidden="true" />}
              label="실패 예상"
              value={`${failedCount.toLocaleString("ko-KR")}개`}
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function ProgressMetric({
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
