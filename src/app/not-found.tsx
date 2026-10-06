import Link from "next/link";

import { AppLogo } from "@/components/app/app-logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * As páginas de quadro chamam `notFound()` também quando o acesso é negado —
 * revelar que o recurso existe já seria vazar informação. Por isso o texto
 * cobre as duas situações sem afirmar qual delas ocorreu.
 */
export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center bg-[var(--workspace)] px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <AppLogo />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Página não encontrada</CardTitle>
            <CardDescription>
              Esta página não existe ou você não tem acesso a ela.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/">Voltar ao início</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
