import type { KanbanColumnDTO } from "@/components/app/types"

export interface PhaseColorOption {
  label: string
  value: string
  accent: NonNullable<KanbanColumnDTO["accent"]>
}

export const PHASE_COLOR_PALETTE: PhaseColorOption[] = [
  { label: "Verde-azulado", value: "#0d9488", accent: "teal" },
  { label: "Azul", value: "#2563eb", accent: "blue" },
  { label: "Âmbar", value: "#d97706", accent: "amber" },
  { label: "Rosa", value: "#e11d48", accent: "rose" },
  { label: "Neutro", value: "#71717a", accent: "neutral" },
]

const ACCENT_BY_COLOR = new Map(
  PHASE_COLOR_PALETTE.map((option) => [option.value.toLowerCase(), option.accent]),
)

export function getAccentForPhaseColor(
  color: string | null | undefined,
  fallbackIndex: number,
): NonNullable<KanbanColumnDTO["accent"]> {
  if (color) {
    const accent = ACCENT_BY_COLOR.get(color.toLowerCase())
    if (accent) return accent
  }

  return PHASE_COLOR_PALETTE[fallbackIndex % PHASE_COLOR_PALETTE.length].accent
}

export function getColorForAccent(
  accent: KanbanColumnDTO["accent"] | undefined,
): string {
  return (
    PHASE_COLOR_PALETTE.find((option) => option.accent === (accent ?? "neutral"))
      ?.value ?? PHASE_COLOR_PALETTE[PHASE_COLOR_PALETTE.length - 1].value
  )
}
