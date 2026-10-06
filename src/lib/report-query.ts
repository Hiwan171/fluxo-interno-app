import "server-only";

import { and, asc, desc, eq, gte, ilike, inArray, lte, sql, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { cardFieldValues, cards, phases, users } from "@/db/schema";

/**
 * Consulta de relatório com filtro, ordenação e paginação no banco.
 *
 * A versão anterior carregava todos os cards do quadro — incluindo arquivados —
 * com todos os valores de campo, e filtrava no navegador. Funcionava com
 * duzentos cards e travava com cinco mil.
 *
 * O vocabulário de `fieldId` é o mesmo da interface: colunas nativas pelo nome
 * (`title`, `phase`, `dueAt`, ...) e campos personalizados como
 * `custom:<uuid>`. Manter os dois lados falando a mesma língua evita uma
 * camada de tradução que ficaria dessincronizada.
 */

export type ReportFilter = {
  fieldId: string;
  value: string;
  valueTo: string;
};

export type ReportSortDir = "asc" | "desc";

export type ReportQueryInput = {
  filters: ReportFilter[];
  sortField: string;
  sortDir: ReportSortDir;
  page: number;
  pageSize: number;
};

export const REPORT_PAGE_SIZE = 50;
/** Teto do CSV: exportar sem limite seria um jeito fácil de derrubar a memória. */
export const REPORT_EXPORT_LIMIT = 10_000;

const CUSTOM_PREFIX = "custom:";

function isCustomField(fieldId: string): string | null {
  return fieldId.startsWith(CUSTOM_PREFIX)
    ? fieldId.slice(CUSTOM_PREFIX.length)
    : null;
}

/**
 * Extrai o valor de um campo personalizado como texto.
 *
 * `value` é jsonb; `#>> '{}'` devolve o escalar já sem as aspas do JSON, o que
 * permite comparar com texto puro sem precisar saber o tipo de antemão.
 */
function customFieldValueSql(customFieldId: string): SQL {
  return sql`(
    select cfv.value #>> '{}'
    from ${cardFieldValues} cfv
    where cfv.card_id = ${cards.id}
      and cfv.custom_field_id = ${customFieldId}::uuid
    limit 1
  )`;
}

/** Fim do dia informado, para que um filtro "até 10/03" inclua o próprio dia. */
function endOfDay(value: string): Date {
  const parsed = new Date(value);
  parsed.setHours(23, 59, 59, 999);
  return parsed;
}

const TEXT_COLUMNS: Record<string, SQL> = {
  title: sql`${cards.title}`,
  requesterName: sql`${cards.requesterName}`,
  requesterEmail: sql`${cards.requesterEmail}`,
  createdByName: sql`${users.name}`,
};

const DATE_COLUMNS: Record<string, SQL> = {
  dueAt: sql`${cards.dueAt}`,
  createdAt: sql`${cards.createdAt}`,
};

function buildFilterCondition(filter: ReportFilter): SQL | null {
  const value = filter.value?.trim() ?? "";
  const valueTo = filter.valueTo?.trim() ?? "";

  if (!value && !valueTo) return null;

  const customFieldId = isCustomField(filter.fieldId);

  if (customFieldId) {
    const extracted = customFieldValueSql(customFieldId);

    // Um filtro de data traz `valueTo`; os demais chegam só com `value`.
    if (valueTo || /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const conditions: SQL[] = [];
      if (value) {
        conditions.push(sql`(${extracted})::timestamptz >= ${new Date(value)}`);
      }
      if (valueTo) {
        conditions.push(sql`(${extracted})::timestamptz <= ${endOfDay(valueTo)}`);
      }
      return conditions.length > 0 ? (and(...conditions) as SQL) : null;
    }

    // Comparação exata para escolhas, `ilike` para texto livre. Como o tipo do
    // campo não vem no filtro, cobrir os dois é mais barato que uma consulta
    // extra só para descobrir o tipo.
    return sql`(${extracted} = ${value} or ${extracted} ilike ${`%${value}%`})`;
  }

  if (filter.fieldId in TEXT_COLUMNS) {
    return ilike(TEXT_COLUMNS[filter.fieldId], `%${value}%`);
  }

  if (filter.fieldId in DATE_COLUMNS) {
    const column = DATE_COLUMNS[filter.fieldId];
    const conditions: SQL[] = [];
    if (value) conditions.push(gte(column, new Date(value)));
    if (valueTo) conditions.push(lte(column, endOfDay(valueTo)));
    return conditions.length > 0 ? (and(...conditions) as SQL) : null;
  }

  // A interface filtra fase pelo nome exibido, não pelo id.
  if (filter.fieldId === "phase") return eq(phases.name, value);
  if (filter.fieldId === "priority") {
    return sql`${cards.priority}::text = ${value}`;
  }
  if (filter.fieldId === "status") {
    return sql`${cards.status}::text = ${value}`;
  }
  if (filter.fieldId === "reference") {
    const number = Number(value.replace("#", ""));
    return Number.isFinite(number) ? eq(cards.number, number) : null;
  }

  // Campo desconhecido: ignorar é melhor que devolver zero linhas, porque um
  // relatório salvo pode referenciar um campo que foi arquivado desde então.
  return null;
}

function buildOrderBy(sortField: string, sortDir: ReportSortDir): SQL {
  const direction = sortDir === "desc" ? desc : asc;
  const customFieldId = isCustomField(sortField);

  if (customFieldId) {
    const extracted = customFieldValueSql(customFieldId);
    // `nulls last` mantém os cards sem valor no fim em qualquer direção, que é
    // o que se espera ao ordenar por um campo opcional.
    return sortDir === "desc"
      ? sql`${extracted} desc nulls last`
      : sql`${extracted} asc nulls last`;
  }

  switch (sortField) {
    case "reference":
      return direction(cards.number);
    case "title":
      return direction(cards.title);
    case "phase":
      return direction(phases.name);
    case "priority":
      return direction(cards.priority);
    case "status":
      return direction(cards.status);
    case "requesterName":
      return direction(cards.requesterName);
    case "requesterEmail":
      return direction(cards.requesterEmail);
    case "createdByName":
      return direction(users.name);
    case "dueAt":
      return sortDir === "desc"
        ? sql`${cards.dueAt} desc nulls last`
        : sql`${cards.dueAt} asc nulls last`;
    case "createdAt":
      return direction(cards.createdAt);
    default:
      return direction(cards.number);
  }
}

export type ReportCardRow = {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: string;
  phaseId: string;
  phaseName: string;
  requesterName: string | null;
  requesterEmail: string | null;
  dueAt: Date | null;
  createdAt: Date;
  createdByName: string | null;
  customFieldValues: Record<string, unknown>;
};

export type ReportPage = {
  rows: ReportCardRow[];
  total: number;
};

/**
 * Executa a consulta. Quem chama já precisa ter verificado o acesso ao quadro —
 * esta função não faz autorização.
 */
export async function queryReportCards(
  boardId: string,
  input: ReportQueryInput,
): Promise<ReportPage> {
  const conditions = [
    eq(cards.boardId, boardId),
    ...input.filters
      .map(buildFilterCondition)
      .filter((condition): condition is SQL => condition !== null),
  ];

  const where = and(...conditions);
  const db = getDb();

  const [countRow] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(cards)
    .innerJoin(phases, eq(phases.id, cards.phaseId))
    .leftJoin(users, eq(users.id, cards.createdBy))
    .where(where);

  const total = countRow?.value ?? 0;
  const pageSize = Math.max(1, Math.min(input.pageSize, REPORT_EXPORT_LIMIT));
  const offset = Math.max(0, (input.page - 1) * pageSize);

  const rows = await db
    .select({
      id: cards.id,
      number: cards.number,
      title: cards.title,
      status: cards.status,
      priority: cards.priority,
      phaseId: cards.phaseId,
      phaseName: phases.name,
      requesterName: cards.requesterName,
      requesterEmail: cards.requesterEmail,
      dueAt: cards.dueAt,
      createdAt: cards.createdAt,
      createdByName: users.name,
    })
    .from(cards)
    .innerJoin(phases, eq(phases.id, cards.phaseId))
    .leftJoin(users, eq(users.id, cards.createdBy))
    .where(where)
    // Desempate por número: sem ordem total, duas páginas podem repetir ou
    // pular linhas quando o campo de ordenação tem valores iguais.
    .orderBy(buildOrderBy(input.sortField, input.sortDir), asc(cards.number))
    .limit(pageSize)
    .offset(offset);

  if (rows.length === 0) {
    return { rows: [], total };
  }

  // Os valores de campo são buscados só para a página atual — antes vinham
  // todos os do quadro inteiro.
  const valueRows = await db
    .select({
      cardId: cardFieldValues.cardId,
      customFieldId: cardFieldValues.customFieldId,
      value: cardFieldValues.value,
    })
    .from(cardFieldValues)
    .where(
      inArray(
        cardFieldValues.cardId,
        rows.map((row) => row.id),
      ),
    );

  const valuesByCard = new Map<string, Record<string, unknown>>();
  for (const row of valueRows) {
    const bucket = valuesByCard.get(row.cardId) ?? {};
    bucket[row.customFieldId] = row.value;
    valuesByCard.set(row.cardId, bucket);
  }

  return {
    total,
    rows: rows.map((row) => ({
      ...row,
      customFieldValues: valuesByCard.get(row.id) ?? {},
    })),
  };
}
