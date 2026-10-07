import {
  CONTRACT_COMPANIES,
  CONTRACT_KIND_LABELS,
  KIND_TRAITS,
  companyKinds,
  companyTerms,
  parseContractCompany,
  type ContractKind,
} from "@/lib/contracts/companies";
import {
  DEFAULT_PACKAGING,
  type ContractFields,
} from "@/lib/contracts/fields";
import {
  foldText,
  formatCep,
  formatCnpj,
  formatCpf,
  formatDateBr,
  billingPeriod,
  formatPhone,
  joinPhones,
  normalizeFrequency,
  normalizeInscricao,
  normalizeStreet,
  normalizeUf,
  onlyDigits,
  parseMoney,
  parseQuantityKg,
  parseResidueGroups,
  stripCnae,
  titleCasePt,
} from "@/lib/contracts/normalize";

/**
 * Transforma os valores do card do quadro "Análise de Contratos" num rascunho
 * de contrato. O rascunho é uma *sugestão*: vai para a tela de revisão, onde a
 * pessoa confere e corrige antes de gerar o PDF.
 *
 * Os campos são localizados pelo rótulo (e não pelo id), porque o id muda de um
 * quadro para outro e o rótulo é o que o Pipefy exportou.
 */

export type DraftFields = Omit<ContractFields, "company"> & {
  /** Vazio quando o card não traz uma empresa conhecida. */
  company: ContractFields["company"] | "";
};

export type DraftIssue = {
  /**
   * `blocker`: o modelo não cobre este contrato e a geração fica desabilitada.
   * `warning`: gera, mas a pessoa precisa conferir.
   */
  level: "blocker" | "warning";
  field?: keyof ContractFields;
  message: string;
};

export type ContractDraft = {
  fields: DraftFields;
  issues: DraftIssue[];
};

/** Chave de busca: sem acento, sem dois-pontos nem espaços sobrando. */
export function labelKey(label: string): string {
  return foldText(label).replace(/[:\s]+$/g, "").replace(/\s+/g, " ");
}

export type CardValues = {
  /** Valores por rótulo normalizado (ver `labelKey`). */
  byLabel: Map<string, unknown>;
  requesterName: string | null;
};

/** Monta o mapa rótulo → valor a partir das definições e valores do card. */
export function toCardValues(
  definitions: Array<{ id: string; label: string }>,
  values: Array<{ customFieldId: string; value: unknown }>,
  requesterName: string | null,
): CardValues {
  const valueById = new Map(values.map((entry) => [entry.customFieldId, entry.value]));
  const byLabel = new Map<string, unknown>();

  for (const definition of definitions) {
    const key = labelKey(definition.label);

    // Rótulos repetidos: vale o primeiro que tem valor.
    if (byLabel.has(key) && byLabel.get(key) !== undefined) continue;

    byLabel.set(key, valueById.get(definition.id));
  }

  return { byLabel, requesterName };
}

function asText(value: unknown): string {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);

  return "";
}

function formatAmount(amount: number): string {
  return Number.isInteger(amount)
    ? String(amount)
    : amount.toFixed(2).replace(".", ",");
}

const SUPPORTED_TERM = "12 meses com renovacao automatica";

function isYes(value: unknown): boolean {
  return foldText(asText(value)) === "sim";
}

export function buildContractDraft(card: CardValues): ContractDraft {
  const issues: DraftIssue[] = [];
  const get = (label: string): unknown => card.byLabel.get(labelKey(label));
  const text = (label: string): string => asText(get(label));

  // -- tipo de contrato -----------------------------------------------------------
  const residueGroups = parseResidueGroups(
    text("TIPOS DE RESÍDUOS QUE SERÃO COLETADOS (SAÚDE)"),
  );
  const industrialText = foldText(
    text("TIPOS DE RESÍDUOS QUE SERÃO COLETADOS (INDUSTRIAL)"),
  );
  const hasIndustrial =
    industrialText !== "" && !/^nao se aplica/.test(industrialText);
  const mentionsClassII = /classe\s*ii\b/.test(industrialText);
  const mentionsClassI = /classe\s*i\b/.test(
    industrialText.replace(/classe\s*ii\b/g, ""),
  );

  const rawFrequency = text("FREQUÊNCIA DE COLETA");
  const term = foldText(text("VIGÊNCIA DO CONTRATO"));
  // "Coleta única" é um contrato à parte (3 meses, preço por coleta). Vale a
  // vigência marcada no card ou, na falta dela, a frequência ("única", "avulsa").
  const single =
    term === "coleta unica" || normalizeFrequency(rawFrequency).kind === "single";

  let baseKind: "saude" | "industrial" | "classe_II" = "saude";

  if (residueGroups.length > 0 && hasIndustrial) {
    issues.push({
      level: "blocker",
      field: "kind",
      message:
        "O card tem resíduo de saúde e industrial ao mesmo tempo. Não há modelo misto: gere um contrato de cada tipo, corrigindo o card.",
    });
  } else if (hasIndustrial) {
    if (mentionsClassII && !mentionsClassI) {
      baseKind = "classe_II";
    } else if (mentionsClassI) {
      baseKind = "industrial";
    } else {
      issues.push({
        level: "blocker",
        field: "kind",
        message: `Resíduo industrial "${text("TIPOS DE RESÍDUOS QUE SERÃO COLETADOS (INDUSTRIAL)")}" não tem modelo: só há contrato para Classe I e Classe II.`,
      });
    }
  } else if (residueGroups.length === 0) {
    issues.push({
      level: "blocker",
      field: "residueGroups",
      message:
        "O card não tem resíduos de saúde (grupos A, B ou E) nem industriais. Não dá para escolher o modelo de contrato.",
    });
  }

  const kind = (single ? `${baseKind}_unica` : baseKind) as ContractKind;

  // -- empresa contratada ------------------------------------------------------
  const companyKey = parseContractCompany(text("EMPRESA CONTRATADA"));

  if (!companyKey) {
    issues.push({
      level: "warning",
      field: "company",
      message: `O card não indica uma empresa contratada conhecida ("${text("EMPRESA CONTRATADA") || "vazio"}"). Escolha a empresa.`,
    });
  } else {
    const company = CONTRACT_COMPANIES[companyKey];

    if (!company.ready) {
      issues.push({
        level: "blocker",
        field: "company",
        message: `Faltam dados da ${company.legalName.replace(/ Ltda$/, "")} para gerar o contrato: ${company.missing.join(", ")}.`,
      });
    } else if (!companyTerms(company, kind)) {
      const available = companyKinds(company)
        .map((item) => CONTRACT_KIND_LABELS[item])
        .join("; ");

      issues.push({
        level: "blocker",
        field: "company",
        message: `Ainda não há modelo de "${CONTRACT_KIND_LABELS[kind]}" para a ${company.legalName.replace(/ Ltda.*$/, "")} (disponível: ${available}).`,
      });
    }
  }

  // -- vigência e frequência -------------------------------------------------------
  if (KIND_TRAITS[kind].recurring) {
    if (term && term !== SUPPORTED_TERM) {
      issues.push({
        level: "blocker",
        message: `Este modelo cobre só "12 meses com renovação automática"; o card diz "${text("VIGÊNCIA DO CONTRATO")}". Outras vigências têm contrato diferente.`,
      });
    }
  } else if (term && term !== "coleta unica") {
    issues.push({
      level: "warning",
      message: `A frequência do card ("${rawFrequency}") indica coleta única, mas a vigência diz "${text("VIGÊNCIA DO CONTRATO")}". Foi escolhido o contrato de coleta única (vigência de 3 meses): confira.`,
    });
  }

  const frequency = normalizeFrequency(rawFrequency, kind === "industrial" ? "industrial" : "saude");

  if (KIND_TRAITS[kind].recurring) {
    if (frequency.kind === "unknown") {
      issues.push({
        level: "warning",
        field: "frequency",
        message: frequency.text
          ? `Frequência "${frequency.text}" não reconhecida: confira como ela deve ser escrita na cláusula 1.2.`
          : "O card não informa a frequência de coleta.",
      });
    } else if (KIND_TRAITS[kind].billingPeriod) {
      issues.push({
        level: "warning",
        field: "frequency",
        message: `A frequência do contrato também define o período de cobrança (valor por ${billingPeriod(frequency.text)?.noun ?? "período"}). Confira o texto da cláusula 1.2.`,
      });
    }
  }

  // -- valores -----------------------------------------------------------------------
  const fee = parseMoney(get("VALOR DA MENSALIDADE"));
  const allowance = parseQuantityKg(get("FRANQUIA MENSAL"));
  const excess = parseMoney(get("VALOR DO KG EXCEDENTE"));

  if (fee === null || fee <= 0) {
    issues.push({
      level: "blocker",
      field: "monthlyFee",
      message:
        "O card não tem valor de mensalidade. Contrato sem mensalidade (valor por kg) não tem modelo.",
    });
  }

  if (allowance === null) {
    issues.push({
      level: "warning",
      field: "monthlyAllowanceKg",
      message: `Não foi possível ler a franquia mensal ("${text("FRANQUIA MENSAL")}"). Informe o número de quilos.`,
    });
  } else if (!Number.isInteger(allowance)) {
    issues.push({
      level: "warning",
      field: "monthlyAllowanceKg",
      message: `A franquia ${allowance} kg não é inteira; o modelo escreve o extenso só de números inteiros.`,
    });
  }

  if (excess === null || excess <= 0) {
    issues.push({
      level: "warning",
      field: "excessPerKg",
      message: "O card não tem valor do kg excedente (ou é zero). Confira.",
    });
  }

  // -- cliente --------------------------------------------------------------------------
  const stateRegistration = normalizeInscricao(text("INSC ESTADUAL"));
  const municipalRegistration = normalizeInscricao(text("INSC MUNICIPAL"));

  if (!stateRegistration) {
    issues.push({
      level: "warning",
      field: "stateRegistration",
      message: `Inscrição estadual indefinida ("${text("INSC ESTADUAL") || "vazio"}"). Informe o número ou 'isento'.`,
    });
  }

  if (!municipalRegistration) {
    issues.push({
      level: "warning",
      field: "municipalRegistration",
      message: `Inscrição municipal indefinida ("${text("INSC MUNICIPAL") || "vazio"}"). Informe o número ou 'isento'.`,
    });
  }

  const uf = normalizeUf(text("ESTADO"));

  if (!uf) {
    issues.push({
      level: "warning",
      field: "uf",
      message: `Estado não reconhecido ("${text("ESTADO") || "vazio"}"). Informe a sigla.`,
    });
  }

  const cnpj = formatCnpj(text("CNPJ"));
  const cnpjDigits = onlyDigits(cnpj).length;

  if (cnpjDigits !== 14 && cnpjDigits !== 11) {
    issues.push({
      level: "warning",
      field: "cnpj",
      message: `CNPJ com ${cnpjDigits} dígitos. Confira.`,
    });
  }

  const birthDate = formatDateBr(get("DATA DE NASCIMENTO"));

  if (!birthDate) {
    issues.push({
      level: "warning",
      field: "representativeBirthDate",
      message: "Data de nascimento do responsável ausente ou inválida.",
    });
  }

  const segment = stripCnae(text("SEGMENTO DO ESTABELECIMENTO"));
  const looksLikeAnimals = /animai|veterin|pet\b|zoo/.test(foldText(segment));

  // -- avisos sobre o que o card marca e o modelo não trata -------------------------------
  const notHandled: Array<[unknown, string]> = [
    [
      get("SE TRATA DE UMA SUBSTITUIÇÃO E/OU TRANSIÇÃO CONTRATUAL?"),
      "substituição/transição contratual",
    ],
    [get("BONIFICAÇÃO DE MENSALIDADE"), "bonificação de mensalidade"],
    [get("PARTICULARIDADE DE COLETA?"), "particularidade de coleta"],
    [get("CONSIGNAÇÃO DE BOMBONA/TAMBOR"), "consignação de bombona/tambor"],
  ];

  for (const [value, name] of notHandled) {
    if (isYes(value)) {
      issues.push({
        level: "warning",
        message: `O card marca "${name}: Sim". O modelo não tem cláusula para isso — confira se o contrato precisa de algo a mais.`,
      });
    }
  }

  if (foldText(asText(get("NO ENDEREÇO DE COBRANÇA TAMBÉM DEVERÁ TER COLETA?"))) === "nao") {
    issues.push({
      level: "warning",
      message:
        "A coleta não é no endereço de cobrança (há unidade de coleta em outro endereço). O modelo não lista unidades de coleta.",
    });
  }

  // O Pipefy repete o celular no campo de fixo quando o cliente só tem celular.
  // O contrato só imprime o fixo quando ele é um número diferente.
  const landlineRaw = text("FIXO DDD");
  const landline =
    onlyDigits(landlineRaw) !== onlyDigits(text("CELULAR DDD")) ? formatPhone(landlineRaw) : "";

  const fields: DraftFields = {
    kind,
    company: companyKey ?? "",
    contractNumber: "",
    consultantRole:
      (companyKey ? companyTerms(CONTRACT_COMPANIES[companyKey], kind) : null)
        ?.consultantRole ?? "Aux. comercial",
    consultant: titleCasePt(
      card.requesterName ?? text("NOME DO CONSULTOR DE VENDAS"),
    ),

    companyName: titleCasePt(text("RAZÃO SOCIAL")),
    cnpj,
    street: normalizeStreet(text("ENDEREÇO")),
    streetNumber: text("NÚMERO"),
    complement: titleCasePt(text("COMPLEMENTO DO ENDEREÇO")),
    district: titleCasePt(text("BAIRRO")),
    city: titleCasePt(text("CIDADE")),
    uf,
    cep: formatCep(text("CEP")),
    stateRegistration,
    municipalRegistration,

    representativeName: titleCasePt(text("RESPONSÁVEL LEGAL")),
    representativeCpf: formatCpf(text("CPF")),
    representativeBirthDate: birthDate,
    landline,
    phones: joinPhones(text("CELULAR DDD"), text("CONTATO EXTRA DDD")),
    email: text("E-MAIL DE CONTATO").toLowerCase(),
    segment,

    // O texto da cláusula 1.1 é sempre "A, B e E" (504 de 506 contratos assinados
    // verificados), mesmo quando o card marca só um grupo.
    residueGroups: residueGroups.length > 0 ? (["A", "B", "E"] as const).slice() : [],
    frequency: KIND_TRAITS[kind].recurring ? frequency.text : "",

    monthlyFee: fee === null ? "" : formatAmount(fee),
    monthlyAllowanceKg: allowance === null ? "" : String(allowance),
    excessPerKg: excess === null ? "" : formatAmount(excess),
    packaging: DEFAULT_PACKAGING,

    // A cláusula 4.5 só existe no contrato de uma clínica veterinária/pet shop.
    animalCollection: KIND_TRAITS[kind].packagingAndAnimals && looksLikeAnimals,
    advancePayment: true,
  };

  if (KIND_TRAITS[kind].packagingAndAnimals && looksLikeAnimals) {
    issues.push({
      level: "warning",
      field: "animalCollection",
      message:
        "O segmento sugere atividade com animais: a cláusula 4.5 (coleta avulsa de animais) foi marcada. Confira.",
    });
  }

  return { fields, issues };
}

/** O quadro tem os campos de que o gerador precisa? Usado para mostrar o botão. */
export function supportsContractGeneration(labels: string[]): boolean {
  const keys = new Set(labels.map(labelKey));

  return ["empresa contratada", "razao social", "cnpj", "valor da mensalidade"].every(
    (required) => keys.has(required),
  );
}
