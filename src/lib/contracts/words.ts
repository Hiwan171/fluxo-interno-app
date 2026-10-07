/**
 * Números por extenso em português do Brasil, no estilo dos contratos:
 * "R$ 120,00 (Cento e vinte reais)" e "5 (Cinco) quilos".
 *
 * Sem dependências e sem I/O — é lógica pura para poder ser testada à parte.
 */

const UNITS = [
  "zero",
  "um",
  "dois",
  "três",
  "quatro",
  "cinco",
  "seis",
  "sete",
  "oito",
  "nove",
  "dez",
  "onze",
  "doze",
  "treze",
  "quatorze",
  "quinze",
  "dezesseis",
  "dezessete",
  "dezoito",
  "dezenove",
];

const TENS = [
  "",
  "",
  "vinte",
  "trinta",
  "quarenta",
  "cinquenta",
  "sessenta",
  "setenta",
  "oitenta",
  "noventa",
];

const HUNDREDS = [
  "",
  "cento",
  "duzentos",
  "trezentos",
  "quatrocentos",
  "quinhentos",
  "seiscentos",
  "setecentos",
  "oitocentos",
  "novecentos",
];

/** Maior valor suportado; acima disso o texto fica ilegível e é quase certo um erro de digitação. */
const MAX_SUPPORTED = 999_999_999_999;

/** 0–999 por extenso. */
function belowThousand(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "cem";

  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];

  if (hundreds > 0) parts.push(HUNDREDS[hundreds]);

  if (rest > 0) {
    if (rest < 20) {
      parts.push(UNITS[rest]);
    } else {
      const ten = Math.floor(rest / 10);
      const unit = rest % 10;
      parts.push(unit === 0 ? TENS[ten] : `${TENS[ten]} e ${UNITS[unit]}`);
    }
  }

  return parts.join(" e ");
}

const SCALES: Array<{ value: number; singular: string; plural: string }> = [
  { value: 1_000_000_000, singular: "bilhão", plural: "bilhões" },
  { value: 1_000_000, singular: "milhão", plural: "milhões" },
  { value: 1_000, singular: "mil", plural: "mil" },
];

/**
 * Inteiro não negativo por extenso, em minúsculas. Lança para valores fora do
 * intervalo, em vez de devolver um texto errado que iria para um contrato.
 */
export function integerToWords(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > MAX_SUPPORTED) {
    throw new RangeError(`Número fora do intervalo suportado: ${value}`);
  }

  if (value === 0) return UNITS[0];

  const chunks: string[] = [];
  let remainder = value;

  for (const scale of SCALES) {
    const count = Math.floor(remainder / scale.value);
    if (count === 0) continue;

    remainder %= scale.value;

    if (scale.value === 1_000 && count === 1) {
      chunks.push("mil");
    } else {
      chunks.push(
        `${belowThousand(count)} ${count === 1 ? scale.singular : scale.plural}`,
      );
    }
  }

  if (remainder > 0) chunks.push(belowThousand(remainder));

  // "e" liga a última parcela quando ela é menor que cem ou é centena exata
  // ("mil e quinhentos", "dois mil e cinquenta"); nos demais casos só espaço
  // ("mil duzentos e trinta").
  if (chunks.length === 1) return chunks[0];

  const last = value % 1_000;
  const joinsWithE = last > 0 && (last < 100 || last % 100 === 0);
  const head = chunks.slice(0, -1).join(" ");

  return joinsWithE
    ? `${head} e ${chunks[chunks.length - 1]}`
    : `${head} ${chunks[chunks.length - 1]}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "5" → "Cinco". */
export function capitalizedWords(value: number): string {
  return capitalize(integerToWords(value));
}

/**
 * Valor em reais por extenso: 120 → "Cento e vinte reais";
 * 8.5 → "Oito reais e cinquenta centavos"; 0.5 → "Cinquenta centavos".
 */
export function moneyToWords(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new RangeError(`Valor monetário inválido: ${amount}`);
  }

  // Trabalhar em centavos inteiros evita 8.5 * 100 = 849.9999… em ponto flutuante.
  const totalCents = Math.round(amount * 100);
  const reais = Math.floor(totalCents / 100);
  const cents = totalCents % 100;

  const parts: string[] = [];

  if (reais > 0) {
    // "um milhão de reais": a preposição entra quando o valor termina em
    // milhão/bilhão redondo.
    const needsDe = reais % 1_000_000 === 0;
    parts.push(
      `${integerToWords(reais)}${needsDe ? " de" : ""} ${reais === 1 ? "real" : "reais"}`,
    );
  }

  if (cents > 0) {
    parts.push(`${integerToWords(cents)} ${cents === 1 ? "centavo" : "centavos"}`);
  }

  if (parts.length === 0) return "Zero real";

  return capitalize(parts.join(" e "));
}

const BRL = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 120 → "R$ 120,00 (Cento e vinte reais)". */
export function formatMoneyWithWords(amount: number): string {
  return `R$ ${BRL.format(amount)} (${moneyToWords(amount)})`;
}

/** 5 → "5 (Cinco)". Para quantidades inteiras (quilos, litros). */
export function formatQuantityWithWords(quantity: number): string {
  return `${quantity} (${capitalizedWords(quantity)})`;
}
