import type { ContractImageKey } from "@/lib/contracts/assets.generated";

/**
 * Empresas contratadas e o que muda no contrato de uma para outra.
 *
 * Os valores foram lidos dos contratos assinados mais recentes de cada empresa.
 * Importante: o texto dos contratos é versionado **por data, igual para todas as
 * empresas** (ex.: juros "ao mês" até mai/2026 e "ao dia" desde 19/06/2026;
 * coleta até 17:00 e depois até 18:00 desde 08/09/2026). Aqui ficam sempre os
 * valores da versão vigente; ver `KNOWN_DIVERGENCES` para o que ainda não foi
 * confirmado.
 */

export const CONTRACT_COMPANY_KEYS = [
  "AMBIENTEC",
  "COLEMAX",
  "COLENORTE",
  "BIOCOLETAS",
  "COLEFAR",
] as const;

export type ContractCompanyKey = (typeof CONTRACT_COMPANY_KEYS)[number];

/** Tipos de contrato do arquivo da empresa. Cada um tem texto próprio. */
export const CONTRACT_KINDS = [
  "saude",
  "saude_unica",
  "industrial",
  "industrial_unica",
  "classe_II",
  "classe_II_unica",
] as const;

export type ContractKind = (typeof CONTRACT_KINDS)[number];

export const CONTRACT_KIND_LABELS: Record<ContractKind, string> = {
  saude: "Resíduos de serviço de saúde",
  saude_unica: "Resíduos de serviço de saúde — coleta única",
  industrial: "Resíduos industriais Classe I",
  industrial_unica: "Resíduos industriais Classe I — coleta única",
  classe_II: "Resíduos Classe II",
  classe_II_unica: "Resíduos Classe II — coleta única",
};

/**
 * O que cada tipo tem de estrutura (quais campos da tela valem e qual abertura
 * usar). Fica separado dos termos por empresa porque vale para todas.
 */
export const KIND_TRAITS: Record<
  ContractKind,
  {
    /** Contrato por período (renovável), com frequência de coleta. */
    recurring: boolean;
    /** Resíduos de saúde: grupos A/B/E na cláusula 1.1. */
    health: boolean;
    /** Preço por período de cobrança escrito no texto (bimestre, trimestre…). */
    billingPeriod: boolean;
    /** Só o modelo de saúde recorrente tem acondicionamento e a cláusula de animais. */
    packagingAndAnimals: boolean;
  }
> = {
  saude: { recurring: true, health: true, billingPeriod: false, packagingAndAnimals: true },
  saude_unica: { recurring: false, health: true, billingPeriod: false, packagingAndAnimals: false },
  industrial: { recurring: true, health: false, billingPeriod: true, packagingAndAnimals: false },
  industrial_unica: { recurring: false, health: false, billingPeriod: false, packagingAndAnimals: false },
  classe_II: { recurring: true, health: false, billingPeriod: true, packagingAndAnimals: false },
  classe_II_unica: { recurring: false, health: false, billingPeriod: false, packagingAndAnimals: false },
};

type PartyAddress = {
  street: string;
  number: string;
  district: string;
  city: string;
  uf: string;
  cep: string;
};

/**
 * O que muda de uma empresa para outra *dentro de um tipo de contrato*. É
 * separado por tipo porque a mesma empresa escreve coisas diferentes em cada
 * modelo (o industrial da Colenorte tem foro em Pirapora/MG; o de saúde, em
 * Montes Claros/MG).
 */
export type KindTerms = {
  /** Fim do horário comercial de coleta (cláusula 1.5.1). */
  closingHour: string;
  /** Em cujo site o boleto fica disponível (cláusula 5.1, quando existe). */
  boletoSite: "CONTRATANTE" | "CONTRATADA";
  /** Período dos juros de mora (cláusula 5.2). */
  lateInterestPeriod: "mês" | "dia";
  /** Foro eleito. */
  forum: string;
  /** Texto de local acima das assinaturas, como cada empresa escreve. */
  signaturePlace: string;
  /** Linhas de testemunha acima das assinaturas. */
  witnesses: boolean;
  /** A abertura escreve "Contato Celular …"; a Colefar escreve só "Contato …". */
  phoneLabel: boolean;
  /** Cargo de quem assina pela contratada: "Aux. comercial" ou "Representante comercial". */
  consultantRole: string;
};

type ReadyCompany = {
  key: ContractCompanyKey;
  ready: true;
  /** Nome como aparece no texto e nas assinaturas. */
  legalName: string;
  cnpj: string;
  stateRegistration: string;
  address: PartyAddress;
  /** Termos de cada tipo; só existe o tipo para o qual há contrato de referência. */
  terms: Partial<Record<ContractKind, KindTerms>>;
  logo: ContractImageKey;
  footer: ContractImageKey;
};

type PendingCompany = {
  key: ContractCompanyKey;
  ready: false;
  legalName: string;
  /** O que falta cadastrar antes de gerar contratos desta empresa. */
  missing: string[];
};

export type ContractCompany = ReadyCompany | PendingCompany;

const AUX = "Aux. comercial";
const REPRESENTANTE = "Representante comercial";

// -- Ambientec ------------------------------------------------------------
const AMBIENTEC_SAUDE: KindTerms = {
  closingHour: "18:00",
  boletoSite: "CONTRATANTE",
  lateInterestPeriod: "dia",
  forum: "Iguatama/MG",
  signaturePlace: "Iguatama/MG.",
  witnesses: true,
  phoneLabel: true,
  consultantRole: AUX,
};

// -- Colemax --------------------------------------------------------------
// Nenhum contrato padrão da Colemax depois de 08/09/2026: o horário 18:00 que as
// outras adotaram nessa data não está confirmado. Último valor verificado: 17:00.
const COLEMAX_SAUDE: KindTerms = {
  closingHour: "17:00",
  boletoSite: "CONTRATANTE",
  lateInterestPeriod: "dia",
  forum: "Vespasiano/MG",
  signaturePlace: "Vespasiano, MG.",
  witnesses: true,
  phoneLabel: true,
  consultantRole: AUX,
};

// -- Colenorte ------------------------------------------------------------
const COLENORTE_SAUDE: KindTerms = {
  closingHour: "18:00",
  boletoSite: "CONTRATADA",
  lateInterestPeriod: "dia",
  forum: "Montes Claros/MG",
  signaturePlace: "Montes Claros/MG.",
  witnesses: true,
  phoneLabel: true,
  consultantRole: AUX,
};

// -- Biocoletas -----------------------------------------------------------
const BIOCOLETAS_SAUDE: KindTerms = {
  closingHour: "18:00",
  boletoSite: "CONTRATADA",
  lateInterestPeriod: "dia",
  forum: "Ubá/MG",
  signaturePlace: "Tocantins, MG.",
  witnesses: true,
  phoneLabel: true,
  consultantRole: AUX,
};

// -- Colefar --------------------------------------------------------------
// Dados do contrato 36978 (jun/2026). Mesma ressalva do horário da Colemax.
const COLEFAR_SAUDE: KindTerms = {
  closingHour: "17:00",
  boletoSite: "CONTRATADA",
  lateInterestPeriod: "dia",
  forum: "Belo Horizonte/MG",
  signaturePlace: "Belo Horizonte/MG,",
  witnesses: true,
  phoneLabel: false,
  consultantRole: AUX,
};

/**
 * A coleta única (saúde e industrial) usa os mesmos termos do contrato recorrente da
 * empresa (verificado nos exemplares de cada uma: mesmo foro e mesma cidade de
 * assinatura), mudando só o cargo de quem assina.
 */
function singleCollection(base: KindTerms, consultantRole: string): KindTerms {
  return { ...base, consultantRole };
}

export const CONTRACT_COMPANIES: Record<ContractCompanyKey, ContractCompany> = {
  AMBIENTEC: {
    key: "AMBIENTEC",
    ready: true,
    legalName: "Ambientec Soluções em Resíduos Ltda - EPP",
    cnpj: "11.399.773/0001-09",
    stateRegistration: "002.148.2020033",
    address: {
      street: "Avenida Juca Pinto",
      number: "1.136",
      district: "Distrito Industrial",
      city: "Iguatama",
      uf: "MG",
      cep: "38.910-000",
    },
    terms: {
      saude: AMBIENTEC_SAUDE,
      saude_unica: singleCollection(AMBIENTEC_SAUDE, REPRESENTANTE),
      // Contrato 37332 (ago/2026): mesma empresa, mas assina "Iguatama/MG,".
      industrial_unica: {
        ...singleCollection(AMBIENTEC_SAUDE, REPRESENTANTE),
        signaturePlace: "Iguatama/MG,",
      },
      // Contrato 36793 (mai/2026): boleto no site da CONTRATANTE, assina "Iguatama/MG.".
      // Horário e juros: versão vigente (a mesma dos contratos de saúde).
      industrial: { ...AMBIENTEC_SAUDE, consultantRole: REPRESENTANTE },
    },
    logo: "AMBIENTEC_LOGO",
    footer: "AMBIENTEC_FOOTER",
  },
  COLEMAX: {
    key: "COLEMAX",
    ready: true,
    legalName: "Colemax Coleta de Resíduos Ltda",
    cnpj: "17.051.250/0001-53",
    stateRegistration: "003554095-00-70",
    address: {
      street: "Rua Presbítero Antônio Reis Sampaio",
      number: "160",
      district: "Gávea",
      city: "Vespasiano",
      uf: "MG",
      cep: "33.202-710",
    },
    terms: {
      saude: COLEMAX_SAUDE,
      saude_unica: singleCollection(COLEMAX_SAUDE, AUX),
      industrial: singleCollection(COLEMAX_SAUDE, AUX),
      industrial_unica: singleCollection(COLEMAX_SAUDE, AUX),
    },
    logo: "COLEMAX_LOGO",
    footer: "COLEMAX_FOOTER",
  },
  COLENORTE: {
    key: "COLENORTE",
    ready: true,
    legalName: "Colenorte Ltda",
    cnpj: "41.282.741/0001-90",
    stateRegistration: "Isento",
    address: {
      street: "Avenida Heribaldo Moreira",
      number: "317",
      district: "Distrito Industrial",
      city: "Montes Claros",
      uf: "MG",
      cep: "39.404-001",
    },
    terms: {
      saude: COLENORTE_SAUDE,
      saude_unica: singleCollection(COLENORTE_SAUDE, AUX),
      industrial: { ...COLENORTE_SAUDE, boletoSite: "CONTRATANTE" },
      industrial_unica: singleCollection(COLENORTE_SAUDE, AUX),
    },
    logo: "COLENORTE_LOGO",
    footer: "COLENORTE_FOOTER",
  },
  BIOCOLETAS: {
    key: "BIOCOLETAS",
    ready: true,
    legalName: "Biocoletas de Resíduos Ltda – ME",
    cnpj: "20.439.518/0001-33",
    stateRegistration: "002.403.145.00-44",
    address: {
      street: "Rua Coronel Joaquim Reis",
      number: "1105",
      district: "Vale do Ouro",
      city: "Tocantins",
      uf: "MG",
      cep: "36.512-000",
    },
    terms: {
      saude: BIOCOLETAS_SAUDE,
      saude_unica: singleCollection(BIOCOLETAS_SAUDE, AUX),
      industrial: { ...BIOCOLETAS_SAUDE, boletoSite: "CONTRATANTE" },
      industrial_unica: singleCollection(BIOCOLETAS_SAUDE, AUX),
    },
    logo: "BIOCOLETAS_LOGO",
    footer: "BIOCOLETAS_FOOTER",
  },
  COLEFAR: {
    key: "COLEFAR",
    ready: true,
    legalName: "COLEFAR LTDA ME",
    cnpj: "04.962.103/0001-93",
    stateRegistration: "002.036.084.00-00",
    address: {
      street: "Rua Governador Milton Campos",
      number: "1154",
      district: "Tupi",
      city: "Belo Horizonte",
      uf: "MG",
      cep: "31.844-440",
    },
    terms: {
      saude: COLEFAR_SAUDE,
      saude_unica: singleCollection(COLEFAR_SAUDE, REPRESENTANTE),
      industrial: COLEFAR_SAUDE,
      industrial_unica: singleCollection(COLEFAR_SAUDE, REPRESENTANTE),
    },
    logo: "COLEFAR_LOGO",
    footer: "COLEFAR_FOOTER",
  },
};

/** Termos da empresa para o tipo de contrato, ou null quando não há contrato de referência. */
export function companyTerms(
  company: ContractCompany,
  kind: ContractKind,
): KindTerms | null {
  return company.ready ? (company.terms[kind] ?? null) : null;
}

export function companyKinds(company: ContractCompany): ContractKind[] {
  return CONTRACT_KINDS.filter((kind) => companyTerms(company, kind) !== null);
}

export function isContractCompanyKey(value: string): value is ContractCompanyKey {
  return (CONTRACT_COMPANY_KEYS as readonly string[]).includes(value);
}

/** "AMBIENTEC", "Ambientec " → chave, ou null quando não é uma empresa conhecida. */
export function parseContractCompany(raw: unknown): ContractCompanyKey | null {
  if (typeof raw !== "string") return null;

  const key = raw.trim().toUpperCase();

  return isContractCompanyKey(key) ? key : null;
}

/**
 * O que ainda não está confirmado ou difere entre empresas/tipos. Serve para o
 * jurídico revisar e para a próxima pessoa saber onde há suposição.
 */
export const KNOWN_DIVERGENCES = [
  "Horário de coleta até 18:00 (desde 08/09/2026): confirmado em Ambientec, Biocoletas e Colenorte. Colemax e Colefar não têm contrato padrão depois dessa data; mantido 17:00.",
  "Site do boleto (cláusula 5.1): CONTRATANTE na Ambientec e na Colemax; CONTRATADA na Biocoletas, Colenorte e Colefar. No modelo industrial varia (Colenorte e Biocoletas dizem CONTRATANTE).",
  "Cargo de quem assina pela contratada: 'Aux. comercial' na maioria; 'Representante comercial' no industrial da Ambientec e na coleta única da Ambientec e da Colefar.",
  "Industrial das empresas que não são a Ambientec: horário, juros e cargo seguem a versão vigente dos contratos de saúde da própria empresa (os industriais delas são de 2024/2025). Boleto: CONTRATANTE em Colenorte, Biocoletas e Colemax (nos industriais), CONTRATADA na Colefar. Foro: o da empresa; contratos isolados trazem foro do cliente (Pirapora/MG, São Paulo/SP).",
  "Frequências não mensais: só 'semanal' e 'trimestral' (com a grafia dos contratos de 2026) foram vistas em contrato real; os demais textos seguem o mesmo molde.",
] as const;
