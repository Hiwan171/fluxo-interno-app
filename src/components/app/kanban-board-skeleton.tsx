import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export interface KanbanBoardSkeletonProps {
  columns?: number
  cardsPerColumn?: number
  className?: string
}

export function KanbanBoardSkeleton({
  columns = 4,
  cardsPerColumn = 3,
  className,
}: KanbanBoardSkeletonProps) {
  return (
    <div
      aria-label="Carregando quadro"
      aria-busy="true"
      className={cn(
        "flex h-full min-h-0 gap-4 overflow-hidden px-4 pb-4 sm:px-6 sm:pb-6",
        className
      )}
    >
      {Array.from({ length: columns }, (_, columnIndex) => (
        <div
          key={`column-${columnIndex}`}
          className="w-[min(20rem,calc(100vw-2rem))] shrink-0 rounded-xl bg-column/70 p-3 ring-1 ring-foreground/7 sm:w-80"
        >
          <div className="mb-4 flex items-center gap-2">
            <Skeleton className="h-5 w-1 rounded-full" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="ml-auto size-5 rounded-full" />
          </div>
          <div className="space-y-2.5">
            {Array.from({ length: cardsPerColumn }, (_, cardIndex) => (
              <div
                key={`card-${columnIndex}-${cardIndex}`}
                className="space-y-3 rounded-xl bg-card p-3 ring-1 ring-foreground/8"
              >
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-3 w-full" />
                <div className="flex items-center gap-2 pt-1">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="ml-auto size-6 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
