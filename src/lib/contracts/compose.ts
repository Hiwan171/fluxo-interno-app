import {
  CONTRACT_COMPANIES,
  CONTRACT_KIND_LABELS,
  KIND_TRAITS,
  companyTerms,
  type ContractCompany,
  type ContractKind,
} from "@/lib/contracts/companies";
import type { ContractFields } from "@/lib/contracts/fields";
import {
  billingPeriod,
  parseMoney,
  parseQuantityKg,
} from "@/lib/contracts/normalize";
import {
  CONTRACT_BLOCKS,
  CONTRACT_TITLE,
  type TemplateBlock,
} from "@/lib/contracts/template";
import {
  INDUSTRIAL_BLOCKS,
  INDUSTRIAL_TITLE,
} from "@/lib/contracts/template-industrial";
import {
  INDUSTRIAL_UNICA_BLOCKS,
  INDUSTRIAL_UNICA_TITLE,
} from "@/lib/contracts/template-industrial-unica";
import {
  SAUDE_UNICA_BLOCKS,
  SAUDE_UNICA_TITLE,
} from "@/lib/contracts/template-saude-unica";
import {
  formatMoneyWithWords,
  formatQuantityWithWords,
} from "@/lib/contracts/words";

/**
 * Junta o modelo (`template.ts`), a empresa (`companies.ts`) e os dados
 * revisados (`fields.ts`) num documento pronto para desenhar. Não conhece PDF:
 * devolve texto com estilo, e por isso dá para testar sem renderizar nada.
 */

export type Span = {
  text: string;
  bold: boolean;
  italic: boolean;
  link: boolean;
};

export type DocBlock =
  | { kind: "heading"; spans: Span[] }
  | { kind: "item"; num?: string; spans: Span[]; indent: boolean }
  | { kind: "table"; rows: Array<[Span[], Span[]]> };

export type ContractDocument = {
  company: Extract<ContractCompany, { ready: true }>;
  title: string;
  intro: Span[];
  blocks: DocBlock[];
  signature: {
    place: string;
    parties: Array<{ name: string; cnpj: string; documentLabel: "CNPJ" | "CPF" }>;
    witnesses: boolean;
  };
};

// Caracteres reservados da marcação trocados por pontos de código privados
// enquanto o texto é interpolado e analisado. Remover ou duplicar `_` e `*` do
// valor do usuário mudaria o dado (um e-mail com "__" viraria outro e-mail).
const SENTINEL: Record<string, string> = {
  "*": "",
  _: "",
  "[": "",
  "]": "",
  "{": "",
  "}": "",
};
const SENTINEL_BACK = Object.fromEntries(
  Object.entries(SENTINEL).map(([char, sentinel]) => [sentinel, char]),
);

function protect(value: string): string {
  return value.replace(/[*_[\]{}]/g, (char) => SENTINEL[char]);
}

function restore(value: string): string {
  return value.replace(/[-]/g, (sentinel) => SENTINEL_BACK[sentinel]);
}

/** Texto do usuário que entra na marcação como **negrito**. */
function bold(value: string): string {
  return `**${protect(value)}**`;
}

function plain(value: string): string {
  return protect(value);
}

function interpolate(template: string, values: Record<string, string>, rawKeys: Set<string>): string {
  return template
    .replace(/\{\{\{(\w+)\}\}\}/g, (_match, key: string) => {
      if (!(key in values)) throw new Error(`Campo do modelo sem valor: ${key}`);
      return values[key];
    })
    .replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
      if (!(key in values)) throw new Error(`Campo do modelo sem valor: ${key}`);
      // Valores montados no código (`rawKeys`) já saem protegidos.
      return rawKeys.has(key) ? values[key] : protect(values[key]);
    });
}

/** Marcação → trechos com estilo. */
export function parseMarkup(markup: string): Span[] {
  const spans: Span[] = [];
  let boldOn = false;
  let italicOn = false;
  let linkOn = false;
  let buffer = "";

  const flush = () => {
    if (!buffer) return;

    spans.push({
      text: restore(buffer),
      bold: boldOn,
      italic: italicOn,
      link: linkOn,
    });
    buffer = "";
  };

  for (let index = 0; index < markup.length; index += 1) {
    const pair = markup.slice(index, index + 2);

    if (pair === "**") {
      flush();
      boldOn = !boldOn;
      index += 1;
    } else if (pair === "__") {
      flush();
      italicOn = !italicOn;
      index += 1;
    } else if (pair === "[[") {
      flush();
      linkOn = true;
      index += 1;
    } else if (pair === "]]") {
      flush();
      linkOn = false;
      index += 1;
    } else {
      buffer += markup[index];
    }
  }

  flush();

  return spans;
}

const RESIDUE_GROUP_LABELS = {
  A: "(infectante)",
  B: "(químico)",
  E: "(perfuro cortante)",
} as const;

/** "nos grupos **A** (infectante), **B** (químico) e **E** (perfuro cortante)". */
function residueGroupsMarkup(groups: ContractFields["residueGroups"]): string {
  const ordered = (["A", "B", "E"] as const).filter((group) =>
    groups.includes(group),
  );
  const items = ordered.map((group) => `**${group}** ${RESIDUE_GROUP_LABELS[group]}`);

  if (items.length === 1) return `no grupo ${items[0]}`;

  return `nos grupos ${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

function kilos(raw: string): string {
  const quantity = parseQuantityKg(raw);

  if (quantity === null) throw new Error(`Quantidade em quilos inválida: ${raw}`);

  return `${formatQuantityWithWords(quantity)} ${quantity === 1 ? "quilo" : "quilos"}`;
}

function money(raw: string): string {
  const amount = parseMoney(raw);

  if (amount === null) throw new Error(`Valor monetário inválido: ${raw}`);

  return formatMoneyWithWords(amount);
}

/** "Fixo 31 3565-4852 Celular 31 99278-0958," ou só "Celular 31 99278-0958,". */
function contactPhones(fields: ContractFields, phoneLabel: boolean): string {
  if (fields.landline) return `Fixo ${fields.landline} Celular ${fields.phones},`;

  return phoneLabel ? `Celular ${fields.phones},` : `${fields.phones},`;
}

type ReadyCompany = Extract<ContractCompany, { ready: true }>;

/** Documento de 11 dígitos no lugar do CNPJ: o cliente é pessoa física. */
function isPerson(fields: ContractFields): boolean {
  return fields.cnpj.replace(/\D/g, "").length === 11;
}

/** A contratada, igual em todos os modelos até o ponto em que o representante entra. */
function contractorParty(company: ReadyCompany): string {
  const a = company.address;

  return (
    `de um lado, ${bold(company.legalName)}, localizada na ${bold(`${a.street},`)} ` +
    `nº ${bold(a.number)}, bairro ${bold(a.district)}, ${bold(a.city)} (${plain(a.uf)}), ` +
    `CEP ${plain(a.cep)}, inscrita no CNPJ (MF) sob nº ${bold(company.cnpj)}, ` +
    `Inscrição Estadual: ${bold(company.stateRegistration)}, `
  );
}

type IntroStyle = {
  /**
   * Como o CPF do representante entra: "inscrita no CPF …" (saúde e industrial
   * recorrentes), "CPF …" (coleta única). Cliente pessoa física não repete o CPF
   * (já está na qualificação do próprio cliente).
   */
  representativeCpf: "inscrita" | "plain";
  /** Rótulo "Celular" antes do telefone, conforme a empresa. */
  phoneLabel: boolean;
  role: string;
};

/**
 * Parágrafo de abertura, com as duas partes qualificadas. Segue a redação dos
 * contratos reais, incluindo o negrito nos dados variáveis. (A abertura do
 * industrial de 2024 saiu com "Todas As Palavras Em Maiúscula" — defeito de
 * colagem, corrigido nos contratos de 2026.)
 */
function buildIntro(
  company: ReadyCompany,
  fields: ContractFields,
  style: IntroStyle,
): Span[] {
  const contractor =
    `${contractorParty(company)}e por seu ` +
        `${bold("representante legal infra-assinado:")} ${plain(style.role)} ${bold(fields.consultant)}, ` +
        `neste ato denominada ${bold("CONTRATADA")}`;

  const person = isPerson(fields);
  const complement = fields.complement
    ? ` ${bold(`${fields.complement},`)}`
    : "";
  const phones = contactPhones(fields, style.phoneLabel);

  const documentLabel = person ? "CPF" : "CNPJ";
  const stateRegistration = bold(fields.stateRegistration);

  const representativeCpf = person
    ? ""
    : style.representativeCpf === "inscrita"
      ? `inscrita no ${bold(`CPF ${fields.representativeCpf}`)} `
      : `${bold(`CPF ${fields.representativeCpf},`)} `;

  const client =
    `e, de outro lado, ${bold(`${fields.companyName},`)} pessoa ` +
    `${person ? "física" : "jurídica"} de direito privado ` +
    `com sede na ${bold(`${fields.street},`)} nº ${bold(`${fields.streetNumber},`)}${complement} ` +
    `bairro ${bold(`${fields.district},`)} cidade ${bold(fields.city)} (${plain(fields.uf)}), ` +
    `CEP ${bold(`${fields.cep},`)} inscrita no ${bold(documentLabel)} sob o nº ${bold(`${fields.cnpj},`)} ` +
    `inscrição estadual nº ${stateRegistration} municipal sob o nº ` +
    `${bold(`${fields.municipalRegistration},`)} representado neste ato por ` +
    `${bold(`${fields.representativeName},`)} ${representativeCpf}` +
    `data de nascimento ${bold(`${fields.representativeBirthDate},`)} Contato ` +
    `${bold(phones)} e-mail ${bold(`${fields.email},`)} Segmento: ` +
    `${bold(`${fields.segment},`)} doravante denominada ${bold("CONTRATANTE")}, resolvem ` +
    `celebrar o presente instrumento, que se regerá pelas seguintes cláusulas e condições:`;

  return parseMarkup(
    `Pelo presente instrumento particular de contrato, as partes, ${contractor} ${client}`,
  );
}

export class ContractCompanyNotReadyError extends Error {
  constructor(readonly missing: string[]) {
    super(`Faltam dados da empresa para gerar contratos: ${missing.join(", ")}.`);
    this.name = "ContractCompanyNotReadyError";
  }
}

type KindDefinition = {
  blocks: ReadonlyArray<TemplateBlock>;
  title: string;
  representativeCpf: IntroStyle["representativeCpf"];
};

/**
 * Os tipos que têm texto implementado. Um tipo que existe em `CONTRACT_KINDS`
 * mas não está aqui ainda não tem modelo: a tela o bloqueia com a mensagem
 * "sem contrato de referência".
 */
const KIND_DEFINITIONS: Partial<Record<ContractKind, KindDefinition>> = {
  saude: {
    blocks: CONTRACT_BLOCKS,
    title: CONTRACT_TITLE,
    representativeCpf: "inscrita",
  },
  saude_unica: {
    blocks: SAUDE_UNICA_BLOCKS,
    title: SAUDE_UNICA_TITLE,
    representativeCpf: "plain",
  },
  industrial_unica: {
    blocks: INDUSTRIAL_UNICA_BLOCKS,
    title: INDUSTRIAL_UNICA_TITLE,
    representativeCpf: "plain",
  },
  industrial: {
    blocks: INDUSTRIAL_BLOCKS,
    title: INDUSTRIAL_TITLE,
    representativeCpf: "inscrita",
  },
};

function capitalizeFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function kindHasTemplate(kind: ContractKind): boolean {
  return kind in KIND_DEFINITIONS;
}

export function buildContractDocument(fields: ContractFields): ContractDocument {
  const company = CONTRACT_COMPANIES[fields.company];

  if (!company.ready) throw new ContractCompanyNotReadyError(company.missing);

  const terms = companyTerms(company, fields.kind);
  const definition = KIND_DEFINITIONS[fields.kind];

  if (!terms || !definition) {
    throw new ContractCompanyNotReadyError([
      `contrato de referência de "${CONTRACT_KIND_LABELS[fields.kind]}" para a ${company.legalName}`,
    ]);
  }

  const traits = KIND_TRAITS[fields.kind];
  const period = traits.billingPeriod ? billingPeriod(fields.frequency) : null;

  if (traits.billingPeriod && !period) {
    throw new Error(`Frequência sem período de cobrança conhecido: ${fields.frequency}`);
  }

  const allowanceKg = parseQuantityKg(fields.monthlyAllowanceKg);

  const rawValues: Record<string, string> = {
    grupos: traits.health ? residueGroupsMarkup(fields.residueGroups) : "",
    frequencia: fields.frequency,
    horarioFim: terms.closingHour,
    mensalidade: money(fields.monthlyFee),
    franquia: kilos(fields.monthlyAllowanceKg),
    franquiaNumero:
      allowanceKg === null ? "" : formatQuantityWithWords(allowanceKg),
    excedente: money(fields.excessPerKg),
    acondicionamento: fields.packaging,
    siteDoBoleto: terms.boletoSite,
    jurosPeriodo: terms.lateInterestPeriod,
    foro: terms.forum,
    antecipado: fields.advancePayment
      ? " **Sendo necessário o pagamento de 50% do valor antecipado, para a programação da coleta.**"
      : "",
    // O contrato escreve "(Trimestre)" e "(Trimestralmente)" com inicial maiúscula.
    periodo: capitalizeFirst(period?.noun ?? ""),
    periodoAdv: capitalizeFirst(period?.adverb ?? ""),
  };
  // Chaves que já trazem marcação (negrito): grupos de resíduo e a frase opcional.
  const rawKeys = new Set(["grupos", "antecipado"]);

  const render = (template: string) =>
    parseMarkup(interpolate(template, rawValues, rawKeys));

  const blocks: DocBlock[] = [];

  for (const block of definition.blocks) {
    if (block.kind === "heading") {
      // Títulos de cláusula são sempre em negrito, qualquer que seja a marcação.
      blocks.push({
        kind: "heading",
        spans: render(block.text).map((span) => ({ ...span, bold: true })),
      });
    } else if (block.kind === "table") {
      blocks.push({
        kind: "table",
        rows: block.rows.map(([label, value]) => [render(label), render(value)]),
      });
    } else {
      if (block.only === "coletaAnimais" && !fields.animalCollection) continue;

      blocks.push({
        kind: "item",
        num: block.num,
        spans: render(block.text),
        indent: Boolean(block.indent),
      });
    }
  }

  return {
    company,
    title: definition.title,
    intro: buildIntro(company, fields, {
      representativeCpf: definition.representativeCpf,
      phoneLabel: terms.phoneLabel,
      role: fields.consultantRole,
    }),
    blocks,
    signature: {
      place: terms.signaturePlace,
      parties: [
        { name: company.legalName, cnpj: company.cnpj, documentLabel: "CNPJ" },
        {
          name: fields.companyName,
          cnpj: fields.cnpj,
          documentLabel: isPerson(fields) ? "CPF" : "CNPJ",
        },
      ],
      witnesses: terms.witnesses,
    },
  };
}

/** Texto corrido de um conjunto de trechos — usado em testes e no nome do arquivo. */
export function spansToText(spans: Span[]): string {
  return spans.map((span) => span.text).join("");
}
