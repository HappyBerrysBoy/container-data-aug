"use client"

import { Cpu, ImageIcon, Tags } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import type { AugmentationConfig, ProjectSummary } from "@/types/project"

const DEFAULT_WORKER_COUNT = 4
const MIN_WORKER_COUNT = 1
const MAX_WORKER_COUNT = 8

type AugmentationOptionsDialogProps = {
  open: boolean
  project: ProjectSummary | null
  onOpenChange: (open: boolean) => void
  onStart: (config: AugmentationConfig) => void
}

export function AugmentationOptionsDialog({
  open,
  project,
  onOpenChange,
  onStart,
}: AugmentationOptionsDialogProps) {
  const [workerCount, setWorkerCount] = useState(DEFAULT_WORKER_COUNT)
  const [runOcrLabeling, setRunOcrLabeling] = useState(true)

  function resetOptions() {
    setWorkerCount(DEFAULT_WORKER_COUNT)
    setRunOcrLabeling(true)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetOptions()
    }

    onOpenChange(nextOpen)
  }

  function updateWorkerCount(value: string) {
    const nextValue = Number(value)

    if (!Number.isFinite(nextValue)) {
      setWorkerCount(DEFAULT_WORKER_COUNT)
      return
    }

    setWorkerCount(
      Math.min(MAX_WORKER_COUNT, Math.max(MIN_WORKER_COUNT, nextValue))
    )
  }

  function startAugmentation() {
    if (!project) {
      return
    }

    onStart({
      workerCount,
      runOcrLabeling,
      totalImageCount: project.fileCount,
    })
    resetOptions()
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => handleOpenChange(nextOpen)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>증강 옵션 설정</DialogTitle>
          <DialogDescription>
            현재 프로젝트 이미지를 기준으로 더미 증강 작업을 시작합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="rounded-lg border bg-muted/20 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
              <ImageIcon className="size-4" aria-hidden="true" />
              <span>현재 프로젝트 이미지</span>
            </div>
            <p className="text-2xl font-semibold tracking-tight">
              {project?.fileCount.toLocaleString("ko-KR") ?? 0}개
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {project?.folderName ?? "선택된 프로젝트가 없습니다"}
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="worker-count">
              <Cpu className="size-4" aria-hidden="true" />
              멀티 스레드 워커 수
            </Label>
            <Input
              id="worker-count"
              type="number"
              min={MIN_WORKER_COUNT}
              max={MAX_WORKER_COUNT}
              value={workerCount}
              onChange={(event) => updateWorkerCount(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              1~8개 사이에서 선택합니다. 기본값은 4개입니다.
            </p>
          </div>

          <Separator />

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-4">
            <Checkbox
              checked={runOcrLabeling}
              onCheckedChange={(checked) => setRunOcrLabeling(checked)}
              aria-label="OCR 수행하여 라벨까지 생성"
              className="mt-0.5"
            />
            <span className="grid gap-1">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Tags className="size-4" aria-hidden="true" />
                OCR 수행하여 라벨까지 생성
              </span>
              <span className="text-xs leading-5 text-muted-foreground">
                더미 흐름에서는 결과 화면의 라벨링 적용 여부에만 반영됩니다.
              </span>
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            취소
          </Button>
          <Button type="button" onClick={startAugmentation} disabled={!project}>
            증강 시작
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
