import { describe, expect, it } from "vitest";

import { renderEmailTemplate } from "./email-template";

describe("renderEmailTemplate", () => {
  it("substitui apenas variáveis explicitamente fornecidas", () => {
    expect(
      renderEmailTemplate("Olá, {{ card.title }} (#{{card.number}})", {
        "card.title": "Solicitação de compra",
        "card.number": 42,
      }),
    ).toBe("Olá, Solicitação de compra (#42)");
  });

  it("remove variáveis ausentes sem avaliar código", () => {
    expect(
      renderEmailTemplate("{{constructor.constructor}} {{missing}} {{card.title}}", {
        "card.title": "Seguro",
      }),
    ).toBe("  Seguro");
  });
});

