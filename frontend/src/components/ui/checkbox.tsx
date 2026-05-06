"use client"

import * as React from "react"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

type CheckboxProps = Omit<
  React.ComponentProps<"input">,
  "type" | "onChange"
> & {
  onCheckedChange?: (checked: boolean) => void
}

function Checkbox({
  className,
  onCheckedChange,
  ...props
}: CheckboxProps) {
  return (
    <span className={cn("relative inline-flex size-4 shrink-0", className)}>
      <input
        type="checkbox"
        data-slot="checkbox"
        className="peer size-4 appearance-none rounded-[4px] border border-input bg-background shadow-xs transition-colors outline-none checked:border-primary checked:bg-primary focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
        onChange={(event) => onCheckedChange?.(event.currentTarget.checked)}
        {...props}
      />
      <Check
        className="pointer-events-none absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 text-primary-foreground opacity-0 transition-opacity peer-checked:opacity-100"
        aria-hidden="true"
      />
    </span>
  )
}

export { Checkbox }
