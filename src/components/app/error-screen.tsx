"use client";

import Link from "next/link";
import { CircleAlertIcon, RefreshCwIcon } from "lucide-react";

import { AppLogo } from "@/components/app/app-logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface ErrorScreenProps {
  title: string;
  description: string;
  /**
   * Identificador que o Next gera para o erro. É o único elo entre o que o
   * usuário viu e a linha correspondente no log do servidor, então precisa
   * ficar visível — é a primeira coisa a pedir quando alguém abre um chamado.
   */
  digest?: string;
  onRetry?: () => void;
  homeHref?: string;
}

export function ErrorScreen({
  title,
  description,
  digest,
  onRetry,
  homeHref = "/",
}: ErrorScreenProps) {
  return (
    <div className="grid min-h-dvh place-items-center bg-[var(--workspace)] px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <AppLogo />
        </div>
        <Card>
          <CardHeader>
            <div className="mb-1 flex size-9 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <CircleAlertIcon className="size-5" />
            </div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              {onRetry && (
                <Button type="button" onClick={onRetry}>
                  <RefreshCwIcon />
                  Tentar novamente
                </Button>
              )}
              <Button asChild variant="outline">
                <Link href={homeHref}>Voltar ao início</Link>
              </Button>
            </div>

            {digest && (
              <p className="text-xs text-muted-foreground">
                Código do erro:{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono">
                  {digest}
                </code>
                . Informe este código ao suporte.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
