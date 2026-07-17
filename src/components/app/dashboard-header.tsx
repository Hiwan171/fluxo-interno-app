"use client"

import Link from "next/link"
import {
  BellIcon,
  ChevronDownIcon,
  HelpCircleIcon,
  LogOutIcon,
  SearchIcon,
  UserRoundIcon,
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

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")
}

export interface DashboardHeaderProps {
  workspaceName: string
  user: AppUserDTO
  signOutAction?: () => void | Promise<void>
  searchValue: string
  onSearchChange: (value: string) => void
}

export function DashboardHeader({
  workspaceName,
  user,
  signOutAction,
  searchValue,
  onSearchChange,
}: DashboardHeaderProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4 sm:px-6">
      <AppLogo compact />

      <nav aria-label="Navegação principal" className="ml-2 flex items-center gap-1">
        <Button asChild type="button" variant="default" size="sm" className="rounded-full">
          <Link href="/">Início</Link>
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled>
          Portal
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled>
          Tarefas e Solicitações
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled>
          Interfaces
        </Button>
      </nav>

      <div className="flex-1" />

      <div className="relative hidden w-52 sm:block lg:w-64">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar quadros"
          className="pl-8"
        />
      </div>

      <Button type="button" variant="ghost" size="icon-sm" disabled aria-label="Notificações">
        <BellIcon />
      </Button>
      <Button type="button" variant="ghost" size="icon-sm" disabled aria-label="Ajuda">
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
    </header>
  )
}
