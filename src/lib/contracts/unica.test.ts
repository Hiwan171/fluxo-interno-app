import { describe, expect, it } from "vitest";

import {
  buildContractDocument,
  spansToText,
  type ContractDocument,
} from "@/lib/contracts/compose";
import {
  contractFieldsSchema,
  type ContractFields,
} from "@/lib/contracts/fields";
import {
  buildContractDraft,
  labelKey,
  type CardValues,
} from "@/lib/contracts/from-card";
import { normalizeInscricao } from "@/lib/contracts/normalize";
import { renderContractPdf } from "@/lib/contracts/pdf";
import { PETEXEMPLO_AMBIENTEC } from "@/lib/contracts/test-fixtures";

/** Contrato 36028 (Ambientec, out/2026): coleta única para uma pessoa física. */
const WILLIAM_UNICA: ContractFields = {
  ...PETEXEMPLO_AMBIENTEC,
  kind: "saude_unica",
  consultant: "Diego Vendedor Teste",
  consultantRole: "Representante comercial",
  companyName: "Wilson Teste Batista",
  cnpj: "999.000.111-12",
  street: "Rua Das Mangueiras",
  streetNumber: "16",
  district: "Esplanada",
  city: "Caratinga",
  cep: "35.300-325",
  stateRegistration: "Isento",
  municipalRegistration: "Isento",
  representativeName: "Wilson Teste Batista",
  representativeCpf: "999.000.111-12",
  representativeBirthDate: "03/03/1982",
  phones: "33 90000-0009",
  email: "wilson.teste@example.com",
  segment: "Consultorio Odontologico",
  frequency: "",
  monthlyFee: "380",
  monthlyAllowanceKg: "5",
  excessPerKg: "7,5",
  animalCollection: false,
  advancePayment: true,
};

function itemText(document: ContractDocument, num: string): string {
  const block = document.blocks.find(
    (candidate) => candidate.kind === "item" && candidate.num === num,
  );

  if (!block || block.kind !== "item") {
    throw new Error(`Cláusula ${num} não encontrada`);
  }

  return spansToText(block.spans);
}

describe("coleta única de saúde — texto", () => {
  const document = buildContractDocument(WILLIAM_UNICA);

  it("tem o título e o objeto próprios", () => {
    expect(document.title).toContain("(COLETA ÚNICA)");
    expect(itemText(document, "1.2")).toContain(
      "uma única coleta previamente agendada com o prazo de 48 (Quarenta e Oito) Horas de antecedência",
    );
    expect(itemText(document, "1.1")).toContain(
      "nos grupos A (infectante), B (químico) e E (perfuro cortante)",
    );
  });

  it("cobra por coleta, com franquia e excedente", () => {
    expect(itemText(document, "4.1")).toContain(
      "R$ 380,00 (Trezentos e oitenta reais) por coleta, considerando a quantia de até 5 (Cinco) quilos de resíduos.",
    );
    expect(itemText(document, "4.2")).toContain(
      "R$ 7,50 (Sete reais e cinquenta centavos)",
    );
  });

  it("vale por 3 meses, com novo contrato para nova coleta, e tem só 10 cláusulas", () => {
    expect(itemText(document, "9.")).toContain("3 (Três) meses");
    expect(itemText(document, "9.")).toContain(
      "um novo contrato deverá ser assinado",
    );
    expect(itemText(document, "10.1")).toContain("10 (Dez) Cláusulas");
  });

  it("usa a tabela de lâmpadas e pilhas e as cláusulas de preço do modelo", () => {
    expect(document.blocks.some((block) => block.kind === "table")).toBe(true);
    expect(itemText(document, "5.2")).toContain("ao dia");
  });

  it("qualifica pessoa física com CPF, sem repetir o CPF do representante", () => {
    const intro = spansToText(document.intro);

    expect(intro).toContain("pessoa física de direito privado");
    expect(intro).toContain("inscrita no CPF sob o nº 999.000.111-12,");
    expect(intro).toContain(
      "e por seu representante legal infra-assinado: Representante comercial Diego Vendedor Teste",
    );
    expect(intro).not.toContain("CPF 999.000.111-12 data");
    expect(document.signature.parties[1].documentLabel).toBe("CPF");
  });

  it("pessoa jurídica repete o CPF do representante, sem 'inscrita no'", () => {
    const intro = spansToText(
      buildContractDocument({
        ...WILLIAM_UNICA,
        companyName: "Drogaria Exemplo Ltda",
        cnpj: "99.000.111/0001-32",
        representativeName: "Aline Teste Lopes",
        representativeCpf: "000.111.222-13",
      }).intro,
    );

    expect(intro).toContain("pessoa jurídica de direito privado");
    expect(intro).toContain(
      "representado neste ato por Aline Teste Lopes, CPF 000.111.222-13, data de nascimento",
    );
  });

  it("a exigência de 50% antecipado é opcional", () => {
    const withAdvance = itemText(document, "5.1");
    const without = itemText(
      buildContractDocument({ ...WILLIAM_UNICA, advancePayment: false }),
      "5.1",
    );

    expect(withAdvance).toContain("pagamento de 50% do valor antecipado");
    expect(without).not.toContain("50%");
    expect(without).toContain(
      "a partir da data de emissão da Nota Fiscal de prestação de serviço.",
    );
  });

  it("não tem boleto no site da contratante nem frequência", () => {
    expect(itemText(document, "5.1")).not.toContain("site da");
    expect(spansToText(document.intro)).not.toContain("frequência");
  });

  it("aceita frequência vazia na validação", () => {
    expect(contractFieldsSchema.safeParse(WILLIAM_UNICA).success).toBe(true);
  });

  it("gera um PDF válido", async () => {
    const pdf = await renderContractPdf(document);

    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});

function card(overrides: Record<string, unknown>): CardValues {
  const base: Record<string, unknown> = {
    "EMPRESA CONTRATADA:": "AMBIENTEC",
    "RAZÃO SOCIAL:": "SINDICATO EXEMPLO",
    "CNPJ:": "00.111.222/0001-33",
    "CPF:": "012.345.678-90",
    "FIXO DDD:": "",
    "CELULAR DDD:": "+55 37 90000-0010",
    "ENDEREÇO:": "RUA DAS FLORES",
    "NÚMERO:": "10",
    "BAIRRO:": "CENTRO",
    "CIDADE:": "ITAUNA",
    "CEP:": "35680-000",
    "ESTADO:": "MG",
    "INSC ESTADUAL:": "ISENTO",
    "INSC MUNICIPAL:": "NÃO INFORMADO",
    "RESPONSÁVEL LEGAL:": "FULANO DE TAL",
    "DATA DE NASCIMENTO:": "1975-06-04T03:00:00.000Z",
    "E-MAIL DE CONTATO:": "a@b.com",
    "SEGMENTO DO ESTABELECIMENTO:": "Organizações sindicais",
    "TIPOS DE RESÍDUOS QUE SERÃO COLETADOS (SAÚDE)":
      "Grupo B - Resíduos Químicos",
    "TIPOS DE RESÍDUOS QUE SERÃO COLETADOS (INDUSTRIAL)": "Não se aplica",
    "FREQUÊNCIA DE COLETA:": "Única",
    "VALOR DA MENSALIDADE:": 380,
    "FRANQUIA MENSAL:": "5kg",
    "VALOR DO KG EXCEDENTE:": 7.5,
    "VIGÊNCIA DO CONTRATO:": "Coleta única",
    ...overrides,
  };

  return {
    requesterName: "Diego Vendedor Teste",
    byLabel: new Map(Object.entries(base).map(([k, v]) => [labelKey(k), v])),
  };
}

describe("coleta única — a partir do card", () => {
  it("detecta o modelo, deixa a frequência vazia e usa o cargo da empresa", () => {
    const { fields, issues } = buildContractDraft(
      card({ "INSC MUNICIPAL:": "isento" }),
    );

    expect(fields.kind).toBe("saude_unica");
    expect(fields.frequency).toBe("");
    expect(fields.consultantRole).toBe("Representante comercial");
    expect(fields.advancePayment).toBe(true);
    expect(issues.filter((issue) => issue.level === "blocker")).toEqual([]);
    expect(contractFieldsSchema.safeParse(fields).success).toBe(true);
  });

  it("o texto de resíduos é sempre A, B e E, mesmo se o card marca só o grupo B", () => {
    // 504 dos 506 contratos assinados verificados escrevem A, B e E.
    expect(buildContractDraft(card({})).fields.residueGroups).toEqual([
      "A",
      "B",
      "E",
    ]);
  });

  it("'não informado' na inscrição vira campo em branco para revisar", () => {
    const { fields, issues } = buildContractDraft(card({}));

    expect(fields.municipalRegistration).toBe("");
    expect(
      issues.some((issue) => issue.field === "municipalRegistration"),
    ).toBe(true);
    expect(normalizeInscricao("NÃO INFORMADO")).toBe("");
    expect(normalizeInscricao("Não informada")).toBe("");
  });

  it("frequência 'única' com vigência de 12 meses gera a coleta única e avisa", () => {
    const { fields, issues } = buildContractDraft(
      card({ "VIGÊNCIA DO CONTRATO:": "12 Meses com renovação automática" }),
    );

    expect(fields.kind).toBe("saude_unica");
    expect(
      issues.some(
        (issue) =>
          issue.level === "warning" && issue.message.includes("vigência"),
      ),
    ).toBe(true);
  });

  it("a Colenorte usa 'Aux. comercial' e a Ambientec 'Representante comercial' por padrão", () => {
    expect(
      buildContractDraft(card({ "EMPRESA CONTRATADA:": "COLENORTE" })).fields
        .consultantRole,
    ).toBe("Aux. comercial");
  });
});
