import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { readSheet } from "read-excel-file/node";

import { closeDb } from "../src/db/client";
import { applyPlan } from "../src/lib/pipefy-import/apply";
import { buildPlan, type ImportMapping, type ImportPlan } from "../src/lib/pipefy-import/plan";

/**
 * Importa um relatório exportado do Pipefy como um quadro novo.
 *
 *   npm run import:pipefy -- relatorio.xlsx --mapping scripts/pipefy-mappings/chamados-ti.json
 *   npm run import:pipefy -- relatorio.xlsx --mapping ... --apply
 *
 * Sem `--apply` nada é gravado: o comando só mostra o plano (fases, campos e
 * formulário que seriam criados), para ser conferido antes. Um quadro com o
 * mesmo endereço não é sobrescrito; `--replace` só substitui quadros que foram
 * criados por uma importação.
 */

const VALUE_OPTIONS = new Set(["--mapping", "--board", "--slug", "--workspace", "--report"]);

function parseArgs(argv: string[]) {
  const options = new Map<string, string>();
  const flags = new Set<string>();
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (VALUE_OPTIONS.has(arg)) {
      options.set(arg, argv[i + 1] ?? "");
      i += 1;
    } else if (arg.startsWith("--")) {
      flags.add(arg);
    } else {
      positional.push(arg);
    }
  }

  return { options, flags, positional };
}

// Espelha a lista do servidor (src/lib/attachments.ts). É só uma estimativa por
// extensão: a decisão real vem do conteúdo do arquivo, na hora de baixar.
const ACCEPTED_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "jfif", "mp4", "webm", "mov", "pdf",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx",
]);

function extensionOf(url: string): string {
  const pathname = url.split("?")[0];
  return (pathname.split(".").pop() ?? "").toLowerCase();
}

function count<T>(items: T[], key: (item: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) result[key(item)] = (result[key(item)] ?? 0) + 1;
  return result;
}

function printPlan(plan: ImportPlan): void {
  const line = (text = "") => console.log(text);

  line(`QUADRO     ${plan.board.name}  (endereço: ${plan.board.slug}, ${plan.board.visibility === "private" ? "PRIVADO" : "visível ao workspace"}, fuso das datas: ${plan.timezone})`);
  line();
  line("FASES (na ordem em que aparecem no quadro)");
  for (const phase of plan.phases) {
    const flags = [phase.isInitial ? "inicial" : "", phase.isFinal ? "final" : ""].filter(Boolean).join(", ");
    line(`  ${String(phase.position + 1).padStart(2)}. ${phase.name.padEnd(26)} ${String(phase.cardCount).padStart(5)} cards  ${flags}`);
  }

  line();
  line("CAMPOS");
  for (const field of plan.fields) {
    const where = field.phase ? `fase ${field.phase}` : "geral";
    const extra = field.type === "select" ? ` (${field.options.length} opções)` : "";
    line(`  ${field.label.slice(0, 44).padEnd(44)} ${(field.type + extra).padEnd(22)} ${where.padEnd(30)} ${String(field.filled).padStart(5)} preenchidos`);
  }

  if (plan.form) {
    line();
    line(`FORMULÁRIO "${plan.form.name}" (nasce como RASCUNHO, cai em "${plan.form.targetPhase}")`);
    for (const field of plan.form.fields) {
      line(`  ${field.required ? "*" : " "} ${field.label.padEnd(50)} ${field.type}${field.targetField ? ` → ${field.targetField}` : ""}`);
    }
  }

  const byPhase = count(plan.cards, (card) => card.phase);
  line();
  line(`CARDS      ${plan.cards.length} no total  ·  ${Object.entries(byPhase).map(([k, v]) => `${k}: ${v}`).join("  ·  ")}`);
  line(`  origem      formulário ${plan.summary.bySource.form}, manual ${plan.summary.bySource.manual}`);
  line(`  prioridade  urgente ${plan.summary.byPriority.urgent}, alta ${plan.summary.byPriority.high}, média ${plan.summary.byPriority.medium}, baixa ${plan.summary.byPriority.low}`);
  line(`  comentários ${plan.cards.filter((card) => card.comment).length}   ·   eventos de histórico ${plan.cards.reduce((sum, card) => sum + card.events.length, 0)}`);

  const attachments = plan.cards.flatMap((card) => card.attachments);
  if (attachments.length > 0) {
    const byExt = count(attachments, (item) => extensionOf(item.url));
    const refused = attachments.filter((item) => !ACCEPTED_EXTENSIONS.has(extensionOf(item.url)));
    line();
    line(`ANEXOS     ${attachments.length} arquivo(s): ${Object.entries(byExt).map(([k, v]) => `${k} ${v}`).join(", ")}`);
    line(`  ${refused.length} provavelmente serão recusados pelo tipo (aceitos: imagem, vídeo, PDF e Word/Excel/PowerPoint sem macro)`);
  }

  if (plan.skippedColumns.length > 0) {
    line();
    line("COLUNAS NÃO IMPORTADAS");
    for (const item of plan.skippedColumns) line(`  ${item.column.slice(0, 60).padEnd(60)} ${item.reason}`);
  }

  if (plan.warnings.length > 0) {
    line();
    line("AVISOS");
    for (const warning of plan.warnings) line(`  - ${warning}`);
  }
}

async function main(): Promise<void> {
  const { options, flags, positional } = parseArgs(process.argv.slice(2));
  const file = positional[0];

  if (!file) {
    console.error("Uso: npm run import:pipefy -- <relatorio.xlsx> [--mapping arquivo.json] [--board \"Nome\"] [--slug endereco] [--apply] [--replace] [--no-attachments]");
    process.exitCode = 2;
    return;
  }

  const mapping: ImportMapping = options.get("--mapping")
    ? JSON.parse(await readFile(options.get("--mapping")!, "utf8"))
    : {};

  mapping.board = {
    ...mapping.board,
    ...(options.get("--board") ? { name: options.get("--board") } : {}),
    ...(options.get("--slug") ? { slug: options.get("--slug") } : {}),
  };

  console.log(`Lendo ${file}...`);
  const rows = await readSheet(file);
  const plan = buildPlan(rows as unknown[][], mapping, path.basename(file));

  printPlan(plan);

  if (!flags.has("--apply")) {
    console.log("\nNada foi gravado (simulação). Confira o plano e rode de novo com --apply.");
    return;
  }

  console.log("\nGravando...");
  const report = await applyPlan(plan, {
    workspaceSlug: options.get("--workspace"),
    replace: flags.has("--replace"),
    downloadAttachments: !flags.has("--no-attachments"),
    log: (message) => console.log(message),
  });

  console.log(`\nPronto: quadro "${plan.board.name}" criado (${report.boardId}).`);
  console.log(
    `  ${report.counts.cards} cards · ${report.counts.phases} fases · ${report.counts.fields} campos · ${report.counts.events} eventos · ${report.counts.comments} comentários · ${report.counts.attachmentsImported} anexos`,
  );

  if (report.attachmentFailures.length > 0) {
    console.log(`\n${report.attachmentFailures.length} anexo(s) NÃO foram importados:`);
    for (const failure of report.attachmentFailures.slice(0, 40)) {
      console.log(`  card #${failure.cardNumber}  ${failure.file.slice(0, 50).padEnd(50)} ${failure.reason}`);
    }
    if (report.attachmentFailures.length > 40) console.log(`  ... e mais ${report.attachmentFailures.length - 40} (veja o relatório)`);
  }

  const reportPath = options.get("--report") ?? `import-report-${plan.board.slug}-${new Date().toISOString().slice(0, 10)}.json`;
  try {
    await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`\nRelatório completo: ${reportPath}`);
  } catch {
    // Em container com disco somente leitura não há onde gravar. A importação já
    // foi concluída; só o relatório em arquivo deixa de existir. Passe --report
    // com um caminho gravável (ex.: um volume montado) para guardá-lo.
    console.log(`\n(Não foi possível gravar o relatório em "${reportPath}"; use --report com um caminho gravável.)`);
  }
  console.log("O formulário foi criado como rascunho. Publique-o em Gerenciar quando quiser usá-lo.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
