import { describe, expect, it } from "vitest";

import {
  formatMoneyWithWords,
  formatQuantityWithWords,
  integerToWords,
  moneyToWords,
} from "@/lib/contracts/words";

describe("integerToWords", () => {
  it.each([
    [0, "zero"],
    [1, "um"],
    [5, "cinco"],
    [11, "onze"],
    [20, "vinte"],
    [21, "vinte e um"],
    [100, "cem"],
    [101, "cento e um"],
    [120, "cento e vinte"],
    [190, "cento e noventa"],
    [999, "novecentos e noventa e nove"],
    [1000, "mil"],
    [1050, "mil e cinquenta"],
    [1500, "mil e quinhentos"],
    [1250, "mil duzentos e cinquenta"],
    [2000, "dois mil"],
    [2050, "dois mil e cinquenta"],
    [10_000, "dez mil"],
    [1_000_000, "um milhão"],
    [2_000_050, "dois milhões e cinquenta"],
  ])("%i → %s", (value, expected) => {
    expect(integerToWords(value)).toBe(expected);
  });

  it("recusa valores que não são inteiros não negativos", () => {
    expect(() => integerToWords(-1)).toThrow(RangeError);
    expect(() => integerToWords(1.5)).toThrow(RangeError);
    expect(() => integerToWords(Number.NaN)).toThrow(RangeError);
  });
});

describe("moneyToWords", () => {
  it("escreve reais inteiros", () => {
    expect(moneyToWords(120)).toBe("Cento e vinte reais");
    expect(moneyToWords(190)).toBe("Cento e noventa reais");
    expect(moneyToWords(1)).toBe("Um real");
  });

  it("escreve centavos, sem erro de ponto flutuante", () => {
    expect(moneyToWords(8.5)).toBe("Oito reais e cinquenta centavos");
    expect(moneyToWords(7.5)).toBe("Sete reais e cinquenta centavos");
    expect(moneyToWords(0.29)).toBe("Vinte e nove centavos");
    expect(moneyToWords(0.01)).toBe("Um centavo");
    expect(moneyToWords(19.95)).toBe("Dezenove reais e noventa e cinco centavos");
  });

  it("usa 'de reais' em milhões redondos", () => {
    expect(moneyToWords(1_000_000)).toBe("Um milhão de reais");
  });

  it("trata zero", () => {
    expect(moneyToWords(0)).toBe("Zero real");
  });
});

describe("formatMoneyWithWords", () => {
  it("segue o estilo do contrato", () => {
    expect(formatMoneyWithWords(120)).toBe("R$ 120,00 (Cento e vinte reais)");
    expect(formatMoneyWithWords(8.5)).toBe(
      "R$ 8,50 (Oito reais e cinquenta centavos)",
    );
  });

  it("usa separador de milhar", () => {
    expect(formatMoneyWithWords(1500)).toBe("R$ 1.500,00 (Mil e quinhentos reais)");
  });
});

describe("formatQuantityWithWords", () => {
  it("escreve a quantidade com o extenso entre parênteses", () => {
    expect(formatQuantityWithWords(5)).toBe("5 (Cinco)");
    expect(formatQuantityWithWords(100)).toBe("100 (Cem)");
  });
});
