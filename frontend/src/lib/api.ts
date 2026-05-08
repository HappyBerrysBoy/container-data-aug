/**
 * Backend API client.
 *
 * Wraps `fetch` with:
 *   - base URL from `NEXT_PUBLIC_API_BASE_URL`
 *   - JSON request/response handling
 *   - structured error parsing into `ApiError`
 *
 * All endpoints follow docs/API-MVP-spec.md.
 */

import type {
  ApiErrorBody,
  ApiErrorCode,
  ApiListResponse,
} from "@/types/api"
import type {
  AugmentationResult,
  AugmentationTask,
  AugmentationTaskCreateRequest,
  Project,
  ProjectCreateRequest,
  ProjectDetail,
} from "@/types/project"

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api"

/**
 * Thrown for any non-2xx response. Carries the parsed backend error code so
 * callers can branch on it (e.g. `err.code === "PATH_NOT_FOUND"`).
 *
 * For network failures (backend offline, DNS error, etc.) the underlying
 * `TypeError` from `fetch` is rethrown unchanged — distinguish with
 * `err instanceof ApiError`.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: ApiErrorCode | string
  readonly details: Record<string, unknown>

  constructor(
    status: number,
    code: ApiErrorCode | string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    this.details = details
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  /** When set, the value is JSON-encoded and `Content-Type` is added. */
  json?: unknown
  /** Optional AbortSignal for cancellation (e.g. polling cleanup). */
  signal?: AbortSignal
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { json, headers, ...rest } = options

  const response = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: {
      Accept: "application/json",
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : undefined,
  })

  // 204 No Content — used by DELETE endpoints.
  if (response.status === 204) {
    return undefined as T
  }

  const contentType = response.headers.get("content-type") ?? ""
  const isJson = contentType.includes("application/json")
  const body: unknown = isJson ? await response.json() : await response.text()

  if (!response.ok) {
    const errorBody = body as Partial<ApiErrorBody>
    if (isJson && errorBody?.error) {
      throw new ApiError(
        response.status,
        errorBody.error.code,
        errorBody.error.message,
        errorBody.error.details ?? {},
      )
    }
    throw new ApiError(
      response.status,
      "INTERNAL_SERVER_ERROR",
      typeof body === "string" && body.length > 0 ? body : response.statusText,
    )
  }

  return body as T
}

// =============================================================================
// Endpoint clients
// =============================================================================

/** `GET /api/health` — used on app start to verify the backend is reachable. */
export const health = {
  check: (signal?: AbortSignal) =>
    request<{ status: string }>("/health", { signal }),
}

/** `/api/projects` — CRUD on projects. */
export const projects = {
  /** `GET /api/projects` — returns the unwrapped list. */
  list: (signal?: AbortSignal) =>
    request<ApiListResponse<Project>>("/projects", { signal }).then(
      (response) => response.data,
    ),

  /** `GET /api/projects/{projectId}` — includes `latestTask`. */
  get: (projectId: number, signal?: AbortSignal) =>
    request<ProjectDetail>(`/projects/${projectId}`, { signal }),

  /** `POST /api/projects` — scans the folder synchronously on the backend. */
  create: (body: ProjectCreateRequest, signal?: AbortSignal) =>
    request<Project>("/projects", { method: "POST", json: body, signal }),

  /** `DELETE /api/projects/{projectId}` — removes metadata only. */
  remove: (projectId: number, signal?: AbortSignal) =>
    request<void>(`/projects/${projectId}`, { method: "DELETE", signal }),
}

/** `/api/augmentation-tasks` — task lifecycle. */
export const augmentationTasks = {
  /** `POST /api/projects/{projectId}/augmentation-tasks` — starts the runner. */
  start: (
    projectId: number,
    body: AugmentationTaskCreateRequest,
    signal?: AbortSignal,
  ) =>
    request<AugmentationTask>(
      `/projects/${projectId}/augmentation-tasks`,
      { method: "POST", json: body, signal },
    ),

  /** `GET /api/augmentation-tasks/active` — the global running task, if any. */
  getActive: (signal?: AbortSignal) =>
    request<{ task: AugmentationTask | null }>(
      "/augmentation-tasks/active",
      { signal },
    ),

  /** `GET /api/augmentation-tasks/{taskId}` — polled at 1s intervals. */
  get: (taskId: number, signal?: AbortSignal) =>
    request<AugmentationTask>(`/augmentation-tasks/${taskId}`, { signal }),

  /** `POST /api/augmentation-tasks/{taskId}/stop` — sets the stop flag. */
  stop: (taskId: number, signal?: AbortSignal) =>
    request<AugmentationTask>(
      `/augmentation-tasks/${taskId}/stop`,
      { method: "POST", signal },
    ),

  /** `GET /api/augmentation-tasks/{taskId}/result` — DONE/FAILED/STOPPED only. */
  result: (taskId: number, signal?: AbortSignal) =>
    request<AugmentationResult>(
      `/augmentation-tasks/${taskId}/result`,
      { signal },
    ),
}
