import { Layers3Icon } from "lucide-react"

import { cn } from "@/lib/utils"

interface AppLogoProps {
  name?: string
  compact?: boolean
  className?: string
}

export function AppLogo({
  name = "Fluxo Interno",
  compact = false,
  className,
}: AppLogoProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm shadow-primary/20">
        <Layers3Icon aria-hidden="true" className="size-4.5" />
      </span>
      {!compact && (
        <span className="truncate font-heading text-[0.925rem] font-semibold tracking-[-0.015em] text-sidebar-foreground">
          {name}
        </span>
      )}
    </div>
  )
}
