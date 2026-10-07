/**
 * Roda o gerador em TODOS os cards do quadro "Análise de Contratos" e grava um
 * JSON com, para cada card, o tipo detectado, os bloqueios e se passa na
 * validação. Serve para medir a cobertura (ver README desta pasta).
 *
 * Uso (precisa do Postgres de desenvolvimento no ar):
 *   npx tsx --conditions=react-server scripts/contracts-tools/coverage-report.ts ./work/cover.json
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { writeFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "../../src/db/client";
import { boards, cardFieldValues, cards, customFields, phases } from "../../src/db/schema";
import { contractFieldsSchema } from "../../src/lib/contracts/fields";
import { buildContractDraft, toCardValues } from "../../src/lib/contracts/from-card";

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error("uso: coverage-report.ts <saida.json>");

  const db = getDb();
  const [board] = await db.select({ id: boards.id }).from(boards).where(eq(boards.slug, "analise-de-contratos"));
  const defs = await db
    .select({ id: customFields.id, label: customFields.label })
    .from(customFields)
    .where(and(eq(customFields.boardId, board.id), eq(customFields.isArchived, false)));
  const phaseRows = await db.select({ id: phases.id, name: phases.name }).from(phases).where(eq(phases.boardId, board.id));
  const phaseName = new Map(phaseRows.map((p) => [p.id, p.name]));
  const cardRows = await db
    .select({ id: cards.id, number: cards.number, phaseId: cards.phaseId, createdAt: cards.createdAt, requesterName: cards.requesterName })
    .from(cards)
    .where(eq(cards.boardId, board.id));
  const valueRows = await db
    .select({ cardId: cardFieldValues.cardId, customFieldId: cardFieldValues.customFieldId, value: cardFieldValues.value })
    .from(cardFieldValues)
    .innerJoin(cards, eq(cards.id, cardFieldValues.cardId))
    .where(eq(cards.boardId, board.id));
  const byCard = new Map<string, Array<{ customFieldId: string; value: unknown }>>();
  for (const r of valueRows) {
    const list = byCard.get(r.cardId) ?? [];
    list.push({ customFieldId: r.customFieldId, value: r.value });
    byCard.set(r.cardId, list);
  }

  const rows = cardRows.map((card) => {
    const draft = buildContractDraft(toCardValues(defs, byCard.get(card.id) ?? [], card.requesterName));
    const blockers = draft.issues.filter((i) => i.level === "blocker");
    const schema = contractFieldsSchema.safeParse(draft.fields);

    return {
      n: card.number,
      phase: phaseName.get(card.phaseId) ?? "?",
      year: card.createdAt.getFullYear(),
      company: draft.fields.company,
      kind: draft.fields.kind,
      blockers: blockers.map((b) => `${b.field ?? "-"}|${b.message.slice(0, 110)}`),
      schemaOk: schema.success,
      schemaErrors: schema.success ? [] : schema.error.issues.map((e) => String(e.path[0])),
    };
  });

  writeFileSync(out, JSON.stringify(rows));
  const live = rows.filter((r) => r.phase !== "Formulário preenchido errado" && r.phase !== "Contrato perdido");
  const ok = live.filter((r) => r.blockers.length === 0);
  console.log(`cards: ${rows.length} | não descartados: ${live.length} | geráveis: ${ok.length} (${((ok.length / live.length) * 100).toFixed(1)}%)`);
  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
