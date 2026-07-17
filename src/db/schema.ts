import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const systemRoleEnum = pgEnum("system_role", ["admin", "user"]);
export const workspaceRoleEnum = pgEnum("workspace_role", [
  "owner",
  "admin",
  "member",
  "viewer",
]);
export const boardVisibilityEnum = pgEnum("board_visibility", [
  "workspace",
  "private",
]);
export const boardMemberRoleEnum = pgEnum("board_member_role", [
  "manager",
  "editor",
  "viewer",
]);
export const cardStatusEnum = pgEnum("card_status", [
  "active",
  "completed",
  "archived",
]);
export const cardPriorityEnum = pgEnum("card_priority", [
  "low",
  "medium",
  "high",
  "urgent",
]);
export const cardSourceEnum = pgEnum("card_source", [
  "manual",
  "form",
  "email",
  "api",
]);
export const fieldTypeEnum = pgEnum("field_type", [
  "short_text",
  "long_text",
  "number",
  "date",
  "datetime",
  "checkbox",
  "select",
  "multiselect",
  "email",
  "phone",
  "url",
  "currency",
  "user",
]);
export const formStatusEnum = pgEnum("form_status", [
  "draft",
  "published",
  "closed",
]);
export const messageDirectionEnum = pgEnum("message_direction", [
  "outbound",
  "inbound",
]);
export const messageStatusEnum = pgEnum("message_status", [
  "queued",
  "sending",
  "sent",
  "failed",
  "cancelled",
]);
export const auditResultEnum = pgEnum("audit_result", [
  "success",
  "denied",
  "failure",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 320 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    avatarUrl: text("avatar_url"),
    systemRole: systemRoleEnum("system_role").notNull().default("user"),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_email_unique").on(sql`lower(${table.email})`)],
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    timezone: varchar("timezone", { length: 64 })
      .notNull()
      .default("America/Sao_Paulo"),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [uniqueIndex("workspaces_slug_unique").on(table.slug)],
);

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: workspaceRoleEnum("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index("workspace_members_user_idx").on(table.userId),
  ],
);

export const boards = pgTable(
  "boards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 100 }).notNull(),
    description: text("description"),
    color: varchar("color", { length: 32 }).notNull().default("#2563eb"),
    icon: varchar("icon", { length: 64 }),
    visibility: boardVisibilityEnum("visibility")
      .notNull()
      .default("workspace"),
    position: integer("position").notNull().default(0),
    isArchived: boolean("is_archived").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("boards_workspace_slug_unique").on(
      table.workspaceId,
      table.slug,
    ),
    index("boards_workspace_position_idx").on(
      table.workspaceId,
      table.position,
    ),
  ],
);

export const boardMembers = pgTable(
  "board_members",
  {
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: boardMemberRoleEnum("role").notNull().default("viewer"),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.boardId, table.userId] }),
    index("board_members_user_idx").on(table.userId),
  ],
);

export const phases = pgTable(
  "phases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    color: varchar("color", { length: 32 }),
    position: integer("position").notNull().default(0),
    isInitial: boolean("is_initial").notNull().default(false),
    isFinal: boolean("is_final").notNull().default(false),
    cardLimit: integer("card_limit"),
    ...timestamps,
  },
  (table) => [index("phases_board_position_idx").on(table.boardId, table.position)],
);

export const customFields = pgTable(
  "custom_fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 80 }).notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    description: text("description"),
    type: fieldTypeEnum("type").notNull(),
    config: jsonb("config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    isRequired: boolean("is_required").notNull().default(false),
    isArchived: boolean("is_archived").notNull().default(false),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("custom_fields_board_key_unique").on(table.boardId, table.key),
    index("custom_fields_board_position_idx").on(
      table.boardId,
      table.position,
    ),
  ],
);

export const intakeForms = pgTable(
  "intake_forms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    targetPhaseId: uuid("target_phase_id").references(() => phases.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 160 }).notNull(),
    publicKey: varchar("public_key", { length: 64 }).notNull(),
    description: text("description"),
    successMessage: text("success_message"),
    status: formStatusEnum("status").notNull().default("draft"),
    requireRequesterEmail: boolean("require_requester_email")
      .notNull()
      .default(false),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("intake_forms_public_key_unique").on(table.publicKey),
    index("intake_forms_board_idx").on(table.boardId),
  ],
);

export const formFields = pgTable(
  "form_fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    formId: uuid("form_id")
      .notNull()
      .references(() => intakeForms.id, { onDelete: "cascade" }),
    customFieldId: uuid("custom_field_id").references(() => customFields.id, {
      onDelete: "set null",
    }),
    targetField: varchar("target_field", { length: 80 }),
    type: fieldTypeEnum("type").notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    helpText: text("help_text"),
    placeholder: varchar("placeholder", { length: 240 }),
    options: jsonb("options")
      .$type<Array<{ label: string; value: string }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    validation: jsonb("validation")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    isRequired: boolean("is_required").notNull().default(false),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (table) => [index("form_fields_form_position_idx").on(table.formId, table.position)],
);

export const cards = pgTable(
  "cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    boardId: uuid("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    phaseId: uuid("phase_id")
      .notNull()
      .references(() => phases.id, { onDelete: "restrict" }),
    number: integer("number").notNull(),
    title: varchar("title", { length: 240 }).notNull(),
    description: text("description"),
    status: cardStatusEnum("status").notNull().default("active"),
    priority: cardPriorityEnum("priority").notNull().default("medium"),
    position: integer("position").notNull().default(0),
    requesterName: varchar("requester_name", { length: 160 }),
    requesterEmail: varchar("requester_email", { length: 320 }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    source: cardSourceEnum("source").notNull().default("manual"),
    sourceFormId: uuid("source_form_id").references(() => intakeForms.id, {
      onDelete: "set null",
    }),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("cards_board_number_unique").on(table.boardId, table.number),
    index("cards_phase_position_idx").on(table.phaseId, table.position),
    index("cards_workspace_updated_idx").on(table.workspaceId, table.updatedAt),
    index("cards_requester_email_idx").on(table.requesterEmail),
  ],
);

export const cardAssignees = pgTable(
  "card_assignees",
  {
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    assignedBy: uuid("assigned_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    primaryKey({ columns: [table.cardId, table.userId] }),
    index("card_assignees_user_idx").on(table.userId),
  ],
);

export const cardFieldValues = pgTable(
  "card_field_values",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    customFieldId: uuid("custom_field_id")
      .notNull()
      .references(() => customFields.id, { onDelete: "cascade" }),
    value: jsonb("value").$type<unknown>().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("card_field_values_card_field_unique").on(
      table.cardId,
      table.customFieldId,
    ),
    index("card_field_values_field_idx").on(table.customFieldId),
  ],
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    isInternal: boolean("is_internal").notNull().default(true),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("comments_card_created_idx").on(table.cardId, table.createdAt)],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    boardId: uuid("board_id").references(() => boards.id, {
      onDelete: "cascade",
    }),
    cardId: uuid("card_id").references(() => cards.id, {
      onDelete: "cascade",
    }),
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    type: varchar("type", { length: 100 }).notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("events_card_occurred_idx").on(table.cardId, table.occurredAt),
    index("events_workspace_occurred_idx").on(
      table.workspaceId,
      table.occurredAt,
    ),
  ],
);

export const emailTemplates = pgTable(
  "email_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    boardId: uuid("board_id").references(() => boards.id, {
      onDelete: "cascade",
    }),
    key: varchar("key", { length: 100 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    subject: varchar("subject", { length: 300 }).notNull(),
    htmlBody: text("html_body"),
    textBody: text("text_body"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("email_templates_workspace_key_unique").on(
      table.workspaceId,
      table.key,
    ),
    index("email_templates_board_idx").on(table.boardId),
  ],
);

export const emailMessages = pgTable(
  "email_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    cardId: uuid("card_id").references(() => cards.id, {
      onDelete: "set null",
    }),
    templateId: uuid("template_id").references(() => emailTemplates.id, {
      onDelete: "set null",
    }),
    direction: messageDirectionEnum("direction")
      .notNull()
      .default("outbound"),
    status: messageStatusEnum("status").notNull().default("queued"),
    fromAddress: varchar("from_address", { length: 320 }).notNull(),
    toAddresses: jsonb("to_addresses").$type<string[]>().notNull(),
    ccAddresses: jsonb("cc_addresses")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    bccAddresses: jsonb("bcc_addresses")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    subject: varchar("subject", { length: 300 }).notNull(),
    htmlBody: text("html_body"),
    textBody: text("text_body"),
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    errorMessage: text("error_message"),
    attempts: integer("attempts").notNull().default(0),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    index("email_messages_queue_idx").on(table.status, table.scheduledAt),
    index("email_messages_card_idx").on(table.cardId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: char("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    userAgent: text("user_agent"),
    ipAddress: varchar("ip_address", { length: 64 }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_idx").on(table.userId),
    index("sessions_expiry_idx").on(table.expiresAt),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    sessionId: uuid("session_id").references(() => sessions.id, {
      onDelete: "set null",
    }),
    action: varchar("action", { length: 120 }).notNull(),
    entityType: varchar("entity_type", { length: 80 }),
    entityId: varchar("entity_id", { length: 120 }),
    result: auditResultEnum("result").notNull().default("success"),
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_logs_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt,
    ),
    index("audit_logs_actor_created_idx").on(table.actorId, table.createdAt),
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type Board = typeof boards.$inferSelect;
export type Phase = typeof phases.$inferSelect;
export type Card = typeof cards.$inferSelect;
export type CustomField = typeof customFields.$inferSelect;
export type IntakeForm = typeof intakeForms.$inferSelect;
export type FormField = typeof formFields.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Event = typeof events.$inferSelect;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type EmailMessage = typeof emailMessages.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type SystemRole = (typeof systemRoleEnum.enumValues)[number];
export type WorkspaceRole = (typeof workspaceRoleEnum.enumValues)[number];
export type BoardMemberRole = (typeof boardMemberRoleEnum.enumValues)[number];
