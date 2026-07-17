export interface AppUserDTO {
  id: string
  name: string
  email: string
  avatarUrl?: string | null
  role?: string | null
}

export type KanbanPriority = "low" | "medium" | "high" | "urgent"

export interface KanbanTagDTO {
  id: string
  label: string
  color?: "neutral" | "teal" | "blue" | "amber" | "rose"
}

export interface KanbanAssigneeDTO {
  id: string
  name: string
  avatarUrl?: string | null
  initials?: string | null
}

export interface KanbanCardDTO {
  id: string
  columnId: string
  title: string
  reference?: string | null
  description?: string | null
  priority?: KanbanPriority | null
  dueDate?: string | null
  tags?: KanbanTagDTO[]
  assignees?: KanbanAssigneeDTO[]
  emailCount?: number
  checklist?: {
    completed: number
    total: number
  } | null
  customFieldValues?: Record<string, unknown>
}

export type CustomFieldType =
  | "short_text"
  | "long_text"
  | "number"
  | "date"
  | "datetime"
  | "checkbox"
  | "select"
  | "multiselect"
  | "email"
  | "phone"
  | "url"
  | "currency"
  | "user"

export interface CustomFieldDTO {
  id: string
  key: string
  label: string
  type: CustomFieldType
  isRequired: boolean
  options?: Array<{ label: string; value: string }>
}

export interface CommentDTO {
  id: string
  body: string
  authorName: string
  authorAvatarUrl?: string | null
  createdAt: string
  isOwn: boolean
}

export interface EmailMessageDTO {
  id: string
  status: "queued" | "sending" | "sent" | "failed" | "cancelled"
  toAddresses: string[]
  subject: string
  textBody?: string | null
  errorMessage?: string | null
  sentAt?: string | null
  createdAt: string
}

export interface KanbanColumnDTO {
  id: string
  title: string
  accent?: "neutral" | "teal" | "blue" | "amber" | "rose"
  limit?: number | null
  cards: KanbanCardDTO[]
}

export interface KanbanMoveInput {
  cardId: string
  sourceColumnId: string
  destinationColumnId: string
  position: number
}

interface FormFieldBaseDTO {
  name: string
  label: string
  description?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
}

export interface FormTextFieldDTO extends FormFieldBaseDTO {
  type: "text" | "email" | "date"
}

export interface FormNumberFieldDTO extends FormFieldBaseDTO {
  type: "number"
  min?: number
  max?: number
}

export interface FormTextareaFieldDTO extends FormFieldBaseDTO {
  type: "textarea"
  rows?: number
}

export interface FormSelectFieldDTO extends FormFieldBaseDTO {
  type: "select"
  options: Array<{
    label: string
    value: string
  }>
}

export interface FormColorFieldDTO extends FormFieldBaseDTO {
  type: "color"
  options: Array<{
    label: string
    value: string
  }>
}

export interface FormCheckboxFieldDTO extends FormFieldBaseDTO {
  type: "checkbox"
}

export type FormFieldDTO =
  | FormTextFieldDTO
  | FormNumberFieldDTO
  | FormTextareaFieldDTO
  | FormSelectFieldDTO
  | FormColorFieldDTO
  | FormCheckboxFieldDTO

export type FormInitialValue = string | number | boolean

export interface FormSubmitResult {
  success?: boolean
  error?: string
}
