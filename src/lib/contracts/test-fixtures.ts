import type { ContractFields } from "@/lib/contracts/fields";

/**
 * Dados FICTÍCIOS que reproduzem a estrutura de contratos reais assinados (um por
 * empresa e tipo): as edições manuais típicas do jurídico em relação ao card
 * (bairro corrigido, inscrição estadual com número onde o card diz "Isento"),
 * cliente pessoa física, telefone fixo etc. Nomes, documentos, telefones e
 * e-mails são inventados — nunca colocar aqui dado de cliente real. Só para testes.
 */

const common = {
  kind: "saude" as ContractFields["kind"],
  contractNumber: "",
  consultantRole: "Aux. comercial",
  advancePayment: true,
  complement: "",
  landline: "",
  residueGroups: ["A", "B", "E"] as ContractFields["residueGroups"],
  packaging: "1 (Um) saco de 100 (Cem) litros",
  animalCollection: false,
  uf: "MG",
} satisfies Partial<ContractFields>;

export const PETEXEMPLO_AMBIENTEC: ContractFields = {
  ...common,
  company: "AMBIENTEC",
  consultant: "Ana Consultora Teste",
  companyName: "Petexemplo Centro De Bem Estar Animal Ltda",
  cnpj: "11.222.333/0001-81",
  street: "Rua Das Palmeiras",
  streetNumber: "157",
  district: "Concenza",
  city: "Mateus Leme",
  cep: "35.670-000",
  stateRegistration: "000000001.00-01",
  municipalRegistration: "00012345",
  representativeName: "Maria Exemplo Silva",
  representativeCpf: "111.444.777-35",
  representativeBirthDate: "01/01/1980",
  phones: "31 90000-0001 e 11 90000-0002",
  email: "contato@petexemplo.example",
  segment:
    "Comércio varejista de animais vivos e de artigos e alimentos para animais de estimação",
  frequency: "mensal (Uma vez por mês)",
  monthlyFee: "120",
  monthlyAllowanceKg: "5",
  excessPerKg: "8,5",
  animalCollection: true,
};

export const ODONTO_COLEMAX: ContractFields = {
  ...common,
  company: "COLEMAX",
  consultant: "Bruno Consultor Teste",
  companyName: "Odontologia Exemplo Ltda",
  cnpj: "22.333.444/0001-55",
  street: "Rua Das Acacias",
  streetNumber: "35 Loja",
  district: "Planalto",
  city: "Belo Horizonte",
  cep: "31.730-500",
  stateRegistration: "isento",
  municipalRegistration: "isento",
  representativeName: "Paulo Exemplo Souza",
  representativeCpf: "222.333.444-05",
  representativeBirthDate: "02/02/1970",
  phones: "31 90000-0003",
  email: "contato@odontoexemplo.example",
  segment: "Atividade odontológica",
  frequency: "Semanal (Uma vez por semana)",
  monthlyFee: "190",
  monthlyAllowanceKg: "5",
  excessPerKg: "7,5",
  packaging: "01 (um) saco de 100 (Cem) litros",
};

export const JOANA_COLENORTE: ContractFields = {
  ...common,
  company: "COLENORTE",
  consultant: "Carla Vendedora Teste",
  companyName: "12.345.678 Joana Teste Mendes",
  cnpj: "12.345.678/0001-90",
  street: "Rua Das Laranjeiras",
  streetNumber: "18",
  district: "Centro",
  city: "Rubelita",
  cep: "39.565-000",
  stateRegistration: "0000000000001",
  municipalRegistration: "isento",
  representativeName: "Joana Teste Mendes",
  representativeCpf: "012.345.678-90",
  representativeBirthDate: "03/03/1985",
  phones: "19 90000-0004",
  email: "joana.teste@example.com",
  segment: "Atividades de estética e outros serviços de cuidados com a beleza",
  frequency: "mensal (Uma vez por mês)",
  monthlyFee: "130",
  monthlyAllowanceKg: "5",
  excessPerKg: "8,5",
};

export const EXEMPLO_BIOCOLETAS: ContractFields = {
  ...common,
  company: "BIOCOLETAS",
  consultant: "Diego Vendedor Teste",
  companyName: "Clinica Exemplo - Laserterapia E Saude Da Mulher S/S Ltda",
  cnpj: "33.444.555/0001-66",
  street: "Avenida Sete De Setembro",
  streetNumber: "80",
  complement: "Sala 04",
  district: "Centro",
  city: "São Joao Del Rei",
  cep: "36.307-250",
  stateRegistration: "Isento",
  municipalRegistration: "Isento",
  representativeName: "Marcos Exemplo De Souza",
  representativeCpf: "333.444.555-06",
  representativeBirthDate: "04/04/1972",
  phones: "32 90000-0005",
  email: "marcos.teste@example.com",
  segment:
    "Atividades de atendimento hospitalar, exceto pronto-socorro e unidades para atendimento a urgências",
  frequency: "Mensal (Uma vez por mês)",
  monthlyFee: "130",
  monthlyAllowanceKg: "5",
  excessPerKg: "7,5",
};

/**
 * Contrato 35980 (Ambientec). O nome do cliente tem "Industrial", mas o texto é
 * o modelo de saúde. É o único dos contratos de referência que imprime telefone
 * fixo (o card tem um fixo diferente do celular).
 */
export const IMPLANTES_AMBIENTEC: ContractFields = {
  ...common,
  company: "AMBIENTEC",
  consultant: "Carla Vendedora Teste",
  companyName: "Implantes Exemplo Ltda",
  cnpj: "44.555.666/0001-77",
  street: "Rua Tiradentes",
  streetNumber: "2290 loja 05",
  district: "Industrial",
  city: "Contagem",
  cep: "32.230-020",
  stateRegistration: "isento",
  municipalRegistration: "72000001",
  representativeName: "Ricardo Teste Souza",
  representativeCpf: "444.555.666-07",
  representativeBirthDate: "01/01/1990",
  landline: "31 3000-0001",
  phones: "31 90000-0006",
  email: "contato@implantesexemplo.example",
  segment: "Atividade odontológica",
  frequency: "mensal (Uma vez por mês)",
  monthlyFee: "120",
  monthlyAllowanceKg: "5",
  excessPerKg: "7,5",
};

/**
 * Contrato 36793 (Ambientec, industrial Classe I, mai/2026). Preço por trimestre.
 * Substituiu o contrato de 2024 como referência do modelo industrial.
 */
export const EXEMPLO_AMBIENTEC_INDUSTRIAL: ContractFields = {
  ...common,
  kind: "industrial",
  company: "AMBIENTEC",
  consultant: "Ana Consultora Teste",
  consultantRole: "Representante comercial",
  companyName: "Sinalização Exemplo Industrial Ltda",
  cnpj: "77.888.999/0001-10",
  street: "Rua Iguato",
  streetNumber: "145",
  district: "Parque Industrial",
  city: "Contagem",
  cep: "32.341-460",
  stateRegistration: "000.000.001-0001",
  municipalRegistration: "72000002-0",
  representativeName: "Marta Teste Tavares",
  representativeCpf: "777.888.999-10",
  representativeBirthDate: "06/01/1990",
  landline: "",
  phones: "90000-0007",
  email: "comercial@sinalizacao.example",
  segment:
    "Fabricação de letras, letreiros e placas de qualquer material, exceto luminosos",
  residueGroups: [],
  frequency: "Trimestral (Uma vez a cada três meses)",
  monthlyFee: "380",
  monthlyAllowanceKg: "25",
  excessPerKg: "8,5",
};

/**
 * Contrato 36978 (Colefar, jun/2026). Na abertura a Colefar escreve só
 * "Contato 37 90000-0008" (sem o rótulo "Celular").
 */
export const FARMA_COLEFAR: ContractFields = {
  ...common,
  company: "COLEFAR",
  consultant: "Diego Vendedor Teste",
  companyName: "Comercio Farmacêutico Exemplo Ltda",
  cnpj: "88.999.000/0001-21",
  street: "Praça Da Matriz",
  streetNumber: "18",
  district: "Centro",
  city: "Pitangui",
  cep: "35.650-000",
  stateRegistration: "isento",
  municipalRegistration: "isento",
  representativeName: "Natalia Teste De Carvalho",
  representativeCpf: "888.999.000-11",
  representativeBirthDate: "05/05/1987",
  phones: "37 90000-0008",
  email: "e-mail.teste@example.com",
  segment:
    "Comércio varejista de produtos farmacêuticos, sem manipulação de fórmulas",
  frequency: "mensal (Uma vez por mês)",
  monthlyFee: "122,5",
  monthlyAllowanceKg: "5",
  excessPerKg: "7,5",
};
