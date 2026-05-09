"use client"

import {
  AlertCircle,
  Cpu,
  FolderOutput,
  ImageIcon,
  Loader2,
  Tags,
} from "lucide-react"
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
import { pathBasename } from "@/lib/format"
import type {
  AugmentationTaskCreateRequest,
  Project,
} from "@/types/project"

const DEFAULT_WORKER_COUNT = 4
const MIN_WORKER_COUNT = 1
const MAX_WORKER_COUNT = 8

type AugmentationOptionsDialogProps = {
  open: boolean
  project: Project | null
  isStarting: boolean
  errorMessage: string | null
  onOpenChange: (open: boolean) => void
  onStart: (config: AugmentationTaskCreateRequest) => void
}

/**
 * Modal that collects the three MVP augmentation options
 * (workerCount, runOcrLabeling, outputFolderName) before AppShell submits
 * `POST /api/projects/{id}/augmentation-tasks`.
 *
 * The actual form lives in `OptionsForm`, mounted only while `open` is true.
 * That mount/unmount cycle gives us a clean reset on every reopen without
 * needing a `useEffect` to reset state (which would trip React 19's
 * react-hooks/set-state-in-effect rule).
 */
export function AugmentationOptionsDialog({
  open,
  project,
  isStarting,
  errorMessage,
  onOpenChange,
  onStart,
}: AugmentationOptionsDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isStarting && !next) return
        onOpenChange(next)
      }}
    >
      <DialogContent>
        {open ? (
          <OptionsForm
            project={project}
            isStarting={isStarting}
            errorMessage={errorMessage}
            onCancel={() => onOpenChange(false)}
            onStart={onStart}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

type OptionsFormProps = {
  project: Project | null
  isStarting: boolean
  errorMessage: string | null
  onCancel: () => void
  onStart: (config: AugmentationTaskCreateRequest) => void
}

function OptionsForm({
  project,
  isStarting,
  errorMessage,
  onCancel,
  onStart,
}: OptionsFormProps) {
  const [workerCount, setWorkerCount] = useState(DEFAULT_WORKER_COUNT)
  const [runOcrLabeling, setRunOcrLabeling] = useState(true)
  const [outputFolderName, setOutputFolderName] = useState(() =>
    defaultOutputFolderName(project),
  )

  function updateWorkerCount(value: string) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
      setWorkerCount(DEFAULT_WORKER_COUNT)
      return
    }
    setWorkerCount(
      Math.min(MAX_WORKER_COUNT, Math.max(MIN_WORKER_COUNT, parsed)),
    )
  }

  function submit() {
    if (!project || isStarting) return
    const trimmed = outputFolderName.trim()
    if (!trimmed) return
    onStart({
      workerCount,
      runOcrLabeling,
      outputFolderName: trimmed,
    })
  }

  const canSubmit =
    project !== null && !isStarting && outputFolderName.trim().length > 0

  return (
    <>
      <DialogHeader>
        <DialogTitle>증강 옵션 설정</DialogTitle>
        <DialogDescription>
          현재 프로젝트의 이미지를 백엔드 워커가 증강 처리합니다.
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
            {project?.title ?? "선택된 프로젝트가 없습니다"}
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
            disabled={isStarting}
          />
          <p className="text-xs text-muted-foreground">
            {MIN_WORKER_COUNT}~{MAX_WORKER_COUNT}개 사이에서 선택합니다.
            기본값은 {DEFAULT_WORKER_COUNT}개입니다.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="output-folder-name">
            <FolderOutput className="size-4" aria-hidden="true" />
            출력 폴더 이름
          </Label>
          <Input
            id="output-folder-name"
            value={outputFolderName}
            onChange={(event) => setOutputFolderName(event.target.value)}
            placeholder="예: container-images-augmented"
            disabled={isStarting}
            autoComplete="off"
            required
          />
          <p className="text-xs text-muted-foreground">
            원본 폴더와 같은 위치에 이 이름으로 결과 폴더가 생성됩니다.
            경로가 아닌 폴더명만 입력해 주세요.
          </p>
        </div>

        <Separator />

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border bg-background p-4">
          <Checkbox
            checked={runOcrLabeling}
            onCheckedChange={(checked) => setRunOcrLabeling(checked)}
            aria-label="OCR 수행하여 라벨까지 생성"
            className="mt-0.5"
            disabled={isStarting}
          />
          <span className="grid gap-1">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Tags className="size-4" aria-hidden="true" />
              OCR 수행하여 라벨까지 생성
            </span>
            <span className="text-xs leading-5 text-muted-foreground">
              MVP 단계에서는 옵션만 저장되고 OCR은 아직 실행되지 않습니다.
            </span>
          </span>
        </label>

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
              <p className="font-medium">증강 작업을 시작하지 못했습니다</p>
              <p className="mt-1 text-xs opacity-90">{errorMessage}</p>
            </div>
          </div>
        ) : null}
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isStarting}
        >
          취소
        </Button>
        <Button type="button" onClick={submit} disabled={!canSubmit}>
          {isStarting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              시작 중…
            </>
          ) : (
            "증강 시작"
          )}
        </Button>
      </DialogFooter>
    </>
  )
}

/** Reasonable default for the output folder name based on the source path. */
function defaultOutputFolderName(project: Project | null): string {
  if (!project) return ""
  const base = pathBasename(project.sourceFolderPath)
  return base ? `${base}-augmented` : "augmented"
}
