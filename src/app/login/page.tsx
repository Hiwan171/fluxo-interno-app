import { redirect } from "next/navigation";

import { LoginForm } from "@/app/login/login-form";
import { AppLogo } from "@/components/app/app-logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentSession } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getCurrentSession();

  if (session) {
    redirect("/");
  }

  const { next } = await searchParams;

  return (
    <div className="grid min-h-dvh place-items-center bg-[var(--workspace)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <AppLogo />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Entrar</CardTitle>
            <CardDescription>
              Acesse com seu e-mail e senha para continuar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm next={next} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
