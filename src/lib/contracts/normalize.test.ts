import { describe, expect, it } from "vitest";

import {
  formatCep,
  formatCnpj,
  formatCpf,
  formatDateBr,
  formatPhone,
  joinPhones,
  normalizeFrequency,
  normalizeInscricao,
  normalizeStreet,
  normalizeUf,
  parseMoney,
  parseQuantityKg,
  parseResidueGroups,
  stripCnae,
  titleCasePt,
} from "@/lib/contracts/normalize";

describe("documentos", () => {
  it("completa o zero que o export do Pipefy perdeu no CPF", () => {
    // Caso real do card 37542: o export trouxe 12.345.678-90, o contrato usa 058.
    expect(formatCpf("12.345.678-90")).toBe("012.345.678-90");
    expect(formatCpf("11144477735")).toBe("111.444.777-35");
  });

  it("deixa passar o que não consegue interpretar", () => {
    expect(formatCpf("123456789012345")).toBe("123456789012345");
    expect(formatCpf("")).toBe("");
  });

  it("formata o CEP no padrão dos contratos, com ponto", () => {
    expect(formatCep("35670000")).toBe("35.670-000");
    expect(formatCep("35670-000")).toBe("35.670-000");
    expect(formatCep("35.670-000")).toBe("35.670-000");
    expect(formatCep("1234")).toBe("1234");
  });

  it("formata CNPJ", () => {
    expect(formatCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatCnpj("11.222.333/0001-81")).toBe("11.222.333/0001-81");
  });
});

describe("inscrições", () => {
  it.each(["0", "Isento", "isenta", "NÃO POSSUI ", "não tem", "-", "ainda não possui"])(
    "'%s' vira isento",
    (raw) => {
      expect(normalizeInscricao(raw)).toBe("isento");
    },
  );

  it("não declara isenção quando o cliente não soube informar", () => {
    expect(normalizeInscricao("cliente não sobe informar")).toBe("");
    expect(normalizeInscricao("Cliente não soube informar.")).toBe("");
  });

  it("mantém o número informado", () => {
    expect(normalizeInscricao("0000000000001")).toBe("0000000000001");
    expect(normalizeInscricao("062.738.164.00-81")).toBe("062.738.164.00-81");
  });
});

describe("nomes e endereços", () => {
  it("passa para maiúsculas só nas iniciais e respeita partículas", () => {
    expect(titleCasePt("PETEXEMPLO CENTRO DE BEM ESTAR ANIMAL LTDA")).toBe(
      "Petexemplo Centro de Bem Estar Animal Ltda",
    );
    expect(
      titleCasePt("CLINICA EXEMPLO - LASERTERAPIA E SAUDE DA MULHER S/S LTDA"),
    ).toBe("Clinica Exemplo - Laserterapia e Saude da Mulher S/S Ltda");
  });

  it("respeita texto que já está com capitalização mista", () => {
    expect(titleCasePt("Joana Teste Mendes")).toBe(
      "Joana Teste Mendes",
    );
  });

  it("expande o tipo de logradouro", () => {
    expect(normalizeStreet("R DAS PALMEIRAS")).toBe(
      "Rua das Palmeiras",
    );
    expect(normalizeStreet("AV SETE DE SETEMBRO")).toBe("Avenida Sete de Setembro");
    expect(normalizeStreet("Rua Das Laranjeiras")).toBe("Rua Das Laranjeiras");
    expect(normalizeStreet("RUA DAS FLORES")).toBe("Rua das Flores");
  });

  it("não confunde nome de rua que só começa parecido com abreviação", () => {
    expect(normalizeStreet("RIO BRANCO")).toBe("Rio Branco");
  });
});

describe("UF", () => {
  it.each([
    ["mg", "MG"],
    ["MG ", "MG"],
    ["MINAS GERAIS", "MG"],
    ["Minas", "MG"],
    ["mians gerais", "MG"],
    ["minas gerias", "MG"],
    ["são paulo", "SP"],
    ["Paraná", "PR"],
    ["es", "ES"],
  ])("'%s' → %s", (raw, expected) => {
    expect(normalizeUf(raw)).toBe(expected);
  });

  it("devolve vazio para o que não é estado", () => {
    expect(normalizeUf("35540-000")).toBe("");
    expect(normalizeUf("belo horizonte")).toBe("");
  });
});

describe("datas e telefones", () => {
  it("formata a data de nascimento no fuso de São Paulo", () => {
    // Meia-noite em São Paulo = 03:00 UTC. Sem o fuso, 16/10 viraria 15/10.
    expect(formatDateBr("1980-01-01T03:00:00.000Z")).toBe("01/01/1980");
    expect(formatDateBr("1985-03-03")).toBe("03/03/1985");
  });

  it("aceita a data já formatada e rejeita lixo", () => {
    expect(formatDateBr("01/01/1980")).toBe("01/01/1980");
    expect(formatDateBr("não sei")).toBe("");
    expect(formatDateBr(null)).toBe("");
  });

  it("tira o +55 do telefone", () => {
    expect(formatPhone("+55 31 90000-0001")).toBe("31 90000-0001");
    expect(formatPhone("(31) 90000-0001")).toBe("31 90000-0001");
  });

  it("junta celular e contato extra", () => {
    expect(joinPhones("+55 31 90000-0001", "+55 11 90000-0002")).toBe(
      "31 90000-0001 e 11 90000-0002",
    );
    expect(joinPhones("+55 31 90000-0003", "", undefined)).toBe("31 90000-0003");
  });
});

describe("frequência", () => {
  it.each([
    ["Mensal", "mensal (Uma vez por mês)"],
    ["mensal", "mensal (Uma vez por mês)"],
    ["mesal", "mensal (Uma vez por mês)"],
    ["SEMANAL ", "semanal (Uma vez por semana)"],
    ["quinzenal", "quinzenal (Uma vez a cada quinze dias)"],
    ["bimentral", "bimestral (Uma vez a cada dois meses)"],
    ["Trimestral", "trimestral (Uma vez a cada três meses)"],
  ])("'%s' é recorrente", (raw, text) => {
    expect(normalizeFrequency(raw)).toEqual({ text, kind: "recurring" });
  });

  it.each(["Única", "unica", "AVULSO", "avulsa (única)", "Coleta única", "sob demanda"])(
    "'%s' é coleta única",
    (raw) => {
      expect(normalizeFrequency(raw).kind).toBe("single");
    },
  );

  it("mantém o texto original quando não reconhece", () => {
    expect(normalizeFrequency("3 vezes por semana")).toEqual({
      text: "3 vezes por semana",
      kind: "unknown",
    });
    expect(normalizeFrequency("").kind).toBe("unknown");
  });
});

describe("quantidades e valores", () => {
  it.each([
    ["5kg", 5],
    ["5 kg", 5],
    ["5", 5],
    ["05", 5],
    ["5,00", 5],
    ["5 quilos", 5],
    ["5KG ", 5],
    [6, 6],
  ])("franquia '%s' → %s", (raw, expected) => {
    expect(parseQuantityKg(raw)).toBe(expected);
  });

  it("não adivinha quando há mais de um número ou nenhum", () => {
    expect(parseQuantityKg("5 a 10 kg")).toBeNull();
    expect(parseQuantityKg("sem franquia")).toBeNull();
    expect(parseQuantityKg("")).toBeNull();
  });

  it("lê valores monetários", () => {
    expect(parseMoney("8.5")).toBe(8.5);
    expect(parseMoney("8,50")).toBe(8.5);
    expect(parseMoney("R$ 1.234,56")).toBe(1234.56);
    expect(parseMoney(120)).toBe(120);
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("")).toBeNull();
  });
});

describe("segmento", () => {
  it("tira o código CNAE do início", () => {
    expect(stripCnae("86.30-5-04 - Atividade odontológica")).toBe(
      "Atividade odontológica",
    );
    expect(
      stripCnae(
        "47.89-0-04 - Comércio varejista de animais vivos e de artigos e alimentos para animais de estimação",
      ),
    ).toBe(
      "Comércio varejista de animais vivos e de artigos e alimentos para animais de estimação",
    );
  });

  it("mantém o segmento que já vem sem código", () => {
    expect(stripCnae(" Atividades de atendimento hospitalar")).toBe(
      "Atividades de atendimento hospitalar",
    );
  });
});

describe("grupos de resíduos", () => {
  it("lê A, B e E do texto padrão do formulário", () => {
    const text =
      "Grupo A1,A4 E A5 - Resíduos Infectantes / Grupo B - Resíduos Químicos (medicamentos vencidos e outros resíduos químicos sólidos/líquidos)  e Grupo E - Resíduos Perfurocortantes";

    expect(parseResidueGroups(text)).toEqual(["A", "B", "E"]);
  });

  it("lê só o grupo B", () => {
    expect(
      parseResidueGroups("Grupo B - Resíduos Químicos (medicamentos vencidos)"),
    ).toEqual(["B"]);
  });

  it("lê A e E", () => {
    expect(
      parseResidueGroups(
        "Grupo A1,A4 E A5 - Resíduos Infectantes e Grupo E - Resíduos Perfurocortantes",
      ),
    ).toEqual(["A", "E"]);
  });

  it("'Não se aplica' não tem grupo", () => {
    expect(parseResidueGroups("Não se aplica")).toEqual([]);
  });
});
