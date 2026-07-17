"use client"

import { useState, type FormEvent } from "react"
import { CheckCircle2Icon, CircleAlertIcon, LoaderCircleIcon } from "lucide-react"

import { submitIntakeFormAction } from "@/app/f/[publicKey]/actions"
import { DynamicFormField } from "@/components/app/dynamic-form-field"
import type { FormFieldDTO } from "@/components/app/types"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

interface PublicFormFieldRow {
  id: string
  type: string
  label: string
  helpText: string | null
  placeholder: string | null
  options: unknown
  isRequired: boolean
}

function mapField(field: PublicFormFieldRow): FormFieldDTO | null {
  const base = {
    name: field.id,
    label: field.label,
    description: field.helpText ?? undefined,
    placeholder: field.placeholder ?? undefined,
    required: field.isRequired,
  }

  switch (field.type) {
    case "short_text":
    case "phone":
    case "url":
      return { ...base, type: "text" }
    case "long_text":
      return { ...base, type: "textarea", rows: 4 }
    case "number":
    case "currency":
      return { ...base, type: "number" }
    case "date":
    case "datetime":
      return { ...base, type: "date" }
    case "checkbox":
      return { ...base, type: "checkbox" }
    case "select":
      return {
        ...base,
        type: "select",
        options: Array.isArray(field.options)
          ? (field.options as Array<{ label: string; value: string }>)
          : [],
      }
    case "email":
      return { ...base, type: "email" }
    default:
      return null
  }
}

export interface PublicIntakeFormProps {
  publicKey: string
  formName: string
  formDescription: string | null
  boardName: string
  boardColor: string
  fields: PublicFormFieldRow[]
}

export function PublicIntakeForm({
  publicKey,
  formName,
  formDescription,
  boardName,
  boardColor,
  fields,
}: PublicIntakeFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const inputFields = fields
    .map(mapField)
    .filter((field): field is FormFieldDTO => field !== null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const result = await submitIntakeFormAction(
        publicKey,
        new FormData(event.currentTarget)
      )

      if (result.error) {
        setError(result.error)
        return
      }

      setSuccessMessage(result.message || "Recebemos sua solicitação. Obrigado!")
    } catch {
      setError("Não foi possível enviar o formulário agora.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (successMessage) {
    return (
      <div className="grid min-h-dvh place-items-center bg-muted/30 px-4">
        <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
          <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-priority-low/10 text-priority-low">
            <CheckCircle2Icon className="size-6" />
          </span>
          <h1 className="font-heading text-lg font-semibold">Enviado!</h1>
          <p className="mt-2 text-sm text-muted-foreground">{successMessage}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-md rounded-xl border bg-card shadow-sm">
        <div className="border-b px-6 py-5">
          <span
            aria-hidden="true"
            className="mb-3 inline-grid size-9 place-items-center rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: boardColor }}
          >
            {boardName.slice(0, 1).toUpperCase()}
          </span>
          <h1 className="font-heading text-lg font-semibold tracking-[-0.01em]">
            {formName}
          </h1>
          {formDescription && (
            <p className="mt-1 text-sm text-muted-foreground">{formDescription}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          {error && (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {inputFields.map((field) => (
            <DynamicFormField key={field.name} field={field} />
          ))}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting && <LoaderCircleIcon className="animate-spin" />}
            {isSubmitting ? "Enviando..." : "Enviar"}
          </Button>
        </form>
      </div>
    </div>
  )
}
