/**
 * Serialização CSV.
 *
 * Duas decisões que costumam morder quem exporta para Excel:
 *
 * 1. O BOM UTF-8 no início. Sem ele o Excel no Windows lê o arquivo como
 *    ANSI e todo acento vira caractere estranho — que é como a maioria dos
 *    relatórios em português chega quebrada ao usuário.
 * 2. O prefixo em células que começam com `=`, `+`, `-` ou `@`. O Excel
 *    interpreta esses valores como fórmula, o que transforma um campo
 *    preenchido por qualquer pessoa num vetor de execução na máquina de quem
 *    abrir a planilha.
 */

const BOM = "﻿";
const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r"]);

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  let text = String(value);

  if (text.length > 0 && FORMULA_TRIGGERS.has(text[0])) {
    text = `'${text}`;
  }

  // Aspas duplas viram duplicadas; qualquer célula com separador, aspas ou
  // quebra de linha precisa ser envolvida.
  if (/[",\r\n;]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

export function toCsv(
  headers: string[],
  rows: Array<Array<unknown>>,
): string {
  const lines = [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => row.map(escapeCell).join(",")),
  ];

  // CRLF é o que o Excel espera como fim de linha.
  return BOM + lines.join("\r\n");
}
