import { describe, expect, it } from "vitest";

import {
  buildContractDocument,
  ContractCompanyNotReadyError,
  parseMarkup,
  spansToText,
  type ContractDocument,
} from "@/lib/contracts/compose";
import type { ContractFields } from "@/lib/contracts/fields";
import {
  IMPLANTES_AMBIENTEC,
  FARMA_COLEFAR,
  PETEXEMPLO_AMBIENTEC,
  EXEMPLO_BIOCOLETAS,
  ODONTO_COLEMAX,
  JOANA_COLENORTE,
} from "@/lib/contracts/test-fixtures";

function itemText(document: ContractDocument, num: string): string {
  const block = document.blocks.find(
    (candidate) => candidate.kind === "item" && candidate.num === num,
  );

  if (!block || block.kind !== "item") throw new Error(`Cláusula ${num} não encontrada`);

  return spansToText(block.spans);
}

function hasItem(document: ContractDocument, num: string): boolean {
  return document.blocks.some(
    (candidate) => candidate.kind === "item" && candidate.num === num,
  );
}

describe("parseMarkup", () => {
  it("lê negrito, itálico e link", () => {
    expect(parseMarkup("a **b** __c__ [[d]]")).toEqual([
      { text: "a ", bold: false, italic: false, link: false },
      { text: "b", bold: true, italic: false, link: false },
      { text: " ", bold: false, italic: false, link: false },
      { text: "c", bold: false, italic: true, link: false },
      { text: " ", bold: false, italic: false, link: false },
      { text: "d", bold: false, italic: false, link: true },
    ]);
  });
});

describe("buildContractDocument — texto por empresa", () => {
  it("monta o contrato da Ambientec com preços por extenso", () => {
    const document = buildContractDocument(PETEXEMPLO_AMBIENTEC);

    expect(itemText(document, "4.1")).toContain("R$ 120,00 (Cento e vinte reais)");
    expect(itemText(document, "4.1")).toContain("5 (Cinco) quilos");
    expect(itemText(document, "4.2")).toContain(
      "R$ 8,50 (Oito reais e cinquenta centavos)",
    );
    expect(itemText(document, "1.2")).toContain("mensal (Uma vez por mês)");
  });

  it("qualifica as duas partes no parágrafo de abertura", () => {
    const intro = spansToText(buildContractDocument(PETEXEMPLO_AMBIENTEC).intro);

    expect(intro).toContain("Ambientec Soluções em Resíduos Ltda - EPP");
    expect(intro).toContain("Avenida Juca Pinto, nº 1.136");
    expect(intro).toContain("Aux. comercial Ana Consultora Teste");
    expect(intro).toContain("Petexemplo Centro De Bem Estar Animal Ltda,");
    expect(intro).toContain("CPF 111.444.777-35");
    expect(intro).toContain("data de nascimento 01/01/1980");
    expect(intro).toContain("Celular 31 90000-0001 e 11 90000-0002");
  });

  it("imprime o telefone fixo só quando há um", () => {
    const withLandline = spansToText(buildContractDocument(IMPLANTES_AMBIENTEC).intro);
    const without = spansToText(buildContractDocument(PETEXEMPLO_AMBIENTEC).intro);

    expect(withLandline).toContain("Contato Fixo 31 3000-0001 Celular 31 90000-0006,");
    expect(without).toContain("Contato Celular 31 90000-0001 e 11 90000-0002,");
    expect(without).not.toContain("Fixo");
  });

  it("inclui o complemento do endereço só quando existe", () => {
    const withComplement = spansToText(
      buildContractDocument(EXEMPLO_BIOCOLETAS).intro,
    );
    const without = spansToText(buildContractDocument(PETEXEMPLO_AMBIENTEC).intro);

    expect(withComplement).toContain("nº 80, Sala 04, bairro Centro");
    expect(without).toContain("nº 157, bairro Concenza");
  });

  it("usa os termos vigentes de cada empresa", () => {
    const ambientec = buildContractDocument(PETEXEMPLO_AMBIENTEC);
    const colemax = buildContractDocument(ODONTO_COLEMAX);
    const colenorte = buildContractDocument(JOANA_COLENORTE);
    const biocoletas = buildContractDocument(EXEMPLO_BIOCOLETAS);
    const colefar = buildContractDocument(FARMA_COLEFAR);

    // Desde jun/2026 todas as empresas escrevem juros "ao dia" (era "ao mês").
    for (const document of [ambientec, colemax, colenorte, biocoletas, colefar]) {
      expect(itemText(document, "5.2")).toContain("ao dia");
    }

    // O site do boleto é por empresa e estável.
    expect(itemText(ambientec, "5.1")).toContain("site da CONTRATANTE");
    expect(itemText(colemax, "5.1")).toContain("site da CONTRATANTE");
    expect(itemText(colenorte, "5.1")).toContain("site da CONTRATADA");
    expect(itemText(biocoletas, "5.1")).toContain("site da CONTRATADA");
    expect(itemText(colefar, "5.1")).toContain("site da CONTRATADA");

    // Horário até 18:00 desde set/2026 (Ambientec, Biocoletas, Colenorte);
    // Colemax e Colefar: último valor verificado, 17:00.
    expect(itemText(ambientec, "1.5.1")).toContain("08:00 às 18:00");
    expect(itemText(colenorte, "1.5.1")).toContain("08:00 às 18:00");
    expect(itemText(biocoletas, "1.5.1")).toContain("08:00 às 18:00");
    expect(itemText(colemax, "1.5.1")).toContain("08:00 às 17:00");
    expect(itemText(colefar, "1.5.1")).toContain("08:00 às 17:00");

    expect(itemText(colemax, "12.1")).toContain("Vespasiano/MG");
    expect(itemText(biocoletas, "12.1")).toContain("Ubá/MG");
    expect(itemText(colefar, "12.1")).toContain("Belo Horizonte/MG");
  });

  it("a Colefar escreve 'Contato' sem o rótulo 'Celular' e tem os dados dela", () => {
    const intro = spansToText(buildContractDocument(FARMA_COLEFAR).intro);

    expect(intro).toContain("COLEFAR LTDA ME");
    expect(intro).toContain("Rua Governador Milton Campos, nº 1154");
    expect(intro).toContain("04.962.103/0001-93");
    expect(intro).toContain("Contato 37 90000-0008,");
    expect(intro).not.toContain("Celular");
  });

  it("assina no local e com as testemunhas de cada empresa", () => {
    expect(buildContractDocument(PETEXEMPLO_AMBIENTEC).signature).toMatchObject({
      place: "Iguatama/MG.",
      witnesses: true,
    });
    expect(buildContractDocument(ODONTO_COLEMAX).signature).toMatchObject({
      place: "Vespasiano, MG.",
      witnesses: true,
    });
    expect(buildContractDocument(FARMA_COLEFAR).signature.place).toBe(
      "Belo Horizonte/MG,",
    );
  });
});

describe("buildContractDocument — cláusulas condicionais", () => {
  it("a 4.5 (coleta de animais) só entra quando marcada", () => {
    expect(hasItem(buildContractDocument(PETEXEMPLO_AMBIENTEC), "4.5")).toBe(true);
    expect(
      hasItem(
        buildContractDocument({ ...PETEXEMPLO_AMBIENTEC, animalCollection: false }),
        "4.5",
      ),
    ).toBe(false);
    expect(hasItem(buildContractDocument(ODONTO_COLEMAX), "4.5")).toBe(false);
  });

  it("escreve os grupos de resíduo conforme os marcados", () => {
    const all = itemText(buildContractDocument(PETEXEMPLO_AMBIENTEC), "1.1");
    const onlyB = itemText(
      buildContractDocument({ ...PETEXEMPLO_AMBIENTEC, residueGroups: ["B"] }),
      "1.1",
    );
    const aAndE = itemText(
      buildContractDocument({ ...PETEXEMPLO_AMBIENTEC, residueGroups: ["E", "A"] }),
      "1.1",
    );

    expect(all).toContain(
      "nos grupos A (infectante), B (químico) e E (perfuro cortante)",
    );
    expect(onlyB).toContain("no grupo B (químico)");
    expect(aAndE).toContain("nos grupos A (infectante) e E (perfuro cortante)");
  });

  it("escreve 'quilo' no singular", () => {
    const text = itemText(
      buildContractDocument({ ...PETEXEMPLO_AMBIENTEC, monthlyAllowanceKg: "1" }),
      "4.1",
    );

    expect(text).toContain("1 (Um) quilo ");
  });
});

describe("buildContractDocument — segurança do texto", () => {
  it("não deixa marcação digitada num campo virar formatação", () => {
    const document = buildContractDocument({
      ...PETEXEMPLO_AMBIENTEC,
      companyName: "Empresa **Negrito** __Itálico__ [[x]] {{campo}}",
    });
    const intro = document.intro;

    expect(spansToText(intro)).toContain(
      "Empresa **Negrito** __Itálico__ [[x]] {{campo}},",
    );
  });

  it("preserva e-mail com sublinhado duplo", () => {
    const intro = spansToText(
      buildContractDocument({ ...PETEXEMPLO_AMBIENTEC, email: "a__b@x.com" }).intro,
    );

    expect(intro).toContain("e-mail a__b@x.com,");
  });

  it("recusa gerar um tipo de contrato sem modelo implementado", () => {
    expect(() =>
      buildContractDocument({ ...PETEXEMPLO_AMBIENTEC, kind: "classe_II" }),
    ).toThrow(ContractCompanyNotReadyError);
  });

  it("falha alto quando o valor monetário é inválido", () => {
    const broken: ContractFields = { ...PETEXEMPLO_AMBIENTEC, monthlyFee: "abc" };

    expect(() => buildContractDocument(broken)).toThrow(/Valor monetário inválido/);
  });
});
