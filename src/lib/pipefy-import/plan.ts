import {
  cleanText,
  isHttpUrl,
  isValidEmail,
  normalize,
  toFieldKey,
  toSlug,
} from "./text";
import { isMidnight, wallClockToInstant } from "./time";

/**
 * Planejamento da importação de um relatório exportado do Pipefy.
 *
 * Tudo aqui é puro: recebe as linhas da planilha e devolve o que seria criado,
 * sem tocar em banco nem em disco. Isso permite mostrar o plano ao usuário antes
 * de gravar e testar a inferência com dados sintéticos. Cada pipe tem campos
 * diferentes, então nada aqui assume nomes de coluna além das que o próprio
 * Pipefy sempre exporta (Título, Fase atual, Criado em...). O resto é inferido
 * dos dados e pode ser corrigido por um arquivo de mapeamento.
 */

export type FieldType =
  | "short_text"
  | "long_text"
  | "number"
  | "currency"
  | "date"
  | "datetime"
  | "select"
  | "email"
  | "phone"
  | "url"
  | "attachment";

export type Priority = "low" | "medium" | "high" | "urgent";

export type ImportMapping = {
  board?: {
    name?: string;
    slug?: string;
    color?: string;
    description?: string;
    /** "private": só administradores e membros do quadro enxergam. */
    visibility?: "workspace" | "private";
  };
  /** Fuso em que o Pipefy exportou as datas. Padrão: America/Sao_Paulo. */
  timezone?: string;
  /** Nomes de coluna. Quando ausentes, são inferidos. */
  title?: string;
  description?: string;
  requesterName?: string;
  requesterEmail?: string;
  initialPhase?: string;
  finalPhases?: string[];
  phaseOrder?: string[];
  skipColumns?: string[];
  fieldTypes?: Record<string, FieldType>;
  /** Coluna → nome da fase, ou null para campo geral (formulário inicial). */
  fieldPhases?: Record<string, string | null>;
  fieldLabels?: Record<string, string>;
  /** Etiqueta do Pipefy → prioridade. */
  priorities?: Record<string, Priority>;
  /** Criadores que representam o formulário (cards com `source = form`). */
  formCreators?: string[];
  kanbanFields?: string[];
  form?: { name?: string; successMessage?: string; skip?: boolean };
};

export type PlanPhase = {
  name: string;
  position: number;
  isInitial: boolean;
  isFinal: boolean;
  cardCount: number;
};

export type PlanField = {
  column: string;
  key: string;
  label: string;
  type: FieldType;
  options: string[];
  /** Nome da fase, ou null para campo geral. */
  phase: string | null;
  inForm: boolean;
  required: boolean;
  filled: number;
};

export type PlanEvent = {
  type: "card.created" | "card.moved" | "card.completed";
  at: Date;
  metadata: Record<string, unknown>;
};

export type PlanCard = {
  number: number;
  code: string | null;
  title: string;
  description: string | null;
  requesterName: string | null;
  requesterEmail: string | null;
  phase: string;
  status: "active" | "completed";
  priority: Priority;
  position: number;
  source: "form" | "manual";
  creator: string | null;
  createdAt: Date;
  updatedAt: Date;
  phaseEnteredAt: Date;
  completedAt: Date | null;
  dueAt: Date | null;
  /** Valores por chave de campo, já normalizados. Anexos ficam em `attachments`. */
  values: Record<string, unknown>;
  attachments: Array<{ fieldKey: string; url: string }>;
  comment: { body: string; at: Date } | null;
  events: PlanEvent[];
};

export type PlanFormField = {
  label: string;
  type: FieldType;
  targetField: "title" | "description" | "requester_name" | "requester_email" | null;
  fieldKey: string | null;
  options: string[];
  required: boolean;
};

export type ImportPlan = {
  board: {
    name: string;
    slug: string;
    color: string;
    description: string;
    visibility: "workspace" | "private";
  };
  timezone: string;
  phases: PlanPhase[];
  fields: PlanField[];
  form: {
    name: string;
    successMessage: string;
    requireRequesterEmail: boolean;
    targetPhase: string;
    fields: PlanFormField[];
  } | null;
  kanbanFieldKeys: string[];
  cards: PlanCard[];
  /** Colunas deixadas de fora, com o motivo. */
  skippedColumns: Array<{ column: string; reason: string }>;
  warnings: string[];
  summary: {
    byPriority: Record<Priority, number>;
    bySource: Record<"form" | "manual", number>;
    creators: Record<string, number>;
    assignees: Record<string, number>;
    ignoredLabels: Record<string, number>;
    attachmentCount: number;
  };
};

type Cell = unknown;
type Column = { index: number; header: string; norm: string };

const STANDARD = {
  title: "titulo",
  phase: "fase atual",
  creator: "criador",
  createdAt: "criado em",
  finishedAt: "finalizado em",
  code: "codigo",
  labels: "etiquetas",
  due: "data de vencimento",
  assignees: "responsaveis",
  updatedAt: "atualizado em",
  lastComment: "ultimo comentario",
  lastCommentAt: "ultimo comentario em",
} as const;

/** Colunas que o Pipefy calcula e que não viram campo. */
const IGNORED_STANDARD: Array<{ norm: string; reason: string }> = [
  { norm: "expirado em", reason: "SLA do Pipefy, sem equivalente" },
  { norm: "vencido", reason: "derivado da data de vencimento" },
];

const ENTERED_PHASE = /^primeira vez que entrou na fase\s+(.+)$/i;
const LEFT_PHASE = /^ultima vez que saiu da fase\s+/;
const TIME_IN_PHASE = /^tempo total na fase\s+/;

const MAX_TITLE = 240;
const MAX_SHORT_TEXT = 500;
const MAX_LONG_TEXT = 20_000;
const MAX_SELECT_OPTIONS = 40;
// O limite do banco para o valor de uma opção é 120 caracteres.
const MAX_OPTION_LENGTH = 120;

const PRIORITY_RANK: Record<Priority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  urgent: 3,
};

const DEFAULT_PRIORITY_RULES: Array<{ pattern: RegExp; priority: Priority }> = [
  { pattern: /critic|urgente/, priority: "urgent" },
  { pattern: /\balta\b/, priority: "high" },
  { pattern: /\bmedia\b/, priority: "medium" },
  { pattern: /\bbaixa\b/, priority: "low" },
];

/**
 * Valor feito só de pontuação. Campos condicionais do Pipefy ("Se sim, informe
 * qual...") chegam como "," ou "." quando a pergunta não se aplica; tratar isso
 * como valor encheria o sistema de campos "preenchidos" com lixo e faria campos
 * opcionais parecerem obrigatórios.
 */
const PUNCTUATION_ONLY = /^[\s,.\-–—_:;/\\|]+$/;

const ISO_WALL_DATE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/;

/** Data escrita como texto, devolvida como horário de parede em UTC. */
function parseWallDate(text: string): Date | null {
  const match = ISO_WALL_DATE.exec(text.trim());
  if (!match) return null;

  const [, year, month, day, hour = "0", minute = "0", second = "0"] = match;
  const wall = new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second));

  // Recusa datas impossíveis (2026-02-31), que o Date empurraria para março.
  return wall.getUTCMonth() === +month - 1 ? wall : null;
}

function isEmptyCell(cell: Cell): boolean {
  if (cell === null || cell === undefined) return true;
  if (typeof cell !== "string") return false;

  const trimmed = cell.trim();
  return trimmed === "" || PUNCTUATION_ONLY.test(trimmed);
}

function asText(cell: Cell): string | null {
  if (typeof cell === "string") {
    return isEmptyCell(cell) ? null : cell.trim();
  }
  if (typeof cell === "number" && Number.isFinite(cell)) return String(cell);
  return null;
}

function isBlankRow(row: Cell[]): boolean {
  return row.every((cell) => cell === null || cell === undefined || cell === "");
}

export function buildPlan(
  rawRows: Cell[][],
  mapping: ImportMapping = {},
  sourceName = "planilha",
): ImportPlan {
  const timezone = mapping.timezone ?? "America/Sao_Paulo";
  const warnings: string[] = [];
  const skippedColumns: Array<{ column: string; reason: string }> = [];

  if (rawRows.length < 2) {
    throw new Error("A planilha não tem linhas de dados.");
  }

  const columns: Column[] = rawRows[0].map((cell, index) => {
    const header = cleanText(String(cell ?? ""));
    return { index, header, norm: normalize(header) };
  });
  const rows = rawRows.slice(1).filter((row) => !isBlankRow(row));

  const findColumn = (name: string | undefined): Column | undefined => {
    if (!name) return undefined;
    const wanted = normalize(name);
    return columns.find((column) => column.norm === wanted);
  };

  const requireColumn = (label: string, name: string): Column => {
    const column = findColumn(name);
    if (!column) {
      throw new Error(
        `Coluna obrigatória ausente: "${label}". Confira se é um relatório do Pipefy.`,
      );
    }
    return column;
  };

  const titleCol = findColumn(mapping.title) ?? requireColumn("Título", STANDARD.title);
  const phaseCol = requireColumn("Fase atual", STANDARD.phase);
  const createdCol = requireColumn("Criado em", STANDARD.createdAt);
  const creatorCol = findColumn(STANDARD.creator);
  const finishedCol = findColumn(STANDARD.finishedAt);
  const codeCol = findColumn(STANDARD.code);
  const labelsCol = findColumn(STANDARD.labels);
  const dueCol = findColumn(STANDARD.due);
  const assigneesCol = findColumn(STANDARD.assignees);
  const updatedCol = findColumn(STANDARD.updatedAt);
  const commentCol = findColumn(STANDARD.lastComment);
  const commentAtCol = findColumn(STANDARD.lastCommentAt);

  const used = new Set<number>(
    [
      titleCol, phaseCol, createdCol, creatorCol, finishedCol, codeCol,
      labelsCol, dueCol, assigneesCol, updatedCol, commentCol, commentAtCol,
    ]
      .filter((column): column is Column => Boolean(column))
      .map((column) => column.index),
  );

  // Colunas de histórico por fase.
  const phaseEntryColumns: Array<{ phase: string; column: Column }> = [];
  for (const column of columns) {
    const match = ENTERED_PHASE.exec(column.header) ?? ENTERED_PHASE.exec(column.norm);
    if (match) {
      // O nome original, com acento e maiúsculas, vem do cabeçalho — não da
      // forma normalizada.
      const original = /^primeira vez que entrou na fase\s+(.+)$/i.exec(column.header);
      phaseEntryColumns.push({
        phase: cleanText(original?.[1] ?? match[1]),
        column,
      });
      used.add(column.index);
    } else if (LEFT_PHASE.test(column.norm) || TIME_IN_PHASE.test(column.norm)) {
      used.add(column.index);
    }
  }

  if (phaseEntryColumns.length === 0) {
    throw new Error(
      'Nenhuma coluna "Primeira vez que entrou na fase ..." encontrada. Exporte o relatório com todas as colunas.',
    );
  }

  for (const ignored of IGNORED_STANDARD) {
    const column = findColumn(ignored.norm);
    if (column && !used.has(column.index)) {
      used.add(column.index);
      skippedColumns.push({ column: column.header, reason: ignored.reason });
    }
  }

  // Colunas explícitas do usuário.
  const skipSet = new Set((mapping.skipColumns ?? []).map(normalize));
  for (const column of columns) {
    if (!used.has(column.index) && skipSet.has(column.norm)) {
      used.add(column.index);
      skippedColumns.push({ column: column.header, reason: "ignorada pelo mapeamento" });
    }
  }

  // Solicitante e descrição: mapeamento primeiro, depois nomes típicos.
  const unused = () => columns.filter((column) => !used.has(column.index));

  const emailCol =
    findColumn(mapping.requesterEmail) ??
    unused().find((column) => /e ?mail/.test(column.norm) && /solicitante|requerente|cliente/.test(column.norm)) ??
    (unused().filter((column) => /e ?mail/.test(column.norm)).length === 1
      ? unused().find((column) => /e ?mail/.test(column.norm))
      : undefined);
  if (emailCol) used.add(emailCol.index);

  const nameCol =
    findColumn(mapping.requesterName) ??
    unused().find((column) => /^nome.*(solicitante|requerente)|^(solicitante|requerente)$/.test(column.norm));
  if (nameCol) used.add(nameCol.index);

  const descriptionCol =
    findColumn(mapping.description) ??
    unused().find((column) => /^detalhes?\b|^descricao d[aoe] (solicitacao|chamado|pedido)/.test(column.norm));
  if (descriptionCol) used.add(descriptionCol.index);

  const cellText = (row: Cell[], column: Column | undefined) =>
    column ? asText(row[column.index]) : null;

  // Aceita a célula de data do Excel e também a data escrita como texto
  // ("1972-03-31", "2026-05-27 09:40:46"), que é como o Pipefy exporta campos
  // de data de formulário.
  const toInstant = (cell: Cell): Date | null => {
    if (cell instanceof Date) {
      return Number.isFinite(cell.getTime()) ? wallClockToInstant(cell, timezone) : null;
    }

    const wall = typeof cell === "string" ? parseWallDate(cell) : null;
    return wall ? wallClockToInstant(wall, timezone) : null;
  };

  // Colunas duplicadas de outras: o Pipefy repete o título do formulário e o
  // responsável. Comparar os valores evita criar um campo que só repete outro.
  const sameValues = (a: Column, b: Column): boolean => {
    let both = 0;
    let equal = 0;
    for (const row of rows) {
      const left = asText(row[a.index]);
      const right = asText(row[b.index]);
      if (left === null && right === null) continue;
      both += 1;
      if (left !== null && right !== null && left === right) equal += 1;
    }
    return both >= 5 && equal / both >= 0.99;
  };

  const compareAgainst = [titleCol, assigneesCol, descriptionCol, nameCol, emailCol, creatorCol]
    .filter((column): column is Column => Boolean(column));

  let titleFormLabel: string | null = null;
  const candidates: Column[] = [];

  for (const column of unused()) {
    const duplicateOf = compareAgainst.find((other) => sameValues(column, other));
    if (duplicateOf) {
      used.add(column.index);
      skippedColumns.push({
        column: column.header,
        reason: `repete "${duplicateOf.header}"`,
      });
      if (duplicateOf.index === titleCol.index) titleFormLabel = column.header;
      continue;
    }

    const filled = rows.filter((row) => asText(row[column.index]) !== null || row[column.index] instanceof Date).length;
    if (filled === 0) {
      used.add(column.index);
      skippedColumns.push({ column: column.header, reason: "sem nenhum valor" });
      continue;
    }

    candidates.push(column);
  }

  // Fases ---------------------------------------------------------------------
  const phaseNameByNorm = new Map<string, string>();
  for (const { phase } of phaseEntryColumns) phaseNameByNorm.set(normalize(phase), phase);

  const canonicalPhase = (value: string | null): string | null => {
    if (!value) return null;
    return phaseNameByNorm.get(normalize(value)) ?? null;
  };

  type RawCard = {
    row: Cell[];
    createdAt: Date;
    current: string;
    transitions: Array<{ phase: string; at: Date }>;
  };

  const rawCards: RawCard[] = [];
  let skippedRows = 0;

  for (const row of rows) {
    const createdAt = toInstant(row[createdCol.index]);
    const current = canonicalPhase(cellText(row, phaseCol));

    if (!createdAt || !current) {
      skippedRows += 1;
      continue;
    }

    const transitions = phaseEntryColumns
      .map(({ phase, column }) => ({ phase, at: toInstant(row[column.index]) }))
      .filter((entry): entry is { phase: string; at: Date } => entry.at !== null)
      .sort((a, b) => a.at.getTime() - b.at.getTime());

    rawCards.push({ row, createdAt, current, transitions });
  }

  if (skippedRows > 0) {
    warnings.push(`${skippedRows} linha(s) sem data de criação ou com fase desconhecida foram ignoradas.`);
  }

  const phaseNames = [...new Set(phaseEntryColumns.map(({ phase }) => phase))];

  const firstPhaseVotes = new Map<string, number>();
  const visitCount = new Map<string, number>();
  const beats = new Map<string, number>();

  for (const card of rawCards) {
    const sequence = card.transitions.map((entry) => entry.phase);
    if (sequence.length > 0) {
      firstPhaseVotes.set(sequence[0], (firstPhaseVotes.get(sequence[0]) ?? 0) + 1);
    }
    for (const phase of sequence) visitCount.set(phase, (visitCount.get(phase) ?? 0) + 1);
    for (let i = 0; i < sequence.length; i += 1) {
      for (let j = i + 1; j < sequence.length; j += 1) {
        const key = `${sequence[i]}\u0000${sequence[j]}`;
        beats.set(key, (beats.get(key) ?? 0) + 1);
      }
    }
  }

  const mostVoted = [...firstPhaseVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const initialPhase =
    canonicalPhase(mapping.initialPhase ?? null) ?? mostVoted ?? phaseNames[0];

  // Fases finais: o Pipefy só preenche "Finalizado em" quando o card entra numa
  // fase final. Fases terminais que não têm "concluído" no nome ("Contrato
  // perdido", "Formulário preenchido errado") são reconhecidas por aí.
  const currentByPhase = new Map<string, number>();
  const finishedByPhase = new Map<string, number>();
  for (const card of rawCards) {
    currentByPhase.set(card.current, (currentByPhase.get(card.current) ?? 0) + 1);
    if (finishedCol && toInstant(card.row[finishedCol.index])) {
      finishedByPhase.set(card.current, (finishedByPhase.get(card.current) ?? 0) + 1);
    }
  }

  const looksFinal = (name: string) => {
    if (/conclu|finaliz|resolv|encerr|fechad|entreg|done|closed/.test(normalize(name))) return true;
    const finished = finishedByPhase.get(name) ?? 0;
    return finished >= 3 && finished / (currentByPhase.get(name) ?? 1) >= 0.05;
  };

  const finalPhases = new Set<string>(
    (mapping.finalPhases
      ? mapping.finalPhases.map((name) => canonicalPhase(name))
      : phaseNames.filter((name) => name !== initialPhase && looksFinal(name)))
      .filter((name): name is string => Boolean(name)),
  );

  const score = (phase: string) =>
    phaseNames.reduce((total, other) => {
      if (other === phase) return total;
      const forward = beats.get(`${phase}\u0000${other}`) ?? 0;
      const backward = beats.get(`${other}\u0000${phase}`) ?? 0;
      return total + Math.sign(forward - backward);
    }, 0);

  let orderedPhases: string[];
  if (mapping.phaseOrder) {
    const explicit = mapping.phaseOrder
      .map((name) => canonicalPhase(name))
      .filter((name): name is string => Boolean(name));
    orderedPhases = [...explicit, ...phaseNames.filter((name) => !explicit.includes(name))];
  } else {
    const rank = (phase: string) => (phase === initialPhase ? 0 : finalPhases.has(phase) ? 2 : 1);
    // Entre as fases finais não há ordem de passagem a aprender (o card termina
    // numa só delas), então vale a mais usada primeiro.
    orderedPhases = [...phaseNames].sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (rank(a) === 2 ? 0 : score(b) - score(a)) ||
        (visitCount.get(b) ?? 0) - (visitCount.get(a) ?? 0) ||
        a.localeCompare(b),
    );
  }

  // Tipos de campo -----------------------------------------------------------
  const takenKeys = new Set<string>();
  const parseNumber = (value: string): number | null => {
    let text = value.replace(/r\$/gi, "").replace(/\s/g, "");
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(text)) text = text.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d+,\d+$/.test(text)) text = text.replace(",", ".");
    if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const inferType = (column: Column): { type: FieldType; options: string[] } => {
    const override = mapping.fieldTypes?.[column.header];
    const cells = rows.map((row) => row[column.index]).filter((cell) => !isEmptyCell(cell));
    const texts = cells.map((cell) => (cell instanceof Date ? null : String(cell).trim())).filter((value): value is string => value !== null && value !== "");
    const distinct = [...new Set(texts)];

    const optionsFrom = () =>
      distinct
        .map((value) => value.slice(0, 120))
        .sort((a, b) => a.localeCompare(b, "pt-BR"));

    if (override) return { type: override, options: override === "select" ? optionsFrom() : [] };

    const pipefyUrls = texts.filter((value) => /https?:\/\/\S*pipefy\.com\/storage/i.test(value)).length;
    if (texts.length > 0 && pipefyUrls / texts.length >= 0.8) return { type: "attachment", options: [] };

    const walls = cells.map((cell) => (cell instanceof Date ? cell : typeof cell === "string" ? parseWallDate(cell) : null));
    if (cells.length > 0 && walls.every((wall): wall is Date => wall !== null)) {
      return { type: walls.every((wall) => isMidnight(wall)) ? "date" : "datetime", options: [] };
    }

    if (texts.length > 0 && texts.length === cells.length) {
      // Número só quando TODOS os valores são numéricos. Aceitar 95% descartava o
      // resto ("S/N" num número de endereço), e é perda silenciosa de dado.
      // Identificadores (CEP, CPF, proposta, inscrição) nunca são número: zeros à
      // esquerda são parte do valor, e "030130" não é "30130".
      const identifierLike =
        /\b(numero|cep|cpf|cnpj|inscri\w*|proposta|codigo|matricula|protocolo|rg|ddd)\b/.test(column.norm) &&
        !/quantidade|valor|preco|total|\bkg\b/.test(column.norm);
      const leadingZero = texts.some((value) => /^0\d/.test(value));
      const allNumeric = texts.every((value) => parseNumber(value) !== null);

      if (allNumeric && !identifierLike && !leadingZero) {
        return { type: /valor|preco|custo|total|r\$/.test(column.norm) ? "currency" : "number", options: [] };
      }

      if (texts.every((value) => isValidEmail(value))) return { type: "email", options: [] };
      if (texts.every((value) => isHttpUrl(value))) return { type: "url", options: [] };

      // Telefone só quando o nome da coluna também indica: um CPF formatado
      // (123.456.789-09) tem a mesma cara de número de telefone.
      const phoneShaped = texts.filter((value) => /^\+?[\d\s().-]{8,22}$/.test(value) && (value.match(/\d/g)?.length ?? 0) >= 8).length;
      if (phoneShaped / texts.length >= 0.95 && /fone|celular|telefone|whats|ddd/.test(column.norm)) {
        return { type: "phone", options: [] };
      }

      const longest = Math.max(...texts.map((value) => value.length));
      const repeats = texts.length >= distinct.length * 2;
      if (
        distinct.length <= MAX_SELECT_OPTIONS &&
        longest <= MAX_OPTION_LENGTH &&
        repeats &&
        (distinct.length <= 12 || distinct.length / texts.length <= 0.1)
      ) {
        return { type: "select", options: optionsFrom() };
      }

      const multiline = texts.some((value) => value.includes("\n"));
      return { type: longest > 200 || multiline ? "long_text" : "short_text", options: [] };
    }

    return { type: "short_text", options: [] };
  };

  // Fase de cada campo: a fase em que o campo é preenchido é aquela que quase
  // todos os cards com valor visitaram e que poucos outros visitaram.
  const visitedByRow: Array<Set<string>> = rawCards.map(
    (card) => new Set(card.transitions.map((entry) => entry.phase)),
  );
  const visitedTotals = new Map<string, number>();
  for (const visited of visitedByRow) {
    for (const phase of visited) visitedTotals.set(phase, (visitedTotals.get(phase) ?? 0) + 1);
  }

  const inferPhase = (column: Column): string | null => {
    if (mapping.fieldPhases && column.header in mapping.fieldPhases) {
      const configured = mapping.fieldPhases[column.header];
      return configured === null ? null : canonicalPhase(configured);
    }

    const filledIdx: number[] = [];
    rawCards.forEach((card, index) => {
      const cell = card.row[column.index];
      if (cell instanceof Date || asText(cell) !== null) filledIdx.push(index);
    });
    if (filledIdx.length === 0) return null;

    // Cobertura alta não basta: quase todo card passa pela fase final, então um
    // campo preenchido em todos "pertenceria" a ela. A fase só vale quando é
    // específica — visitada por bem menos cards do que a média (lift >= 1,5).
    // Sem isso, o campo fica geral, que é o comportamento seguro: aparece sempre.
    let best: { phase: string; lift: number } | null = null;
    for (const phase of phaseNames) {
      if (phase === initialPhase) continue;
      const hits = filledIdx.filter((index) => visitedByRow[index].has(phase)).length;
      const coverage = hits / filledIdx.length;
      if (coverage < 0.8) continue;
      const lift = coverage / ((visitedTotals.get(phase) ?? 1) / rawCards.length);
      if (lift < 1.5) continue;
      if (!best || lift > best.lift) best = { phase, lift };
    }

    return best?.phase ?? null;
  };

  const creatorsAsForm = new Set((mapping.formCreators ?? ["Pipebot"]).map(normalize));
  const formCardIdx = rawCards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => creatorsAsForm.has(normalize(cellText(card.row, creatorCol) ?? "")))
    .map(({ index }) => index);

  const fields: PlanField[] = [];
  const fieldByColumn = new Map<number, PlanField>();

  if (codeCol) {
    const field: PlanField = {
      column: codeCol.header,
      key: toFieldKey("Código Pipefy", takenKeys),
      label: "Código Pipefy",
      type: "short_text",
      options: [],
      phase: null,
      inForm: false,
      required: false,
      filled: rawCards.length,
    };
    fields.push(field);
    fieldByColumn.set(codeCol.index, field);
  }

  const manualCreators = new Set<string>();
  if (creatorCol) {
    for (const card of rawCards) {
      const creator = cellText(card.row, creatorCol);
      if (creator && !creatorsAsForm.has(normalize(creator))) manualCreators.add(creator);
    }
  }

  let creatorField: PlanField | null = null;
  if (manualCreators.size > 0) {
    creatorField = {
      column: creatorCol!.header,
      key: toFieldKey("Criado por (Pipefy)", takenKeys),
      label: "Criado por (Pipefy)",
      type: "short_text",
      options: [],
      phase: null,
      inForm: false,
      required: false,
      filled: 0,
    };
    fields.push(creatorField);
  }

  for (const column of candidates) {
    const { type, options } = inferType(column);
    const phase = inferPhase(column);
    const filled = rawCards.filter((card) => {
      const cell = card.row[column.index];
      return cell instanceof Date || asText(cell) !== null;
    }).length;

    const fillAmongFormCards = formCardIdx.length
      ? formCardIdx.filter((index) => {
          const cell = rawCards[index].row[column.index];
          return cell instanceof Date || asText(cell) !== null;
        }).length / formCardIdx.length
      : 0;

    const field: PlanField = {
      column: column.header,
      key: toFieldKey(mapping.fieldLabels?.[column.header] ?? column.header, takenKeys),
      label: mapping.fieldLabels?.[column.header] ?? column.header.replace(/[:\s]+$/, ""),
      type,
      options,
      phase,
      inForm: phase === null,
      required: phase === null && fillAmongFormCards >= 0.99,
      filled,
    };

    fields.push(field);
    fieldByColumn.set(column.index, field);
    used.add(column.index);
  }

  // Rótulos únicos: o Pipefy permite duas colunas com o mesmo nome ("CPF:" e o
  // anexo "CPF"), mas dois campos iguais na tela não se distinguem.
  const labelSeen = new Map<string, number>();
  for (const field of fields) {
    const key = normalize(field.label);
    const count = (labelSeen.get(key) ?? 0) + 1;
    labelSeen.set(key, count);

    if (count > 1) {
      field.label = `${field.label} ${field.type === "attachment" ? "(anexo)" : `(${count})`}`;
    }
  }

  // Cards --------------------------------------------------------------------
  const priorityOf = (labelsText: string | null, ignored: Record<string, number>): Priority => {
    if (!labelsText) return "medium";

    let best: Priority | null = null;
    for (const label of labelsText.split(",").map((part) => part.trim()).filter(Boolean)) {
      const norm = normalize(label);
      const explicit = Object.entries(mapping.priorities ?? {}).find(([name]) => normalize(name) === norm)?.[1];
      const matched = explicit ?? DEFAULT_PRIORITY_RULES.find((rule) => rule.pattern.test(norm))?.priority;

      if (!matched) {
        ignored[label] = (ignored[label] ?? 0) + 1;
        continue;
      }
      if (best === null || PRIORITY_RANK[matched] > PRIORITY_RANK[best]) best = matched;
    }

    return best ?? "medium";
  };

  const summary: ImportPlan["summary"] = {
    byPriority: { low: 0, medium: 0, high: 0, urgent: 0 },
    bySource: { form: 0, manual: 0 },
    creators: {},
    assignees: {},
    ignoredLabels: {},
    attachmentCount: 0,
  };

  let truncatedTitles = 0;
  let truncatedValues = 0;
  let invalidEmails = 0;
  let invalidNumbers = 0;
  let reconciled = 0;

  const cards: PlanCard[] = rawCards.map((raw) => {
    const { row } = raw;
    const creator = cellText(row, creatorCol);
    const source: "form" | "manual" = creator && creatorsAsForm.has(normalize(creator)) ? "form" : "manual";

    let title = cellText(row, titleCol) ?? cellText(row, codeCol) ?? "(sem título)";
    if (title.length > MAX_TITLE) {
      title = title.slice(0, MAX_TITLE - 1) + "…";
      truncatedTitles += 1;
    }

    let requesterEmail = cellText(row, emailCol)?.toLocaleLowerCase("en-US") ?? null;
    if (requesterEmail && !isValidEmail(requesterEmail)) {
      invalidEmails += 1;
      requesterEmail = null;
    }

    const updatedAt = toInstant(updatedCol ? row[updatedCol.index] : null) ?? raw.createdAt;

    // Histórico: o Pipefy só informa a primeira entrada em cada fase.
    const sequence = raw.transitions.length > 0 ? [...raw.transitions] : [{ phase: raw.current, at: raw.createdAt }];
    if (sequence[sequence.length - 1].phase !== raw.current) {
      const last = sequence[sequence.length - 1].at;
      sequence.push({
        phase: raw.current,
        at: new Date(Math.max(updatedAt.getTime(), last.getTime() + 1000)),
      });
      reconciled += 1;
    }

    const events: PlanEvent[] = [
      {
        type: "card.created",
        at: raw.createdAt,
        metadata: {
          imported: true,
          source,
          phaseName: sequence[0].phase,
          ...(source === "manual" && creator ? { importedCreator: creator } : {}),
        },
      },
    ];

    for (let i = 1; i < sequence.length; i += 1) {
      events.push({
        type: "card.moved",
        at: sequence[i].at,
        metadata: {
          imported: true,
          fromPhaseName: sequence[i - 1].phase,
          toPhaseName: sequence[i].phase,
        },
      });
      if (finalPhases.has(sequence[i].phase)) {
        events.push({
          type: "card.completed",
          at: sequence[i].at,
          metadata: { imported: true, phaseName: sequence[i].phase },
        });
      }
    }

    const isFinal = finalPhases.has(raw.current);
    const phaseEnteredAt = sequence[sequence.length - 1].at;
    const completedAt = isFinal ? toInstant(finishedCol ? row[finishedCol.index] : null) ?? phaseEnteredAt : null;

    const values: Record<string, unknown> = {};
    const attachments: Array<{ fieldKey: string; url: string }> = [];

    for (const [columnIndex, field] of fieldByColumn) {
      if (field.column === codeCol?.header && columnIndex === codeCol.index) {
        const code = cellText(row, codeCol);
        if (code) values[field.key] = code;
        continue;
      }

      const cell = row[columnIndex];
      if (isEmptyCell(cell)) continue;

      switch (field.type) {
        case "attachment": {
          for (const url of String(cell).match(/https?:\/\/[^\s,;]+/g) ?? []) {
            attachments.push({ fieldKey: field.key, url });
          }
          break;
        }
        case "date":
        case "datetime": {
          const instant = toInstant(cell);
          if (instant) values[field.key] = instant.toISOString();
          break;
        }
        case "number":
        case "currency": {
          const parsed = parseNumber(String(cell));
          if (parsed === null) invalidNumbers += 1;
          else values[field.key] = parsed;
          break;
        }
        case "email": {
          const text = String(cell).trim().toLocaleLowerCase("en-US");
          if (isValidEmail(text)) values[field.key] = text;
          else invalidEmails += 1;
          break;
        }
        case "select": {
          const text = String(cell).trim().slice(0, 120);
          if (text) values[field.key] = text;
          break;
        }
        default: {
          let text = String(cell).trim();
          const cap = field.type === "long_text" ? MAX_LONG_TEXT : MAX_SHORT_TEXT;
          if (text.length > cap) {
            text = text.slice(0, cap);
            truncatedValues += 1;
          }
          if (text) values[field.key] = text;
        }
      }
    }

    if (creatorField && source === "manual" && creator) {
      values[creatorField.key] = creator;
      creatorField.filled += 1;
    }

    let description = cellText(row, descriptionCol);
    if (description && description.length > MAX_LONG_TEXT) {
      description = description.slice(0, MAX_LONG_TEXT);
      truncatedValues += 1;
    }

    const commentBody = cellText(row, commentCol);
    const commentAt = toInstant(commentAtCol ? row[commentAtCol.index] : null) ?? updatedAt;

    const priority = priorityOf(cellText(row, labelsCol), summary.ignoredLabels);
    summary.byPriority[priority] += 1;
    summary.bySource[source] += 1;
    if (creator) summary.creators[creator] = (summary.creators[creator] ?? 0) + 1;

    const assignee = cellText(row, assigneesCol);
    if (assignee) summary.assignees[assignee] = (summary.assignees[assignee] ?? 0) + 1;
    summary.attachmentCount += attachments.length;

    return {
      number: 0,
      code: cellText(row, codeCol),
      title,
      description,
      requesterName: cellText(row, nameCol)?.slice(0, 160) ?? null,
      requesterEmail,
      phase: raw.current,
      status: isFinal ? "completed" : "active",
      priority,
      position: 0,
      source,
      creator,
      createdAt: raw.createdAt,
      updatedAt,
      phaseEnteredAt,
      completedAt,
      dueAt: toInstant(dueCol ? row[dueCol.index] : null),
      values,
      attachments,
      comment: commentBody ? { body: commentBody, at: commentAt } : null,
      events,
    };
  });

  // Numeração e posição ------------------------------------------------------
  const chronological = [...cards].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.code ?? "").localeCompare(b.code ?? ""),
  );
  chronological.forEach((card, index) => {
    card.number = index + 1;
  });

  const byPhase = new Map<string, PlanCard[]>();
  for (const card of cards) {
    const list = byPhase.get(card.phase) ?? [];
    list.push(card);
    byPhase.set(card.phase, list);
  }

  for (const [phase, list] of byPhase) {
    // Fase final: o concluído mais recente no topo. As demais: o mais antigo
    // primeiro, que é o que está esperando há mais tempo.
    if (finalPhases.has(phase)) {
      list.sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));
    } else {
      list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    }
    list.forEach((card, index) => {
      card.position = index;
    });
  }

  const phases: PlanPhase[] = orderedPhases.map((name, position) => ({
    name,
    position,
    isInitial: name === initialPhase,
    isFinal: finalPhases.has(name),
    cardCount: byPhase.get(name)?.length ?? 0,
  }));

  // Formulário inicial -------------------------------------------------------
  const kanbanFieldKeys = (mapping.kanbanFields ?? [])
    .map((name) => fields.find((field) => normalize(field.column) === normalize(name) || normalize(field.label) === normalize(name))?.key)
    .filter((key): key is string => Boolean(key))
    .slice(0, 6);

  const boardName = mapping.board?.name ?? "Quadro importado";
  const formFill = (column: Column | undefined) =>
    column && formCardIdx.length
      ? formCardIdx.filter((index) => asText(rawCards[index].row[column.index]) !== null).length / formCardIdx.length
      : 0;

  let form: ImportPlan["form"] = null;

  if (!mapping.form?.skip && formCardIdx.length > 0) {
    const entries: Array<{ at: number; field: PlanFormField }> = [
      {
        at: titleFormLabel ? columns.find((column) => column.header === titleFormLabel)!.index : titleCol.index,
        field: { label: titleFormLabel ?? "Título", type: "short_text", targetField: "title", fieldKey: null, options: [], required: true },
      },
    ];

    if (nameCol) {
      entries.push({
        at: nameCol.index,
        field: { label: nameCol.header.replace(/[:\s]+$/, ""), type: "short_text", targetField: "requester_name", fieldKey: null, options: [], required: formFill(nameCol) >= 0.99 },
      });
    }
    if (emailCol) {
      entries.push({
        at: emailCol.index,
        field: { label: emailCol.header.replace(/[:\s]+$/, ""), type: "email", targetField: "requester_email", fieldKey: null, options: [], required: formFill(emailCol) >= 0.99 },
      });
    }
    if (descriptionCol) {
      entries.push({
        at: descriptionCol.index,
        field: { label: descriptionCol.header.replace(/[:\s]+$/, ""), type: "long_text", targetField: "description", fieldKey: null, options: [], required: formFill(descriptionCol) >= 0.99 },
      });
    }

    for (const field of fields) {
      if (!field.inForm) continue;
      const column = columns.find((candidate) => candidate.header === field.column);
      if (!column || column.index === codeCol?.index) continue;
      entries.push({
        at: column.index,
        field: { label: field.label, type: field.type, targetField: null, fieldKey: field.key, options: field.options, required: field.required },
      });
    }

    entries.sort((a, b) => a.at - b.at);

    form = {
      name: mapping.form?.name ?? `Abrir chamado — ${boardName}`,
      successMessage: mapping.form?.successMessage ?? "Recebemos sua solicitação. Em breve alguém da equipe entra em contato.",
      requireRequesterEmail: formFill(emailCol) >= 0.99,
      targetPhase: initialPhase,
      fields: entries.map((entry) => entry.field),
    };
  }

  // Avisos -------------------------------------------------------------------
  if (reconciled > 0) {
    warnings.push(`${reconciled} card(s) tinham a última fase do histórico diferente da fase atual; a movimentação final foi acrescentada.`);
  }
  if (truncatedTitles > 0) warnings.push(`${truncatedTitles} título(s) acima de ${MAX_TITLE} caracteres foram cortados.`);
  if (truncatedValues > 0) warnings.push(`${truncatedValues} valor(es) de texto acima do limite do campo foram cortados.`);
  if (invalidEmails > 0) warnings.push(`${invalidEmails} e-mail(s) inválido(s) foram descartados.`);
  if (invalidNumbers > 0) warnings.push(`${invalidNumbers} número(s) não puderam ser lidos e foram descartados.`);
  if (summary.assignees && Object.keys(summary.assignees).length > 0) {
    warnings.push(
      `Responsáveis (${Object.entries(summary.assignees).map(([name, count]) => `${name}: ${count}`).join(", ")}) não foram atribuídos: o sistema só atribui usuários cadastrados.`,
    );
  }
  if (Object.keys(summary.ignoredLabels).length > 0) {
    warnings.push(
      `Etiquetas sem equivalente (viram só prioridade): ${Object.entries(summary.ignoredLabels).map(([name, count]) => `${name} (${count})`).join(", ")}.`,
    );
  }

  for (const column of unused()) {
    if (!fieldByColumn.has(column.index)) {
      skippedColumns.push({ column: column.header, reason: "não classificada" });
    }
  }

  return {
    board: {
      name: boardName,
      slug: mapping.board?.slug ?? toSlug(boardName),
      color: mapping.board?.color ?? "#2563eb",
      visibility: mapping.board?.visibility ?? "workspace",
      description:
        mapping.board?.description ??
        `Importado do Pipefy a partir de ${sourceName}.`,
    },
    timezone,
    phases,
    fields,
    form,
    kanbanFieldKeys,
    cards,
    skippedColumns,
    warnings,
    summary,
  };
}
