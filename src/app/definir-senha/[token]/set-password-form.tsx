"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CircleAlertIcon, CircleCheckIcon, LoaderCircleIcon } from "lucide-react";

import {
  setPassword,
  type SetPasswordState,
} from "@/app/definir-senha/[token]/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: SetPasswordState = {};

export const PASSWORD_HINT =
  "Mínimo de 12 caracteres, com maiúscula, minúscula, número e caractere especial.";

export function SetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(setPassword, initialState);

  if (state.success) {
    return (
      <div className="grid gap-4">
        <Alert>
          <CircleCheckIcon />
          <AlertDescription>
            Senha definida. Você já pode entrar com o seu e-mail e a nova senha.
          </AlertDescription>
        </Alert>
        <Button asChild className="w-full">
          <Link href="/login">Ir para o login</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="token" value={token} />

      {state.error && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="password">Nova senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          disabled={pending}
          aria-describedby="password-hint"
        />
        <p id="password-hint" className="text-xs text-muted-foreground">
          {PASSWORD_HINT}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmation">Repita a nova senha</Label>
        <Input
          id="confirmation"
          name="confirmation"
          type="password"
          autoComplete="new-password"
          required
          disabled={pending}
        />
      </div>

      <Button type="submit" className="mt-2 w-full" disabled={pending}>
        {pending && <LoaderCircleIcon className="animate-spin" />}
        {pending ? "Salvando..." : "Definir senha"}
      </Button>
    </form>
  );
}
