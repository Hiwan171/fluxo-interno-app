import {
  ClipboardListIcon,
  Columns3Icon,
  FolderIcon,
  HeadsetIcon,
  InboxIcon,
  LifeBuoyIcon,
  TicketIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react"

export interface IconOption {
  label: string
  value: string
  Icon: LucideIcon
}

export const ICON_PALETTE: IconOption[] = [
  { label: "Colunas", value: "columns3", Icon: Columns3Icon },
  { label: "Chamado", value: "ticket", Icon: TicketIcon },
  { label: "Suporte", value: "headset", Icon: HeadsetIcon },
  { label: "Manutenção", value: "wrench", Icon: WrenchIcon },
  { label: "Caixa de entrada", value: "inbox", Icon: InboxIcon },
  { label: "Lista", value: "clipboard", Icon: ClipboardListIcon },
  { label: "Ajuda", value: "life-buoy", Icon: LifeBuoyIcon },
  { label: "Pasta", value: "folder", Icon: FolderIcon },
]

const ICON_BY_VALUE = new Map(ICON_PALETTE.map((option) => [option.value, option.Icon]))

export function getIconComponent(value: string | null | undefined): LucideIcon {
  if (value) {
    const icon = ICON_BY_VALUE.get(value)
    if (icon) return icon
  }
  return Columns3Icon
}
