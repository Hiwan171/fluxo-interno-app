import Link from "next/link";

import { SetPasswordForm } from "@/app/definir-senha/[token]/set-password-form";
import { AppLogo } from "@/components/app/app-logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { readAuthToken } from "@/lib/auth";

export default async function SetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const holder = await readAuthToken(token);

  return (
    <div className="grid min-h-dvh place-items-center bg-[var(--workspace)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <AppLogo />
        </div>
        <Card>
          {holder ? (
            <>
              <CardHeader>
                <CardTitle>
                  {holder.purpose === "invite"
                    ? "Bem-vindo ao Fluxo Interno"
                    : "Definir nova senha"}
                </CardTitle>
                <CardDescription>
                  {holder.purpose === "invite"
                    ? `Olá, ${holder.name}. Escolha uma senha para acessar sua conta (${holder.email}).`
                    : `Escolha uma nova senha para ${holder.email}.`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SetPasswordForm token={token} />
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle>Link indisponível</CardTitle>
                <CardDescription>
                  Este link é inválido, já foi usado ou expirou. Peça um novo a
                  quem administra o espaço de trabalho.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/login">Voltar para o login</Link>
                </Button>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
