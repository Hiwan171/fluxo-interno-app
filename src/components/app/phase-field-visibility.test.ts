import { describe, expect, it } from "vitest";

import {
  hasFieldValue,
  isFieldVisibleOnCard,
} from "@/components/app/phase-field-visibility";

describe("isFieldVisibleOnCard", () => {
  it("mostra campo sem fase em qualquer fase, mesmo vazio", () => {
    expect(isFieldVisibleOnCard({ phaseId: null }, "triagem", undefined)).toBe(true);
    expect(isFieldVisibleOnCard({}, "concluidos", null)).toBe(true);
  });

  it("mostra campo da fase atual mesmo vazio, para poder preencher", () => {
    expect(isFieldVisibleOnCard({ phaseId: "infra" }, "infra", null)).toBe(true);
  });

  it("mantém visível o campo de uma fase anterior que tem valor", () => {
    expect(
      isFieldVisibleOnCard({ phaseId: "infra" }, "concluidos", "Office ativado"),
    ).toBe(true);
  });

  it("oculta campo de fase que o card não alcançou (vazio)", () => {
    expect(isFieldVisibleOnCard({ phaseId: "compras" }, "triagem", undefined)).toBe(false);
    expect(isFieldVisibleOnCard({ phaseId: "compras" }, "triagem", "")).toBe(false);
  });
});

describe("hasFieldValue", () => {
  it("trata nulo, vazio e lista vazia como sem valor", () => {
    expect(hasFieldValue(null)).toBe(false);
    expect(hasFieldValue(undefined)).toBe(false);
    expect(hasFieldValue("")).toBe(false);
    expect(hasFieldValue([])).toBe(false);
  });

  it("trata anexos pelo conteúdo, não pela existência do objeto", () => {
    expect(hasFieldValue({ files: [] })).toBe(false);
    expect(hasFieldValue({ attachmentIds: [] })).toBe(false);
    expect(hasFieldValue({ files: [{ id: "1" }] })).toBe(true);
    expect(hasFieldValue({ attachmentIds: ["1"] })).toBe(true);
  });

  it("aceita zero e falso como valores reais", () => {
    expect(hasFieldValue(0)).toBe(true);
    expect(hasFieldValue(false)).toBe(true);
  });
});
