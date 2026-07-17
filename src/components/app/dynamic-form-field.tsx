"use client"

import { useId } from "react"

import type {
  FormFieldDTO,
  FormInitialValue,
} from "@/components/app/types"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

export interface DynamicFormFieldProps {
  field: FormFieldDTO
  initialValue?: FormInitialValue
}

export function DynamicFormField({
  field,
  initialValue,
}: DynamicFormFieldProps) {
  const generatedId = useId()
  const fieldId = `${generatedId}-${field.name}`
  const descriptionId = field.description ? `${fieldId}-description` : undefined

  if (field.type === "checkbox") {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border bg-muted/25 p-3">
        <Checkbox
          id={fieldId}
          name={field.name}
          value="true"
          defaultChecked={initialValue === true}
          required={field.required}
          disabled={field.disabled}
          aria-describedby={descriptionId}
          className="mt-0.5"
        />
        <div className="min-w-0 space-y-1">
          <Label htmlFor={fieldId} className="leading-snug">
            {field.label}
            {field.required && (
              <span className="ml-1 text-destructive" aria-hidden="true">
                *
              </span>
            )}
          </Label>
          {field.description && (
            <p
              id={descriptionId}
              className="text-xs leading-relaxed text-muted-foreground"
            >
              {field.description}
            </p>
          )}
        </div>
      </div>
    )
  }

  const stringValue =
    typeof initialValue === "string"
      ? initialValue
      : typeof initialValue === "number"
        ? String(initialValue)
        : ""

  return (
    <div className="space-y-1.5">
      <Label htmlFor={fieldId}>
        {field.label}
        {field.required && (
          <span className="ml-1 text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </Label>

      {field.type === "textarea" && (
        <Textarea
          id={fieldId}
          name={field.name}
          defaultValue={stringValue}
          placeholder={field.placeholder}
          required={field.required}
          disabled={field.disabled}
          rows={field.rows ?? 4}
          aria-describedby={descriptionId}
          className="resize-y"
        />
      )}

      {(field.type === "text" ||
        field.type === "email" ||
        field.type === "date") && (
        <Input
          id={fieldId}
          name={field.name}
          type={field.type}
          defaultValue={stringValue}
          placeholder={field.placeholder}
          required={field.required}
          disabled={field.disabled}
          aria-describedby={descriptionId}
        />
      )}

      {field.type === "number" && (
        <Input
          id={fieldId}
          name={field.name}
          type="number"
          min={field.min}
          max={field.max}
          defaultValue={stringValue}
          placeholder={field.placeholder}
          required={field.required}
          disabled={field.disabled}
          aria-describedby={descriptionId}
        />
      )}

      {field.type === "color" && (
        <div
          role="radiogroup"
          aria-describedby={descriptionId}
          className="flex flex-wrap gap-2"
        >
          {field.options.map((option) => (
            <label key={option.value} className="cursor-pointer">
              <input
                type="radio"
                name={field.name}
                value={option.value}
                defaultChecked={stringValue === option.value}
                required={field.required}
                disabled={field.disabled}
                className="peer sr-only"
              />
              <span
                title={option.label}
                aria-hidden="true"
                className="block size-7 rounded-full ring-1 ring-foreground/15 transition-shadow peer-checked:ring-3 peer-checked:ring-offset-2 peer-checked:ring-offset-background peer-focus-visible:ring-3"
                style={{ backgroundColor: option.value }}
              />
              <span className="sr-only">{option.label}</span>
            </label>
          ))}
        </div>
      )}

      {field.type === "select" && (
        <Select
          name={field.name}
          defaultValue={stringValue || undefined}
          required={field.required}
          disabled={field.disabled}
        >
          <SelectTrigger
            id={fieldId}
            className="w-full"
            aria-describedby={descriptionId}
          >
            <SelectValue
              placeholder={field.placeholder ?? "Selecione uma opção"}
            />
          </SelectTrigger>
          <SelectContent position="popper">
            {field.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {field.description && (
        <p
          id={descriptionId}
          className="text-xs leading-relaxed text-muted-foreground"
        >
          {field.description}
        </p>
      )}
    </div>
  )
}
