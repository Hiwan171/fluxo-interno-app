/**
 * Gera o PDF de cards REAIS do banco para comparar com o contrato assinado do
 * mesmo cliente (ver `validate-match.py`). É assim que cada modelo foi validado.
 *
 * Uso (precisa do Postgres de desenvolvimento no ar):
 *   npx tsx --conditions=react-server scripts/contracts-tools/validate-cards.ts \
 *     <pasta-saida> <tipo> <por-empresa> [desde-AAAA-MM]
 * Ex.: ... ./work/val saude_unica 6 2025-06
 *
 * Tipos: saude | saude_unica | industrial | industrial_unica
 * Só considera cards concluídos, sem bloqueio e que passam na validação.
 */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { mkdirSync, writeFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "../../src/db/client";
import { boards, cardFieldValues, cards, customFields, phases } from "../../src/db/schema";
import { buildContractDocument } from "../../src/lib/contracts/compose";
import { contractFieldsSchema } from "../../src/lib/contracts/fields";
import { buildContractDraft, toCardValues } from "../../src/lib/contracts/from-card";
import { renderContractPdf } from "../../src/lib/contracts/pdf";

async function main() {
  const [out, wantKind, perCompanyRaw, since = "2025-01"] = process.argv.slice(2);
  if (!out || !wantKind) throw new Error("uso: validate-cards.ts <pasta-saida> <tipo> <por-empresa> [desde-AAAA-MM]");
  const perCompany = Number(perCompanyRaw || "3");
  mkdirSync(out, { recursive: true });

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
  const recent = cardRows
    .filter((c) => c.createdAt.toISOString().slice(0, 7) >= since && (phaseName.get(c.phaseId) ?? "").startsWith("Concluído"))
    .sort((a, b) => b.number - a.number);
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

  const taken: Record<string, number> = {};
  const meta: unknown[] = [];

  for (const card of recent) {
    const draft = buildContractDraft(toCardValues(defs, byCard.get(card.id) ?? [], card.requesterName));
    if (draft.fields.kind !== wantKind) continue;
    if (draft.issues.some((i) => i.level === "blocker")) continue;

    const company = draft.fields.company || "?";
    if ((taken[company] ?? 0) >= perCompany) continue;

    const parsed = contractFieldsSchema.safeParse(draft.fields);
    if (!parsed.success) continue;

    taken[company] = (taken[company] ?? 0) + 1;
    const file = `val_${wantKind}_${company}_${card.number}.pdf`;
    writeFileSync(`${out}/${file}`, await renderContractPdf(buildContractDocument(parsed.data)));
    meta.push({ file, card: card.number, company, kind: wantKind, razao: parsed.data.companyName, cnpj: parsed.data.cnpj });
  }

  writeFileSync(`${out}/val_${wantKind}_meta.json`, JSON.stringify(meta, null, 1));
  console.log(wantKind, taken);
  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
