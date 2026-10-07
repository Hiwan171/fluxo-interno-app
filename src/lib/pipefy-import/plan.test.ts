import { describe, expect, it } from "vitest";

import { buildPlan } from "@/lib/pipefy-import/plan";
import { wallClockToInstant } from "@/lib/pipefy-import/time";

/** Data como a biblioteca de leitura entrega: números do relógio, em UTC. */
const wall = (iso: string) => new Date(`${iso}Z`);

const HEADERS = [
  "Título",
  "Fase atual",
  "Criador",
  "Criado em",
  "Finalizado em",
  "Código",
  "Etiquetas",
  "Responsáveis",
  "Setor",
  "Nome do Solicitante ",
  "E-mail do Solicitante",
  "Detalhes da Solicitação",
  "Qual o assunto do seu pedido?",
  "CONCLUSÃO",
  "Primeira vez que entrou na fase Triagem",
  "Última vez que saiu da fase Triagem",
  "Primeira vez que entrou na fase Infra/Interno",
  "Primeira vez que entrou na fase Concluidos",
];

type Row = (string | number | Date | null)[];

function card(n: number, overrides: Partial<Record<string, string | number | Date | null>> = {}): Row {
  const day = String(n + 1).padStart(2, "0");
  const base: Record<string, string | number | Date | null> = {
    "Título": `Chamado ${n}`,
    "Fase atual": "Concluidos",
    "Criador": "Pipebot",
    "Criado em": wall(`2026-07-${day}T08:00:00`),
    "Finalizado em": wall(`2026-07-${day}T10:00:00`),
    "Código": 1000 + n,
    "Etiquetas": "Concluído",
    "Responsáveis": null,
    "Setor": n % 2 === 0 ? "Financeiro" : "RH",
    "Nome do Solicitante ": `Pessoa ${n}`,
    "E-mail do Solicitante": `pessoa${n}@empresa.com.br`,
    "Detalhes da Solicitação": `Detalhe do chamado ${n}`,
    "Qual o assunto do seu pedido?": `Chamado ${n}`,
    "CONCLUSÃO": null,
    "Primeira vez que entrou na fase Triagem": wall(`2026-07-${day}T08:00:00`),
    "Última vez que saiu da fase Triagem": wall(`2026-07-${day}T09:00:00`),
    "Primeira vez que entrou na fase Infra/Interno": null,
    "Primeira vez que entrou na fase Concluidos": wall(`2026-07-${day}T10:00:00`),
    ...overrides,
  };
  return HEADERS.map((header) => base[header] ?? null);
}

function sheet(rows: Row[]): (string | number | Date | null)[][] {
  return [HEADERS, ...rows];
}

/** 12 cards: 4 passam por Infra/Interno e têm CONCLUSÃO. */
function sampleRows(): Row[] {
  return Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    if (n > 4) return card(n);

    const day = String(n + 1).padStart(2, "0");
    return card(n, {
      "CONCLUSÃO": `Resolvido ${n}`,
      "Primeira vez que entrou na fase Infra/Interno": wall(`2026-07-${day}T09:00:00`),
      "Etiquetas": "Alta prioridade, Concluído",
    });
  });
}

describe("wallClockToInstant", () => {
  it("lê o horário de parede como hora de Brasília (UTC-3)", () => {
    const instant = wallClockToInstant(wall("2026-07-30T14:24:39"), "America/Sao_Paulo");
    expect(instant.toISOString()).toBe("2026-07-30T17:24:39.000Z");
  });

  it("preserva os milissegundos", () => {
    const instant = wallClockToInstant(
      new Date("2026-07-30T14:24:39.651Z"),
      "America/Sao_Paulo",
    );
    expect(instant.toISOString()).toBe("2026-07-30T17:24:39.651Z");
  });
});

describe("buildPlan — fidelidade dos dados", () => {
  const headers = [
    "Título",
    "Fase atual",
    "Criado em",
    "Primeira vez que entrou na fase Nova",
    "NÚMERO DA PROPOSTA",
    "NÚMERO",
    "CEP",
    "DATA DE NASCIMENTO",
    "QUANTIDADE",
  ];

  const rows: Row[] = Array.from({ length: 8 }, (_, i) => {
    const created = wall("2026-07-02T08:00:00");
    const base: Record<string, string | number | Date | null> = {
      "Título": `Cliente ${i}`,
      "Fase atual": "Nova",
      "Criado em": created,
      "Primeira vez que entrou na fase Nova": created,
      "NÚMERO DA PROPOSTA": `03013${i}`,
      "NÚMERO": i === 7 ? "S/N" : String(3540 + i),
      "CEP": `3014010${i}`,
      "DATA DE NASCIMENTO": "1972-03-31",
      "QUANTIDADE": i + 1,
    };
    return headers.map((header) => base[header] ?? null);
  });

  const result = buildPlan([headers, ...rows], {});
  const field = (label: string) => result.fields.find((f) => f.label === label)!;

  it("não transforma identificador em número: o zero à esquerda é parte do valor", () => {
    expect(field("NÚMERO DA PROPOSTA").type).toBe("short_text");
    expect(result.cards[0].values[field("NÚMERO DA PROPOSTA").key]).toBe("030130");
    expect(field("CEP").type).toBe("short_text");
  });

  it("mantém como texto a coluna que mistura números e 'S/N', sem descartar nada", () => {
    const numero = field("NÚMERO");
    expect(numero.type).toBe("short_text");
    expect(result.cards[7].values[numero.key]).toBe("S/N");
    expect(result.warnings.join(" ")).not.toMatch(/número\(s\) não puderam/);
  });

  it("trata data escrita como texto como data, no horário de Brasília", () => {
    const nascimento = field("DATA DE NASCIMENTO");
    expect(nascimento.type).toBe("date");
    expect(result.cards[0].values[nascimento.key]).toBe("1972-03-31T03:00:00.000Z");
  });

  it("continua inferindo número quando a coluna é de fato numérica", () => {
    expect(field("QUANTIDADE").type).toBe("number");
    expect(result.cards[2].values[field("QUANTIDADE").key]).toBe(3);
  });
});

describe("buildPlan — fases terminais, colunas repetidas e lixo", () => {
  const headers = [
    "Título",
    "Fase atual",
    "Criador",
    "Criado em",
    "Finalizado em",
    "Primeira vez que entrou na fase Nova",
    "Primeira vez que entrou na fase Contrato perdido",
    "Primeira vez que entrou na fase Concluído",
    "CPF:",
    "CPF",
    "FIXO DDD:",
    "SE SIM, INFORMAR:",
  ];

  function contractRow(n: number, phase: "Nova" | "Contrato perdido" | "Concluído"): Row {
    const day = String(n + 1).padStart(2, "0");
    const created = wall(`2026-07-${day}T08:00:00`);
    const done = phase === "Nova" ? null : wall(`2026-07-${day}T10:00:00`);

    const base: Record<string, string | number | Date | null> = {
      "Título": `Cliente ${n}`,
      "Fase atual": phase,
      "Criador": "Pipebot",
      "Criado em": created,
      "Finalizado em": done,
      "Primeira vez que entrou na fase Nova": created,
      "Primeira vez que entrou na fase Contrato perdido": phase === "Contrato perdido" ? done : null,
      "Primeira vez que entrou na fase Concluído": phase === "Concluído" ? done : null,
      "CPF:": `863.136.906-${String(10 + n)}`,
      "CPF": n % 2 === 0 ? `https://app.pipefy.com/storage/v1/signed/uploads/x/doc${n}.pdf?expires_on=1` : null,
      "FIXO DDD:": `+55 31 3201-${String(7000 + n)}`,
      "SE SIM, INFORMAR:": n === 1 ? "Substitui o contrato 123" : n === 2 ? "Particularidade X" : ",",
    };
    return headers.map((header) => base[header] ?? null);
  }

  const rows: Row[] = [
    ...Array.from({ length: 4 }, (_, i) => contractRow(i + 1, "Contrato perdido")),
    ...Array.from({ length: 6 }, (_, i) => contractRow(i + 5, "Concluído")),
    ...Array.from({ length: 2 }, (_, i) => contractRow(i + 11, "Nova")),
  ];

  const result = buildPlan([headers, ...rows], { board: { name: "Contratos", visibility: "private" } });

  it("reconhece como final a fase terminal que não tem 'concluído' no nome", () => {
    const lost = result.phases.find((phase) => phase.name === "Contrato perdido")!;
    const open = result.phases.find((phase) => phase.name === "Nova")!;

    expect(lost.isFinal).toBe(true);
    expect(open.isFinal).toBe(false);
    expect(open.isInitial).toBe(true);
    expect(result.cards.filter((card) => card.phase === "Contrato perdido").every((card) => card.status === "completed")).toBe(true);
    expect(result.cards.filter((card) => card.phase === "Nova").every((card) => card.status === "active")).toBe(true);
  });

  it("diferencia dois campos com o mesmo nome", () => {
    const labels = result.fields.map((field) => field.label);

    expect(labels).toContain("CPF");
    expect(labels).toContain("CPF (anexo)");
    expect(new Set(labels).size).toBe(labels.length);
    expect(result.fields.find((field) => field.label === "CPF (anexo)")!.type).toBe("attachment");
  });

  it("só trata como telefone quando o nome da coluna também indica", () => {
    expect(result.fields.find((field) => field.label === "FIXO DDD")!.type).toBe("phone");
    // O CPF tem formato parecido com o de um telefone, mas é texto.
    expect(result.fields.find((field) => field.label === "CPF")!.type).toBe("short_text");
  });

  it("descarta valores feitos só de pontuação e não torna o campo obrigatório", () => {
    const optional = result.fields.find((field) => field.label.startsWith("SE SIM"))!;

    expect(optional.filled).toBe(2);
    expect(optional.required).toBe(false);
    expect(result.cards[0].values[optional.key]).toBe("Substitui o contrato 123");
    expect(result.cards[3].values[optional.key]).toBeUndefined();
  });

  it("propaga a visibilidade do quadro", () => {
    expect(result.board.visibility).toBe("private");
  });
});

describe("buildPlan", () => {
  const plan = buildPlan(sheet(sampleRows()), { board: { name: "Chamados TI" } });

  it("descobre a ordem das fases e marca inicial e final", () => {
    expect(plan.phases.map((phase) => phase.name)).toEqual([
      "Triagem",
      "Infra/Interno",
      "Concluidos",
    ]);
    expect(plan.phases[0].isInitial).toBe(true);
    expect(plan.phases[2].isFinal).toBe(true);
    expect(plan.phases[1]).toMatchObject({ isInitial: false, isFinal: false });
  });

  it("converte datas do horário de Brasília e numera por ordem de criação", () => {
    const first = plan.cards.find((c) => c.title === "Chamado 1")!;
    expect(first.number).toBe(1);
    expect(first.createdAt.toISOString()).toBe("2026-07-02T11:00:00.000Z");
    expect(plan.cards.find((c) => c.title === "Chamado 12")!.number).toBe(12);
  });

  it("conclui cards na fase final e guarda a data de conclusão", () => {
    const done = plan.cards[0];
    expect(done.status).toBe("completed");
    expect(done.completedAt?.toISOString()).toBe("2026-07-02T13:00:00.000Z");
  });

  it("deixa o concluído mais recente no topo da fase final", () => {
    const final = plan.cards.filter((c) => c.phase === "Concluidos");
    const top = final.find((c) => c.position === 0)!;
    expect(top.title).toBe("Chamado 12");
  });

  it("mapeia etiquetas para prioridade e informa as que não têm equivalente", () => {
    expect(plan.cards.find((c) => c.title === "Chamado 1")!.priority).toBe("high");
    expect(plan.cards.find((c) => c.title === "Chamado 9")!.priority).toBe("medium");
    expect(plan.summary.ignoredLabels["Concluído"]).toBe(12);
  });

  it("descarta a coluna que repete o título e usa o rótulo dela no formulário", () => {
    expect(plan.skippedColumns).toContainEqual({
      column: "Qual o assunto do seu pedido?",
      reason: 'repete "Título"',
    });
    expect(plan.form?.fields.find((field) => field.targetField === "title")).toMatchObject({
      label: "Qual o assunto do seu pedido?",
    });
  });

  it("infere select para coluna de poucos valores repetidos", () => {
    const setor = plan.fields.find((field) => field.label === "Setor")!;
    expect(setor.type).toBe("select");
    expect(setor.options).toEqual(["Financeiro", "RH"]);
  });

  it("liga o campo preenchido só numa fase à fase certa", () => {
    const conclusao = plan.fields.find((field) => field.label === "CONCLUSÃO")!;
    expect(conclusao.phase).toBe("Infra/Interno");
    expect(conclusao.inForm).toBe(false);
    expect(conclusao.type).toBe("short_text");
  });

  it("trata campo do formulário inicial como geral", () => {
    const setor = plan.fields.find((field) => field.label === "Setor")!;
    expect(setor.phase).toBeNull();
    expect(setor.inForm).toBe(true);
    expect(setor.required).toBe(true);
  });

  it("separa solicitante e descrição dos campos personalizados", () => {
    const card1 = plan.cards.find((c) => c.title === "Chamado 1")!;
    expect(card1.requesterName).toBe("Pessoa 1");
    expect(card1.requesterEmail).toBe("pessoa1@empresa.com.br");
    expect(card1.description).toBe("Detalhe do chamado 1");
    expect(plan.fields.some((field) => /solicitante|detalhes/i.test(field.label))).toBe(false);
  });

  it("guarda o código do Pipefy para rastreio", () => {
    const code = plan.fields.find((field) => field.label === "Código Pipefy")!;
    const card1 = plan.cards.find((c) => c.title === "Chamado 1")!;
    expect(card1.values[code.key]).toBe("1001");
  });

  it("reconstrói o histórico com eventos marcados como importados", () => {
    const passou = plan.cards.find((c) => c.title === "Chamado 1")!;
    expect(passou.events.map((event) => event.type)).toEqual([
      "card.created",
      "card.moved",
      "card.moved",
      "card.completed",
    ]);
    expect(passou.events.every((event) => event.metadata.imported === true)).toBe(true);
    expect(passou.events[1].metadata).toMatchObject({
      fromPhaseName: "Triagem",
      toPhaseName: "Infra/Interno",
    });
  });

  it("monta o formulário inicial na ordem das colunas", () => {
    // Mesma ordem das colunas da planilha sintética (Setor vem antes do nome).
    expect(plan.form?.fields.map((field) => field.label)).toEqual([
      "Setor",
      "Nome do Solicitante",
      "E-mail do Solicitante",
      "Detalhes da Solicitação",
      "Qual o assunto do seu pedido?",
    ]);
    expect(plan.form?.requireRequesterEmail).toBe(true);
    expect(plan.form?.targetPhase).toBe("Triagem");
  });

  it("marca como manual o card criado por pessoa e guarda quem criou", () => {
    const rows = sampleRows();
    rows[0] = card(1, { "Criador": "Bruna Araújo" });
    const result = buildPlan(sheet(rows), {});

    const manual = result.cards.find((c) => c.title === "Chamado 1")!;
    expect(manual.source).toBe("manual");
    expect(manual.events[0].metadata.importedCreator).toBe("Bruna Araújo");
    expect(result.fields.some((field) => field.label === "Criado por (Pipefy)")).toBe(true);
  });

  it("acrescenta a movimentação final quando o histórico termina fora da fase atual", () => {
    const rows = sampleRows();
    // Terminou em Infra/Interno no histórico, mas a fase atual é Concluidos.
    rows[0] = card(1, {
      "Primeira vez que entrou na fase Infra/Interno": wall("2026-07-02T12:00:00"),
      "Primeira vez que entrou na fase Concluidos": wall("2026-07-02T10:00:00"),
    });
    const result = buildPlan(sheet(rows), {});

    const fixed = result.cards.find((c) => c.title === "Chamado 1")!;
    const last = fixed.events[fixed.events.length - 1];
    expect(fixed.phase).toBe("Concluidos");
    expect(result.warnings.join(" ")).toMatch(/última fase do histórico/);
    expect(["card.moved", "card.completed"]).toContain(last.type);
  });

  it("rejeita relatório sem as colunas do Pipefy", () => {
    expect(() => buildPlan([["a", "b"], [1, 2]], {})).toThrow(/Coluna obrigatória/);
  });

  it("respeita a ordem de fases e o tipo informados no mapeamento", () => {
    const result = buildPlan(sheet(sampleRows()), {
      phaseOrder: ["Triagem", "Infra/Interno", "Concluidos"],
      fieldTypes: { Setor: "short_text" },
    });
    expect(result.fields.find((field) => field.label === "Setor")!.type).toBe("short_text");
  });
});
