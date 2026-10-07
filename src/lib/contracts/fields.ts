import { z } from "zod";

import {
  CONTRACT_COMPANY_KEYS,
  CONTRACT_KINDS,
  KIND_TRAITS,
  type ContractCompanyKey,
  type ContractKind,
} from "@/lib/contracts/companies";
import {
  billingPeriod,
  parseMoney,
  parseQuantityKg,
} from "@/lib/contracts/normalize";

/**
 * Dados que alimentam o contrato.
 *
 * Tudo aqui é texto simples, pronto para ser impresso — é exatamente o que a
 * tela de revisão mostra e o que o servidor recebe de volta. Ou seja, o PDF
 * nunca é gerado a partir do card "cru": o que o usuário revisou é o que sai.
 */

export type ContractFields = {
  /** Qual modelo de contrato: saúde ou industrial Classe I. */
  kind: ContractKind;
  company: ContractCompanyKey;
  /** Número do contrato no sistema de origem. Só entra no nome do arquivo. */
  contractNumber: string;
  /** Consultor que assina em nome da contratada. */
  consultant: string;
  /** Cargo dele no contrato: "Aux. comercial" ou "Representante comercial". */
  consultantRole: string;

  companyName: string;
  cnpj: string;
  street: string;
  streetNumber: string;
  complement: string;
  district: string;
  city: string;
  uf: string;
  cep: string;
  stateRegistration: string;
  municipalRegistration: string;

  representativeName: string;
  representativeCpf: string;
  representativeBirthDate: string;
  /** Telefone fixo; só entra no contrato quando é diferente do celular. */
  landline: string;
  phones: string;
  email: string;
  segment: string;

  /** Só no modelo de saúde (cláusula 1.1). */
  residueGroups: Array<"A" | "B" | "E">;
  frequency: string;

  /**
   * Valores numéricos como o usuário digita ("120", "8,50"); o extenso sai no PDF.
   * No modelo industrial a "mensalidade" é o valor por período de cobrança
   * (bimestre, trimestre…) e a franquia vale para o mesmo período.
   */
  monthlyFee: string;
  monthlyAllowanceKg: string;
  excessPerKg: string;
  /** Cláusula 4.1: "condicionados a ...". */
  packaging: string;

  /** Inclui a cláusula 4.5, de coleta avulsa de animais. */
  animalCollection: boolean;
  /** Coleta única: exige 50% do valor antecipado (cláusula 5.1). Em ~10% dos contratos a frase não existe. */
  advancePayment: boolean;
};

export const DEFAULT_PACKAGING = "1 (Um) saco de 100 (Cem) litros";

const text = (label: string, max = 200) =>
  z
    .string({ error: `${label}: informe o valor.` })
    .trim()
    .min(1, `${label}: obrigatório.`)
    .max(max, `${label}: no máximo ${max} caracteres.`);

const optionalText = (label: string, max = 200) =>
  z
    .string({ error: `${label}: valor inválido.` })
    .trim()
    .max(max, `${label}: no máximo ${max} caracteres.`);

const money = (label: string, { allowZero }: { allowZero: boolean }) =>
  text(label, 20).refine(
    (value) => {
      const parsed = parseMoney(value);
      return parsed !== null && (allowZero ? parsed >= 0 : parsed > 0);
    },
    {
      message: `${label}: informe um valor em reais${allowZero ? "" : " maior que zero"}.`,
    },
  );

export const contractFieldsSchema = z
  .object({
    kind: z.enum(CONTRACT_KINDS, { error: "Escolha o tipo de contrato." }),
    company: z.enum(CONTRACT_COMPANY_KEYS, {
      error: "Escolha a empresa contratada.",
    }),
    contractNumber: optionalText("Número do contrato", 40),
    consultant: text("Consultor que assina pela contratada", 160),
  consultantRole: text("Cargo do consultor", 60),

    companyName: text("Razão social", 200),
    cnpj: text("CNPJ", 30),
    street: text("Endereço", 200),
    streetNumber: text("Número", 30),
    complement: optionalText("Complemento", 100),
    district: text("Bairro", 100),
    city: text("Cidade", 100),
    uf: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "UF: use a sigla com duas letras (ex.: MG)."),
    cep: text("CEP", 20),
    stateRegistration: text(
      "Inscrição estadual (use 'isento' se não houver)",
      60,
    ),
    municipalRegistration: text(
      "Inscrição municipal (use 'isento' se não houver)",
      60,
    ),

    representativeName: text("Responsável legal", 160),
    representativeCpf: text("CPF do responsável", 20),
    representativeBirthDate: text("Data de nascimento", 20),
    landline: optionalText("Telefone fixo", 80),
    phones: text("Celular(es)", 80),
    email: text("E-mail", 320),
    segment: text("Segmento", 200),

    residueGroups: z.array(z.enum(["A", "B", "E"])),
    // Obrigatória só nos contratos recorrentes (ver `superRefine`): a coleta única
    // tem o texto "uma única coleta previamente agendada" fixo no modelo.
    frequency: optionalText("Frequência de coleta", 120),

    monthlyFee: money("Valor da mensalidade", { allowZero: false }),
    monthlyAllowanceKg: text("Franquia mensal (kg)", 20).refine(
      (value) => {
        const parsed = parseQuantityKg(value);
        return parsed !== null && Number.isInteger(parsed) && parsed > 0;
      },
      { message: "Franquia mensal (kg): informe um número inteiro de quilos." },
    ),
    excessPerKg: money("Valor do kg excedente", { allowZero: false }),
    packaging: text("Acondicionamento", 120),

    animalCollection: z.boolean(),
  advancePayment: z.boolean(),
  })
  .superRefine((fields, context) => {
    const traits = KIND_TRAITS[fields.kind];

    if (traits.health && fields.residueGroups.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["residueGroups"],
        message: "Resíduos: marque ao menos um grupo (A, B ou E).",
      });
    }

    if (traits.recurring && !fields.frequency) {
      context.addIssue({
        code: "custom",
        path: ["frequency"],
        message: "Frequência de coleta: obrigatório.",
      });
    }

    // Os modelos que cobram por período escrevem o período no texto: a
    // frequência precisa começar por uma palavra que se saiba converter.
    if (traits.billingPeriod && !billingPeriod(fields.frequency)) {
      context.addIssue({
        code: "custom",
        path: ["frequency"],
        message:
          "Frequência: comece por mensal, bimestral, trimestral, semestral… (ex.: 'bimestral (de dois em dois meses)').",
      });
    }
  }) satisfies z.ZodType<ContractFields>;

export type ContractFieldErrors = Partial<Record<keyof ContractFields, string>>;

/** Erros por campo, na ordem em que o formulário mostra. */
export function collectFieldErrors(error: z.ZodError): ContractFieldErrors {
  const errors: ContractFieldErrors = {};

  for (const issue of error.issues) {
    const key = issue.path[0] as keyof ContractFields | undefined;

    if (key && !errors[key]) errors[key] = issue.message;
  }

  return errors;
}
