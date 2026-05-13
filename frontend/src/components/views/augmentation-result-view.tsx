"use client"

import {
  CheckCircle2,
  FolderOpen,
  ImageIcon,
  RotateCcw,
  XCircle,
} from "lucide-react"
import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ApiError, localFolders } from "@/lib/api"
import { formatDateShort, pathBasename } from "@/lib/format"
import type { AugmentationResult, Project } from "@/types/project"

type AugmentationResultViewProps = {
  project: Project
  result: AugmentationResult
  onBackToDetail: () => void
}

/**
 * Final summary shown after a task transitions to DONE. Source data comes
 * from `GET /api/augmentation-tasks/{id}/result` (see AppShell polling loop).
 */
export function AugmentationResultView({
  project,
  result,
  onBackToDetail,
}: AugmentationResultViewProps) {
  const [isOpeningFolder, setIsOpeningFolder] = useState(false)
  const [folderOpenError, setFolderOpenError] = useState<string | null>(null)
  const folderName = pathBasename(project.sourceFolderPath) || project.title

  async function openOutputFolder() {
    if (isOpeningFolder) return
    setIsOpeningFolder(true)
    setFolderOpenError(null)
    try {
      await localFolders.open(result.outputFolderPath)
    } catch (error) {
      setFolderOpenError(describeOpenFolderError(error))
    } finally {
      setIsOpeningFolder(false)
    }
  }

  return (
    <section className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-6 py-10 md:px-10">
      <div className="mb-8">
        <p className="text-sm font-medium text-muted-foreground">
          결과 시각화
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {project.title}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          백엔드가 보고한 증강 작업 결과를 요약합니다.
        </p>
      </div>

      <div className="rounded-xl border bg-background">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
              <CheckCircle2 className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold">
                Task #{result.taskId} 완료
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {folderName} · {formatDateShort(result.completedAt)}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={openOutputFolder}
              disabled={isOpeningFolder}
            >
              {isOpeningFolder ? (
                <RotateCcw className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <FolderOpen className="size-4" aria-hidden="true" />
              )}
              저장 폴더 위치 확인
            </Button>
            <Button type="button" onClick={onBackToDetail}>
              <RotateCcw className="size-4" aria-hidden="true" />
              프로젝트 상세로 돌아가기
            </Button>
          </div>
        </div>

        {folderOpenError ? (
          <div
            role="alert"
            className="mx-5 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900"
          >
            {folderOpenError}
          </div>
        ) : null}

        <Separator />

        <div className="grid gap-4 p-5 md:grid-cols-3">
          <ResultMetric
            icon={<ImageIcon className="size-4" aria-hidden="true" />}
            label="전체 이미지"
            value={`${result.totalImageCount.toLocaleString("ko-KR")}개`}
          />
          <ResultMetric
            icon={<CheckCircle2 className="size-4" aria-hidden="true" />}
            label="정상 처리"
            value={`${result.successCount.toLocaleString("ko-KR")}개`}
          />
          <ResultMetric
            icon={<XCircle className="size-4" aria-hidden="true" />}
            label="실패"
            value={`${result.failedCount.toLocaleString("ko-KR")}개`}
          />
        </div>
      </div>
    </section>
  )
}

function describeOpenFolderError(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.code}: ${error.message}`
  }
  return "결과 폴더를 열지 못했습니다. 백엔드가 실행 중인지 확인해 주세요."
}

function ResultMetric({
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
