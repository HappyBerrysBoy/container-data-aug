"use client"

import { useEffect, useMemo, useState } from "react"

import { ProjectSidebar } from "@/components/project-sidebar"
import { CreateProjectView } from "@/components/views/create-project-view"
import { EmptyProjectView } from "@/components/views/empty-project-view"
import { ProjectDetailView } from "@/components/views/project-detail-view"
import type { ProjectSummary } from "@/types/project"

type ViewMode = "empty" | "create" | "detail"

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

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      <ProjectSidebar
        collapsed={collapsed}
        projects={projects}
        selectedProjectId={selectedProjectId}
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
          <ProjectDetailView project={selectedProject} />
        )}
      </main>
    </div>
  )
}
