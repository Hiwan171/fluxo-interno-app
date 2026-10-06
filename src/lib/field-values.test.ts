import { describe, expect, it } from "vitest";

import {
  FieldValidationError,
  normalizeFieldValue,
  normalizeFieldValues,
  type FieldDefinition,
} from "@/lib/field-values";

function field(overrides: Partial<FieldDefinition> = {}): FieldDefinition {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    label: "Campo",
    type: "short_text",
    config: {},
    isRequired: false,
    ...overrides,
  };
}

describe("normalizeFieldValue", () => {
  it("recusa texto acima do limite do tipo", () => {
    expect(() =>
      normalizeFieldValue(field({ type: "short_text" }), "a".repeat(501)),
    ).toThrow(FieldValidationError);
  });

  it("aceita texto longo até o limite maior", () => {
    const value = normalizeFieldValue(
      field({ type: "long_text" }),
      "a".repeat(20_000),
    );

    expect(value).toHaveLength(20_000);
  });

  it("converte número enviado como texto pelo formulário", () => {
    expect(normalizeFieldValue(field({ type: "number" }), " 42 ")).toBe(42);
  });

  it("recusa texto onde se espera número", () => {
    expect(() =>
      normalizeFieldValue(field({ type: "number" }), "quarenta e dois"),
    ).toThrow(FieldValidationError);
  });

  it("respeita mínimo e máximo configurados", () => {
    const bounded = field({ type: "number", config: { min: 1, max: 10 } });

    expect(normalizeFieldValue(bounded, 5)).toBe(5);
    expect(() => normalizeFieldValue(bounded, 0)).toThrow(FieldValidationError);
    expect(() => normalizeFieldValue(bounded, 11)).toThrow(FieldValidationError);
  });

  it("recusa opção fora da lista configurada", () => {
    const select = field({
      type: "select",
      config: { options: [{ label: "Alta", value: "alta" }] },
    });

    expect(normalizeFieldValue(select, "alta")).toBe("alta");
    expect(() => normalizeFieldValue(select, "inventada")).toThrow(
      FieldValidationError,
    );
  });

  it("recusa URL com esquema perigoso", () => {
    const url = field({ type: "url" });

    expect(normalizeFieldValue(url, "https://exemplo.com/a")).toBe(
      "https://exemplo.com/a",
    );
    // A interface renderiza este valor como link; `javascript:` viraria XSS.
    expect(() => normalizeFieldValue(url, "javascript:alert(1)")).toThrow(
      FieldValidationError,
    );
  });

  it("exige valor quando o campo é obrigatório", () => {
    expect(() =>
      normalizeFieldValue(field({ isRequired: true }), ""),
    ).toThrow(FieldValidationError);

    expect(normalizeFieldValue(field({ isRequired: false }), "")).toBeNull();
  });
});

describe("normalizeFieldValues", () => {
  it("recusa id de campo que não pertence ao quadro", () => {
    const definitions = [field({ id: "aaaaaaaa-0000-0000-0000-000000000001" })];

    expect(() =>
      normalizeFieldValues(definitions, {
        "bbbbbbbb-0000-0000-0000-000000000002": "valor",
      }),
    ).toThrow(FieldValidationError);
  });

  it("normaliza os valores dos campos conhecidos", () => {
    const definitions = [
      field({ id: "aaaaaaaa-0000-0000-0000-000000000001", type: "number" }),
      field({ id: "aaaaaaaa-0000-0000-0000-000000000002", type: "checkbox" }),
    ];

    expect(
      normalizeFieldValues(definitions, {
        "aaaaaaaa-0000-0000-0000-000000000001": "7",
        "aaaaaaaa-0000-0000-0000-000000000002": "true",
      }),
    ).toEqual({
      "aaaaaaaa-0000-0000-0000-000000000001": 7,
      "aaaaaaaa-0000-0000-0000-000000000002": true,
    });
  });
});
