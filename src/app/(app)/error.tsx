"use client";

import { ErrorScreen } from "@/components/app/error-screen";

/**
 * Erros dentro da área autenticada. Separado da fronteira da raiz porque aqui
 * já se sabe que a pessoa tem sessão: o caminho de volta é o painel, não o
 * login.
 */
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <ErrorScreen
      title="Não foi possível carregar"
      description="Houve uma falha ao buscar os dados deste espaço de trabalho. Tente novamente."
      digest={error.digest}
      onRetry={unstable_retry}
    />
  );
}
