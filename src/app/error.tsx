"use client";

import { ErrorScreen } from "@/components/app/error-screen";

/**
 * Fronteira de erro da raiz. Em produção o Next não entrega a mensagem original
 * ao cliente — só o `digest` —, então a tela não tenta interpretar a causa:
 * mostra o código e oferece a saída. O detalhe fica no log do servidor.
 */
export default function RootError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <ErrorScreen
      title="Algo deu errado"
      description="Não foi possível carregar esta página. Tente novamente em alguns instantes."
      digest={error.digest}
      onRetry={unstable_retry}
    />
  );
}
