import { describe, expect, it } from "vitest";

import {
  buildContractDocument,
  ContractCompanyNotReadyError,
  spansToText,
  type ContractDocument,
} from "@/lib/contracts/compose";
import { contractFieldsSchema } from "@/lib/contracts/fields";
import {
  buildContractDraft,
  labelKey,
  type CardValues,
} from "@/lib/contracts/from-card";
import { billingPeriod, normalizeFrequency } from "@/lib/contracts/normalize";
import { renderContractPdf } from "@/lib/contracts/pdf";
import {
  PETEXEMPLO_AMBIENTEC,
  EXEMPLO_AMBIENTEC_INDUSTRIAL,
} from "@/lib/contracts/test-fixtures";

function itemText(document: ContractDocument, num: string): string {
  const block = document.blocks.find(
    (candidate) => candidate.kind === "item" && candidate.num === num,
  );

  if (!block || block.kind !== "item") {
    throw new Error(`Cláusula ${num} não encontrada`);
  }

  return spansToText(block.spans);
}

const SIGMA_CARD: CardValues = {
  requesterName: "Ana Consultora Teste",
  byLabel: new Map(
    Object.entries({
      "EMPRESA CONTRATADA:": "AMBIENTEC",
      "RAZÃO SOCIAL:": "SINALIZACAO EXEMPLO INDUSTRIAL LTDA",
      "CNPJ:": "77.888.999/0001-10",
      "CPF:": "777.888.999-10",
      "FIXO DDD:": "+55 31 90000-0007",
      "CELULAR DDD:": "+55 31 90000-0007",
      "ENDEREÇO:": "RUA IGUATO",
      "NÚMERO:": "145",
      "BAIRRO:": "PARQUE INDUSTRIAL",
      "CIDADE:": "CONTAGEM",
      "CEP:": "32.341-460",
      "ESTADO:": "MG",
      "INSC ESTADUAL:": "000.000.001-0001",
      "INSC MUNICIPAL:": "72000002-0",
      "RESPONSÁVEL LEGAL:": "MARTA TESTE TAVARES",
      "DATA DE NASCIMENTO:": "1990-01-06T03:00:00.000Z",
      "E-MAIL DE CONTATO:": "comercial@sinalizacao.example",
      "SEGMENTO DO ESTABELECIMENTO:": "Fabricação de letras, letreiros e placas",
      "TIPOS DE RESÍDUOS QUE SERÃO COLETADOS (SAÚDE)": "Não se aplica",
      "TIPOS DE RESÍDUOS QUE SERÃO COLETADOS (INDUSTRIAL)":
        "Resíduo industrial classe I, pilhas e baterias",
      "FREQUÊNCIA DE COLETA:": "Trimestral",
      "VALOR DA MENSALIDADE:": 380,
      "FRANQUIA MENSAL:": "25KG",
      "VALOR DO KG EXCEDENTE:": 8.5,
      "VIGÊNCIA DO CONTRATO:": "12 Meses com renovação automática",
    }).map(([label, value]) => [labelKey(label), value]),
  ),
};

function cardWith(overrides: Record<string, unknown>): CardValues {
  return {
    ...SIGMA_CARD,
    byLabel: new Map([
      ...SIGMA_CARD.byLabel,
      ...Object.entries(overrides).map(
        ([label, value]) => [labelKey(label), value] as const,
      ),
    ]),
  };
}

const INDUSTRIAL_FIELD = "TIPOS DE RESÍDUOS QUE SERÃO COLETADOS (INDUSTRIAL)";

function blockersOf(card: CardValues) {
  return buildContractDraft(card).issues.filter(
    (issue) => issue.level === "blocker",
  );
}

describe("período de cobrança", () => {
  it("lê o período da primeira palavra da frequência", () => {
    expect(billingPeriod("Trimestral (Uma vez a cada três meses)")).toEqual({
      noun: "trimestre",
      adverb: "trimestralmente",
    });
    expect(billingPeriod("bimestral")).toEqual({
      noun: "bimestre",
      adverb: "bimestralmente",
    });
    expect(billingPeriod("Mensal (Uma vez por mês)")).toEqual({
      noun: "mês",
      adverb: "mensalmente",
    });
  });

  it("não adivinha quando a frequência não começa por uma palavra conhecida", () => {
    expect(billingPeriod("3 vezes por semana")).toBeNull();
    expect(billingPeriod("")).toBeNull();
  });

  it("o industrial escreve o texto da saúde com inicial maiúscula", () => {
    expect(normalizeFrequency("Trimestral", "industrial").text).toBe(
      "Trimestral (Uma vez a cada três meses)",
    );
    expect(normalizeFrequency("Trimestral", "saude").text).toBe(
      "trimestral (Uma vez a cada três meses)",
    );
  });
});

describe("contrato industrial — texto", () => {
  const document = buildContractDocument(EXEMPLO_AMBIENTEC_INDUSTRIAL);

  it("usa o título e o objeto industriais", () => {
    expect(document.title).toContain("RESÍDUOS INDUSTRIAIS CLASSE I");
    expect(itemText(document, "1.1")).toContain(
      "resíduos INDUSTRIAIS de Classe I",
    );
    expect(itemText(document, "1.1")).not.toContain("saúde");
  });

  it("abre como o contrato de 2026: cargo depois de 'infra-assinado:' e 'inscrita no CPF'", () => {
    const intro = spansToText(document.intro);

    expect(intro).toContain(
      "e por seu representante legal infra-assinado: Representante comercial Ana Consultora Teste",
    );
    expect(intro).toContain("inscrita no CPF 777.888.999-10");
    expect(intro).toContain("Contato Celular 90000-0007,");
  });

  it("escreve o preço por período de cobrança, com inicial maiúscula", () => {
    const price = itemText(document, "4.1");

    expect(price).toContain("R$ 380,00 (Trezentos e oitenta reais) por (Trimestre)");
    expect(price).toContain("25 (Vinte e cinco) quilos de resíduo por (Trimestre)");
    expect(price).toContain("(Trimestralmente)");
    expect(itemText(document, "4.3")).toContain(
      "R$ 8,50 (Oito reais e cinquenta centavos)",
    );
    expect(itemText(document, "1.2")).toContain(
      "Trimestral (Uma vez a cada três meses)",
    );
  });

  it("usa os termos vigentes: juros ao dia, 18:00 e boleto na CONTRATANTE", () => {
    expect(itemText(document, "5.2")).toContain("ao dia");
    expect(itemText(document, "1.5.1")).toContain("08:00 às 18:00");
    expect(itemText(document, "5.1")).toContain("site da CONTRATANTE");
    expect(document.signature.place).toBe("Iguatama/MG.");
  });

  it("não tem as cláusulas do modelo de saúde, e tem as do industrial", () => {
    const nums = document.blocks.flatMap((block) =>
      block.kind === "item" && block.num ? [block.num] : [],
    );

    expect(nums).toContain("3.1.5.4");
    expect(document.blocks.some((block) => block.kind === "table")).toBe(false);
    expect(nums).not.toContain("4.5");
  });

  it("agora há contrato industrial para as outras empresas", () => {
    for (const company of ["COLEMAX", "COLENORTE", "BIOCOLETAS", "COLEFAR"] as const) {
      const built = buildContractDocument({ ...EXEMPLO_AMBIENTEC_INDUSTRIAL, company });

      expect(built.title).toContain("INDUSTRIAIS CLASSE I");
    }
  });

  it("recusa Classe II (sem modelo implementado)", () => {
    expect(() =>
      buildContractDocument({ ...EXEMPLO_AMBIENTEC_INDUSTRIAL, kind: "classe_II" }),
    ).toThrow(ContractCompanyNotReadyError);
  });

  it("gera um PDF válido", async () => {
    const pdf = await renderContractPdf(document);

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});

describe("contrato industrial — validação", () => {
  it("aceita os dados do contrato de referência", () => {
    expect(
      contractFieldsSchema.safeParse(EXEMPLO_AMBIENTEC_INDUSTRIAL).success,
    ).toBe(true);
  });

  it("não exige grupo de resíduo de saúde no industrial", () => {
    expect(
      contractFieldsSchema.safeParse({
        ...EXEMPLO_AMBIENTEC_INDUSTRIAL,
        residueGroups: [],
      }).success,
    ).toBe(true);
  });

  it("exige grupo de resíduo no modelo de saúde", () => {
    expect(
      contractFieldsSchema.safeParse({ ...PETEXEMPLO_AMBIENTEC, residueGroups: [] })
        .success,
    ).toBe(false);
  });

  it("exige frequência com período conhecido no industrial", () => {
    expect(
      contractFieldsSchema.safeParse({
        ...EXEMPLO_AMBIENTEC_INDUSTRIAL,
        frequency: "de vez em quando",
      }).success,
    ).toBe(false);
  });
});

describe("contrato industrial — a partir do card", () => {
  it("detecta o modelo industrial e normaliza o card", () => {
    const { fields } = buildContractDraft(SIGMA_CARD);

    expect(fields).toMatchObject({
      kind: "industrial",
      company: "AMBIENTEC",
      consultantRole: "Representante comercial",
      frequency: "Trimestral (Uma vez a cada três meses)",
      monthlyFee: "380",
      monthlyAllowanceKg: "25",
      excessPerKg: "8,50",
      landline: "",
      animalCollection: false,
    });
    expect(blockersOf(SIGMA_CARD)).toEqual([]);
    expect(contractFieldsSchema.safeParse(fields).success).toBe(true);
  });

  it("Classe II é reconhecida, mas ainda sem modelo implementado", () => {
    const card = cardWith({ [INDUSTRIAL_FIELD]: "Resíduos Classe II" });

    expect(buildContractDraft(card).fields.kind).toBe("classe_II");
    expect(blockersOf(card).some((issue) => issue.field === "company")).toBe(true);
  });

  it("bloqueia card com resíduo de saúde e industrial ao mesmo tempo", () => {
    const blockers = blockersOf(
      cardWith({
        "TIPOS DE RESÍDUOS QUE SERÃO COLETADOS (SAÚDE)":
          "Grupo A1,A4 E A5 - Resíduos Infectantes / Grupo B - Resíduos Químicos",
      }),
    );

    expect(blockers.some((issue) => issue.field === "kind")).toBe(true);
  });

  it("lâmpadas ou pilhas sozinhas não são Classe I", () => {
    const blockers = blockersOf(cardWith({ [INDUSTRIAL_FIELD]: "Lâmpadas" }));

    expect(blockers.some((issue) => issue.field === "kind")).toBe(true);
  });
});
