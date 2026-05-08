"use client"

import { useEffect, useMemo, useState } from "react"

import { AugmentationOptionsDialog } from "@/components/augmentation-options-dialog"
import { ProjectSidebar } from "@/components/project-sidebar"
import { AugmentationProgressView } from "@/components/views/augmentation-progress-view"
import { AugmentationResultView } from "@/components/views/augmentation-result-view"
import { CreateProjectView } from "@/components/views/create-project-view"
import { EmptyProjectView } from "@/components/views/empty-project-view"
import { ProjectDetailView } from "@/components/views/project-detail-view"
import type {
  AugmentationConfig,
  MockAugmentationResult,
  ProjectSummary,
} from "@/types/project"

type ViewMode = "empty" | "create" | "detail" | "augmenting" | "result"

const MOCK_FOLDER = {
  name: "container-images-2026",
  fileCount: 148,
  totalSizeLabel: "612.4 MB",
  hasLabels: true,
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>("empty")
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null
  )
  const [selectedFolder, setSelectedFolder] = useState<typeof MOCK_FOLDER | null>(
    null
  )
  const [projectName, setProjectName] = useState("")
  const [projectDescription, setProjectDescription] = useState("")
  const [optionsDialogOpen, setOptionsDialogOpen] = useState(false)
  const [augmentationConfig, setAugmentationConfig] =
    useState<AugmentationConfig | null>(null)
  const [augmentationProgress, setAugmentationProgress] = useState(0)
  const [augmentationResult, setAugmentationResult] =
    useState<MockAugmentationResult | null>(null)

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 640px)")
    const syncSidebarToViewport = () => setCollapsed(mediaQuery.matches)

    syncSidebarToViewport()
    mediaQuery.addEventListener("change", syncSidebarToViewport)

    return () => {
      mediaQuery.removeEventListener("change", syncSidebarToViewport)
    }
  }, [])

  useEffect(() => {
    if (viewMode !== "augmenting" || !augmentationConfig) {
      return
    }

    if (augmentationProgress >= 100) {
      const completionTimer = window.setTimeout(() => {
        setAugmentationResult(
          createAugmentationResult(
            augmentationConfig,
            selectedProject?.folderName ?? "project"
          )
        )
        setViewMode("result")
      }, 300)

      return () => {
        window.clearTimeout(completionTimer)
      }
    }

    const progressTimer = window.setTimeout(() => {
      setAugmentationProgress((currentProgress) =>
        Math.min(100, currentProgress + 5)
      )
    }, 300)

    return () => {
      window.clearTimeout(progressTimer)
    }
  }, [
    augmentationConfig,
    augmentationProgress,
    selectedProject?.folderName,
    viewMode,
  ])

  function openCreateProject() {
    setSelectedFolder(null)
    setProjectName("")
    setProjectDescription("")
    setViewMode("create")
  }

  function selectProject(projectId: string) {
    setSelectedProjectId(projectId)
    setViewMode("detail")
  }

  function createProject() {
    if (!selectedFolder || !projectName.trim()) {
      return
    }

    const createdProject: ProjectSummary = {
      id: `project-${Date.now()}`,
      name: projectName.trim(),
      description: projectDescription.trim(),
      folderName: selectedFolder.name,
      fileCount: selectedFolder.fileCount,
      totalSizeLabel: selectedFolder.totalSizeLabel,
      hasLabels: selectedFolder.hasLabels,
      createdAtLabel: new Intl.DateTimeFormat("ko-KR", {
        month: "long",
        day: "numeric",
      }).format(new Date()),
    }

    setProjects((currentProjects) => [createdProject, ...currentProjects])
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
          (augmentationConfig.totalImageCount * augmentationProgress) / 100
        )
      )
    : 0
  const failedCount = augmentationConfig
    ? Math.min(
        processedCount,
        Math.round((expectedFailedCount * augmentationProgress) / 100)
      )
    : 0

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <ProjectSidebar
        collapsed={collapsed}
        projects={projects}
        selectedProjectId={selectedProjectId}
        processingProjectId={
          viewMode === "augmenting" ? selectedProjectId : null
        }
        onToggleCollapsed={() => setCollapsed((current) => !current)}
        onCreateProject={openCreateProject}
        onSelectProject={selectProject}
      />

      <main className="min-w-0 flex-1 overflow-y-auto bg-zinc-50/70">
        {viewMode === "empty" && (
          <EmptyProjectView onCreateProject={openCreateProject} />
        )}

        {viewMode === "create" && (
          <CreateProjectView
            folder={selectedFolder}
            projectName={projectName}
            projectDescription={projectDescription}
            onChooseFolder={() => setSelectedFolder(MOCK_FOLDER)}
            onProjectNameChange={setProjectName}
            onProjectDescriptionChange={setProjectDescription}
            onCreateProject={createProject}
          />
        )}

        {viewMode === "detail" && selectedProject && (
          <ProjectDetailView
            project={selectedProject}
            onStartAugmentation={() => setOptionsDialogOpen(true)}
          />
        )}

        {viewMode === "augmenting" && selectedProject && augmentationConfig && (
          <AugmentationProgressView
            project={selectedProject}
            config={augmentationConfig}
            progress={augmentationProgress}
            processedCount={processedCount}
            failedCount={failedCount}
            onCancel={cancelAugmentation}
          />
        )}

        {viewMode === "result" && selectedProject && augmentationResult && (
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
        onOpenChange={setOptionsDialogOpen}
        onStart={startAugmentation}
      />
    </div>
  )
}

function calculateFailedCount(totalImageCount: number) {
  return Math.round(totalImageCount * 0.04)
}

function createAugmentationResult(
  config: AugmentationConfig,
  folderName: string
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
