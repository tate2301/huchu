import * as React from "react"

import { cn } from "@/lib/utils"

export type MaterialIconProps = Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> & {
  size?: number | string
  strokeWidth?: number | string
  absoluteStrokeWidth?: boolean
}

export type LucideIcon = React.ComponentType<MaterialIconProps>

function createMaterialIcon(symbol: string, displayName: string): LucideIcon {
  const Icon = ({ className, size, style, ...props }: MaterialIconProps) => (
    <span
      {...props}
      className={cn(
        "material-symbols-rounded inline-flex h-[1em] w-[1em] shrink-0 select-none items-center justify-center align-middle leading-none",
        className,
      )}
      style={{
        fontSize: size ?? "1em",
        ...style,
      }}
    >
      {symbol}
    </span>
  )

  Icon.displayName = displayName
  return Icon
}

export const AlertCircle = createMaterialIcon("error", "AlertCircle")
export const AlertTriangle = createMaterialIcon("warning", "AlertTriangle")
export const ArrowRight = createMaterialIcon("arrow_forward", "ArrowRight")
export const ArrowRightLeft = createMaterialIcon("sync_alt", "ArrowRightLeft")
export const ArrowDownward = createMaterialIcon("arrow_downward", "ArrowDownward")
export const ArrowUpward = createMaterialIcon("arrow_upward", "ArrowUpward")
export const BarChart3 = createMaterialIcon("bar_chart", "BarChart3")
export const Bell = createMaterialIcon("notifications", "Bell")
export const Building2 = createMaterialIcon("domain", "Building2")
export const Calendar = createMaterialIcon("calendar_month", "Calendar")
export const Camera = createMaterialIcon("videocam", "Camera")
export const ChartLine = createMaterialIcon("monitoring", "ChartLine")
export const CheckCircle = createMaterialIcon("check_circle", "CheckCircle")
export const CheckCircle2 = createMaterialIcon("task_alt", "CheckCircle2")
export const CheckIcon = createMaterialIcon("check", "CheckIcon")
export const Checklist = createMaterialIcon("checklist", "Checklist")
export const ChevronDown = createMaterialIcon("expand_more", "ChevronDown")
export const ChevronDownIcon = createMaterialIcon("expand_more", "ChevronDownIcon")
export const ChevronRight = createMaterialIcon("chevron_right", "ChevronRight")
export const ChevronUpIcon = createMaterialIcon("expand_less", "ChevronUpIcon")
export const Circle = createMaterialIcon("circle", "Circle")
export const ClipboardList = createMaterialIcon("assignment", "ClipboardList")
export const Clock = createMaterialIcon("schedule", "Clock")
export const Coins = createMaterialIcon("monetization_on", "Coins")
export const Dashboard = createMaterialIcon("dashboard", "Dashboard")
export const Dataset = createMaterialIcon("dataset", "Dataset")
export const Download = createMaterialIcon("download", "Download")
export const EventNote = createMaterialIcon("event_note", "EventNote")
export const Factory = createMaterialIcon("factory", "Factory")
export const FileCheck = createMaterialIcon("task", "FileCheck")
export const FileText = createMaterialIcon("description", "FileText")
export const Fuel = createMaterialIcon("local_gas_station", "Fuel")
export const Gem = createMaterialIcon("diamond", "Gem")
export const Grid3x3 = createMaterialIcon("grid_view", "Grid3x3")
export const HelpCircle = createMaterialIcon("help", "HelpCircle")
export const History = createMaterialIcon("history", "History")
export const Home = createMaterialIcon("home", "Home")
export const Loader2 = createMaterialIcon("progress_activity", "Loader2")
export const LocalShipping = createMaterialIcon("local_shipping", "LocalShipping")
export const LogOut = createMaterialIcon("logout", "LogOut")
export const ManageAccounts = createMaterialIcon("manage_accounts", "ManageAccounts")
export const Mic = createMaterialIcon("mic", "Mic")
export const Minus = createMaterialIcon("remove", "Minus")
export const NoteAdd = createMaterialIcon("note_add", "NoteAdd")
export const Package = createMaterialIcon("inventory_2", "Package")
export const PackageCheck = createMaterialIcon("inventory", "PackageCheck")
export const PanelLeft = createMaterialIcon("left_panel_open", "PanelLeft")
export const Payments = createMaterialIcon("payments", "Payments")
export const Pencil = createMaterialIcon("edit", "Pencil")
export const Plus = createMaterialIcon("add", "Plus")
export const QrCode = createMaterialIcon("qr_code", "QrCode")
export const Radio = createMaterialIcon("radio", "Radio")
export const ReceiptLong = createMaterialIcon("receipt_long", "ReceiptLong")
export const ReportProblem = createMaterialIcon("report_problem", "ReportProblem")
export const Save = createMaterialIcon("save", "Save")
export const Scale = createMaterialIcon("balance", "Scale")
export const SearchX = createMaterialIcon("search_off", "SearchX")
export const Send = createMaterialIcon("send", "Send")
export const Server = createMaterialIcon("dns", "Server")
export const Shield = createMaterialIcon("shield", "Shield")
export const ShieldAlert = createMaterialIcon("gpp_bad", "ShieldAlert")
export const ShieldCheck = createMaterialIcon("verified_user", "ShieldCheck")
export const TableRows = createMaterialIcon("table_rows", "TableRows")
export const Trash2 = createMaterialIcon("delete", "Trash2")
export const TrendingDown = createMaterialIcon("trending_down", "TrendingDown")
export const TrendingUp = createMaterialIcon("trending_up", "TrendingUp")
export const User = createMaterialIcon("person", "User")
export const UserCheck = createMaterialIcon("how_to_reg", "UserCheck")
export const UserPlus = createMaterialIcon("person_add", "UserPlus")
export const UserRound = createMaterialIcon("account_circle", "UserRound")
export const UserX = createMaterialIcon("person_off", "UserX")
export const Users = createMaterialIcon("groups", "Users")
export const Video = createMaterialIcon("videocam", "Video")
export const Wallet = createMaterialIcon("account_balance_wallet", "Wallet")
export const Wrench = createMaterialIcon("build", "Wrench")
export const X = createMaterialIcon("close", "X")
export const XCircle = createMaterialIcon("cancel", "XCircle")
export const Zap = createMaterialIcon("bolt", "Zap")
