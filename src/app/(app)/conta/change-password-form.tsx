"use client";

import { useActionState } from "react";
import { CircleAlertIcon, CircleCheckIcon, LoaderCircleIcon } from "lucide-react";

import {
  changePassword,
  type ChangePasswordState,
} from "@/app/(app)/conta/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: ChangePasswordState = {};

const PASSWORD_HINT =
  "Mínimo de 12 caracteres, com maiúscula, minúscula, número e caractere especial.";

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(
    changePassword,
    initialState,
  );

  return (
    <form action={formAction} className="grid max-w-sm gap-4">
      {state.error && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      {state.success && (
        <Alert>
          <CircleCheckIcon />
          <AlertDescription>
            Senha alterada. As sessões abertas em outros dispositivos foram
            encerradas.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="currentPassword">Senha atual</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Nova senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          disabled={pending}
          aria-describedby="new-password-hint"
        />
        <p id="new-password-hint" className="text-xs text-muted-foreground">
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

      <Button type="submit" className="mt-2 w-fit" disabled={pending}>
        {pending && <LoaderCircleIcon className="animate-spin" />}
        {pending ? "Salvando..." : "Alterar senha"}
      </Button>
    </form>
  );
}
