import { describe, expect, it } from "vitest";

import { buildKanbanCards, type CardExtras, type CardRow } from "@/lib/card-dto";

const row: CardRow = {
  id: "c1",
  phaseId: "p1",
  number: 270,
  title: "EMISSAO DE NOTA FISCAL",
  description: "Tentei autorizar a NF",
  priority: "high",
  dueAt: null,
  phaseEnteredAt: new Date("2026-07-02T10:00:00.000Z"),
};

const empty: CardExtras = { assignees: [], fieldValues: [], attachments: [], emailCounts: [] };

describe("buildKanbanCards", () => {
  it("monta o card com referência e prazo vazio quando não há expiração", () => {
    const [card] = buildKanbanCards([row], empty, null);

    expect(card).toMatchObject({
      id: "c1",
      columnId: "p1",
      reference: "#270",
      priority: "high",
      dueDate: null,
      phaseDeadline: null,
      customFieldValues: {},
      emailCount: 0,
      attachmentCount: 0,
    });
  });

  it("traz os valores dos campos, que a busca antes deixava de fora", () => {
    const [card] = buildKanbanCards(
      [row],
      { ...empty, fieldValues: [{ cardId: "c1", customFieldId: "f-categoria", value: "SupraMAIS" }] },
      null,
    );

    expect(card.customFieldValues).toEqual({ "f-categoria": "SupraMAIS" });
  });

  it("resolve anexos para arquivos e conta quantos há", () => {
    const [card] = buildKanbanCards(
      [row],
      {
        ...empty,
        attachments: [{ id: "a1", fileName: "print.png", mimeType: "image/png", sizeBytes: 10 }],
        fieldValues: [{ cardId: "c1", customFieldId: "f-print", value: { attachmentIds: ["a1", "inexistente"] } }],
      },
      null,
    );

    const value = card.customFieldValues?.["f-print"] as { files: Array<{ id: string }> };
    expect(value.files.map((file) => file.id)).toEqual(["a1"]);
    expect(card.attachmentCount).toBe(1);
  });

  it("calcula o prazo da fase a partir da entrada", () => {
    const [card] = buildKanbanCards([row], empty, 60);
    expect(card.phaseDeadline).toBe("2026-07-02T11:00:00.000Z");
  });

  it("agrupa responsáveis e contagem de e-mails por card", () => {
    const [card] = buildKanbanCards(
      [row],
      {
        ...empty,
        assignees: [{ cardId: "c1", userId: "u1", name: "Ana", avatarUrl: null }],
        emailCounts: [{ cardId: "c1", count: 3 }, { cardId: null, count: 9 }],
      },
      null,
    );

    expect(card.assignees).toEqual([{ id: "u1", name: "Ana", avatarUrl: null }]);
    expect(card.emailCount).toBe(3);
  });
});
