"use client"

import { createElement } from "react"
import Link from "next/link"
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  Columns3Icon,
  GlobeIcon,
  InfoIcon,
  LayoutTemplateIcon,
  LogOutIcon,
  MailIcon,
  SearchIcon,
  Settings2Icon,
  SlidersHorizontalIcon,
  UserRoundIcon,
  UsersIcon,
  ZapIcon,
} from "lucide-react"

import { AppLogo } from "@/components/app/app-logo"
import { getIconComponent } from "@/components/app/phase-icons"
import { ThemeToggle } from "@/components/app/theme-toggle"
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

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

export type PipeTabKey = "kanban" | "relatorios" | "formulario" | "emails"

export interface PipeHeaderProps {
  boardId: string
  boardName: string
  boardIcon?: string | null
  workspaceName: string
  user: AppUserDTO
  dashboardHref: string
  signOutAction?: () => void | Promise<void>
  searchValue: string
  onSearchChange: (value: string) => void
  activeTab?: PipeTabKey
}

export function PipeHeader({
  boardId,
  boardName,
  boardIcon,
  workspaceName,
  user,
  dashboardHref,
  signOutAction,
  searchValue,
  onSearchChange,
  activeTab = "kanban",
}: PipeHeaderProps) {
  const manageHref = `/boards/${boardId}/manage`
  const pipeTabs: Array<{ key: PipeTabKey; label: string; href: string }> = [
    { key: "kanban", label: "Kanban", href: `/boards/${boardId}` },
    { key: "relatorios", label: "Relatórios", href: `/boards/${boardId}/reports` },
    { key: "formulario", label: "Formulário", href: `/boards/${boardId}/form` },
    { key: "emails", label: "Emails", href: `/boards/${boardId}/emails` },
  ]
  return (
    <header className="flex shrink-0 flex-col border-b bg-background">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
        <AppLogo compact />
        <div className="h-6 w-px bg-border" />
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            {/* `createElement` evita ligar um componente a uma variável do
                corpo do render — o ícone é escolhido por dado, não por tipo. */}
            {createElement(getIconComponent(boardIcon), {
              className: "size-4",
              "aria-hidden": true,
            })}
          </span>
          <h1 className="truncate font-heading text-sm font-semibold sm:text-base">
            {boardName}
          </h1>
          <InfoIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </div>

        <div className="flex-1" />

        <ThemeToggle />

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
            <DropdownMenuItem asChild>
              <Link href="/conta">
                <UserRoundIcon />
                Minha conta
              </Link>
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
        <Button
          asChild
          type="button"
          variant="secondary"
          size="sm"
          className="rounded-full"
        >
          <Link href={dashboardHref}>
            <ArrowLeftIcon />
            Pipe
          </Link>
        </Button>
        <div className="mx-1 h-5 w-px bg-border" />
        <Button asChild type="button" variant="ghost" size="sm">
          <Link href={`/boards/${boardId}/emails/automations`}>
            <ZapIcon />
            Automações
          </Link>
        </Button>

        <div className="flex-1" />

        <Button asChild type="button" variant="ghost" size="sm">
          <Link href={`/boards/${boardId}/form`}>
            <GlobeIcon />
            Compartilhar formulário
          </Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm">
              <Settings2Icon />
              Gerenciar
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem asChild>
              <Link href={`${manageHref}?tab=formulario`}>
                <LayoutTemplateIcon />
                Formulário inicial
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`${manageHref}?tab=fases`}>
                <Columns3Icon />
                Fases
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`${manageHref}?tab=pessoas`}>
                <UsersIcon />
                Pessoas
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`${manageHref}?tab=email`}>
                <MailIcon />
                Email
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`${manageHref}?tab=configuracoes`}>
                <SlidersHorizontalIcon />
                Configurações do pipe
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex h-11 items-center gap-1 overflow-x-auto border-t px-4 sm:px-6">
        <nav aria-label="Visualizações do fluxo" className="flex items-center gap-1">
          {pipeTabs.map((tab) =>
            tab.key === activeTab ? (
              <span
                key={tab.key}
                aria-current="page"
                className="flex h-11 shrink-0 cursor-default items-center border-b-2 border-foreground px-2.5 text-sm font-semibold text-foreground"
              >
                {tab.label}
              </span>
            ) : (
              <Button
                key={tab.key}
                asChild
                type="button"
                variant="ghost"
                className="h-11 rounded-none border-b-2 border-transparent px-2.5 text-sm font-medium text-muted-foreground hover:border-border"
              >
                <Link href={tab.href}>{tab.label}</Link>
              </Button>
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
      </div>
    </header>
  )
}
