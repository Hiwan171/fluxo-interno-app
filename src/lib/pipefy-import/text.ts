/** Reduz espaços repetidos, inclusive os que o Pipefy deixa no fim do cabeçalho. */
export function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Forma comparável de um texto: minúsculo, sem acento nem pontuação.
 * "Último comentário em" e "ultimo comentario em" resultam na mesma coisa.
 */
export function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Valor que cabe numa chave de campo: `^[a-z][a-z0-9_]*$`, até 80 caracteres. */
export function toFieldKey(label: string, taken: Set<string>): string {
  let base = normalize(label).replace(/ /g, "_").slice(0, 70);

  if (!base) base = "campo";
  if (!/^[a-z]/.test(base)) base = `campo_${base}`;

  let key = base;
  let suffix = 2;

  while (taken.has(key)) {
    key = `${base}_${suffix}`;
    suffix += 1;
  }

  taken.add(key);
  return key;
}

/** Slug do quadro: `^[a-z0-9]+(?:-[a-z0-9]+)*$`. */
export function toSlug(value: string): string {
  return normalize(value).replace(/ /g, "-").slice(0, 100) || "quadro-importado";
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
