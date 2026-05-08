import {
  Boxes,
  FolderOpen,
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RotateCw,
  TriangleAlert,
} from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { formatBytes } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Project } from "@/types/project"

/**
 * Lifecycle of the project list fetch (`GET /api/projects`).
 * Drives the empty / loading / error / list rendering in the sidebar body.
 */
export type ProjectListLoadState =
  | "idle"
  | "loading"
  | "loaded"
  | "error"

type ProjectSidebarProps = {
  collapsed: boolean
  projects: Project[]
  loadState: ProjectListLoadState
  selectedProjectId: number | null
  processingProjectId: number | null
  onToggleCollapsed: () => void
  onCreateProject: () => void
  onSelectProject: (projectId: number) => void
  onRetryLoad?: () => void
}

export function ProjectSidebar({
  collapsed,
  projects,
  loadState,
  selectedProjectId,
  processingProjectId,
  onToggleCollapsed,
  onCreateProject,
  onSelectProject,
  onRetryLoad,
}: ProjectSidebarProps) {
  return (
    <aside
      className={cn(
        "flex h-dvh shrink-0 flex-col border-r bg-muted/30 transition-[width] duration-200",
        collapsed ? "w-16" : "w-72",
      )}
      aria-label="프로젝트 사이드바"
    >
      <div className="flex h-14 items-center gap-2 px-3">
        {collapsed ? (
          <SidebarIconButton label="사이드바 펼치기" onClick={onToggleCollapsed}>
            <PanelLeftOpen className="size-4" aria-hidden="true" />
          </SidebarIconButton>
        ) : (
          <>
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background">
              <Boxes className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">Container Aug</p>
              <p className="truncate text-xs text-muted-foreground">
                image augmentation
              </p>
            </div>
            <SidebarIconButton
              label="사이드바 접기"
              onClick={onToggleCollapsed}
            >
              <PanelLeftClose className="size-4" aria-hidden="true" />
            </SidebarIconButton>
          </>
        )}
      </div>

      <div className="px-3 pb-3">
        {collapsed ? (
          <SidebarIconButton
            label="새 프로젝트 생성"
            onClick={onCreateProject}
            className="w-full"
          >
            <Plus className="size-4" aria-hidden="true" />
          </SidebarIconButton>
        ) : (
          <Button
            className="w-full justify-start"
            variant="outline"
            onClick={onCreateProject}
          >
            <Plus className="size-4" aria-hidden="true" />
            새 프로젝트 생성
          </Button>
        )}
      </div>

      <Separator />

      <div className="px-3 py-3">
        {!collapsed && (
          <p className="mb-2 px-2 text-xs font-medium text-muted-foreground">
            프로젝트
          </p>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1 px-3 pb-3">
        <SidebarBody
          collapsed={collapsed}
          projects={projects}
          loadState={loadState}
          selectedProjectId={selectedProjectId}
          processingProjectId={processingProjectId}
          onSelectProject={onSelectProject}
          onRetryLoad={onRetryLoad}
        />
      </ScrollArea>
    </aside>
  )
}

type SidebarBodyProps = {
  collapsed: boolean
  projects: Project[]
  loadState: ProjectListLoadState
  selectedProjectId: number | null
  processingProjectId: number | null
  onSelectProject: (projectId: number) => void
  onRetryLoad?: () => void
}

function SidebarBody({
  collapsed,
  projects,
  loadState,
  selectedProjectId,
  processingProjectId,
  onSelectProject,
  onRetryLoad,
}: SidebarBodyProps) {
  if (loadState === "loading" && projects.length === 0) {
    return collapsed ? (
      <div className="flex justify-center pt-2 text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      </div>
    ) : (
      <div className="flex items-center gap-2 rounded-lg border border-dashed bg-background/60 p-4 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        프로젝트 목록 불러오는 중…
      </div>
    )
  }

  if (loadState === "error") {
    if (collapsed) {
      return (
        <SidebarIconButton
          label="프로젝트 목록 다시 불러오기"
          onClick={onRetryLoad ?? (() => {})}
        >
          <TriangleAlert
            className="size-4 text-amber-600"
            aria-hidden="true"
          />
        </SidebarIconButton>
      )
    }

    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
        <p className="flex items-center gap-2 text-sm font-medium">
          <TriangleAlert className="size-4" aria-hidden="true" />
          목록을 불러오지 못했습니다
        </p>
        <p className="mt-1 text-xs leading-5 opacity-90">
          백엔드 응답에 문제가 있습니다.
        </p>
        {onRetryLoad ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3 w-full"
            onClick={onRetryLoad}
          >
            <RotateCw className="size-4" aria-hidden="true" />
            다시 시도
          </Button>
        ) : null}
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed bg-background/60 text-muted-foreground",
          collapsed ? "p-2" : "p-4",
        )}
      >
        {collapsed ? (
          <FolderOpen className="mx-auto size-4" aria-hidden="true" />
        ) : (
          <>
            <FolderOpen className="mb-3 size-5" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">
              아직 프로젝트가 없습니다
            </p>
            <p className="mt-1 text-xs leading-5">
              새 프로젝트를 생성하면 이곳에 목록이 표시됩니다.
            </p>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="grid gap-1">
      {projects.map((project) => {
        const selected = project.id === selectedProjectId
        const processing = project.id === processingProjectId

        if (collapsed) {
          return (
            <SidebarIconButton
              key={project.id}
              label={
                processing ? `${project.title} 증강 적용 중` : project.title
              }
              onClick={() => onSelectProject(project.id)}
              className={cn(
                "w-full",
                selected && "bg-accent text-accent-foreground",
              )}
            >
              {processing ? (
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <span className="text-xs font-semibold">
                  {project.title.slice(0, 1)}
                </span>
              )}
            </SidebarIconButton>
          )
        }

        return (
          <button
            key={project.id}
            type="button"
            className={cn(
              "flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50",
              selected && "bg-accent text-accent-foreground",
            )}
            aria-current={selected ? "page" : undefined}
            onClick={() => onSelectProject(project.id)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium">{project.title}</span>
              {processing && (
                <>
                  <LoaderCircle
                    className="size-3.5 shrink-0 animate-spin text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="sr-only">증강 적용 중</span>
                </>
              )}
            </span>
            <span className="mt-1 truncate text-xs text-muted-foreground">
              {project.fileCount.toLocaleString("ko-KR")}개 ·{" "}
              {formatBytes(project.totalSizeBytes)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function SidebarIconButton({
  label,
  className,
  children,
  onClick,
}: {
  label: string
  className?: string
  children: ReactNode
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={label}
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={className}
            onClick={onClick}
          >
            {children}
          </Button>
        }
      />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}
