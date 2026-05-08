/**
 * Domain types.
 *
 * This file holds two groups of types side-by-side during the API migration:
 *
 *  1. Backend types (top of file) — match docs/API-MVP-spec.md §6 exactly.
 *     These are returned by the FastAPI backend and consumed by `lib/api.ts`.
 *
 *  2. Legacy view models (bottom of file) — kept temporarily so the existing
 *     mockup keeps compiling. They will be removed as views migrate to the
 *     backend types in tasks [2]~[5] of the integration plan.
 */

// =============================================================================
// Backend API types (docs/API-MVP-spec.md §5, §6)
// =============================================================================

/** Augmentation task lifecycle status. */
export type AugmentationTaskStatus =
  | "PENDING"
  | "RUNNING"
  | "STOPPED"
  | "FAILED"
  | "DONE"

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

// =============================================================================
// Legacy view models (kept until views migrate to backend types above)
// =============================================================================

/**
 * @deprecated Use `Project` (backend type) once views are migrated in task [2].
 * Pre-formatted display fields will move into a dedicated formatter helper.
 */
export type ProjectSummary = {
  id: string
  name: string
  description: string
  folderName: string
  fileCount: number
  totalSizeLabel: string
  hasLabels: boolean
  createdAtLabel: string
}

/**
 * @deprecated Use `AugmentationTaskCreateRequest` once the options dialog is
 * migrated in task [5]. Note `outputFolderName` is required by the backend.
 */
export type AugmentationConfig = {
  workerCount: number
  runOcrLabeling: boolean
  totalImageCount: number
}

/**
 * @deprecated Renamed to free up the `AugmentationResult` name for the
 * backend type. Used only by the mockup result view; will be removed in
 * task [5].
 */
export type MockAugmentationResult = {
  totalImageCount: number
  successCount: number
  failedCount: number
  runOcrLabeling: boolean
  outputFolderLabel: string
}
