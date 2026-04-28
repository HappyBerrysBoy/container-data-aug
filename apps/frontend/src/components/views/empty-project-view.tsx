import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"

type EmptyProjectViewProps = {
  onCreateProject: () => void
}

export function EmptyProjectView({ onCreateProject }: EmptyProjectViewProps) {
  return (
    <section className="flex min-h-full items-center justify-center px-6">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <div className="mb-6 flex size-12 items-center justify-center rounded-xl border bg-background text-muted-foreground">
          <Plus className="size-5" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          프로젝트가 없습니다
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          이미지 폴더를 선택해 새 증강 프로젝트를 시작하세요.
        </p>
        <Button className="mt-7" onClick={onCreateProject}>
          <Plus className="size-4" aria-hidden="true" />
          새 프로젝트 생성하기
        </Button>
      </div>
    </section>
  )
}
