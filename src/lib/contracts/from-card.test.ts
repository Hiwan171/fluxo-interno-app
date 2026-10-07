import { describe, expect, it } from "vitest";

import {
  buildContractDraft,
  labelKey,
  supportsContractGeneration,
  toCardValues,
  type CardValues,
} from "@/lib/contracts/from-card";
import {
  PETEXEMPLO_AMBIENTEC,
  EXEMPLO_BIOCOLETAS,
  ODONTO_COLEMAX,
  JOANA_COLENORTE,
} from "@/lib/contracts/test-fixtures";

const HEALTH_WASTE =
  "Grupo A1,A4 E A5 - Resíduos Infectantes / Grupo B - Resíduos Químicos (medicamentos vencidos e outros resíduos químicos sólidos/líquidos)  e Grupo E - Resíduos Perfurocortantes";

function card(
  values: Record<string, unknown>,
  requesterName: string | null = null,
): CardValues {
  return {
    byLabel: new Map(
      Object.entries(values).map(([label, value]) => [labelKey(label), value]),
    ),
    requesterName,
  };
}

// Os quatro cards reais, com os valores do jeito que o Pipefy exportou.
const PETEXEMPLO_CARD = card(
  {
    "EMPRESA CONTRATADA:": "AMBIENTEC",
    "RAZÃO SOCIAL:": "PETEXEMPLO CENTRO DE BEM ESTAR ANIMAL LTDA",
    "CNPJ:": "11.222.333/0001-81",
    "CPF:": "111.444.777-35",
    "ENDEREÇO:": "R DAS PALMEIRAS",
    "NÚMERO:": "157",
    "BAIRRO:": "CENTRO",
    "CIDADE:": "MATEUS LEME",
    "CEP:": "35.670-000",
    "ESTADO:": "MINAS GERAIS",
    "INSC ESTADUAL:": "Isento",
    "INSC MUNICIPAL:": "00012345",
    "RESPONSÁVEL LEGAL:": "MARIA EXEMPLO SILVA",
    "DATA DE NASCIMENTO:": "1980-01-01T03:00:00.000Z",
    "CELULAR DDD:": "+55 31 90000-0001",
    "CONTATO EXTRA DDD:": "+55 11 90000-0002",
    "E-MAIL DE CONTATO:": "contato@petexemplo.example",
    "SEGMENTO DO ESTABELECIMENTO:":
      "47.89-0-04 - Comércio varejista de animais vivos e de artigos e alimentos para animais de estimação",
    "TIPOS DE RESÍDUOS QUE SERÃO COLETADOS (SAÚDE)": HEALTH_WASTE,
    "FREQUÊNCIA DE COLETA:": "Mensal",
    "VALOR DA MENSALIDADE:": 120,
    "FRANQUIA MENSAL:": "5 quilos",
    "VALOR DO KG EXCEDENTE:": 8.5,
    "VIGÊNCIA DO CONTRATO:": "12 Meses com renovação automática",
    "SE TRATA DE UMA SUBSTITUIÇÃO E/OU TRANSIÇÃO CONTRATUAL?": "Não",
    "BONIFICAÇÃO DE MENSALIDADE:": "Não",
    "NO ENDEREÇO DE COBRANÇA TAMBÉM DEVERÁ TER COLETA?": "Sim",
    "PARTICULARIDADE DE COLETA?": "Não",
    "CONSIGNAÇÃO DE BOMBONA/TAMBOR:": "Não",
  },
  "Ana Consultora Teste",
);

const PLANALTO_CARD = card(
  {
    "EMPRESA CONTRATADA:": "COLEMAX",
    "RAZÃO SOCIAL:": "ODONTOLOGIA EXEMPLO LTDA",
    "CNPJ:": "22.333.444/0001-55",
    "CPF:": "222.333.444-05",
    "ENDEREÇO:": "R DAS ACACIAS",
    "NÚMERO:": "35",
    "COMPLEMENTO DO ENDEREÇO:": "LOJA",
    "BAIRRO:": "PLANALTO",
    "CIDADE:": "BELO HORIZONTE",
    "CEP:": "31.730-500",
    "ESTADO:": "MINAS GERAIS ",
    "INSC ESTADUAL:": "NÃO POSSUI ",
    "INSC MUNICIPAL:": "NÃO POSSUI ",
    "RESPONSÁVEL LEGAL:": "PAULO EXEMPLO SOUZA",
    "DATA DE NASCIMENTO:": "1970-02-02T03:00:00.000Z",
    "CELULAR DDD:": "+55 31 90000-0003",
    "E-MAIL DE CONTATO:": "contato@odontoexemplo.example",
    "SEGMENTO DO ESTABELECIMENTO:": "86.30-5-04 - Atividade odontológica",
    "TIPOS DE RESÍDUOS QUE SERÃO COLETADOS (SAÚDE)": HEALTH_WASTE,
    "FREQUÊNCIA DE COLETA:": "SEMANAL ",
    "VALOR DA MENSALIDADE:": 190,
    "FRANQUIA MENSAL:": "5KG ",
    "VALOR DO KG EXCEDENTE:": 7.5,
    "VIGÊNCIA DO CONTRATO:": "12 Meses com renovação automática",
    "BONIFICAÇÃO DE MENSALIDADE:": "Não",
    "NO ENDEREÇO DE COBRANÇA TAMBÉM DEVERÁ TER COLETA?": "Não",
  },
  "BRUNO CONSULTOR TESTE ",
);

const TEONILIA_CARD = card(
  {
    "EMPRESA CONTRATADA:": "COLENORTE",
    "RAZÃO SOCIAL:": "12.345.678 Joana Teste Mendes",
    "CNPJ:": "12.345.678/0001-90",
    "CPF:": "12.345.678-90",
    "ENDEREÇO:": "Rua Das Laranjeiras",
    "NÚMERO:": "18",
    "BAIRRO:": "Centro",
    "CIDADE:": "Rubelita",
    "CEP:": "39.565-000",
    "ESTADO:": "mg",
    "INSC ESTADUAL:": "0000000000001",
    "INSC MUNICIPAL:": "isento",
    "RESPONSÁVEL LEGAL:": "Joana Teste Mendes",
    "DATA DE NASCIMENTO:": "1985-03-03",
    "CELULAR DDD:": "+55 19 90000-0004",
    "E-MAIL DE CONTATO:": "joana.teste@example.com",
    "SEGMENTO DO ESTABELECIMENTO:":
      "Atividades de estética e outros serviços de cuidados com a beleza",
    "TIPOS DE RESÍDUOS QUE SERÃO COLETADOS (SAÚDE)": HEALTH_WASTE,
    "FREQUÊNCIA DE COLETA:": "mensal",
    "VALOR DA MENSALIDADE:": 130,
    "FRANQUIA MENSAL:": "05",
    "VALOR DO KG EXCEDENTE:": 8.5,
    "VIGÊNCIA DO CONTRATO:": "12 Meses com renovação automática",
    "BONIFICAÇÃO DE MENSALIDADE:": "Sim",
    "NO ENDEREÇO DE COBRANÇA TAMBÉM DEVERÁ TER COLETA?": "Sim",
  },
  "CARLA VENDEDORA TESTE",
);

const NAPOLEAO_CARD = card(
  {
    "EMPRESA CONTRATADA:": "BIOCOLETAS",
    "RAZÃO SOCIAL:":
      "CLINICA EXEMPLO - LASERTERAPIA E SAUDE DA MULHER S/S LTDA",
    "CNPJ:": "33.444.555/0001-66",
    "CPF:": "333.444.555-06",
    "ENDEREÇO:": "AV SETE DE SETEMBRO",
    "NÚMERO:": "80",
    "COMPLEMENTO DO ENDEREÇO:": "SALA 04",
    "BAIRRO:": "CENTRO",
    "CIDADE:": "SAO JOAO DEL REI",
    "CEP:": "36.307-250",
    "ESTADO:": "MG ",
    "INSC ESTADUAL:": "Isento",
    "INSC MUNICIPAL:": "Isento",
    "RESPONSÁVEL LEGAL:": "MARCOS EXEMPLO DE SOUZA",
    "DATA DE NASCIMENTO:": "1972-04-04T03:00:00.000Z",
    "CELULAR DDD:": "+55 32 90000-0005",
    "E-MAIL DE CONTATO:": "marcos.teste@example.com",
    "SEGMENTO DO ESTABELECIMENTO:":
      " Atividades de atendimento hospitalar, exceto pronto-socorro e unidades para atendimento a urgências",
    "TIPOS DE RESÍDUOS QUE SERÃO COLETADOS (SAÚDE)": HEALTH_WASTE,
    "FREQUÊNCIA DE COLETA:": "Mensal",
    "VALOR DA MENSALIDADE:": 130,
    "FRANQUIA MENSAL:": "5kg",
    "VALOR DO KG EXCEDENTE:": 7.5,
    "VIGÊNCIA DO CONTRATO:": "12 Meses com renovação automática",
    "BONIFICAÇÃO DE MENSALIDADE:": "Sim",
  },
  "Diego Vendedor Teste ",
);

describe("buildContractDraft — cards reais", () => {
  it("normaliza o card da Petexemplo (Ambientec)", () => {
    const { fields } = buildContractDraft(PETEXEMPLO_CARD);

    expect(fields).toMatchObject({
      kind: "saude",
      company: "AMBIENTEC",
      consultant: "Ana Consultora Teste",
      companyName: "Petexemplo Centro de Bem Estar Animal Ltda",
      cnpj: "11.222.333/0001-81",
      street: "Rua das Palmeiras",
      streetNumber: "157",
      district: "Centro",
      city: "Mateus Leme",
      uf: "MG",
      cep: "35.670-000",
      stateRegistration: "isento",
      municipalRegistration: "00012345",
      representativeName: "Maria Exemplo Silva",
      representativeCpf: "111.444.777-35",
      representativeBirthDate: "01/01/1980",
      phones: "31 90000-0001 e 11 90000-0002",
      email: "contato@petexemplo.example",
      segment:
        "Comércio varejista de animais vivos e de artigos e alimentos para animais de estimação",
      residueGroups: ["A", "B", "E"],
      frequency: "mensal (Uma vez por mês)",
      monthlyFee: "120",
      monthlyAllowanceKg: "5",
      excessPerKg: "8,50",
      animalCollection: true,
    });
  });

  it("normaliza o card da Odontologia Planalto (Colemax)", () => {
    const { fields, issues } = buildContractDraft(PLANALTO_CARD);

    expect(fields).toMatchObject({
      company: "COLEMAX",
      consultant: "Bruno Consultor Teste",
      companyName: "Odontologia Exemplo Ltda",
      street: "Rua das Acacias",
      complement: "Loja",
      uf: "MG",
      stateRegistration: "isento",
      municipalRegistration: "isento",
      segment: "Atividade odontológica",
      frequency: "semanal (Uma vez por semana)",
      monthlyFee: "190",
      monthlyAllowanceKg: "5",
      excessPerKg: "7,50",
      animalCollection: false,
    });
    expect(issues.some((issue) => issue.level === "blocker")).toBe(false);
  });

  it("recupera o zero do CPF e lê a data sem hora (Colenorte)", () => {
    const { fields } = buildContractDraft(TEONILIA_CARD);

    expect(fields.representativeCpf).toBe("012.345.678-90");
    expect(fields.representativeBirthDate).toBe("03/03/1985");
    expect(fields.monthlyAllowanceKg).toBe("5");
    expect(fields.uf).toBe("MG");
  });

  it("expande endereço abreviado e título (Biocoletas)", () => {
    const { fields } = buildContractDraft(NAPOLEAO_CARD);

    expect(fields).toMatchObject({
      companyName: "Clinica Exemplo - Laserterapia e Saude da Mulher S/S Ltda",
      street: "Avenida Sete de Setembro",
      complement: "Sala 04",
      city: "Sao Joao del Rei".replace("del", "Del"),
      consultant: "Diego Vendedor Teste",
    });
  });

  it("os quatro rascunhos chegam muito perto do contrato assinado", () => {
    // Diferenças esperadas: edições manuais do jurídico (bairro "Concenza",
    // inscrição estadual da Petexemplo) e a capitalização de partículas.
    const folded = (value: string) => value.toLowerCase();
    const pairs: Array<
      [ReturnType<typeof buildContractDraft>, typeof PETEXEMPLO_AMBIENTEC]
    > = [
      [buildContractDraft(PETEXEMPLO_CARD), PETEXEMPLO_AMBIENTEC],
      [buildContractDraft(PLANALTO_CARD), ODONTO_COLEMAX],
      [buildContractDraft(TEONILIA_CARD), JOANA_COLENORTE],
      [buildContractDraft(NAPOLEAO_CARD), EXEMPLO_BIOCOLETAS],
    ];

    for (const [{ fields }, signed] of pairs) {
      expect(folded(fields.companyName)).toBe(folded(signed.companyName));
      expect(fields.cnpj).toBe(signed.cnpj);
      expect(fields.representativeCpf).toBe(signed.representativeCpf);
      expect(fields.representativeBirthDate).toBe(
        signed.representativeBirthDate,
      );
      expect(fields.phones).toBe(signed.phones);
      expect(fields.email).toBe(signed.email);
      expect(fields.monthlyFee).toBe(signed.monthlyFee);
      expect(fields.monthlyAllowanceKg).toBe(signed.monthlyAllowanceKg);
      expect(fields.consultant).toBe(signed.consultant);
    }
  });
});

describe("buildContractDraft — telefone fixo", () => {
  const withFixo = (fixo: string) =>
    card({
      ...Object.fromEntries(PETEXEMPLO_CARD.byLabel),
      "FIXO DDD:": fixo,
      "CELULAR DDD:": "+55 31 90000-0006",
      "CONTATO EXTRA DDD:": "",
    });

  it("usa o fixo quando é um número diferente do celular", () => {
    expect(
      buildContractDraft(withFixo("+55 31 3000-0001")).fields.landline,
    ).toBe("31 3000-0001");
  });

  it("ignora o fixo repetido do celular (o Pipefy copia o celular para o fixo)", () => {
    expect(
      buildContractDraft(withFixo("+55 31 90000-0006")).fields.landline,
    ).toBe("");
    expect(buildContractDraft(withFixo("")).fields.landline).toBe("");
  });
});

describe("buildContractDraft — avisos", () => {
  it("avisa quando o card marca bonificação (o modelo não trata)", () => {
    const { issues } = buildContractDraft(TEONILIA_CARD);

    expect(
      issues.some(
        (issue) =>
          issue.level === "warning" &&
          issue.message.includes("bonificação de mensalidade"),
      ),
    ).toBe(true);
  });

  it("avisa que a coleta não é no endereço de cobrança", () => {
    const { issues } = buildContractDraft(PLANALTO_CARD);

    expect(
      issues.some((issue) => issue.message.includes("endereço de cobrança")),
    ).toBe(true);
  });

  it("marca a cláusula de animais pelo segmento e avisa", () => {
    const { issues } = buildContractDraft(PETEXEMPLO_CARD);

    expect(issues.some((issue) => issue.field === "animalCollection")).toBe(
      true,
    );
  });

  it("deixa a inscrição em branco quando o cliente não soube informar", () => {
    const { fields, issues } = buildContractDraft(
      card({
        ...Object.fromEntries(PETEXEMPLO_CARD.byLabel),
        "INSC ESTADUAL:": "cliente não soube informar.",
      }),
    );

    expect(fields.stateRegistration).toBe("");
    expect(issues.some((issue) => issue.field === "stateRegistration")).toBe(
      true,
    );
  });
});

describe("buildContractDraft — o que o modelo não cobre", () => {
  const base = () => Object.fromEntries([...PETEXEMPLO_CARD.byLabel]);
  const cardWith = (overrides: Record<string, unknown>) =>
    ({
      byLabel: new Map(Object.entries({ ...base(), ...overrides })),
      requesterName: "X",
    }) as CardValues;
  const blockers = (draft: ReturnType<typeof buildContractDraft>) =>
    draft.issues.filter((issue) => issue.level === "blocker");

  it("coleta única de saúde passa para o modelo próprio, sem bloqueio", () => {
    const draft = buildContractDraft(
      cardWith({
        [labelKey("FREQUÊNCIA DE COLETA:")]: "Única",
        [labelKey("VIGÊNCIA DO CONTRATO:")]: "Coleta única",
      }),
    );

    expect(draft.fields.kind).toBe("saude_unica");
    expect(draft.fields.frequency).toBe("");
    expect(blockers(draft)).toEqual([]);
  });

  it("coleta única industrial passa na Ambientec e é bloqueada onde não há referência", () => {
    const industrial = {
      [labelKey("FREQUÊNCIA DE COLETA:")]: "Única",
      [labelKey("VIGÊNCIA DO CONTRATO:")]: "Coleta única",
      [labelKey("TIPOS DE RESÍDUOS QUE SERÃO COLETADOS (SAÚDE)")]:
        "Não se aplica",
      [labelKey("TIPOS DE RESÍDUOS QUE SERÃO COLETADOS (INDUSTRIAL)")]:
        "Resíduo industrial classe I, pilhas e baterias",
    };
    const ambientec = buildContractDraft(cardWith(industrial));
    const classeII = buildContractDraft(
      cardWith({
        ...industrial,
        [labelKey("TIPOS DE RESÍDUOS QUE SERÃO COLETADOS (INDUSTRIAL)")]:
          "Resíduos Classe II",
      }),
    );

    expect(ambientec.fields.kind).toBe("industrial_unica");
    expect(blockers(ambientec)).toEqual([]);
    expect(classeII.fields.kind).toBe("classe_II_unica");
    expect(blockers(classeII).some((issue) => issue.field === "company")).toBe(
      true,
    );
  });

  it("avisa quando a frequência é única mas a vigência diz 12 meses", () => {
    const draft = buildContractDraft(
      cardWith({ [labelKey("FREQUÊNCIA DE COLETA:")]: "Única" }),
    );

    expect(draft.fields.kind).toBe("saude_unica");
    expect(
      draft.issues.some(
        (issue) =>
          issue.level === "warning" && issue.message.includes("vigência"),
      ),
    ).toBe(true);
  });

  it("bloqueia resíduo industrial ('Não se aplica' na saúde)", () => {
    const draft = buildContractDraft(
      cardWith({
        [labelKey("TIPOS DE RESÍDUOS QUE SERÃO COLETADOS (SAÚDE)")]:
          "Não se aplica",
      }),
    );

    expect(
      blockers(draft).some((issue) => issue.field === "residueGroups"),
    ).toBe(true);
  });

  it("bloqueia contrato sem mensalidade", () => {
    const draft = buildContractDraft(
      cardWith({ [labelKey("VALOR DA MENSALIDADE:")]: 0 }),
    );

    expect(blockers(draft).some((issue) => issue.field === "monthlyFee")).toBe(
      true,
    );
  });

  it("a Colefar passa nos modelos de saúde e industrial; Classe II ainda não tem modelo", () => {
    const company = { [labelKey("EMPRESA CONTRATADA:")]: "COLEFAR" };
    const noHealth = {
      ...company,
      [labelKey("TIPOS DE RESÍDUOS QUE SERÃO COLETADOS (SAÚDE)")]:
        "Não se aplica",
    };
    const industrial = buildContractDraft(
      cardWith({
        ...noHealth,
        [labelKey("TIPOS DE RESÍDUOS QUE SERÃO COLETADOS (INDUSTRIAL)")]:
          "Resíduo industrial classe I, pilhas e baterias",
      }),
    );
    const classeII = buildContractDraft(
      cardWith({
        ...noHealth,
        [labelKey("TIPOS DE RESÍDUOS QUE SERÃO COLETADOS (INDUSTRIAL)")]:
          "Resíduos Classe II",
      }),
    );

    expect(blockers(buildContractDraft(cardWith(company)))).toEqual([]);
    expect(blockers(industrial)).toEqual([]);
    expect(blockers(classeII).some((issue) => issue.field === "company")).toBe(
      true,
    );
  });

  it("não bloqueia o contrato padrão", () => {
    expect(blockers(buildContractDraft(PETEXEMPLO_CARD))).toEqual([]);
  });
});

describe("toCardValues / supportsContractGeneration", () => {
  it("indexa os valores pelo rótulo normalizado", () => {
    const values = toCardValues(
      [
        { id: "a", label: "RAZÃO SOCIAL:" },
        { id: "b", label: "CPF:" },
        { id: "c", label: "CPF" },
      ],
      [
        { customFieldId: "a", value: "ACME" },
        { customFieldId: "c", value: "123" },
      ],
      "Fulano",
    );

    expect(values.byLabel.get("razao social")).toBe("ACME");
    // "CPF:" está vazio, então vale o "CPF" repetido que tem valor.
    expect(values.byLabel.get("cpf")).toBe("123");
    expect(values.requesterName).toBe("Fulano");
  });

  it("só oferece o gerador em quadro com os campos do contrato", () => {
    expect(
      supportsContractGeneration([
        "EMPRESA CONTRATADA:",
        "RAZÃO SOCIAL:",
        "CNPJ:",
        "VALOR DA MENSALIDADE:",
      ]),
    ).toBe(true);
    expect(supportsContractGeneration(["Título", "Descrição"])).toBe(false);
  });
});
