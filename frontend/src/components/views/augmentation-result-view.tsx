"use client"

import {
  CheckCircle2,
  FolderOpen,
  ImageIcon,
  RotateCcw,
  Tags,
  XCircle,
} from "lucide-react"
import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import type { MockAugmentationResult, ProjectSummary } from "@/types/project"

type AugmentationResultViewProps = {
  project: ProjectSummary
  /** Mock result, will be replaced with backend AugmentationResult in task [5]. */
  result: MockAugmentationResult
  onBackToDetail: () => void
}

export function AugmentationResultView({
  project,
  result,
  onBackToDetail,
}: AugmentationResultViewProps) {
  const [showFolderNotice, setShowFolderNotice] = useState(false)

  return (
    <section className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-6 py-10 md:px-10">
      <div className="mb-8">
        <p className="text-sm font-medium text-muted-foreground">
          결과 시각화
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {project.name}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          더미 증강 작업의 처리 결과를 요약합니다.
        </p>
      </div>

      <div className="rounded-xl border bg-background">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
              <CheckCircle2 className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold">증강 작업 완료</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {project.folderName}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowFolderNotice(true)}
            >
              <FolderOpen className="size-4" aria-hidden="true" />
              저장 폴더 열기
            </Button>
            <Button type="button" onClick={onBackToDetail}>
              <RotateCcw className="size-4" aria-hidden="true" />
              프로젝트 상세로 돌아가기
            </Button>
          </div>
        </div>

        {showFolderNotice && (
          <div className="mx-5 rounded-lg border bg-muted/20 p-4 text-sm text-muted-foreground">
            실제 폴더 열기는 아직 연결되지 않았습니다. 목업 저장 위치:{" "}
            <span className="font-medium text-foreground">
              {result.outputFolderLabel}
            </span>
          </div>
        )}

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

        <div className="px-5 pb-5">
          <div className="rounded-lg border bg-muted/20 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Tags className="size-4" aria-hidden="true" />
              <span>라벨링 적용 여부</span>
            </div>
            <p className="text-sm font-semibold">
              {result.runOcrLabeling ? "OCR 라벨링 적용" : "OCR 라벨링 미적용"}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
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
