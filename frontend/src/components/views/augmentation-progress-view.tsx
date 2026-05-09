"use client"

import { Cpu, Images, Loader2, Play, RotateCcw, XCircle } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { pathBasename } from "@/lib/format"
import type { AugmentationTask, Project } from "@/types/project"

type AugmentationProgressViewProps = {
  project: Project
  task: AugmentationTask
  isStopping: boolean
  errorMessage: string | null
  onStop: () => void
}

/**
 * Live progress view driven by 1s polling on `GET /api/augmentation-tasks/{id}`.
 * AppShell owns the polling loop and feeds the latest `task` snapshot here.
 */
export function AugmentationProgressView({
  project,
  task,
  isStopping,
  errorMessage,
  onStop,
}: AugmentationProgressViewProps) {
  const folderName = pathBasename(project.sourceFolderPath) || project.title
  const progress = Math.round(task.progress)

  return (
    <section className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-6 py-10 md:px-10">
      <div className="mb-8">
        <p className="text-sm font-medium text-muted-foreground">증강 수행</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {project.title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          백엔드 워커가 프로젝트 이미지를 처리하는 상태를 1초마다 갱신합니다.
        </p>
      </div>

      <div className="rounded-xl border bg-background">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
              <RotateCcw className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold">
                Task #{task.id} · {task.status}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{folderName}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={onStop}
            disabled={isStopping || task.status !== "RUNNING"}
          >
            {isStopping ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                중단 중…
              </>
            ) : (
              <>
                <XCircle className="size-4" aria-hidden="true" />
                중단
              </>
            )}
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
              value={`${task.workerCount}개`}
            />
            <ProgressMetric
              icon={<Images className="size-4" aria-hidden="true" />}
              label="전체 이미지"
              value={`${task.totalImageCount.toLocaleString("ko-KR")}개`}
            />
            <ProgressMetric
              icon={<Play className="size-4" aria-hidden="true" />}
              label="처리됨"
              value={`${task.processedCount.toLocaleString("ko-KR")}개`}
            />
            <ProgressMetric
              icon={<XCircle className="size-4" aria-hidden="true" />}
              label="실패"
              value={`${task.failedCount.toLocaleString("ko-KR")}개`}
            />
          </div>

          {errorMessage ? (
            <div
              role="alert"
              className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900"
            >
              {errorMessage}
            </div>
          ) : null}
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
