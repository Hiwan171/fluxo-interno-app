import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { ChangePasswordForm } from "@/app/(app)/conta/change-password-form";
import { AppLogo } from "@/components/app/app-logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getCurrentSession } from "@/lib/auth";

export default async function AccountPage() {
  const session = await getCurrentSession();

  if (!session) {
    redirect("/login");
  }

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4 sm:px-6">
        <AppLogo compact />
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link href="/">
            <ArrowLeftIcon />
            Voltar
          </Link>
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto grid max-w-2xl gap-6">
          <div>
            <h1 className="font-heading text-xl font-semibold tracking-tight">
              Minha conta
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Seus dados de acesso ao Fluxo Interno.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Dados</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="grid gap-0.5">
                <span className="text-muted-foreground">Nome</span>
                <span className="font-medium">{session.user.name}</span>
              </div>
              <Separator />
              <div className="grid gap-0.5">
                <span className="text-muted-foreground">E-mail</span>
                <span className="font-medium">{session.user.email}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Senha</CardTitle>
              <CardDescription>
                Ao alterar a senha, as sessões abertas em outros dispositivos são
                encerradas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
