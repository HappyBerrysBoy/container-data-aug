"use client"

import {
  AlertCircle,
  FileText,
  HardDrive,
  ImageIcon,
  Loader2,
  Play,
  RefreshCw,
  Trash2,
} from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  formatBytes,
  formatDateShort,
  pathBasename,
} from "@/lib/format"
import type { AugmentationTaskStatus, ProjectDetail } from "@/types/project"

type ProjectDetailViewProps = {
  project: ProjectDetail
  isStale: boolean
  errorMessage: string | null
  isDeleting: boolean
  isRescanning: boolean
  rescanError: string | null
  onStartAugmentation: () => void
  onRequestDelete: () => void
  onRescan: () => void
}

const STATUS_LABEL: Record<AugmentationTaskStatus, string> = {
  PENDING: "대기 중",
  RUNNING: "진행 중",
  STOPPED: "중단됨",
  FAILED: "실패",
  DONE: "완료",
}

const STATUS_BADGE: Record<AugmentationTaskStatus, string> = {
  PENDING: "border-zinc-300 bg-zinc-50 text-zinc-700",
  RUNNING: "border-sky-300 bg-sky-50 text-sky-800",
  STOPPED: "border-zinc-300 bg-zinc-50 text-zinc-700",
  FAILED: "border-rose-300 bg-rose-50 text-rose-800",
  DONE: "border-emerald-300 bg-emerald-50 text-emerald-800",
}

export function ProjectDetailView({
  project,
  isStale,
  errorMessage,
  isDeleting,
  isRescanning,
  rescanError,
  onStartAugmentation,
  onRequestDelete,
  onRescan,
}: ProjectDetailViewProps) {
  const folderName = pathBasename(project.sourceFolderPath) || project.title

  return (
    <section className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-6 py-10 md:px-10">
      <div className="mb-8">
        <p className="text-sm font-medium text-muted-foreground">
          프로젝트 상세
          {isStale ? (
            <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              최신 정보 갱신 중…
            </span>
          ) : null}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {project.title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {project.description ||
            "프로젝트 설명이 아직 입력되지 않았습니다."}
        </p>
      </div>

      {errorMessage ? (
        <div
          role="alert"
          className="mb-6 flex items-start gap-2.5 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900"
        >
          <AlertCircle
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <div>
            <p className="font-medium">상세 정보를 불러오지 못했습니다</p>
            <p className="mt-1 text-xs opacity-90">{errorMessage}</p>
          </div>
        </div>
      ) : null}

      {rescanError ? (
        <div
          role="alert"
          className="mb-6 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <AlertCircle
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <div>
            <p className="font-medium">폴더 재스캔에 실패했습니다</p>
            <p className="mt-1 text-xs opacity-90">{rescanError}</p>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border bg-background">
        <div className="flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
                <FileText className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{folderName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {project.sourceFolderPath}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDateShort(project.createdAt)} 생성
                  {project.targetSpec ? ` · ${project.targetSpec}` : ""}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap md:justify-end">
            <Button type="button" onClick={onStartAugmentation}>
              <Play className="size-4" aria-hidden="true" />
              증강 프로세스 시작
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onRescan}
              disabled={isRescanning}
              title="원본 폴더를 다시 스캔하여 파일 개수와 용량을 갱신합니다"
            >
              {isRescanning ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  스캔 중…
                </>
              ) : (
                <>
                  <RefreshCw className="size-4" aria-hidden="true" />
                  폴더 다시 스캔
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onRequestDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  삭제 중…
                </>
              ) : (
                <>
                  <Trash2 className="size-4" aria-hidden="true" />
                  프로젝트 삭제
                </>
              )}
            </Button>
          </div>
        </div>

        <Separator />

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <ProjectMetric
            icon={<ImageIcon className="size-4" aria-hidden="true" />}
            label="파일 개수"
            value={`${project.fileCount.toLocaleString("ko-KR")}개`}
          />
          <ProjectMetric
            icon={<HardDrive className="size-4" aria-hidden="true" />}
            label="전체 용량"
            value={formatBytes(project.totalSizeBytes)}
          />
        </div>

        {project.latestTask ? (
          <>
            <Separator />
            <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">최근 증강 작업</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Task #{project.latestTask.id} · 진행률{" "}
                  {project.latestTask.progress}%
                </p>
              </div>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                  STATUS_BADGE[project.latestTask.status]
                }`}
              >
                {STATUS_LABEL[project.latestTask.status]}
              </span>
            </div>
          </>
        ) : null}
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
