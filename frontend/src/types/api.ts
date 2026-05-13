/**
 * Shared API response shapes used across the app.
 * Matches docs/API-MVP-spec.md §4.
 */

/** MVP error codes from docs/API-MVP-spec.md §4.4. */
export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "PROJECT_NOT_FOUND"
  | "TASK_NOT_FOUND"
  | "PATH_NOT_FOUND"
  | "PATH_NOT_READABLE"
  | "PATH_NOT_WRITABLE"
  | "FOLDER_DIALOG_UNAVAILABLE"
  | "FOLDER_DIALOG_FAILED"
  | "FOLDER_OPEN_FAILED"
  | "TASK_ALREADY_RUNNING"
  | "PROJECT_HAS_ACTIVE_TASK"
  | "TASK_NOT_RUNNING"
  | "TASK_NOT_FINISHED"
  | "INTERNAL_SERVER_ERROR"

/** Error response body the backend sends for non-2xx responses. */
export type ApiErrorBody = {
  error: {
    code: ApiErrorCode | string
    message: string
    details?: Record<string, unknown>
  }
}

/** List endpoints wrap items under `data`. Pagination is optional in MVP. */
export type ApiListResponse<T> = {
  data: T[]
  pagination?: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
}
