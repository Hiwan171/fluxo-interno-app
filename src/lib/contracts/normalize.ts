/**
 * Normalização dos dados do card para o texto do contrato.
 *
 * O card chega como veio do Pipefy: em maiúsculas, abreviado ("R MARIA..."),
 * com CPF sem o zero à esquerda, estado escrito de cinco jeitos. Estas funções
 * só *sugerem* o texto — a tela de revisão mostra o resultado e quem gera o
 * contrato pode corrigir antes. Por isso, quando não há como decidir com
 * segurança (ex.: "cliente não soube informar"), devolvem vazio em vez de
 * inventar um valor.
 */

const TIME_ZONE = "America/Sao_Paulo";

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Remove acentos e põe em minúsculas, para comparar texto sem se importar com grafia. */
export function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// ---------------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------------

/**
 * O export do Pipefy perde zeros à esquerda ("12.345.678-90" em vez de
 * "012.345.678-90"), então completa até 11 dígitos antes de formatar. Se o
 * número tiver tamanho impossível, devolve o texto original e deixa a revisão
 * decidir.
 */
export function formatCpf(raw: string): string {
  const digits = onlyDigits(raw);

  if (digits.length === 0 || digits.length > 11) return collapseSpaces(raw);

  const padded = digits.padStart(11, "0");

  return `${padded.slice(0, 3)}.${padded.slice(3, 6)}.${padded.slice(6, 9)}-${padded.slice(9)}`;
}

/** CNPJ com 14 dígitos; completa com zeros à esquerda pelo mesmo motivo do CPF. */
export function formatCnpj(raw: string): string {
  const digits = onlyDigits(raw);

  if (digits.length === 0 || digits.length > 14) return collapseSpaces(raw);

  const padded = digits.padStart(14, "0");

  return `${padded.slice(0, 2)}.${padded.slice(2, 5)}.${padded.slice(5, 8)}/${padded.slice(8, 12)}-${padded.slice(12)}`;
}

/** Os contratos escrevem o CEP com ponto: "35.670-000". */
export function formatCep(raw: string): string {
  const digits = onlyDigits(raw);

  if (digits.length !== 8) return collapseSpaces(raw);

  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}-${digits.slice(5)}`;
}

/**
 * Inscrições. "0", "isenta", "não possui" e variações significam que o cliente
 * não tem inscrição — o contrato escreve "isento". "Cliente não soube
 * informar" é ausência de informação, não isenção: fica em branco para a
 * revisão preencher (declarar isenção que ninguém confirmou seria afirmar um
 * fato falso num documento jurídico).
 */
export function normalizeInscricao(raw: string): string {
  const text = collapseSpaces(raw);
  const folded = foldText(text);

  if (!folded) return "";

  if (/n[aã]o\s+(sou|sob)e?\s+informar|nao\s+soube|n[aã]o\s+sabe|nao\s+informad[oa]/.test(folded)) {
    return "";
  }

  const isentoPatterns = [
    /^0+$/,
    /^-+$/,
    /^isent[oa]\.?$/,
    /^(ainda\s+)?nao\s+(possui|tem)(\s+ainda)?\.?$/,
    /^nao\s+(ha|existe)\.?$/,
  ];

  if (isentoPatterns.some((pattern) => pattern.test(folded))) return "isento";

  return text;
}

// ---------------------------------------------------------------------------
// Nomes e endereços
// ---------------------------------------------------------------------------

const LOWERCASE_PARTICLES = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "a",
  "o",
  "em",
  "no",
  "na",
  "nos",
  "nas",
  "para",
  "com",
]);

/** Siglas societárias e afins que devem permanecer em maiúsculas. */
const KEEP_UPPERCASE = new Set([
  "ME",
  "EPP",
  "MEI",
  "EIRELI",
  "SLU",
  "SS",
  "S/S",
  "S/A",
  "SA",
  "LTDA",
  "II",
  "III",
  "IV",
  "CNPJ",
  "CPF",
]);

const SPECIAL_CASE: Record<string, string> = {
  LTDA: "Ltda",
};

/**
 * "PETEXEMPLO CENTRO DE BEM ESTAR ANIMAL LTDA" → "Petexemplo Centro de Bem Estar
 * Animal Ltda". Só mexe em texto escrito todo em maiúsculas ou todo em
 * minúsculas: se a pessoa já digitou com capitalização mista, respeita.
 */
export function titleCasePt(raw: string): string {
  const text = collapseSpaces(raw);

  if (!text) return "";

  const hasLower = /[a-zà-ÿ]/.test(text);
  const hasUpper = /[A-ZÀ-Ý]/.test(text);

  if (hasLower && hasUpper) return text;

  return text
    .split(" ")
    .map((word, index) => {
      const upper = word.toUpperCase();

      if (SPECIAL_CASE[upper]) return SPECIAL_CASE[upper];
      if (KEEP_UPPERCASE.has(upper)) return upper;

      const lower = word.toLowerCase();

      if (index > 0 && LOWERCASE_PARTICLES.has(lower)) return lower;

      // Respeita hífen e apóstrofo: "d'água" → "D'água", "bom-jardim" → "Bom-Jardim".
      return lower.replace(
        /(^|[-'’/(])([a-zà-ÿ])/g,
        (_match, prefix: string, letter: string) =>
          `${prefix}${letter.toUpperCase()}`,
      );
    })
    .join(" ");
}

const STREET_PREFIXES: Array<[RegExp, string]> = [
  [/^(r|rua)\.?(?=\s)/i, "Rua"],
  [/^(av|avenida|avda)\.?(?=\s)/i, "Avenida"],
  [/^(al|alameda)\.?(?=\s)/i, "Alameda"],
  [/^(tv|trav|travessa)\.?(?=\s)/i, "Travessa"],
  [/^(pc|pça|pca|praca|praça)\.?(?=\s)/i, "Praça"],
  [/^(rod|rodovia)\.?(?=\s)/i, "Rodovia"],
  [/^(est|estr|estrada)\.?(?=\s)/i, "Estrada"],
  [/^(lg|largo)\.?(?=\s)/i, "Largo"],
  [/^(vl|viela)\.?(?=\s)/i, "Viela"],
];

/** "R DAS PALMEIRAS" → "Rua das Palmeiras". */
export function normalizeStreet(raw: string): string {
  const cased = titleCasePt(raw);

  if (!cased) return "";

  for (const [pattern, expanded] of STREET_PREFIXES) {
    if (pattern.test(cased)) {
      return cased.replace(pattern, expanded);
    }
  }

  return cased;
}

const UF_BY_NAME: Record<string, string> = {
  acre: "AC",
  alagoas: "AL",
  amapa: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceara: "CE",
  "distrito federal": "DF",
  "espirito santo": "ES",
  goias: "GO",
  maranhao: "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  para: "PA",
  paraiba: "PB",
  parana: "PR",
  pernambuco: "PE",
  piaui: "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  rondonia: "RO",
  roraima: "RR",
  "santa catarina": "SC",
  "sao paulo": "SP",
  sergipe: "SE",
  tocantins: "TO",
};

const VALID_UFS = new Set(Object.values(UF_BY_NAME));

/**
 * Typos que apareceram de verdade nos 10 mil cards ("mians gerais",
 * "minas gerias"). Tudo que começa com "min" e tem "ger" é Minas Gerais.
 */
function looksLikeMinasGerais(folded: string): boolean {
  return folded === "minas" || /^m[a-z]{3,5}\s+g[a-z]{3,5}$/.test(folded);
}

export function normalizeUf(raw: string): string {
  const folded = foldText(raw).replace(/\./g, "");

  if (!folded) return "";

  const asCode = folded.toUpperCase();
  if (VALID_UFS.has(asCode)) return asCode;

  if (UF_BY_NAME[folded]) return UF_BY_NAME[folded];

  if (looksLikeMinasGerais(folded)) return "MG";

  return "";
}

// ---------------------------------------------------------------------------
// Datas e telefones
// ---------------------------------------------------------------------------

const BR_DATE = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * Datas de nascimento chegam como instante ISO (meia-noite de São Paulo, que em
 * UTC é 03:00). Formatar no fuso certo evita o clássico "um dia antes".
 */
export function formatDateBr(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";

  if (typeof value === "string") {
    const text = value.trim();

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return text;

    // Data sem hora é um dia do calendário, não um instante: passar por `Date`
    // a trataria como meia-noite UTC e o fuso a empurraria para o dia anterior.
    const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  }

  const date = value instanceof Date ? value : new Date(String(value));

  if (Number.isNaN(date.getTime())) return "";

  return BR_DATE.format(date);
}

/** "+55 31 90000-0001" → "31 90000-0001". */
export function formatPhone(raw: string): string {
  const text = collapseSpaces(raw).replace(/^\+?55\s*/, "");

  return text.replace(/^\((\d{2})\)\s*/, "$1 ");
}

/** Junta celular e contato extra: "31 90000-0001 e 11 90000-0002". */
export function joinPhones(...phones: Array<string | null | undefined>): string {
  return phones
    .map((phone) => formatPhone(phone ?? ""))
    .filter(Boolean)
    .join(" e ");
}

// ---------------------------------------------------------------------------
// Cláusulas de coleta e preço
// ---------------------------------------------------------------------------

export type FrequencyKind = "recurring" | "single" | "unknown";

export type FrequencyResult = {
  /** Texto para a cláusula 1.2, no estilo "mensal (Uma vez por mês)". */
  text: string;
  kind: FrequencyKind;
};

type FrequencyEntry = {
  key: string;
  pattern: RegExp;
  /** Texto da cláusula 1.2 no modelo de saúde ("mensal (Uma vez por mês)"). */
  saude: string;
  /** Período de cobrança do modelo industrial: "por (bimestre)", "(bimestralmente)". */
  noun: string;
  adverb: string;
};

const FREQUENCIES: FrequencyEntry[] = [
  {
    key: "mensal",
    pattern: /^(mensal|mesal|mensall|mensais)\.?$/,
    saude: "mensal (Uma vez por mês)",
    noun: "mês",
    adverb: "mensalmente",
  },
  {
    key: "semanal",
    pattern: /^semanal\.?$/,
    saude: "semanal (Uma vez por semana)",
    noun: "semana",
    adverb: "semanalmente",
  },
  {
    key: "quinzenal",
    pattern: /^quinzenal(\.|\s*\(.*\))?$/,
    saude: "quinzenal (Uma vez a cada quinze dias)",
    noun: "quinzena",
    adverb: "quinzenalmente",
  },
  {
    key: "bimestral",
    pattern: /^bimestral$|^bimentral$|^bimenstral$/,
    saude: "bimestral (Uma vez a cada dois meses)",
    noun: "bimestre",
    adverb: "bimestralmente",
  },
  {
    key: "trimestral",
    pattern: /^trimestral$/,
    saude: "trimestral (Uma vez a cada três meses)",
    noun: "trimestre",
    adverb: "trimestralmente",
  },
  {
    key: "quadrimestral",
    pattern: /^quadrimestral$/,
    saude: "quadrimestral (Uma vez a cada quatro meses)",
    noun: "quadrimestre",
    adverb: "quadrimestralmente",
  },
  {
    key: "semestral",
    pattern: /^semestral$/,
    saude: "semestral (Uma vez a cada seis meses)",
    noun: "semestre",
    adverb: "semestralmente",
  },
  {
    key: "anual",
    pattern: /^anual$/,
    saude: "anual (Uma vez por ano)",
    noun: "ano",
    adverb: "anualmente",
  },
];

/**
 * Coleta única/avulsa é outro tipo de contrato (sem vigência nem renovação), e
 * estes modelos não cobrem. Sinaliza para a tela avisar em vez de gerar errado.
 */
const SINGLE_COLLECTION =
  /\b(unic[ao]|avuls[ao]|sob demanda|por demanda|eventual)\b/;

export function normalizeFrequency(
  raw: string,
  contractKind: "saude" | "industrial" = "saude",
): FrequencyResult {
  const text = collapseSpaces(raw);
  const folded = foldText(text);

  if (!folded) return { text: "", kind: "unknown" };

  for (const entry of FREQUENCIES) {
    if (entry.pattern.test(folded)) {
      // O modelo industrial escreve o mesmo texto da saúde, com inicial maiúscula
      // ("Trimestral (Uma vez a cada três meses)", contrato 36793).
      const text =
        contractKind === "industrial"
          ? entry.saude.charAt(0).toUpperCase() + entry.saude.slice(1)
          : entry.saude;

      return { text, kind: "recurring" };
    }
  }

  if (SINGLE_COLLECTION.test(folded)) return { text, kind: "single" };

  return { text, kind: "unknown" };
}

/**
 * Período de cobrança do modelo industrial, lido da primeira palavra do texto
 * da frequência ("bimestral (de dois em dois meses)" → bimestre/bimestralmente).
 * Nulo quando o texto não começa por uma frequência conhecida.
 */
export function billingPeriod(
  frequency: string,
): { noun: string; adverb: string } | null {
  const first = foldText(frequency).match(/^[a-z]+/)?.[0] ?? "";

  const entry = FREQUENCIES.find((candidate) => candidate.key === first);

  return entry ? { noun: entry.noun, adverb: entry.adverb } : null;
}

/**
 * "5kg", "5 quilos", "05", "5,00" → 5. Devolve null quando não há número ou
 * quando há mais de um (texto ambíguo que a revisão precisa resolver).
 */
export function parseQuantityKg(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;

  const matches = raw.match(/\d+(?:[.,]\d+)?/g);

  if (!matches || matches.length !== 1) return null;

  const value = Number(matches[0].replace(",", "."));

  return Number.isFinite(value) ? value : null;
}

/** Valores monetários: número já pronto, "8.5" ou "8,50". */
export function parseMoney(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;

  const text = raw.replace(/[R$\s]/g, "");

  if (!text) return null;

  // "1.234,56" (pt-BR) vs "1234.56": a vírgula, quando existe, é o decimal.
  const normalized = text.includes(",")
    ? text.replace(/\./g, "").replace(",", ".")
    : text;
  const value = Number(normalized);

  return Number.isFinite(value) ? value : null;
}

/** Tira o código CNAE do início: "86.30-5-04 - Atividade odontológica" → "Atividade odontológica". */
export function stripCnae(raw: string): string {
  return collapseSpaces(raw.replace(/^\s*\d{2}[.\s]?\d{2}[-\s]?\d[-\s]?\d{2}\s*[-–]\s*/, ""));
}

export type ResidueGroup = "A" | "B" | "E";

/**
 * Lê o texto do campo "Tipos de resíduos (saúde)" e devolve os grupos citados.
 * "Não se aplica" significa que o contrato é industrial, que este modelo não cobre.
 */
export function parseResidueGroups(raw: string): ResidueGroup[] {
  const folded = foldText(raw);
  const groups: ResidueGroup[] = [];

  if (/grupo\s*a\b|grupos?\s*a\d|\ba[1-5]\b/.test(folded)) groups.push("A");
  if (/grupo\s*b\b/.test(folded)) groups.push("B");
  if (/grupo\s*e\b|\be\s*-\s*res[ií]duos\s+perfuro|perfurocortante/.test(folded)) {
    groups.push("E");
  }

  return groups;
}
