import { describe, expect, it } from "vitest";

import { toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("começa com BOM para o Excel não quebrar os acentos", () => {
    expect(toCsv(["Título"], [["Solicitação"]]).startsWith("\uFEFF")).toBe(true);
  });

  it("usa CRLF entre as linhas", () => {
    const csv = toCsv(["a"], [["1"], ["2"]]);

    expect(csv).toBe("\uFEFFa\r\n1\r\n2");
  });

  it("envolve células com vírgula, aspas ou quebra de linha", () => {
    expect(toCsv(["a"], [["x,y"]])).toContain('"x,y"');
    expect(toCsv(["a"], [['diz "oi"']])).toContain('"diz ""oi"""');
    expect(toCsv(["a"], [["linha1\nlinha2"]])).toContain('"linha1\nlinha2"');
  });

  it("neutraliza células que o Excel interpretaria como fórmula", () => {
    // Sem o prefixo, abrir a planilha executaria o conteúdo — e esse conteúdo
    // vem de campo preenchido por qualquer pessoa, inclusive pelo formulário
    // público.
    for (const payload of [
      "=1+1",
      "+1",
      "-1",
      "@SUM(A1)",
      '=cmd|" /c calc"!A0',
    ]) {
      const cell = toCsv(["a"], [[payload]]).split("\r\n")[1];
      expect(cell.startsWith("'") || cell.startsWith("\"'")).toBe(true);
    }
  });

  it("trata nulo e indefinido como célula vazia", () => {
    expect(toCsv(["a", "b"], [[null, undefined]])).toBe("\uFEFFa,b\r\n,");
  });
});
