"use client";

import "./globals.css";

/**
 * Última linha de defesa: substitui o layout raiz, então precisa trazer as
 * próprias tags `html` e `body` e não pode depender de nada acima dela. Só é
 * acionada quando o próprio layout raiz falha — por isso o texto é autocontido
 * e não usa os componentes de interface, que também poderiam estar quebrados.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          margin: 0,
          padding: "1.5rem",
          background: "#f6f7f9",
          color: "#12181d",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <title>Erro — Fluxo Interno</title>
        <main style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.35rem", margin: "0 0 0.5rem" }}>
            O sistema não conseguiu carregar
          </h1>
          <p style={{ margin: "0 0 1.25rem", lineHeight: 1.6, color: "#414d59" }}>
            Ocorreu uma falha inesperada. Tente novamente; se continuar, avise o
            suporte informando o código abaixo.
          </p>

          <button
            type="button"
            onClick={unstable_retry}
            style={{
              padding: "0.55rem 1.1rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "#2f6fd0",
              color: "#ffffff",
              fontSize: "0.9rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Tentar novamente
          </button>

          {error.digest && (
            <p style={{ marginTop: "1.25rem", fontSize: "0.8rem", color: "#6d7a86" }}>
              Código do erro:{" "}
              <code style={{ fontFamily: "ui-monospace, monospace" }}>
                {error.digest}
              </code>
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
