import "server-only";

/**
 * Log estruturado em JSON, uma linha por evento.
 *
 * Sem dependência externa de propósito: o volume aqui é baixo e a saída em JSON
 * já é o suficiente para `docker logs` ser filtrável com `jq` e para qualquer
 * coletor (Loki, Vector, CloudWatch) ingerir sem parser customizado. Em
 * desenvolvimento imprime legível, porque JSON puro no terminal atrapalha.
 *
 * Regra de conteúdo: nunca registrar senha, token, cookie de sessão ou corpo de
 * e-mail. Identificadores (usuário, quadro, card) são bem-vindos — são o que
 * torna um erro rastreável.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function minimumLevel(): LogLevel {
  const configured = process.env.LOG_LEVEL?.toLowerCase();

  if (configured && configured in LEVEL_WEIGHT) {
    return configured as LogLevel;
  }

  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function isPretty(): boolean {
  return process.env.NODE_ENV !== "production";
}

/** Reduz um erro a algo serializável, preservando causa e stack. */
function describeError(error: unknown): LogContext {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      stack: error.stack,
      ...(error.cause ? { cause: String(error.cause) } : {}),
    };
  }

  return { errorMessage: String(error) };
}

function write(level: LogLevel, event: string, context: LogContext = {}): void {
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[minimumLevel()]) return;

  const entry = {
    level,
    event,
    time: new Date().toISOString(),
    ...context,
  };

  const line = isPretty()
    ? `[${level}] ${event} ${Object.keys(context).length ? JSON.stringify(context) : ""}`.trim()
    : JSON.stringify(entry);

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (event: string, context?: LogContext) => write("debug", event, context),
  info: (event: string, context?: LogContext) => write("info", event, context),
  warn: (event: string, context?: LogContext) => write("warn", event, context),
  /**
   * `error` recebe a exceção como segundo argumento — a forma mais comum de
   * chamada — e contexto adicional como terceiro.
   */
  error: (event: string, error?: unknown, context?: LogContext) =>
    write("error", event, {
      ...(error === undefined ? {} : describeError(error)),
      ...context,
    }),
};
