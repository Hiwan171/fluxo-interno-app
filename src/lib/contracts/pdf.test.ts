import { describe, expect, it } from "vitest";

import { buildContractDocument } from "@/lib/contracts/compose";
import { renderContractPdf, toWinAnsi } from "@/lib/contracts/pdf";
import {
  IMPLANTES_AMBIENTEC,
  PETEXEMPLO_AMBIENTEC,
  EXEMPLO_BIOCOLETAS,
  ODONTO_COLEMAX,
  JOANA_COLENORTE,
} from "@/lib/contracts/test-fixtures";

describe("toWinAnsi", () => {
  it("mantém acentos do português e sinais usados no contrato", () => {
    const text = "ção ÃÕ ºª § “aspas” – travessão";

    expect(toWinAnsi(text)).toBe(text);
  });

  it("troca o que a fonte não tem pela letra sem acento", () => {
    expect(toWinAnsi("śą")).toBe("sa");
  });

  it("sinaliza com ? o que não tem equivalente", () => {
    expect(toWinAnsi("a→b")).toBe("a?b");
    expect(toWinAnsi("Ł")).toBe("?");
  });
});

describe("renderContractPdf", () => {
  it.each([
    ["Ambientec", PETEXEMPLO_AMBIENTEC],
    ["Colemax", ODONTO_COLEMAX],
    ["Colenorte", JOANA_COLENORTE],
    ["Biocoletas", EXEMPLO_BIOCOLETAS],
    ["Ambientec (com telefone fixo)", IMPLANTES_AMBIENTEC],
  ])("gera um PDF válido para %s", async (_name, fields) => {
    const pdf = await renderContractPdf(buildContractDocument(fields));

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.subarray(-6).toString("latin1")).toContain("%%EOF");
    // Imagens embutidas uma vez só: um contrato de 8 páginas não passa disso.
    expect(pdf.byteLength).toBeLessThan(400_000);
  });

  it("não quebra com texto longo sem espaços", async () => {
    const pdf = await renderContractPdf(
      buildContractDocument({
        ...PETEXEMPLO_AMBIENTEC,
        email: `${"a".repeat(300)}@example.com`,
      }),
    );

    expect(pdf.byteLength).toBeGreaterThan(1000);
  });
});
