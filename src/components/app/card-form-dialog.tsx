"use client"

import { useState, type FormEvent } from "react"
import { CircleAlertIcon, LoaderCircleIcon } from "lucide-react"

import { DynamicFormField } from "@/components/app/dynamic-form-field"
import type {
  FormFieldDTO,
  FormInitialValue,
  FormSubmitResult,
} from "@/components/app/types"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export interface CardFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fields: FormFieldDTO[]
  submitAction: (
    formData: FormData
  ) => void | FormSubmitResult | Promise<void | FormSubmitResult>
  title?: string
  description?: string
  submitLabel?: string
  initialValues?: Record<string, FormInitialValue>
  hiddenValues?: Record<string, string>
  errorMessage?: string | null
}

export function CardFormDialog({
  open,
  onOpenChange,
  fields,
  submitAction,
  title = "Novo card",
  description = "Preencha os dados abaixo para incluir o card no fluxo.",
  submitLabel = "Criar card",
  initialValues = {},
  hiddenValues = {},
  errorMessage,
}: CardFormDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [wasOpen, setWasOpen] = useState(open)

  // Ajuste de estado durante o render, em vez de um efeito: reabrir o diálogo
  // não deve mostrar o erro da tentativa anterior, e fazer isso num efeito
  // renderizaria o erro antigo por um quadro antes de limpá-lo.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setLocalError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setLocalError(null)

    try {
      const result = await submitAction(new FormData(event.currentTarget))

      if (result?.error) {
        setLocalError(result.error)
        return
      }

      if (result?.success === false) {
        setLocalError("Não foi possível salvar o card.")
        return
      }

      onOpenChange(false)
    } catch {
      setLocalError(
        "Não foi possível salvar agora. Revise os dados e tente novamente."
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(46rem,calc(100dvh-2rem))] overflow-y-auto sm:max-w-lg">
        <form onSubmit={handleSubmit} className="grid gap-5">
          <DialogHeader className="pr-8">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          {(localError || errorMessage) && (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertDescription>
                {localError || errorMessage}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4">
            {Object.entries(hiddenValues).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            {fields.map((field) => (
              <DynamicFormField
                key={field.name}
                field={field}
                initialValue={initialValues[field.name]}
              />
            ))}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSubmitting}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <LoaderCircleIcon className="animate-spin" />}
              {isSubmitting ? "Salvando..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
