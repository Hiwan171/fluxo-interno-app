"use client"

import Link from "next/link"
import {
  ArrowLeftIcon,
  BellIcon,
  ChevronDownIcon,
  Columns3Icon,
  HelpCircleIcon,
  InfoIcon,
  LinkIcon,
  LogOutIcon,
  PlugIcon,
  SearchIcon,
  Settings2Icon,
  SlidersHorizontalIcon,
  UserRoundIcon,
  ZapIcon,
} from "lucide-react"

import { AppLogo } from "@/components/app/app-logo"
import type { AppUserDTO } from "@/components/app/types"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

export interface PipeHeaderProps {
  boardId: string
  boardName: string
  workspaceName: string
  user: AppUserDTO
  dashboardHref: string
  signOutAction?: () => void | Promise<void>
  searchValue: string
  onSearchChange: (value: string) => void
}

export function PipeHeader({
  boardId,
  boardName,
  workspaceName,
  user,
  dashboardHref,
  signOutAction,
  searchValue,
  onSearchChange,
}: PipeHeaderProps) {
  const manageHref = `/boards/${boardId}/manage`
  const pipeTabs = [
    { label: "Mapa", href: undefined },
    { label: "Fluxo", href: undefined },
    { label: "Kanban", href: undefined, isActive: true },
    { label: "Lista", href: undefined },
    { label: "Relatórios", href: undefined },
    { label: "Formulário", href: `${manageHref}?tab=forms` },
    { label: "Emails", href: undefined },
    { label: "Painéis", href: undefined },
    { label: "Learning Center", href: undefined },
  ]
  return (
    <header className="flex shrink-0 flex-col border-b bg-background">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <AppLogo compact />
        <div className="h-6 w-px bg-border" />
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <Columns3Icon className="size-4" />
          </span>
          <h1 className="truncate font-heading text-sm font-semibold sm:text-base">
            {boardName}
          </h1>
          <InfoIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </div>

        <div className="flex-1" />

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled
          aria-label="Notificações"
        >
          <BellIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled
          aria-label="Ajuda"
        >
          <HelpCircleIcon />
        </Button>
        <Badge variant="secondary" className="hidden font-semibold sm:inline-flex">
          {workspaceName}
        </Badge>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="h-9 gap-2 px-1.5 sm:px-2"
              aria-label={`Abrir menu de ${user.name}`}
            >
              <Avatar size="sm">
                {user.avatarUrl && (
                  <AvatarImage src={user.avatarUrl} alt={user.name} />
                )}
                <AvatarFallback className="bg-primary/10 font-semibold text-primary">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
              <ChevronDownIcon className="hidden size-3.5 text-muted-foreground sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="py-2">
              <span className="block truncate text-sm font-medium text-foreground">
                {user.name}
              </span>
              <span className="mt-0.5 block truncate font-normal">
                {user.email}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <UserRoundIcon />
              Minha conta
            </DropdownMenuItem>
            {signOutAction && (
              <form action={signOutAction}>
                <DropdownMenuItem asChild>
                  <button type="submit" className="w-full">
                    <LogOutIcon />
                    Sair
                  </button>
                </DropdownMenuItem>
              </form>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex h-11 items-center gap-1.5 border-t bg-muted/30 px-4 sm:px-6">
        <Button asChild type="button" variant="ghost" size="sm">
          <Link href={dashboardHref}>
            <ArrowLeftIcon />
            Pipe
          </Link>
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button type="button" variant="ghost" size="sm" disabled>
          <ZapIcon />
          Automações
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled>
          <PlugIcon />
          Integrações
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled>
          <LinkIcon />
          Conexões
          <ChevronDownIcon />
        </Button>

        <div className="flex-1" />

        <Button asChild type="button" variant="ghost" size="sm">
          <Link href={`${manageHref}?tab=forms`}>Compartilhar formulário</Link>
        </Button>
        <Button asChild type="button" variant="ghost" size="sm">
          <Link href={manageHref}>
            <Settings2Icon />
            Gerenciar
          </Link>
        </Button>
      </div>

      <div className="flex h-11 items-center gap-1 overflow-x-auto border-t px-4 sm:px-6">
        <nav aria-label="Visualizações do fluxo" className="flex items-center gap-1">
          {pipeTabs.map((tab) =>
            tab.href ? (
              <Button
                key={tab.label}
                asChild
                type="button"
                variant="ghost"
                className="h-11 rounded-none border-b-2 border-transparent px-2.5 text-sm font-medium text-muted-foreground hover:border-border"
              >
                <Link href={tab.href}>{tab.label}</Link>
              </Button>
            ) : (
              <span
                key={tab.label}
                aria-current={tab.isActive ? "page" : undefined}
                aria-disabled={!tab.isActive}
                className={cn(
                  "flex h-11 shrink-0 cursor-not-allowed items-center border-b-2 border-transparent px-2.5 text-sm font-medium text-muted-foreground/50",
                  tab.isActive &&
                    "cursor-default border-primary font-semibold text-primary"
                )}
              >
                {tab.label}
              </span>
            )
          )}
        </nav>

        <div className="flex-1" />

        <div className="relative hidden w-52 sm:block lg:w-64">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Procurar cards"
            className="pl-8"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled
          aria-label="Filtros"
        >
          <SlidersHorizontalIcon />
        </Button>
      </div>
    </header>
  )
}
