"use client"

import { Trash2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { AugmentationOptionsDialog } from "@/components/augmentation-options-dialog"
import { ConnectionBanner } from "@/components/connection-banner"
import {
  ProjectSidebar,
  type ProjectListLoadState,
} from "@/components/project-sidebar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AugmentationProgressView } from "@/components/views/augmentation-progress-view"
import { AugmentationResultView } from "@/components/views/augmentation-result-view"
import { CreateProjectView } from "@/components/views/create-project-view"
import { EmptyProjectView } from "@/components/views/empty-project-view"
import { ProjectDetailView } from "@/components/views/project-detail-view"
import {
  ApiError,
  augmentationTasks as tasksApi,
  health,
  projects as projectsApi,
} from "@/lib/api"
import type {
  AugmentationResult,
  AugmentationTask,
  AugmentationTaskCreateRequest,
  Project,
  ProjectDetail,
} from "@/types/project"

type ViewMode = "empty" | "create" | "detail" | "augmenting" | "result"

/** Backend reachability — drives the top-of-main connection banner. */
type ConnectionState = "checking" | "connected" | "error"

/** How often `GET /api/augmentation-tasks/{id}` is polled while RUNNING. */
const POLL_INTERVAL_MS = 1000
const DEFAULT_TARGET_SPEC = "ISO 6346"

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>("empty")

  // Project list — sourced from `GET /api/projects`.
  const [projects, setProjects] = useState<Project[]>([])
  const [projectListLoadState, setProjectListLoadState] =
    useState<ProjectListLoadState>("loading")

  // Backend handshake state.
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("checking")
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
    null,
  )

  // Project detail (task [4]). Stale data is kept visible while a refetch
  // is in flight to avoid flashing skeletons during view-mode transitions.
  const [selectedProjectDetail, setSelectedProjectDetail] =
    useState<ProjectDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)

  // Create flow state (task [3]).
  const [sourceFolderPath, setSourceFolderPath] = useState("")
  const [projectName, setProjectName] = useState("")
  const [projectDescription, setProjectDescription] = useState("")
  const [targetSpec, setTargetSpec] = useState(DEFAULT_TARGET_SPEC)
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Delete flow state (task [4]).
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Rescan flow state (task [9]).
  const [isRescanning, setIsRescanning] = useState(false)
  const [rescanError, setRescanError] = useState<string | null>(null)

  // Augmentation flow state (task [5]).
  const [optionsDialogOpen, setOptionsDialogOpen] = useState(false)
  const [isStartingAugmentation, setIsStartingAugmentation] = useState(false)
  const [augmentationStartError, setAugmentationStartError] = useState<
    string | null
  >(null)
  // `activeTaskId` drives the polling effect — set it to start polling,
  // null to stop. The latest snapshot lives in `activeTask`.
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null)
  const [activeTask, setActiveTask] = useState<AugmentationTask | null>(null)
  const [augmentationResult, setAugmentationResult] =
    useState<AugmentationResult | null>(null)
  const [isStoppingAugmentation, setIsStoppingAugmentation] = useState(false)
  const [augmentationActionError, setAugmentationActionError] = useState<
    string | null
  >(null)

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  )

  // Mirror `selectedProjectId` in a ref so the polling closure (which is
  // captured once per `activeTaskId` change) can read the *current* value
  // without restarting the interval whenever the user navigates around.
  const selectedProjectIdRef = useRef(selectedProjectId)
  useEffect(() => {
    selectedProjectIdRef.current = selectedProjectId
  }, [selectedProjectId])

  // Detail view fallback uses the cached list project when the API fetch
  // hasn't returned yet, so the view always has *something* to show.
  const detailForView: ProjectDetail | null = selectedProjectDetail
    ? selectedProjectDetail
    : selectedProject
      ? { ...selectedProject, latestTask: null }
      : null

  // True when the cached detail does not match the currently selected id.
  // Drives the "Refreshing…" indicator in the detail view.
  const isLoadingDetail =
    viewMode === "detail" &&
    selectedProjectId !== null &&
    (selectedProjectDetail === null ||
      selectedProjectDetail.id !== selectedProjectId)

  /**
   * Backend handshake. Runs on mount and re-runs whenever `retryToken`
   * changes (bumped by retryConnection()).
   *
   *   GET /api/health
   *     → GET /api/projects                    (populate sidebar)
   *     → GET /api/augmentation-tasks/active   (resume in-flight task)
   *
   * If a task is already running on the backend (e.g. user refreshed mid-run
   * or another tab started one), we hydrate `activeTaskId` and switch to the
   * augmenting view so the polling effect can pick up where things left off.
   */
  const [retryToken, setRetryToken] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller

    void (async () => {
      try {
        await health.check(signal)
      } catch (error) {
        if (signal.aborted) return
        setConnectionState("error")
        setProjectListLoadState("idle")
        setConnectionError(describeConnectionError(error))
        setRetrying(false)
        return
      }

      setConnectionState("connected")

      try {
        const data = await projectsApi.list(signal)
        if (signal.aborted) return
        setProjects(data)
        setProjectListLoadState("loaded")
        setConnectionError(null)
      } catch (error) {
        if (signal.aborted) return
        setProjectListLoadState("error")
        setConnectionError(describeProjectsError(error))
        setRetrying(false)
        return
      }

      // Active task recovery (task [6]). Failures here are non-fatal — the
      // app simply behaves as if no task is running.
      try {
        const { task } = await tasksApi.getActive(signal)
        if (signal.aborted) return
        if (task) {
          setActiveTask(task)
          setActiveTaskId(task.id)
          setSelectedProjectId(task.projectId)
          setSelectedProjectDetail(null)
          setDetailError(null)
          setAugmentationResult(null)
          setViewMode("augmenting")
        }
      } catch {
        // Silent — getActive() failure should not block the app.
      } finally {
        if (!signal.aborted) {
          setRetrying(false)
        }
      }
    })()

    return () => controller.abort()
  }, [retryToken])

  function retryConnection() {
    setRetrying(true)
    setConnectionState("checking")
    setConnectionError(null)
    setProjectListLoadState("loading")
    setRetryToken((token) => token + 1)
  }

  // Collapse sidebar on small viewports.
  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 640px)")
    const syncSidebarToViewport = () => setCollapsed(mediaQuery.matches)

    syncSidebarToViewport()
    mediaQuery.addEventListener("change", syncSidebarToViewport)

    return () => {
      mediaQuery.removeEventListener("change", syncSidebarToViewport)
    }
  }, [])

  /**
   * Fetch the selected project's detail (with `latestTask`) whenever the
   * user enters or returns to the detail view.
   */
  useEffect(() => {
    if (viewMode !== "detail" || selectedProjectId === null) {
      return
    }

    const projectId = selectedProjectId
    const controller = new AbortController()
    const { signal } = controller

    void (async () => {
      try {
        const detail = await projectsApi.get(projectId, signal)
        if (signal.aborted) return
        setSelectedProjectDetail(detail)
        setDetailError(null)
      } catch (error) {
        if (signal.aborted) return
        if (error instanceof ApiError && error.code === "PROJECT_NOT_FOUND") {
          setProjects((current) => current.filter((p) => p.id !== projectId))
          setSelectedProjectId(null)
          setSelectedProjectDetail(null)
          setViewMode("empty")
          return
        }
        setDetailError(describeDetailError(error))
      }
    })()

    return () => controller.abort()
  }, [selectedProjectId, viewMode])

  /**
   * Augmentation polling (task [5]).
   *
   * While `activeTaskId` is set, polls `GET /api/augmentation-tasks/{id}`
   * once per second. Transitions:
   *   - DONE → fetch /result, switch to "result" view, stop polling
   *   - STOPPED / FAILED → switch to "detail" view, stop polling
   *   - RUNNING / PENDING → keep polling
   *
   * Network errors during polling are swallowed so a transient blip doesn't
   * tear down the running task UI; the next tick will retry.
   */
  useEffect(() => {
    if (activeTaskId === null) return

    const taskId = activeTaskId
    let cancelled = false

    const poll = async () => {
      try {
        const task = await tasksApi.get(taskId)
        if (cancelled) return
        setActiveTask(task)

        // Only auto-switch the view when the user is actually focused on
        // the project that just finished. If they're browsing another
        // project we silently clear the active state — they can revisit
        // the result via selectProject() (which routes through the cached
        // `augmentationResult`) or via the latestTask badge in detail.
        const userIsWatching =
          selectedProjectIdRef.current === task.projectId

        if (task.status === "DONE") {
          try {
            const result = await tasksApi.result(taskId)
            if (cancelled) return
            setAugmentationResult(result)
            setActiveTask(null)
            setActiveTaskId(null)
            if (userIsWatching) {
              setViewMode("result")
            }
          } catch (error) {
            if (cancelled) return
            setAugmentationActionError(describeResultError(error))
            setActiveTask(null)
            setActiveTaskId(null)
            if (userIsWatching) {
              setViewMode("detail")
            }
          }
        } else if (task.status === "STOPPED" || task.status === "FAILED") {
          setActiveTask(null)
          setActiveTaskId(null)
          if (userIsWatching) {
            setViewMode("detail")
          }
        }
      } catch {
        // Transient failure — try again on the next interval tick.
      }
    }

    void poll()
    const intervalId = window.setInterval(() => {
      void poll()
    }, POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [activeTaskId])

  function openCreateProject() {
    setSourceFolderPath("")
    setProjectName("")
    setProjectDescription("")
    setTargetSpec(DEFAULT_TARGET_SPEC)
    setCreateError(null)
    setViewMode("create")
  }

  function selectProject(projectId: number) {
    // If this project is the one currently being augmented, jump straight
    // back to the live progress view instead of the static detail view.
    // Lets users tab away to peek at other projects without losing their
    // place in the running task. Also covers the [6] recovery flow when a
    // user clicks the spinning sidebar item after a refresh.
    if (activeTaskId !== null && activeTask?.projectId === projectId) {
      setSelectedProjectId(projectId)
      setViewMode("augmenting")
      return
    }

    // If we have a cached result for this project (because the user was
    // looking elsewhere when the task finished), show that instead of the
    // plain detail. The user can dismiss it via "프로젝트 상세로 돌아가기".
    if (augmentationResult && augmentationResult.projectId === projectId) {
      setSelectedProjectId(projectId)
      setViewMode("result")
      return
    }

    if (projectId !== selectedProjectId) {
      setSelectedProjectDetail(null)
      setDetailError(null)
    }
    setSelectedProjectId(projectId)
    setViewMode("detail")
  }

  /**
   * Submit the create form. Calls `POST /api/projects` and lets the backend
   * scan the folder. On success, prepends the new project to the sidebar
   * list and switches to the detail view.
   */
  async function createProject() {
    if (
      !sourceFolderPath.trim() ||
      !projectName.trim() ||
      isCreating
    ) {
      return
    }

    setIsCreating(true)
    setCreateError(null)

    try {
      const created = await projectsApi.create({
        title: projectName.trim(),
        description: projectDescription.trim() || undefined,
        sourceFolderPath: sourceFolderPath.trim(),
        targetSpec: targetSpec.trim() || DEFAULT_TARGET_SPEC,
      })
      setProjects((current) => [created, ...current])
      setSelectedProjectDetail(null)
      setDetailError(null)
      setSelectedProjectId(created.id)
      setViewMode("detail")
    } catch (error) {
      setCreateError(describeCreateError(error))
    } finally {
      setIsCreating(false)
    }
  }

  /**
   * Re-scan the source folder of the currently selected project. Updates
   * `fileCount` / `totalSizeBytes` / `hasLabels` in both the sidebar list
   * and the detail view without changing other metadata.
   *
   * Backend: `POST /api/projects/{id}/rescan`.
   */
  async function rescanProject() {
    if (selectedProjectId === null || isRescanning) return

    const projectId = selectedProjectId
    setIsRescanning(true)
    setRescanError(null)

    try {
      const updated = await projectsApi.rescan(projectId)
      // Replace the project in the sidebar list.
      setProjects((current) =>
        current.map((p) => (p.id === projectId ? updated : p)),
      )
      // Merge the new scan numbers into the cached detail (preserve latestTask).
      setSelectedProjectDetail((current) =>
        current && current.id === projectId
          ? {
              ...current,
              fileCount: updated.fileCount,
              totalSizeBytes: updated.totalSizeBytes,
              hasLabels: updated.hasLabels,
            }
          : current,
      )
    } catch (error) {
      if (error instanceof ApiError && error.code === "PROJECT_NOT_FOUND") {
        // Project was deleted in the meantime — treat like the detail effect.
        setProjects((current) => current.filter((p) => p.id !== projectId))
        setSelectedProjectId(null)
        setSelectedProjectDetail(null)
        setViewMode("empty")
        return
      }
      setRescanError(describeRescanError(error))
    } finally {
      setIsRescanning(false)
    }
  }

  function requestDeleteProject() {
    setDeleteError(null)
    setDeleteConfirmOpen(true)
  }

  function cancelDeleteProject() {
    if (isDeleting) return
    setDeleteConfirmOpen(false)
    setDeleteError(null)
  }

  /**
   * Confirm deletion. Calls `DELETE /api/projects/{id}`. PROJECT_NOT_FOUND
   * is treated as success (idempotent removal).
   */
  async function confirmDeleteProject() {
    if (selectedProjectId === null || isDeleting) return

    const projectId = selectedProjectId
    setIsDeleting(true)
    setDeleteError(null)

    try {
      await projectsApi.remove(projectId)
    } catch (error) {
      if (
        !(error instanceof ApiError && error.code === "PROJECT_NOT_FOUND")
      ) {
        setDeleteError(describeDeleteError(error))
        setIsDeleting(false)
        return
      }
    }

    setProjects((current) => current.filter((p) => p.id !== projectId))
    setSelectedProjectId(null)
    setSelectedProjectDetail(null)
    setDeleteConfirmOpen(false)
    setIsDeleting(false)
    setViewMode("empty")
  }

  function openAugmentationOptions() {
    setAugmentationStartError(null)
    setOptionsDialogOpen(true)
  }

  /**
   * Start augmentation. POSTs the options to the backend, saves the
   * returned task id, and lets the polling effect pick it up.
   *
   * Common error case: 409 TASK_ALREADY_RUNNING when the global single-task
   * lock is held by some other project's task.
   */
  async function startAugmentation(config: AugmentationTaskCreateRequest) {
    if (selectedProjectId === null || isStartingAugmentation) return

    setIsStartingAugmentation(true)
    setAugmentationStartError(null)
    setAugmentationActionError(null)

    try {
      const task = await tasksApi.start(selectedProjectId, config)
      setActiveTask(task)
      setAugmentationResult(null)
      setOptionsDialogOpen(false)
      setActiveTaskId(task.id)
      setViewMode("augmenting")
    } catch (error) {
      setAugmentationStartError(describeStartError(error))
    } finally {
      setIsStartingAugmentation(false)
    }
  }

  /**
   * Request the backend to stop the running task. The polling loop will
   * see the resulting STOPPED status and transition to the detail view.
   */
  async function stopAugmentation() {
    if (activeTaskId === null || isStoppingAugmentation) return

    setIsStoppingAugmentation(true)
    setAugmentationActionError(null)

    try {
      const task = await tasksApi.stop(activeTaskId)
      setActiveTask(task)
    } catch (error) {
      // TASK_NOT_RUNNING means the task already finished — let the next
      // poll tick observe the terminal status and transition normally.
      if (
        !(error instanceof ApiError && error.code === "TASK_NOT_RUNNING")
      ) {
        setAugmentationActionError(describeStopError(error))
      }
    } finally {
      setIsStoppingAugmentation(false)
    }
  }

  function backToProjectDetail() {
    setActiveTask(null)
    setActiveTaskId(null)
    setAugmentationResult(null)
    setAugmentationActionError(null)
    setViewMode("detail")
  }

  const showConnectionBanner =
    connectionState === "error" || projectListLoadState === "error"

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <ProjectSidebar
        collapsed={collapsed}
        projects={projects}
        loadState={projectListLoadState}
        selectedProjectId={selectedProjectId}
        // The spinner reflects which project is currently being augmented,
        // independent of which view the user happens to be looking at.
        // While `activeTaskId` is set, the polling loop is alive — keep
        // the spinner on so users see it while browsing other projects.
        processingProjectId={activeTask?.projectId ?? null}
        onToggleCollapsed={() => setCollapsed((current) => !current)}
        onCreateProject={openCreateProject}
        onSelectProject={selectProject}
        onRetryLoad={retryConnection}
      />

      <main className="min-w-0 flex-1 overflow-y-auto bg-zinc-50/70">
        {showConnectionBanner && connectionError ? (
          <ConnectionBanner
            variant={connectionState === "error" ? "error" : "warning"}
            title={
              connectionState === "error"
                ? "백엔드에 연결할 수 없습니다"
                : "프로젝트 목록을 불러오지 못했습니다"
            }
            description={connectionError}
            onRetry={retryConnection}
            retrying={retrying}
          />
        ) : null}

        {viewMode === "empty" && (
          <EmptyProjectView onCreateProject={openCreateProject} />
        )}

        {viewMode === "create" && (
          <CreateProjectView
            sourceFolderPath={sourceFolderPath}
            projectName={projectName}
            projectDescription={projectDescription}
            targetSpec={targetSpec}
            isCreating={isCreating}
            errorMessage={createError}
            onSourceFolderPathChange={setSourceFolderPath}
            onProjectNameChange={setProjectName}
            onProjectDescriptionChange={setProjectDescription}
            onTargetSpecChange={setTargetSpec}
            onCreateProject={createProject}
          />
        )}

        {viewMode === "detail" && detailForView && (
          <ProjectDetailView
            project={detailForView}
            isStale={isLoadingDetail}
            errorMessage={detailError}
            isDeleting={isDeleting}
            isRescanning={isRescanning}
            rescanError={rescanError}
            onStartAugmentation={openAugmentationOptions}
            onRequestDelete={requestDeleteProject}
            onRescan={rescanProject}
          />
        )}

        {viewMode === "augmenting" && selectedProject && activeTask && (
          <AugmentationProgressView
            project={selectedProject}
            task={activeTask}
            isStopping={isStoppingAugmentation}
            errorMessage={augmentationActionError}
            onStop={stopAugmentation}
          />
        )}

        {viewMode === "result" &&
          selectedProject &&
          augmentationResult && (
            <AugmentationResultView
              project={selectedProject}
              result={augmentationResult}
              onBackToDetail={backToProjectDetail}
            />
          )}
      </main>

      <AugmentationOptionsDialog
        open={optionsDialogOpen}
        project={selectedProject}
        isStarting={isStartingAugmentation}
        errorMessage={augmentationStartError}
        onOpenChange={(open) => {
          if (!open && isStartingAugmentation) return
          setOptionsDialogOpen(open)
          if (!open) setAugmentationStartError(null)
        }}
        onStart={startAugmentation}
      />

      <Dialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          if (!open) cancelDeleteProject()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>프로젝트 삭제</DialogTitle>
            <DialogDescription>
              {selectedProjectDetail?.title ?? selectedProject?.title ?? "이 프로젝트"}
              를 삭제합니다. 원본 이미지 파일과 증강 결과 폴더는 삭제되지
              않으며, 백엔드의 프로젝트 메타데이터만 제거됩니다.
            </DialogDescription>
          </DialogHeader>

          {deleteError ? (
            <div
              role="alert"
              className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900"
            >
              {deleteError}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={cancelDeleteProject}
              disabled={isDeleting}
            >
              취소
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDeleteProject}
              disabled={isDeleting}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              {isDeleting ? "삭제 중…" : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// =============================================================================
// Error message helpers
// =============================================================================

/** Build a user-facing message for a failed `GET /api/health` call. */
function describeConnectionError(error: unknown): string {
  if (error instanceof ApiError) {
    return `백엔드 응답: ${error.status} ${error.message}`
  }
  return "localhost:8000에서 백엔드가 실행 중인지 확인해 주세요."
}

/** Build a user-facing message for a failed `GET /api/projects` call. */
function describeProjectsError(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.code}: ${error.message}`
  }
  return "프로젝트 목록을 가져오는 중 알 수 없는 오류가 발생했습니다."
}

/** Build a user-facing message for a failed `POST /api/projects` call. */
function describeCreateError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "PATH_NOT_FOUND":
        return "지정한 경로의 폴더가 존재하지 않습니다. 경로를 확인해 주세요."
      case "PATH_NOT_READABLE":
        return "폴더는 존재하지만 백엔드가 읽을 수 없습니다. 권한을 확인해 주세요."
      case "VALIDATION_ERROR":
        return error.message || "입력값이 올바르지 않습니다."
      default:
        return `${error.code}: ${error.message}`
    }
  }
  return "알 수 없는 오류로 프로젝트를 생성하지 못했습니다."
}

/** Build a user-facing message for a failed `GET /api/projects/{id}` call. */
function describeDetailError(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.code}: ${error.message}`
  }
  return "프로젝트 상세 정보를 불러오는 중 오류가 발생했습니다."
}

/** Build a user-facing message for a failed `DELETE /api/projects/{id}` call. */
function describeDeleteError(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.code}: ${error.message}`
  }
  return "프로젝트를 삭제하는 중 오류가 발생했습니다."
}

/** Build a user-facing message for a failed `POST .../rescan` call. */
function describeRescanError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "PATH_NOT_FOUND":
        return "원본 폴더가 더 이상 존재하지 않습니다. 경로를 확인해 주세요."
      case "PATH_NOT_READABLE":
        return "원본 폴더를 읽을 수 없습니다. 권한을 확인해 주세요."
      default:
        return `${error.code}: ${error.message}`
    }
  }
  return "폴더 재스캔 중 알 수 없는 오류가 발생했습니다."
}

/** Build a user-facing message for a failed task-start call. */
function describeStartError(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "TASK_ALREADY_RUNNING":
        return "이미 실행 중인 증강 작업이 있습니다. 끝난 뒤 다시 시도해 주세요."
      case "PATH_NOT_WRITABLE":
        return "출력 폴더를 만들거나 쓸 수 없습니다. 권한을 확인해 주세요."
      case "VALIDATION_ERROR":
        return error.message || "입력값이 올바르지 않습니다."
      default:
        return `${error.code}: ${error.message}`
    }
  }
  return "알 수 없는 오류로 증강 작업을 시작하지 못했습니다."
}

/** Build a user-facing message for a failed task-stop call. */
function describeStopError(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.code}: ${error.message}`
  }
  return "증강 작업 중단 요청이 실패했습니다."
}

/** Build a user-facing message for a failed task-result call. */
function describeResultError(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.code}: ${error.message}`
  }
  return "증강 결과를 가져오는 중 오류가 발생했습니다."
}
