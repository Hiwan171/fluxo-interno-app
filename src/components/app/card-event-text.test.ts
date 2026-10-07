import { describe, expect, it } from "vitest";

import { describeCardEvent } from "@/components/app/card-event-text";
import type { CardHistoryDTO } from "@/components/app/types";

function entry(overrides: Partial<CardHistoryDTO> = {}): CardHistoryDTO {
  return {
    id: "1",
    type: "card.created",
    metadata: {},
    actorName: "Ana",
    occurredAt: "2026-08-24T12:00:00.000Z",
    ...overrides,
  };
}

describe("describeCardEvent", () => {
  it("descreve a geração de contrato com o nome do arquivo", () => {
    expect(
      describeCardEvent(
        entry({
          type: "card.contract_generated",
          metadata: { fileName: "Contrato - Acme.pdf" },
        }),
      ),
    ).toBe('Ana gerou o contrato "Contrato - Acme.pdf"');
  });

  it("descreve criação com a fase de entrada", () => {
    expect(
      describeCardEvent(entry({ metadata: { phaseName: "Triagem" } })),
    ).toBe('Ana criou o card em "Triagem"');
  });

  it("identifica card vindo do formulário público", () => {
    expect(
      describeCardEvent(
        entry({ actorName: null, metadata: { formName: "Suporte" } }),
      ),
    ).toBe('Card criado pelo formulário "Suporte"');
  });

  it("descreve movimentação entre fases", () => {
    expect(
      describeCardEvent(
        entry({
          type: "card.moved",
          metadata: { fromPhaseName: "Triagem", toPhaseName: "Em análise" },
        }),
      ),
    ).toBe('Ana moveu de "Triagem" para "Em análise"');
  });

  it("nomeia o ator anônimo quando não há usuário", () => {
    expect(
      describeCardEvent(entry({ type: "card.archived", actorName: null })),
    ).toBe("Alguém pelo formulário público arquivou o card");
  });

  it("aceita metadata incompleto sem quebrar", () => {
    // Eventos gravados antes de o formato mudar precisam continuar exibíveis.
    expect(describeCardEvent(entry({ type: "card.moved", metadata: {} }))).toBe(
      "Ana moveu o card de fase",
    );
  });

  describe("eventos importados", () => {
    it("não atribui a movimentação a um autor inexistente", () => {
      expect(
        describeCardEvent(
          entry({
            type: "card.moved",
            actorName: null,
            metadata: {
              imported: true,
              fromPhaseName: "Triagem",
              toPhaseName: "Infra/Interno",
            },
          }),
        ),
      ).toBe('Movido de "Triagem" para "Infra/Interno" (histórico do Pipefy)');
    });

    it("identifica card aberto pelo formulário", () => {
      expect(
        describeCardEvent(
          entry({
            actorName: null,
            metadata: { imported: true, source: "form", phaseName: "Triagem" },
          }),
        ),
      ).toBe("Card aberto pelo formulário (importado do Pipefy)");
    });

    it("cita o criador original quando o card foi aberto manualmente", () => {
      expect(
        describeCardEvent(
          entry({
            actorName: null,
            metadata: {
              imported: true,
              source: "manual",
              importedCreator: "Bruna Araújo",
              phaseName: "Triagem",
            },
          }),
        ),
      ).toBe('Bruna Araújo criou o card em "Triagem" (importado do Pipefy)');
    });

    it("cai no texto padrão para tipos sem versão importada", () => {
      expect(
        describeCardEvent(
          entry({
            type: "card.completed",
            actorName: null,
            metadata: { imported: true, phaseName: "Concluidos" },
          }),
        ),
      ).toBe('Card concluído ao entrar em "Concluidos"');
    });
  });

  it("tem texto genérico para tipo desconhecido", () => {
    expect(describeCardEvent(entry({ type: "card.algo_novo" }))).toBe(
      "Ana registrou uma alteração",
    );
  });
});
