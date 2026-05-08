"use client"

import { useEffect, useMemo, useState } from "react"

import { AugmentationOptionsDialog } from "@/components/augmentation-options-dialog"
import { ConnectionBanner } from "@/components/connection-banner"
import {
  ProjectSidebar,
  type ProjectListLoadState,
} from "@/components/project-sidebar"
import { AugmentationProgressView } from "@/components/views/augmentation-progress-view"
import { AugmentationResultView } from "@/components/views/augmentation-result-view"
import { CreateProjectView } from "@/components/views/create-project-view"
import { EmptyProjectView } from "@/components/views/empty-project-view"
import { ProjectDetailView } from "@/components/views/project-detail-view"
import { ApiError, health, projects as projectsApi } from "@/lib/api"
import { formatBytes, formatDateShort, pathBasename } from "@/lib/format"
import type {
  AugmentationConfig,
  MockAugmentationResult,
  Project,
  ProjectSummary,
} from "@/types/project"

type ViewMode = "empty" | "create" | "detail" | "augmenting" | "result"

/** Backend reachability — drives the top-of-main connection banner. */
type ConnectionState = "checking" | "connected" | "error"

/**
 * Mock folder used by the legacy create flow until task [3] swaps in real
 * `POST /api/projects` calls. Shaped like the backend folder scan response
 * so the rest of the app speaks one type (`Project`).
 */
const MOCK_FOLDER = {
  sourceFolderPath: "C:\\mock\\container-images-2026",
  fileCount: 148,
  totalSizeBytes: 642_147_123,
  hasLabels: true,
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>("empty")

  // Project list — sourced from `GET /api/projects`. Mock-created projects
  // (until task [3]) are inserted with negative ids to avoid colliding with
  // backend-assigned positive ids.
  const [projects, setProjects] = useState<Project[]>([])
  // Initial value is "loading" so the first effect run does not need to
  // synchronously reset it — see retryConnection() for the retry path.
  const [projectListLoadState, setProjectListLoadState] =
    useState<ProjectListLoadState>("loading")

  // Backend handshake state.
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("checking")
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  // Selected project id (backend ids are numbers; mock ids are negative).
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
    null,
  )

  // Mockup create-project state — lives until task [3].
  const [selectedFolder, setSelectedFolder] =
    useState<typeof MOCK_FOLDER | null>(null)
  const [projectName, setProjectName] = useState("")
  const [projectDescription, setProjectDescription] = useState("")

  // Mockup augmentation flow state — lives until task [5].
  const [optionsDialogOpen, setOptionsDialogOpen] = useState(false)
  const [augmentationConfig, setAugmentationConfig] =
    useState<AugmentationConfig | null>(null)
  const [augmentationProgress, setAugmentationProgress] = useState(0)
  const [augmentationResult, setAugmentationResult] =
    useState<MockAugmentationResult | null>(null)

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  )

  const selectedProjectSummary = useMemo(
    () => (selectedProject ? toProjectSummary(selectedProject) : null),
    [selectedProject],
  )

  /**
   * Backend handshake. Runs on mount and re-runs whenever `retryToken`
   * changes (bumped by retryConnection()).
   *
   *   GET /api/health  →  GET /api/projects  →  populate sidebar
   *
   * The async work is defined inline as an IIFE so the lint rule
   * react-hooks/set-state-in-effect can see that every setState call lives
   * behind an `await` (which moves them out of the synchronous effect body).
   * AbortSignal handles React Strict Mode's double-mount cleanup in dev.
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
      } finally {
        if (!signal.aborted) {
          setRetrying(false)
        }
      }
    })()

    return () => controller.abort()
  }, [retryToken])

  function retryConnection() {
    // Reset the handshake state from the event handler so the effect itself
    // does not need to call setState synchronously (React 19 lint rule).
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

  // Mock augmentation progress — to be replaced by 1s polling in task [5].
  useEffect(() => {
    if (viewMode !== "augmenting" || !augmentationConfig) {
      return
    }

    if (augmentationProgress >= 100) {
      const completionTimer = window.setTimeout(() => {
        setAugmentationResult(
          createMockAugmentationResult(
            augmentationConfig,
            selectedProject
              ? pathBasename(selectedProject.sourceFolderPath)
              : "project",
          ),
        )
        setViewMode("result")
      }, 300)

      return () => {
        window.clearTimeout(completionTimer)
      }
    }

    const progressTimer = window.setTimeout(() => {
      setAugmentationProgress((currentProgress) =>
        Math.min(100, currentProgress + 5),
      )
    }, 300)

    return () => {
      window.clearTimeout(progressTimer)
    }
  }, [
    augmentationConfig,
    augmentationProgress,
    selectedProject,
    viewMode,
  ])

  function openCreateProject() {
    setSelectedFolder(null)
    setProjectName("")
    setProjectDescription("")
    setViewMode("create")
  }

  function selectProject(projectId: number) {
    setSelectedProjectId(projectId)
    setViewMode("detail")
  }

  function createProject() {
    if (!selectedFolder || !projectName.trim()) {
      return
    }

    // Mock-only project. Backend integration arrives in task [3].
    const createdProject: Project = {
      id: -Date.now(),
      title: projectName.trim(),
      description: projectDescription.trim() || null,
      sourceFolderPath: selectedFolder.sourceFolderPath,
      targetSpec: null,
      fileCount: selectedFolder.fileCount,
      totalSizeBytes: selectedFolder.totalSizeBytes,
      hasLabels: selectedFolder.hasLabels,
      createdAt: new Date().toISOString(),
    }

    setProjects((current) => [createdProject, ...current])
    setSelectedProjectId(createdProject.id)
    setViewMode("detail")
  }

  function startAugmentation(config: AugmentationConfig) {
    setOptionsDialogOpen(false)
    setAugmentationConfig(config)
    setAugmentationResult(null)
    setAugmentationProgress(0)
    setViewMode("augmenting")
  }

  function cancelAugmentation() {
    setAugmentationConfig(null)
    setAugmentationProgress(0)
    setViewMode("detail")
  }

  function backToProjectDetail() {
    setAugmentationConfig(null)
    setAugmentationProgress(0)
    setViewMode("detail")
  }

  const expectedFailedCount = augmentationConfig
    ? calculateFailedCount(augmentationConfig.totalImageCount)
    : 0
  const processedCount = augmentationConfig
    ? Math.min(
        augmentationConfig.totalImageCount,
        Math.round(
          (augmentationConfig.totalImageCount * augmentationProgress) / 100,
        ),
      )
    : 0
  const failedCount = augmentationConfig
    ? Math.min(
        processedCount,
        Math.round((expectedFailedCount * augmentationProgress) / 100),
      )
    : 0

  const showConnectionBanner =
    connectionState === "error" || projectListLoadState === "error"

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <ProjectSidebar
        collapsed={collapsed}
        projects={projects}
        loadState={projectListLoadState}
        selectedProjectId={selectedProjectId}
        processingProjectId={
          viewMode === "augmenting" ? selectedProjectId : null
        }
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
            folder={legacyFolderForCreateView(selectedFolder)}
            projectName={projectName}
            projectDescription={projectDescription}
            onChooseFolder={() => setSelectedFolder(MOCK_FOLDER)}
            onProjectNameChange={setProjectName}
            onProjectDescriptionChange={setProjectDescription}
            onCreateProject={createProject}
          />
        )}

        {viewMode === "detail" && selectedProjectSummary && (
          <ProjectDetailView
            project={selectedProjectSummary}
            onStartAugmentation={() => setOptionsDialogOpen(true)}
          />
        )}

        {viewMode === "augmenting" &&
          selectedProjectSummary &&
          augmentationConfig && (
            <AugmentationProgressView
              project={selectedProjectSummary}
              config={augmentationConfig}
              progress={augmentationProgress}
              processedCount={processedCount}
              failedCount={failedCount}
              onCancel={cancelAugmentation}
            />
          )}

        {viewMode === "result" &&
          selectedProjectSummary &&
          augmentationResult && (
            <AugmentationResultView
              project={selectedProjectSummary}
              result={augmentationResult}
              onBackToDetail={backToProjectDetail}
            />
          )}
      </main>

      <AugmentationOptionsDialog
        open={optionsDialogOpen}
        project={selectedProjectSummary}
        onOpenChange={setOptionsDialogOpen}
        onStart={startAugmentation}
      />
    </div>
  )
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Adapter that converts the backend `Project` shape into the legacy
 * `ProjectSummary` consumed by the detail / progress / result views.
 *
 * Removed in tasks [4]/[5] when those views migrate to backend types.
 */
function toProjectSummary(project: Project): ProjectSummary {
  return {
    id: String(project.id),
    name: project.title,
    description: project.description ?? "",
    folderName: pathBasename(project.sourceFolderPath) || project.title,
    fileCount: project.fileCount,
    totalSizeLabel: formatBytes(project.totalSizeBytes),
    hasLabels: project.hasLabels,
    createdAtLabel: formatDateShort(project.createdAt),
  }
}

/**
 * Converts the new MOCK_FOLDER shape (matches backend) into the shape the
 * legacy CreateProjectView expects. Removed in task [3] when the create form
 * is rewritten around real folder path input.
 */
function legacyFolderForCreateView(folder: typeof MOCK_FOLDER | null) {
  if (!folder) return null
  return {
    name: pathBasename(folder.sourceFolderPath),
    fileCount: folder.fileCount,
    totalSizeLabel: formatBytes(folder.totalSizeBytes),
    hasLabels: folder.hasLabels,
  }
}

function calculateFailedCount(totalImageCount: number) {
  return Math.round(totalImageCount * 0.04)
}

function createMockAugmentationResult(
  config: AugmentationConfig,
  folderName: string,
): MockAugmentationResult {
  const failedCount = calculateFailedCount(config.totalImageCount)

  return {
    totalImageCount: config.totalImageCount,
    successCount: config.totalImageCount - failedCount,
    failedCount,
    runOcrLabeling: config.runOcrLabeling,
    outputFolderLabel: `./outputs/${folderName}-augmented`,
  }
}

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
