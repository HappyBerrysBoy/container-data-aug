"use client"

import { AlertCircle, RotateCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type Variant = "warning" | "error"

type ConnectionBannerProps = {
  variant?: Variant
  title: string
  description?: string
  onRetry?: () => void
  retrying?: boolean
}

const variantStyles: Record<Variant, string> = {
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  error: "border-rose-300 bg-rose-50 text-rose-900",
}

/**
 * Top-of-content alert used when the backend is unreachable or a fetch fails.
 *
 * Renders a single retry action; callers should disable it during the retry
 * by passing `retrying={true}`. The banner is purely presentational and does
 * not own any state.
 */
export function ConnectionBanner({
  variant = "error",
  title,
  description,
  onRetry,
  retrying = false,
}: ConnectionBannerProps) {
  return (
    <div
      role="alert"
      className={cn(
        "mx-6 mt-6 flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:mx-10",
        variantStyles[variant],
      )}
    >
      <div className="flex items-start gap-2.5">
        <AlertCircle
          className="mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
        <div className="text-sm">
          <p className="font-medium">{title}</p>
          {description ? (
            <p className="mt-1 text-xs opacity-90">{description}</p>
          ) : null}
        </div>
      </div>
      {onRetry ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={retrying}
          onClick={onRetry}
          className="self-start sm:self-auto"
        >
          <RotateCw
            className={cn("size-4", retrying && "animate-spin")}
            aria-hidden="true"
          />
          {retrying ? "재시도 중…" : "다시 시도"}
        </Button>
      ) : null}
    </div>
  )
}
