import type { CustomFieldDTO, FormFieldDTO } from "@/components/app/types"

export const CUSTOM_FIELD_NAME_PREFIX = "field:"

export function customFieldInputName(fieldId: string) {
  return `${CUSTOM_FIELD_NAME_PREFIX}${fieldId}`
}

export function customFieldToFormField(field: CustomFieldDTO): FormFieldDTO | null {
  const base = {
    name: customFieldInputName(field.id),
    label: field.label,
    required: field.isRequired,
  }

  switch (field.type) {
    case "short_text":
    case "phone":
    case "url":
      return { ...base, type: "text" }
    case "long_text":
      return { ...base, type: "textarea", rows: 3 }
    case "number":
    case "currency":
      return { ...base, type: "number" }
    case "date":
    case "datetime":
      return { ...base, type: "date" }
    case "checkbox":
      return { ...base, type: "checkbox" }
    case "select":
      return { ...base, type: "select", options: field.options ?? [] }
    case "radio":
      return { ...base, type: "radio", options: field.options ?? [] }
    case "email":
      return { ...base, type: "email" }
    case "attachment":
      return { ...base, type: "file", multiple: true }
    default:
      return null
  }
}
