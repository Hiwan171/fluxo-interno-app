"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  ExternalLinkIcon,
  FileTextIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
} from "lucide-react"

import {
  generateContractAction,
  prepareContractAction,
} from "@/app/(app)/boards/[boardId]/actions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DEFAULT_PACKAGING,
  type ContractFieldErrors,
} from "@/lib/contracts/fields"
import { CONTRACT_KIND_LABELS, KIND_TRAITS } from "@/lib/contracts/companies"
import type { DraftFields, DraftIssue } from "@/lib/contracts/from-card"
import { parseMoney, parseQuantityKg } from "@/lib/contracts/normalize"
import type { ContractPreparation } from "@/lib/contracts/service"
import {
  formatMoneyWithWords,
  formatQuantityWithWords,
} from "@/lib/contracts/words"

export interface ContractDialogProps {
  boardId: string
  cardId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Chamado depois de gerar, para o card recarregar o histórico. */
  onGenerated?: (cardId: string) => void | Promise<void>
}

type GeneratedFile = { attachmentId: string; fileName: string }

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
})

function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Extenso do valor, mostrado sob o campo para quem revisa conferir o que vai ao contrato. */
function moneyPreview(raw: string): string | null {
  const amount = parseMoney(raw)

  return amount !== null && amount > 0 ? formatMoneyWithWords(amount) : null
}

function kilosPreview(raw: string): string | null {
  const quantity = parseQuantityKg(raw)

  if (quantity === null || !Number.isInteger(quantity) || quantity <= 0)
    return null

  return `${formatQuantityWithWords(quantity)} ${quantity === 1 ? "quilo" : "quilos"}`
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-3 rounded-lg border p-3 sm:p-4">
      <legend className="px-1 text-sm font-medium">{title}</legend>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  )
}

function TextField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
  wide = false,
  inputMode,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string | null
  wide?: boolean
  inputMode?: "decimal" | "numeric" | "email"
}) {
  return (
    <div className={wide ? "grid gap-1.5 sm:col-span-2" : "grid gap-1.5"}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${id}-note` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {(error || hint) && (
        <p
          id={`${id}-note`}
          className={
            error ? "text-xs text-destructive" : "text-xs text-muted-foreground"
          }
        >
          {error ?? hint}
        </p>
      )}
    </div>
  )
}

function IssueList({
  issues,
  level,
}: {
  issues: DraftIssue[]
  level: DraftIssue["level"]
}) {
  const items = issues.filter((issue) => issue.level === level)

  if (items.length === 0) return null

  return (
    <Alert variant={level === "blocker" ? "destructive" : "default"}>
      {level === "blocker" ? <CircleAlertIcon /> : <TriangleAlertIcon />}
      <AlertDescription>
        <p className="font-medium">
          {level === "blocker"
            ? "Este contrato não pode ser gerado por aqui:"
            : "Confira antes de gerar:"}
        </p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {items.map((issue, index) => (
            <li key={`${issue.field ?? "geral"}-${index}`}>{issue.message}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}

/**
 * O conteúdo do diálogo é desmontado quando ele fecha, então todo o estado vive
 * em `ContractDialogBody`: reabrir começa do zero, sem efeito para limpar o que
 * sobrou da vez anterior.
 */
export function ContractDialog({
  boardId,
  cardId,
  open,
  onOpenChange,
  onGenerated,
}: ContractDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(54rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        {cardId && (
          <ContractDialogBody
            boardId={boardId}
            cardId={cardId}
            onClose={() => onOpenChange(false)}
            onGenerated={onGenerated}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ContractDialogBody({
  boardId,
  cardId,
  onClose,
  onGenerated,
}: {
  boardId: string
  cardId: string
  onClose: () => void
  onGenerated?: (cardId: string) => void | Promise<void>
}) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [preparation, setPreparation] = useState<ContractPreparation | null>(
    null,
  )
  const [fields, setFields] = useState<DraftFields | null>(null)
  const [fieldErrors, setFieldErrors] = useState<ContractFieldErrors>({})
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [generated, setGenerated] = useState<GeneratedFile | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false

    prepareContractAction(cardId)
      .then((result) => {
        if (cancelled) return

        if (result.ok) {
          setPreparation(result.data)
          setFields(result.data.fields)
        } else {
          setLoadError(result.error)
        }
      })
      .catch(() => {
        if (!cancelled)
          setLoadError("Não foi possível preparar o contrato agora.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [cardId])

  function update<K extends keyof DraftFields>(key: K, value: DraftFields[K]) {
    setFields((current) => (current ? { ...current, [key]: value } : current))
    setFieldErrors((current) => {
      if (!current[key]) return current

      const next = { ...current }
      delete next[key]
      return next
    })
  }

  function toggleGroup(group: "A" | "B" | "E", checked: boolean) {
    if (!fields) return

    const next = checked
      ? [...new Set([...fields.residueGroups, group])]
      : fields.residueGroups.filter((item) => item !== group)

    update("residueGroups", next)
  }

  const selectedCompany = preparation?.companies.find(
    (company) => company.key === fields?.company,
  )
  const companyUnavailable =
    Boolean(fields?.company) &&
    (!selectedCompany ||
      !fields ||
      !selectedCompany.kinds.includes(fields.kind))
  // O bloqueio "empresa sem contrato de referência" vem do que o card dizia; se a
  // pessoa escolheu outra empresa que tem o modelo, ele deixa de valer.
  const issues = (preparation?.issues ?? []).filter(
    (issue) =>
      !(issue.level === "blocker" && issue.field === "company") ||
      companyUnavailable,
  )
  const blockers = issues.filter((issue) => issue.level === "blocker")
  const canGenerate =
    Boolean(fields) &&
    Boolean(fields?.company) &&
    blockers.length === 0 &&
    !companyUnavailable &&
    !generating &&
    !generated

  async function handleGenerate() {
    if (!fields) return

    setGenerating(true)
    setGenerateError(null)
    setFieldErrors({})

    try {
      const result = await generateContractAction(boardId, cardId, fields)

      if (result.success) {
        setGenerated({
          attachmentId: result.attachmentId,
          fileName: result.fileName,
        })
        // Atualiza a lista de contratos já gerados sem refazer o rascunho.
        setPreparation((current) =>
          current
            ? {
                ...current,
                existing: [
                  {
                    id: result.attachmentId,
                    fileName: result.fileName,
                    sizeBytes: 0,
                    createdAt: new Date().toISOString(),
                  },
                  ...current.existing,
                ],
              }
            : current,
        )
        // O aviso de sucesso fica no topo; quem estava revisando lá embaixo precisa vê-lo.
        bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" })
        // Atualizar o histórico do card não deve segurar o botão em "Gerando...".
        Promise.resolve(onGenerated?.(cardId)).catch(() => {})
        return
      }

      setGenerateError(result.error)
      if (result.fieldErrors) setFieldErrors(result.fieldErrors)
    } catch {
      setGenerateError(
        "Não foi possível gerar o contrato agora. Tente novamente.",
      )
    } finally {
      setGenerating(false)
    }
  }

  const error = (key: keyof DraftFields) =>
    fieldErrors[key as keyof ContractFieldErrors]

  return (
    <>
      <DialogHeader className="border-b px-5 py-4 pr-12">
        <DialogTitle className="flex items-center gap-2">
          <FileTextIcon className="size-4" aria-hidden="true" />
          Gerar contrato
        </DialogTitle>
        <DialogDescription>
          Os dados vêm do card. Confira e corrija o que for preciso: o que está
          nesta tela é exatamente o que vai para o PDF.
        </DialogDescription>
      </DialogHeader>

      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {loading && (
          <div
            className="grid gap-3"
            aria-busy="true"
            aria-label="Carregando dados do contrato"
          >
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {loadError && (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        )}

        {preparation && fields && (
          <div className="grid gap-4">
            <IssueList issues={issues} level="blocker" />
            <IssueList issues={issues} level="warning" />

            {generated && (
              <Alert>
                <CheckCircle2Icon />
                <AlertDescription>
                  <p className="font-medium">
                    Contrato gerado e anexado ao card.
                  </p>
                  <a
                    href={`/api/attachments/${generated.attachmentId}`}
                    className="mt-1 inline-flex items-center gap-1 underline underline-offset-3"
                  >
                    <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
                    {generated.fileName}
                  </a>
                </AlertDescription>
              </Alert>
            )}

            {generateError && (
              <Alert variant="destructive">
                <CircleAlertIcon />
                <AlertDescription>{generateError}</AlertDescription>
              </Alert>
            )}

            <Section title="Contratada">
              <p className="text-sm sm:col-span-2">
                <span className="text-muted-foreground">Modelo: </span>
                <span className="font-medium">
                  {CONTRACT_KIND_LABELS[fields.kind]}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  (definido pelo tipo de resíduo do card)
                </span>
              </p>
              <div className="grid gap-1.5">
                <Label htmlFor="contract-company">Empresa contratada</Label>
                <Select
                  value={fields.company}
                  onValueChange={(value) =>
                    update("company", value as DraftFields["company"])
                  }
                >
                  <SelectTrigger
                    id="contract-company"
                    className="w-full"
                    aria-invalid={error("company") ? true : undefined}
                  >
                    <SelectValue placeholder="Escolha a empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {preparation.companies.map((company) => (
                      <SelectItem
                        key={company.key}
                        value={company.key}
                        disabled={!company.kinds.includes(fields.kind)}
                      >
                        {company.name}
                        {company.ready
                          ? company.kinds.includes(fields.kind)
                            ? ""
                            : " (sem contrato de referência deste tipo)"
                          : " (cadastro incompleto)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {error("company") && (
                  <p className="text-xs text-destructive">{error("company")}</p>
                )}
              </div>
              <TextField
                id="contract-number"
                label="Número do contrato (opcional)"
                hint="Só aparece no nome do arquivo."
                value={fields.contractNumber}
                onChange={(value) => update("contractNumber", value)}
                error={error("contractNumber")}
              />
              <TextField
                id="contract-consultant-role"
                label="Cargo do consultor no contrato"
                hint="Ex.: Aux. comercial ou Representante comercial."
                value={fields.consultantRole}
                onChange={(value) => update("consultantRole", value)}
                error={error("consultantRole")}
              />
              <TextField
                id="contract-consultant"
                label="Consultor que assina pela contratada"
                value={fields.consultant}
                onChange={(value) => update("consultant", value)}
                error={error("consultant")}
              />
            </Section>

            <Section title="Contratante">
              <TextField
                id="contract-company-name"
                label="Razão social"
                value={fields.companyName}
                onChange={(value) => update("companyName", value)}
                error={error("companyName")}
                wide
              />
              <TextField
                id="contract-cnpj"
                label="CNPJ"
                value={fields.cnpj}
                onChange={(value) => update("cnpj", value)}
                error={error("cnpj")}
              />
              <TextField
                id="contract-cep"
                label="CEP"
                value={fields.cep}
                onChange={(value) => update("cep", value)}
                error={error("cep")}
              />
              <TextField
                id="contract-street"
                label="Endereço"
                value={fields.street}
                onChange={(value) => update("street", value)}
                error={error("street")}
                wide
              />
              <TextField
                id="contract-number-street"
                label="Número"
                value={fields.streetNumber}
                onChange={(value) => update("streetNumber", value)}
                error={error("streetNumber")}
              />
              <TextField
                id="contract-complement"
                label="Complemento"
                value={fields.complement}
                onChange={(value) => update("complement", value)}
                error={error("complement")}
              />
              <TextField
                id="contract-district"
                label="Bairro"
                value={fields.district}
                onChange={(value) => update("district", value)}
                error={error("district")}
              />
              <TextField
                id="contract-city"
                label="Cidade"
                value={fields.city}
                onChange={(value) => update("city", value)}
                error={error("city")}
              />
              <TextField
                id="contract-uf"
                label="UF"
                value={fields.uf}
                onChange={(value) =>
                  update("uf", value.toUpperCase().slice(0, 2))
                }
                error={error("uf")}
              />
              <TextField
                id="contract-ie"
                label="Inscrição estadual"
                hint="Use 'isento' se o cliente não tiver."
                value={fields.stateRegistration}
                onChange={(value) => update("stateRegistration", value)}
                error={error("stateRegistration")}
              />
              <TextField
                id="contract-im"
                label="Inscrição municipal"
                hint="Use 'isento' se o cliente não tiver."
                value={fields.municipalRegistration}
                onChange={(value) => update("municipalRegistration", value)}
                error={error("municipalRegistration")}
              />
            </Section>

            <Section title="Representante legal">
              <TextField
                id="contract-rep-name"
                label="Nome"
                value={fields.representativeName}
                onChange={(value) => update("representativeName", value)}
                error={error("representativeName")}
                wide
              />
              <TextField
                id="contract-rep-cpf"
                label="CPF"
                value={fields.representativeCpf}
                onChange={(value) => update("representativeCpf", value)}
                error={error("representativeCpf")}
              />
              <TextField
                id="contract-rep-birth"
                label="Data de nascimento"
                hint="dd/mm/aaaa"
                value={fields.representativeBirthDate}
                onChange={(value) => update("representativeBirthDate", value)}
                error={error("representativeBirthDate")}
              />
              <TextField
                id="contract-landline"
                label="Telefone fixo (opcional)"
                hint="Só vai para o contrato se for preenchido."
                value={fields.landline}
                onChange={(value) => update("landline", value)}
                error={error("landline")}
              />
              <TextField
                id="contract-phones"
                label="Celular(es)"
                value={fields.phones}
                onChange={(value) => update("phones", value)}
                error={error("phones")}
              />
              <TextField
                id="contract-email"
                label="E-mail"
                inputMode="email"
                value={fields.email}
                onChange={(value) => update("email", value)}
                error={error("email")}
              />
              <TextField
                id="contract-segment"
                label="Segmento"
                value={fields.segment}
                onChange={(value) => update("segment", value)}
                error={error("segment")}
                wide
              />
            </Section>

            <Section title="Coleta e preços">
              {KIND_TRAITS[fields.kind].health && (
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label>Grupos de resíduos (cláusula 1.1)</Label>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {(
                      [
                        ["A", "A — infectante"],
                        ["B", "B — químico"],
                        ["E", "E — perfurocortante"],
                      ] as const
                    ).map(([group, label]) => (
                      <div key={group} className="flex items-center gap-2">
                        <Checkbox
                          id={`contract-group-${group}`}
                          checked={fields.residueGroups.includes(group)}
                          onCheckedChange={(checked) =>
                            toggleGroup(group, checked === true)
                          }
                        />
                        <Label htmlFor={`contract-group-${group}`}>
                          {label}
                        </Label>
                      </div>
                    ))}
                  </div>
                  {error("residueGroups") && (
                    <p className="text-xs text-destructive">
                      {error("residueGroups")}
                    </p>
                  )}
                </div>
              )}
              {KIND_TRAITS[fields.kind].recurring ? (
                <TextField
                  id="contract-frequency"
                  label="Frequência de coleta (cláusula 1.2)"
                  hint={
                    KIND_TRAITS[fields.kind].billingPeriod
                      ? "Define também o período de cobrança (ex.: bimestral → valor por bimestre)."
                      : undefined
                  }
                  value={fields.frequency}
                  onChange={(value) => update("frequency", value)}
                  error={error("frequency")}
                  wide
                />
              ) : (
                <p className="text-sm text-muted-foreground sm:col-span-2">
                  Coleta única: o contrato diz &ldquo;uma única coleta
                  previamente agendada com 48 horas de antecedência&rdquo; e
                  vale por 3 meses.
                </p>
              )}
              <TextField
                id="contract-fee"
                label={
                  KIND_TRAITS[fields.kind].billingPeriod
                    ? "Valor por período de cobrança (R$)"
                    : KIND_TRAITS[fields.kind].recurring
                      ? "Mensalidade (R$)"
                      : "Valor da coleta (R$)"
                }
                inputMode="decimal"
                value={fields.monthlyFee}
                onChange={(value) => update("monthlyFee", value)}
                error={error("monthlyFee")}
                hint={moneyPreview(fields.monthlyFee)}
              />
              <TextField
                id="contract-allowance"
                label={
                  KIND_TRAITS[fields.kind].billingPeriod
                    ? "Franquia por período (kg)"
                    : KIND_TRAITS[fields.kind].recurring
                      ? "Franquia mensal (kg)"
                      : "Franquia por coleta (kg)"
                }
                inputMode="numeric"
                value={fields.monthlyAllowanceKg}
                onChange={(value) => update("monthlyAllowanceKg", value)}
                error={error("monthlyAllowanceKg")}
                hint={kilosPreview(fields.monthlyAllowanceKg)}
              />
              <TextField
                id="contract-excess"
                label="Valor do kg excedente (R$)"
                inputMode="decimal"
                value={fields.excessPerKg}
                onChange={(value) => update("excessPerKg", value)}
                error={error("excessPerKg")}
                hint={moneyPreview(fields.excessPerKg)}
              />
              {!KIND_TRAITS[fields.kind].recurring && (
                <div className="flex items-start gap-2 sm:col-span-2">
                  <Checkbox
                    id="contract-advance"
                    className="mt-0.5"
                    checked={fields.advancePayment}
                    onCheckedChange={(checked) =>
                      update("advancePayment", checked === true)
                    }
                  />
                  <Label htmlFor="contract-advance" className="leading-snug">
                    Exigir 50% do valor antecipado para programar a coleta
                    (cláusula 5.1). Algumas coletas únicas saem sem essa frase.
                  </Label>
                </div>
              )}
              {KIND_TRAITS[fields.kind].packagingAndAnimals && (
                <>
                  <TextField
                    id="contract-packaging"
                    label="Acondicionamento (cláusula 4.1)"
                    hint={`Padrão: ${DEFAULT_PACKAGING}`}
                    value={fields.packaging}
                    onChange={(value) => update("packaging", value)}
                    error={error("packaging")}
                  />
                  <div className="flex items-start gap-2 sm:col-span-2">
                    <Checkbox
                      id="contract-animals"
                      className="mt-0.5"
                      checked={fields.animalCollection}
                      onCheckedChange={(checked) =>
                        update("animalCollection", checked === true)
                      }
                    />
                    <Label htmlFor="contract-animals" className="leading-snug">
                      Incluir a cláusula 4.5 (coleta avulsa de animais, R$ 9,00
                      por kg com mínimo de 10 kg por animal)
                    </Label>
                  </div>
                </>
              )}
            </Section>

            {preparation.existing.length > 0 && (
              <section
                aria-labelledby="contract-existing-title"
                className="grid gap-2"
              >
                <h3
                  id="contract-existing-title"
                  className="text-sm font-medium"
                >
                  Contratos já gerados para este card
                </h3>
                <ul className="divide-y rounded-lg border text-sm">
                  {preparation.existing.map((file) => (
                    <li
                      key={file.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                    >
                      <a
                        href={`/api/attachments/${file.id}`}
                        className="min-w-0 truncate underline-offset-3 hover:underline"
                      >
                        {file.fileName}
                      </a>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {dateFormatter.format(new Date(file.createdAt))}
                        {file.sizeBytes > 0
                          ? ` · ${formatSize(file.sizeBytes)}`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </div>

      <DialogFooter className="border-t px-5 py-3">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={generating}
        >
          {generated ? "Fechar" : "Cancelar"}
        </Button>
        <Button type="button" onClick={handleGenerate} disabled={!canGenerate}>
          {generating && <LoaderCircleIcon className="animate-spin" />}
          {generating ? "Gerando..." : "Gerar contrato"}
        </Button>
      </DialogFooter>
    </>
  )
}
