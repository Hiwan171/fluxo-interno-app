"use client"

import {
  Columns3Icon,
  FileTextIcon,
  InboxIcon,
  MailIcon,
  SearchXIcon,
  UsersIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type EmptyStateIcon =
  | "inbox"
  | "board"
  | "form"
  | "mail"
  | "search"
  | "users"

const icons = {
  inbox: InboxIcon,
  board: Columns3Icon,
  form: FileTextIcon,
  mail: MailIcon,
  search: SearchXIcon,
  users: UsersIcon,
} satisfies Record<EmptyStateIcon, typeof InboxIcon>

export interface EmptyStateProps {
  title: string
  description: string
  icon?: EmptyStateIcon
  actionLabel?: string
  onAction?: () => void
  compact?: boolean
  className?: string
}

export function EmptyState({
  title,
  description,
  icon = "inbox",
  actionLabel,
  onAction,
  compact = false,
  className,
}: EmptyStateProps) {
  const Icon = icons[icon]

  return (
    <Card
      className={cn(
        "grid min-h-80 place-items-center border-dashed bg-card/70 px-6 text-center shadow-none",
        compact && "min-h-48",
        className
      )}
    >
      <div className="flex max-w-sm flex-col items-center py-8">
        <span className="mb-4 grid size-11 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <h2 className="font-heading text-base font-semibold tracking-[-0.01em]">
          {title}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
        {actionLabel && onAction && (
          <Button type="button" className="mt-5" onClick={onAction}>
            {actionLabel}
          </Button>
        )}
      </div>
    </Card>
  )
}
