"use client"

import {
  CheckCircle2,
  CircleDashed,
  Cpu,
  Download,
  Loader2,
} from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export type ModelPreparationStatus = "waiting" | "running" | "done"

export type ModelPreparationState = {
  craft: ModelPreparationStatus
  glm: ModelPreparationStatus
}

type ModelPreparationDialogProps = {
  open: boolean
  state: ModelPreparationState
}

const MODEL_ROWS = [
  {
    id: "craft",
    name: "CRAFT",
    description: "문자 영역 감지 모델",
  },
  {
    id: "glm",
    name: "GLM-OCR",
    description: "문자 인식 모델",
  },
] as const

export function ModelPreparationDialog({
  open,
  state,
}: ModelPreparationDialogProps) {
  const allDone = state.craft === "done" && state.glm === "done"

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        className="max-w-md gap-5 p-0"
      >
        <div className="border-b px-6 py-5">
          <DialogHeader className="pr-0">
            <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-zinc-900 text-white">
              {allDone ? (
                <CheckCircle2 className="size-5" aria-hidden="true" />
              ) : (
                <Download className="size-5" aria-hidden="true" />
              )}
            </div>
            <DialogTitle>
              {allDone ? "모델 준비 완료" : "모델 준비 중"}
            </DialogTitle>
            <DialogDescription>
              첫 실행에는 모델 다운로드로 시간이 걸릴 수 있습니다.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="grid gap-3 px-6">
          {MODEL_ROWS.map((model) => (
            <ModelRow
              key={model.id}
              name={model.name}
              description={model.description}
              status={state[model.id]}
            />
          ))}
        </div>

        <div className="border-t bg-muted/30 px-6 py-4 text-sm text-muted-foreground">
          {allDone
            ? "잠시 후 증강 작업을 시작합니다."
            : "창을 닫지 말고 모델 준비가 끝날 때까지 기다려주세요."}
        </div>
      </DialogContent>
    </Dialog>
  )
}

type ModelRowProps = {
  name: string
  description: string
  status: ModelPreparationStatus
}

function ModelRow({ name, description, status }: ModelRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3 transition-colors",
        status === "running" && "border-zinc-900 bg-zinc-50",
        status === "done" && "border-emerald-200 bg-emerald-50",
      )}
    >
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background",
          status === "done" && "border-emerald-200 text-emerald-700",
          status === "running" && "border-zinc-300 text-zinc-900",
        )}
      >
        {status === "done" ? (
          <CheckCircle2 className="size-4" aria-hidden="true" />
        ) : status === "running" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <CircleDashed className="size-4" aria-hidden="true" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Cpu className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <p className="truncate text-sm font-medium">{name}</p>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>

      <p
        className={cn(
          "shrink-0 text-xs font-medium",
          status === "done" && "text-emerald-700",
          status === "running" && "text-zinc-900",
          status === "waiting" && "text-muted-foreground",
        )}
      >
        {status === "done"
          ? "완료"
          : status === "running"
            ? "fetching"
            : "대기"}
      </p>
    </div>
  )
}
