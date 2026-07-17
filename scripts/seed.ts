import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { hash } from "@node-rs/argon2";
import { and, asc, eq } from "drizzle-orm";

import { closeDb, getDb } from "../src/db/client";
import {
  boards,
  cardAssignees,
  cards,
  phases,
  users,
  workspaceMembers,
  workspaces,
} from "../src/db/schema";

// Argon2id is the library's default algorithm; referencing the `Algorithm`
// const enum directly breaks under isolatedModules (it's ambient/native-backed).
const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
} as const;

const ADMIN_EMAIL = "admin@fluxo.local";
const ADMIN_PASSWORD = "TrocarSenha123!";

async function main() {
  const db = getDb();

  let [admin] = await db
    .select()
    .from(users)
    .where(eq(users.email, ADMIN_EMAIL))
    .limit(1);

  if (!admin) {
    const passwordHash = await hash(ADMIN_PASSWORD, ARGON2_OPTIONS);
    [admin] = await db
      .insert(users)
      .values({
        email: ADMIN_EMAIL,
        passwordHash,
        name: "Administrador",
        systemRole: "admin",
      })
      .returning();
    console.log(`Usuário criado: ${ADMIN_EMAIL}`);
  } else {
    console.log(`Usuário já existia: ${ADMIN_EMAIL}`);
  }

  let [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, "fluxo-interno"))
    .limit(1);

  if (!workspace) {
    [workspace] = await db
      .insert(workspaces)
      .values({
        name: "Fluxo Interno",
        slug: "fluxo-interno",
        createdBy: admin.id,
      })
      .returning();
    console.log(`Workspace criado: ${workspace.name}`);
  }

  const [existingMembership] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspace.id),
        eq(workspaceMembers.userId, admin.id),
      ),
    )
    .limit(1);

  if (!existingMembership) {
    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: admin.id,
      role: "owner",
    });
  }

  let [board] = await db
    .select()
    .from(boards)
    .where(eq(boards.slug, "atendimento"))
    .limit(1);

  if (!board) {
    [board] = await db
      .insert(boards)
      .values({
        workspaceId: workspace.id,
        name: "Atendimento",
        slug: "atendimento",
        description: "Fluxo de solicitações internas",
        color: "#2563eb",
        createdBy: admin.id,
      })
      .returning();
    console.log(`Quadro criado: ${board.name}`);
  }

  let boardPhases = await db
    .select()
    .from(phases)
    .where(eq(phases.boardId, board.id))
    .orderBy(asc(phases.position));

  if (boardPhases.length === 0) {
    const phaseDefs = [
      { name: "Entrada", isInitial: true, isFinal: false },
      { name: "Em andamento", isInitial: false, isFinal: false },
      { name: "Aguardando", isInitial: false, isFinal: false },
      { name: "Concluído", isInitial: false, isFinal: true },
    ];

    boardPhases = await db
      .insert(phases)
      .values(
        phaseDefs.map((phase, index) => ({
          boardId: board.id,
          name: phase.name,
          position: index,
          isInitial: phase.isInitial,
          isFinal: phase.isFinal,
        })),
      )
      .returning();
    console.log(
      `Etapas criadas: ${boardPhases.map((phase) => phase.name).join(", ")}`,
    );
  }

  const [existingCard] = await db
    .select()
    .from(cards)
    .where(eq(cards.boardId, board.id))
    .limit(1);

  if (!existingCard) {
    const [entrada, andamento, aguardando, concluido] = boardPhases;
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    const cardDefs = [
      {
        phase: entrada,
        number: 1,
        title: "Solicitação de acesso ao sistema financeiro",
        description: "Novo colaborador precisa de acesso ao ERP.",
        priority: "medium" as const,
        requesterName: "Ana Souza",
        requesterEmail: "ana.souza@empresa.com.br",
        dueAt: new Date(now + 2 * day),
      },
      {
        phase: entrada,
        number: 2,
        title: "Dúvida sobre política de reembolso",
        description: null,
        priority: "low" as const,
        requesterName: "Carlos Lima",
        requesterEmail: "carlos.lima@empresa.com.br",
        dueAt: null,
      },
      {
        phase: andamento,
        number: 3,
        title: "Erro ao emitir nota fiscal",
        description: "Cliente relata erro 500 ao emitir NF-e.",
        priority: "urgent" as const,
        requesterName: "Beatriz Alves",
        requesterEmail: "beatriz.alves@empresa.com.br",
        dueAt: new Date(now - 1 * day),
      },
      {
        phase: andamento,
        number: 4,
        title: "Renovação de contrato de fornecedor",
        description: "Verificar cláusulas antes de renovar.",
        priority: "high" as const,
        requesterName: "Diego Martins",
        requesterEmail: "diego.martins@empresa.com.br",
        dueAt: new Date(now + 5 * day),
      },
      {
        phase: aguardando,
        number: 5,
        title: "Aprovação de orçamento de marketing",
        description: "Aguardando validação da diretoria.",
        priority: "medium" as const,
        requesterName: "Elisa Rocha",
        requesterEmail: "elisa.rocha@empresa.com.br",
        dueAt: new Date(now + 3 * day),
      },
      {
        phase: concluido,
        number: 6,
        title: "Cadastro de novo fornecedor",
        description: "Fornecedor cadastrado e aprovado.",
        priority: "low" as const,
        requesterName: "Fábio Nogueira",
        requesterEmail: "fabio.nogueira@empresa.com.br",
        dueAt: null,
      },
    ];

    const createdCards = await db
      .insert(cards)
      .values(
        cardDefs.map((def, index) => ({
          workspaceId: workspace.id,
          boardId: board.id,
          phaseId: def.phase.id,
          number: def.number,
          title: def.title,
          description: def.description,
          priority: def.priority,
          position: index,
          requesterName: def.requesterName,
          requesterEmail: def.requesterEmail,
          dueAt: def.dueAt,
          createdBy: admin.id,
          updatedBy: admin.id,
        })),
      )
      .returning();
    console.log(`${createdCards.length} cards criados.`);

    const urgentCard = createdCards.find((card) => card.number === 3);
    if (urgentCard) {
      await db.insert(cardAssignees).values({
        cardId: urgentCard.id,
        userId: admin.id,
        assignedBy: admin.id,
      });
    }
  }

  console.log("\nSeed concluído.");
  console.log(`Login: ${ADMIN_EMAIL}`);
  console.log(`Senha: ${ADMIN_PASSWORD}`);

  await closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
