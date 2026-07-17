import { z } from "zod";

export const uuidSchema = z.uuid("Identificador inválido.");
export const emailSchema = z
  .email("E-mail inválido.")
  .max(320)
  .transform((value) => value.trim().toLocaleLowerCase("en-US"));
export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use apenas letras minúsculas, números e hífens.",
  );
export const passwordSchema = z
  .string()
  .min(12, "A senha deve ter pelo menos 12 caracteres.")
  .max(128, "A senha deve ter no máximo 128 caracteres.")
  .regex(/[a-z]/, "Inclua uma letra minúscula.")
  .regex(/[A-Z]/, "Inclua uma letra maiúscula.")
  .regex(/[0-9]/, "Inclua um número.")
  .regex(/[^A-Za-z0-9]/, "Inclua um caractere especial.");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: emailSchema,
  password: passwordSchema,
  systemRole: z.enum(["admin", "user"]).default("user"),
  isActive: z.boolean().default(true),
});

export const updateUserSchema = createUserSchema
  .omit({ password: true })
  .partial()
  .extend({ password: passwordSchema.optional() });

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: slugSchema,
  timezone: z.string().trim().min(1).max(64).default("America/Sao_Paulo"),
});

export const workspaceMemberSchema = z.object({
  userId: uuidSchema,
  role: z.enum(["owner", "admin", "member", "viewer"]),
});

export const createBoardSchema = z.object({
  workspaceId: uuidSchema,
  name: z.string().trim().min(2).max(160),
  slug: slugSchema,
  description: z.string().trim().max(5_000).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default("#2563eb"),
  icon: z.string().trim().max(64).nullable().optional(),
  visibility: z.enum(["workspace", "private"]).default("workspace"),
  position: z.number().int().min(0).default(0),
});

export const updateBoardSchema = createBoardSchema
  .omit({ workspaceId: true })
  .partial();

export const createPhaseSchema = z.object({
  boardId: uuidSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2_000).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .nullable()
    .optional(),
  position: z.number().int().min(0).default(0),
  isInitial: z.boolean().default(false),
  isFinal: z.boolean().default(false),
  cardLimit: z.coerce.number().int().min(1).nullable().optional(),
});

export const updatePhaseSchema = createPhaseSchema.omit({ boardId: true }).partial();

export const fieldTypeSchema = z.enum([
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

export const createCustomFieldSchema = z.object({
  boardId: uuidSchema,
  key: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z][a-z0-9_]*$/),
  label: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).nullable().optional(),
  type: fieldTypeSchema,
  config: z.record(z.string(), z.unknown()).default({}),
  isRequired: z.boolean().default(false),
  position: z.number().int().min(0).default(0),
});

export const updateCustomFieldSchema = createCustomFieldSchema
  .omit({ boardId: true, key: true, type: true })
  .partial();

export const createIntakeFormSchema = z.object({
  workspaceId: uuidSchema,
  boardId: uuidSchema,
  targetPhaseId: uuidSchema.nullable().optional(),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(5_000).nullable().optional(),
  successMessage: z.string().trim().max(2_000).nullable().optional(),
  status: z.enum(["draft", "published", "closed"]).default("draft"),
  requireRequesterEmail: z.boolean().default(false),
});

export const updateIntakeFormSchema = createIntakeFormSchema
  .omit({ workspaceId: true, boardId: true })
  .partial();

export const formFieldOptionSchema = z.object({
  label: z.string().trim().min(1).max(120),
  value: z.string().trim().min(1).max(120),
});

export const createFormFieldSchema = z.object({
  formId: uuidSchema,
  customFieldId: uuidSchema.nullable().optional(),
  targetField: z
    .enum(["title", "description", "requester_name", "requester_email"])
    .nullable()
    .optional(),
  type: fieldTypeSchema,
  label: z.string().trim().min(1).max(160),
  helpText: z.string().trim().max(1_000).nullable().optional(),
  placeholder: z.string().trim().max(240).nullable().optional(),
  options: z.array(formFieldOptionSchema).max(100).default([]),
  validation: z.record(z.string(), z.unknown()).default({}),
  isRequired: z.boolean().default(false),
  position: z.number().int().min(0).default(0),
});

export const updateFormFieldSchema = z.object({
  label: z.string().trim().min(1).max(160).optional(),
  helpText: z.string().trim().max(1_000).nullable().optional(),
  placeholder: z.string().trim().max(240).nullable().optional(),
  options: z.array(formFieldOptionSchema).max(100).optional(),
  isRequired: z.boolean().optional(),
});

export const cardPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);

export const createCardSchema = z.object({
  boardId: uuidSchema,
  phaseId: uuidSchema,
  title: z.string().trim().min(1).max(240),
  description: z.string().trim().max(20_000).nullable().optional(),
  priority: cardPrioritySchema.default("medium"),
  position: z.number().int().min(0).default(0),
  requesterName: z.string().trim().max(160).nullable().optional(),
  requesterEmail: emailSchema.nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
  source: z.enum(["manual", "form", "email", "api"]).default("manual"),
  sourceFormId: uuidSchema.nullable().optional(),
  assigneeIds: z.array(uuidSchema).max(20).default([]),
  fieldValues: z.record(uuidSchema, z.unknown()).default({}),
});

export const updateCardSchema = createCardSchema
  .omit({ boardId: true, phaseId: true })
  .partial();

export const moveCardSchema = z.object({
  cardId: uuidSchema,
  destinationPhaseId: uuidSchema,
  position: z.number().int().min(0),
});

export const createCommentSchema = z.object({
  cardId: uuidSchema,
  body: z.string().trim().min(1).max(20_000),
  isInternal: z.boolean().default(true),
});

const templateBodySchema = z.string().max(200_000).nullable().optional();

export const createEmailTemplateSchema = z
  .object({
    workspaceId: uuidSchema,
    boardId: uuidSchema.nullable().optional(),
    key: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-z][a-z0-9_.-]*$/),
    name: z.string().trim().min(2).max(160),
    subject: z.string().trim().min(1).max(300),
    htmlBody: templateBodySchema,
    textBody: templateBodySchema,
    isActive: z.boolean().default(true),
  })
  .refine((value) => value.htmlBody || value.textBody, {
    message: "Informe o corpo HTML ou texto do modelo.",
    path: ["htmlBody"],
  });

export const queueEmailSchema = z
  .object({
    workspaceId: uuidSchema,
    cardId: uuidSchema.nullable().optional(),
    templateId: uuidSchema.nullable().optional(),
    fromAddress: emailSchema,
    toAddresses: z.array(emailSchema).min(1).max(50),
    ccAddresses: z.array(emailSchema).max(50).default([]),
    bccAddresses: z.array(emailSchema).max(50).default([]),
    subject: z.string().trim().min(1).max(300),
    htmlBody: templateBodySchema,
    textBody: templateBodySchema,
    scheduledAt: z.coerce.date().nullable().optional(),
  })
  .refine((value) => value.htmlBody || value.textBody, {
    message: "Informe o corpo HTML ou texto da mensagem.",
    path: ["htmlBody"],
  });

export const createAuditLogSchema = z.object({
  workspaceId: uuidSchema.nullable().optional(),
  action: z.string().trim().min(1).max(120),
  entityType: z.string().trim().max(80).nullable().optional(),
  entityId: z.string().trim().max(120).nullable().optional(),
  result: z.enum(["success", "denied", "failure"]).default("success"),
  details: z.record(z.string(), z.unknown()).default({}),
});

export type LoginInput = z.input<typeof loginSchema>;
export type CreateUserInput = z.input<typeof createUserSchema>;
export type UpdateUserInput = z.input<typeof updateUserSchema>;
export type WorkspaceMemberInput = z.input<typeof workspaceMemberSchema>;
export type CreateWorkspaceInput = z.input<typeof createWorkspaceSchema>;
export type CreateBoardInput = z.input<typeof createBoardSchema>;
export type CreatePhaseInput = z.input<typeof createPhaseSchema>;
export type UpdatePhaseInput = z.input<typeof updatePhaseSchema>;
export type CreateCardInput = z.input<typeof createCardSchema>;
export type UpdateCardInput = z.input<typeof updateCardSchema>;
export type CreateCustomFieldInput = z.input<typeof createCustomFieldSchema>;
export type UpdateCustomFieldInput = z.input<typeof updateCustomFieldSchema>;
export type CreateIntakeFormInput = z.input<typeof createIntakeFormSchema>;
export type UpdateIntakeFormInput = z.input<typeof updateIntakeFormSchema>;
export type CreateFormFieldInput = z.input<typeof createFormFieldSchema>;
export type UpdateFormFieldInput = z.input<typeof updateFormFieldSchema>;
export type CreateCommentInput = z.input<typeof createCommentSchema>;
export type CreateEmailTemplateInput = z.input<
  typeof createEmailTemplateSchema
>;
export type QueueEmailInput = z.input<typeof queueEmailSchema>;
