"use client"

import {
  AlertCircle,
  Cpu,
  FolderOutput,
  ImageIcon,
  Layers,
  Loader2,
} from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
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
import { pathBasename } from "@/lib/format"
import type {
  AugmentationTaskCreateRequest,
  Project,
} from "@/types/project"

const DEFAULT_WORKER_COUNT = 4
const MIN_WORKER_COUNT = 1
const MAX_WORKER_COUNT = 8

const DEFAULT_VARIANTS_PER_IMAGE = 10
const MIN_VARIANTS_PER_IMAGE = 1
const MAX_VARIANTS_PER_IMAGE = 90

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
 * (workerCount, variantsPerImage, outputFolderName) before AppShell submits
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
  const [outputFolderName, setOutputFolderName] = useState(() =>
    defaultOutputFolderName(project),
  )
  const [variantsPerImage, setVariantsPerImage] = useState(
    DEFAULT_VARIANTS_PER_IMAGE,
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

  function updateVariantsPerImage(value: string) {
    // Empty input → keep showing the default rather than NaN.
    if (value.trim() === "") {
      setVariantsPerImage(DEFAULT_VARIANTS_PER_IMAGE)
      return
    }
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) {
      setVariantsPerImage(DEFAULT_VARIANTS_PER_IMAGE)
      return
    }
    // Clamp into the [MIN, MAX] range — anything above 90 snaps to 90,
    // anything below 1 (including 0 and negatives) snaps to 1.
    const clamped = Math.min(
      MAX_VARIANTS_PER_IMAGE,
      Math.max(MIN_VARIANTS_PER_IMAGE, Math.floor(parsed)),
    )
    setVariantsPerImage(clamped)
  }

  function submit() {
    if (!project || isStarting) return
    const trimmed = outputFolderName.trim()
    if (!trimmed) return
    onStart({
      workerCount,
      runOcrLabeling: true,
      outputFolderName: trimmed,
      variantsPerImage,
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
          <Label htmlFor="variants-per-image">
            <Layers className="size-4" aria-hidden="true" />
            이미지 1개당 증강 개수
          </Label>
          <Input
            id="variants-per-image"
            type="number"
            min={MIN_VARIANTS_PER_IMAGE}
            max={MAX_VARIANTS_PER_IMAGE}
            value={variantsPerImage}
            onChange={(event) => updateVariantsPerImage(event.target.value)}
            disabled={isStarting}
          />
          <p className="text-xs text-muted-foreground">
            원본 이미지 한 장당 생성할 증강본 개수입니다.{" "}
            {MIN_VARIANTS_PER_IMAGE}~{MAX_VARIANTS_PER_IMAGE} 범위 안에서
            입력하면 그대로, 벗어나면 자동으로 보정됩니다. 기본값은{" "}
            {DEFAULT_VARIANTS_PER_IMAGE}개입니다.
          </p>
          {project ? (
            <p className="text-xs text-muted-foreground">
              예상 결과 이미지 수: 약{" "}
              <span className="font-medium text-foreground">
                {(project.fileCount * variantsPerImage).toLocaleString(
                  "ko-KR",
                )}
                개
              </span>{" "}
              ({project.fileCount.toLocaleString("ko-KR")}장 ×{" "}
              {variantsPerImage}개)
            </p>
          ) : null}
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
