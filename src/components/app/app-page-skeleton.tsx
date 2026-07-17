import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export interface AppPageSkeletonProps {
  rows?: number
  className?: string
}

export function AppPageSkeleton({
  rows = 5,
  className,
}: AppPageSkeletonProps) {
  return (
    <div
      aria-label="Carregando conteúdo"
      aria-busy="true"
      className={cn("space-y-6 p-4 sm:p-6", className)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="rounded-xl bg-card ring-1 ring-foreground/8">
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={`row-${index}`}
            className="flex items-center gap-4 border-b p-4 last:border-b-0"
          >
            <Skeleton className="size-8 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-3/5" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
