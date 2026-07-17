"use client"

import { CircleAlertIcon, RefreshCwIcon } from "lucide-react"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface InlineErrorStateProps {
  title?: string
  description: string
  retryLabel?: string
  onRetry?: () => void
  className?: string
}

export function InlineErrorState({
  title = "Algo deu errado",
  description,
  retryLabel = "Tentar novamente",
  onRetry,
  className,
}: InlineErrorStateProps) {
  return (
    <Alert variant="destructive" className={cn("items-start", className)}>
      <CircleAlertIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
      {onRetry && (
        <div className="col-start-2 mt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetry}
          >
            <RefreshCwIcon />
            {retryLabel}
          </Button>
        </div>
      )}
    </Alert>
  )
}
