/**
 * Domain types — match docs/API-MVP-spec.md §5, §6 exactly.
 *
 * These are the shapes the FastAPI backend returns and accepts. They are
 * consumed directly by `lib/api.ts` and by every view in the app.
 */

// =============================================================================
// Augmentation task lifecycle
// =============================================================================

/** docs/API-MVP-spec.md §5.1. */
export type AugmentationTaskStatus =
  | "PENDING"
  | "RUNNING"
  | "STOPPED"
  | "FAILED"
  | "DONE"

// =============================================================================
// Project
// =============================================================================

/** Project list item / created project. */
export type Project = {
  id: number
  title: string
  description: string | null
  sourceFolderPath: string
  targetSpec: string | null
  fileCount: number
  totalSizeBytes: number
  hasLabels: boolean
  /** ISO 8601 timestamp. */
  createdAt: string
}

/** Project detail response includes the latest task summary. */
export type ProjectDetail = Project & {
  latestTask: {
    id: number
    status: AugmentationTaskStatus
    progress: number
  } | null
}

/** Request body for `POST /api/projects`. */
export type ProjectCreateRequest = {
  title: string
  description?: string
  sourceFolderPath: string
  targetSpec?: string
}

// =============================================================================
// Augmentation task
// =============================================================================

/** Augmentation task as returned by the backend. */
export type AugmentationTask = {
  id: number
  projectId: number
  status: AugmentationTaskStatus
  /** 0 ~ 100. */
  progress: number
  workerCount: number
  runOcrLabeling: boolean
  processedCount: number
  failedCount: number
  totalImageCount: number
  outputFolderPath: string
  /** ISO 8601 or null. */
  startedAt: string | null
  /** ISO 8601 or null. */
  completedAt: string | null
}

/** Request body for `POST /api/projects/{projectId}/augmentation-tasks`. */
export type AugmentationTaskCreateRequest = {
  workerCount: number
  runOcrLabeling: boolean
  outputFolderName: string
}

/** Result returned from `GET /api/augmentation-tasks/{taskId}/result`. */
export type AugmentationResult = {
  taskId: number
  projectId: number
  totalImageCount: number
  successCount: number
  failedCount: number
  runOcrLabeling: boolean
  outputFolderPath: string
  /** ISO 8601 timestamp. */
  completedAt: string
}
