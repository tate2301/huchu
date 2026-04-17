import * as React from "react";
import {
  AcademicCap as MedusaAcademicCapRaw,
  ArrowRightOnRectangle as MedusaArrowRightOnRectangleRaw,
  BookOpen as MedusaBookOpenRaw,
  Buildings as MedusaBuildingsRaw,
  BuildingStorefront as MedusaBuildingStorefrontRaw,
  Cash as MedusaCashRaw,
  ChevronDown as MedusaChevronDownRaw,
  ChevronRight as MedusaChevronRightRaw,
  ChartBar as MedusaChartBarRaw,
  CirclePlus as MedusaCirclePlusRaw,
  CircleSliders as MedusaCircleSlidersRaw,
  CircleStack as MedusaCircleStackRaw,
  CogSixTooth as MedusaCogSixToothRaw,
  Directions as MedusaDirectionsRaw,
  GridList as MedusaGridListRaw,
  HandTruck as MedusaHandTruckRaw,
  House as MedusaHouseRaw,
  IdBadge as MedusaIdBadgeRaw,
  Lifebuoy as MedusaLifebuoyRaw,
} from "@medusajs/icons";

import { cn } from "@/lib/utils";

export type MaterialIconProps = Omit<
  React.HTMLAttributes<HTMLSpanElement>,
  "children"
> & {
  size?: number | string;
  strokeWidth?: number | string;
  absoluteStrokeWidth?: boolean;
};

export type LucideIcon = React.ComponentType<MaterialIconProps>;

function createMaterialIcon(symbol: string, displayName: string): LucideIcon {
  const Icon = ({ className, size, style, ...props }: MaterialIconProps) => (
    <span
      {...props}
      className={cn(
        "material-symbols-rounded inline-flex h-[1em] w-[1em] shrink-0 select-none items-center justify-center align-middle leading-none text-current",
        className,
      )}
      style={{
        color: "currentColor",
        ...(size !== undefined ? { fontSize: size } : null),
        ...style,
      }}
    >
      {symbol}
    </span>
  );

  Icon.displayName = displayName;
  return Icon;
}

function createMedusaIcon(
  IconComponent: React.ElementType,
  displayName: string,
): LucideIcon {
  const Icon = ({ className, size, style, ...props }: MaterialIconProps) => (
    <IconComponent
      {...(props as unknown as React.SVGAttributes<SVGSVGElement>)}
      aria-hidden={props["aria-label"] ? undefined : true}
      className={cn(
        "inline-flex h-[1em] w-[1em] shrink-0 select-none items-center justify-center align-middle leading-none text-current",
        className,
      )}
      focusable="false"
      style={{
        color: "currentColor",
        ...(size !== undefined ? { width: size, height: size } : null),
        ...style,
      }}
    />
  );

  Icon.displayName = displayName;
  return Icon;
}

export const MedusaAcademicCapIcon = createMedusaIcon(
  MedusaAcademicCapRaw,
  "MedusaAcademicCapIcon",
);
export const MedusaArrowRightOnRectangleIcon = createMedusaIcon(
  MedusaArrowRightOnRectangleRaw,
  "MedusaArrowRightOnRectangleIcon",
);
export const MedusaBookOpenIcon = createMedusaIcon(
  MedusaBookOpenRaw,
  "MedusaBookOpenIcon",
);
export const MedusaBuildingsIcon = createMedusaIcon(
  MedusaBuildingsRaw,
  "MedusaBuildingsIcon",
);
export const MedusaBuildingStorefrontIcon = createMedusaIcon(
  MedusaBuildingStorefrontRaw,
  "MedusaBuildingStorefrontIcon",
);
export const MedusaCashIcon = createMedusaIcon(MedusaCashRaw, "MedusaCashIcon");
export const MedusaChevronDownIcon = createMedusaIcon(
  MedusaChevronDownRaw,
  "MedusaChevronDownIcon",
);
export const MedusaChevronRightIcon = createMedusaIcon(
  MedusaChevronRightRaw,
  "MedusaChevronRightIcon",
);
export const MedusaChartBarIcon = createMedusaIcon(
  MedusaChartBarRaw,
  "MedusaChartBarIcon",
);
export const MedusaCirclePlusIcon = createMedusaIcon(
  MedusaCirclePlusRaw,
  "MedusaCirclePlusIcon",
);
export const MedusaCircleSlidersIcon = createMedusaIcon(
  MedusaCircleSlidersRaw,
  "MedusaCircleSlidersIcon",
);
export const MedusaCircleStackIcon = createMedusaIcon(
  MedusaCircleStackRaw,
  "MedusaCircleStackIcon",
);
export const MedusaCogSixToothIcon = createMedusaIcon(
  MedusaCogSixToothRaw,
  "MedusaCogSixToothIcon",
);
export const MedusaDirectionsIcon = createMedusaIcon(
  MedusaDirectionsRaw,
  "MedusaDirectionsIcon",
);
export const MedusaGridListIcon = createMedusaIcon(
  MedusaGridListRaw,
  "MedusaGridListIcon",
);
export const MedusaHandTruckIcon = createMedusaIcon(
  MedusaHandTruckRaw,
  "MedusaHandTruckIcon",
);
export const MedusaHouseIcon = createMedusaIcon(
  MedusaHouseRaw,
  "MedusaHouseIcon",
);
export const MedusaIdBadgeIcon = createMedusaIcon(
  MedusaIdBadgeRaw,
  "MedusaIdBadgeIcon",
);
export const MedusaLifebuoyIcon = createMedusaIcon(
  MedusaLifebuoyRaw,
  "MedusaLifebuoyIcon",
);

export const ArrowUploadProgress = createMaterialIcon(
  "arrow_upload",
  "ArrowUploadProgress",
);
export const AlertCircle = createMaterialIcon("error", "AlertCircle");
export const AlertTriangle = createMaterialIcon("warning", "AlertTriangle");
export const ArrowRight = createMaterialIcon("arrow_forward", "ArrowRight");
export const ArrowRightLeft = createMaterialIcon("sync_alt", "ArrowRightLeft");
export const ArrowRightUp = createMaterialIcon("call_made", "ArrowRightLeft");
export const ArrowDownward = createMaterialIcon(
  "arrow_downward",
  "ArrowDownward",
);
export const ArrowUpward = createMaterialIcon("arrow_upward", "ArrowUpward");
export const BarChart3 = createMaterialIcon("bar_chart", "BarChart3");
export const Bell = createMaterialIcon("notifications", "Bell");
export const Building2 = createMaterialIcon("domain", "Building2");
export const Calendar = createMaterialIcon("calendar_month", "Calendar");
export const Camera = createMaterialIcon("videocam", "Camera");
export const Nvr = createMaterialIcon("router", "Nvr");
export const ChartLine = createMaterialIcon("monitoring", "ChartLine");
export const CheckCircle = createMaterialIcon("check_circle", "CheckCircle");
export const CheckCircle2 = createMaterialIcon("task_alt", "CheckCircle2");
export const CheckIcon = createMaterialIcon("check", "CheckIcon");
export const Checklist = createMaterialIcon("checklist", "Checklist");
export const ChevronDown = createMaterialIcon("expand_more", "ChevronDown");
export const ChevronDownIcon = createMaterialIcon(
  "expand_more",
  "ChevronDownIcon",
);
export const ChevronRight = createMaterialIcon("chevron_right", "ChevronRight");
export const ChevronUpIcon = createMaterialIcon("expand_less", "ChevronUpIcon");
export const Circle = createMaterialIcon("circle", "Circle");
export const ClipboardList = createMaterialIcon("assignment", "ClipboardList");
export const Clock = createMaterialIcon("schedule", "Clock");
export const CloudSync = createMaterialIcon("cloud_sync", "CloudSync");
export const CloudAlert = createMaterialIcon("cloud_off", "CloudAlert");
export const Coins = createMaterialIcon("monetization_on", "Coins");
export const DeployedCodeUpdate = createMaterialIcon(
  "deployed_code",
  "DeployedCodeUpdate",
);
export const Dashboard = createMaterialIcon("dashboard", "Dashboard");
export const Dataset = createMaterialIcon("dataset", "Dataset");
export const DirectionsCar = createMaterialIcon(
  "directions_car",
  "DirectionsCar",
);
export const Download = createMaterialIcon("download", "Download");
export const EventNote = createMaterialIcon("event_note", "EventNote");
export const Factory = createMaterialIcon("factory", "Factory");
export const FileCheck = createMaterialIcon("task", "FileCheck");
export const FileText = createMaterialIcon("description", "FileText");
export const Fullscreen = createMaterialIcon("fullscreen", "Fullscreen");
export const FullscreenExit = createMaterialIcon(
  "fullscreen_exit",
  "FullscreenExit",
);
export const Fuel = createMaterialIcon("local_gas_station", "Fuel");
export const Gem = createMaterialIcon("diamond", "Gem");
export const Grid3x3 = createMaterialIcon("grid_view", "Grid3x3");
export const HelpCircle = createMaterialIcon("help", "HelpCircle");
export const History = createMaterialIcon("history", "History");
export const Home = createMaterialIcon("home", "Home");
export const Loader2 = createMaterialIcon("progress_activity", "Loader2");
export const LocalShipping = createMaterialIcon(
  "local_shipping",
  "LocalShipping",
);
export const LogOut = createMaterialIcon("logout", "LogOut");
export const ManageAccounts = createMaterialIcon(
  "manage_accounts",
  "ManageAccounts",
);
export const Mic = createMaterialIcon("mic", "Mic");
export const Minimize2 = createMaterialIcon("close_fullscreen", "Minimize2");
export const Minus = createMaterialIcon("remove", "Minus");
export const NoteAdd = createMaterialIcon("note_add", "NoteAdd");
export const Package = createMaterialIcon("inventory_2", "Package");
export const PackageCheck = createMaterialIcon("inventory", "PackageCheck");
export const Palette = createMaterialIcon("palette", "Palette");
export const PanelLeft = createMaterialIcon("left_panel_open", "PanelLeft");
export const Payments = createMaterialIcon("payments", "Payments");
export const Pencil = createMaterialIcon("edit", "Pencil");
export const Plus = createMaterialIcon("add", "Plus");
export const Play = createMaterialIcon("play_arrow", "Play");
export const QrCode = createMaterialIcon("qr_code", "QrCode");
export const Radio = createMaterialIcon("radio", "Radio");
export const ReceiptLong = createMaterialIcon("receipt_long", "ReceiptLong");
export const Recycle = createMaterialIcon("recycling", "Recycle");
export const ReportProblem = createMaterialIcon(
  "report_problem",
  "ReportProblem",
);
export const RefreshCcw = createMaterialIcon("refresh", "Refresh");
export const SignalWifiOff = createMaterialIcon(
  "signal_wifi_off",
  "SignalWifiOff",
);

export const Save = createMaterialIcon("save", "Save");
export const Scale = createMaterialIcon("balance", "Scale");
export const Search = createMaterialIcon("search", "Search");
export const SearchX = createMaterialIcon("search_off", "SearchX");
export const Send = createMaterialIcon("send", "Send");
export const Server = createMaterialIcon("dns", "Server");
export const Settings2 = createMaterialIcon("settings", "Settings2");
export const Shield = createMaterialIcon("shield", "Shield");
export const ShieldAlert = createMaterialIcon("gpp_bad", "ShieldAlert");
export const ShieldCheck = createMaterialIcon("verified_user", "ShieldCheck");
export const Storefront = createMaterialIcon("storefront", "Storefront");
export const Sparkles = createMaterialIcon("auto_awesome", "Sparkles");
export const TableRows = createMaterialIcon("table_rows", "TableRows");
export const Trash2 = createMaterialIcon("delete", "Trash2");
export const TrendingDown = createMaterialIcon("trending_down", "TrendingDown");
export const TrendingUp = createMaterialIcon("trending_up", "TrendingUp");
export const User = createMaterialIcon("person", "User");
export const UserCheck = createMaterialIcon("how_to_reg", "UserCheck");
export const UserPlus = createMaterialIcon("person_add", "UserPlus");
export const UserRound = createMaterialIcon("account_circle", "UserRound");
export const UserX = createMaterialIcon("person_off", "UserX");
export const Users = createMaterialIcon("groups", "Users");
export const Video = createMaterialIcon("videocam", "Video");
export const Volume2 = createMaterialIcon("volume_up", "Volume2");
export const VolumeOff = createMaterialIcon("volume_off", "VolumeOff");
export const Wallet = createMaterialIcon("account_balance_wallet", "Wallet");
export const Wrench = createMaterialIcon("build", "Wrench");
export const X = createMaterialIcon("close", "X");
export const XCircle = createMaterialIcon("cancel", "XCircle");
export const Zap = createMaterialIcon("bolt", "Zap");
export const Square = createMaterialIcon("stop", "Square");
export const EditSquare = createMaterialIcon("edit_square", "EditSquare");
export const Maximize2 = createMaterialIcon("open_in_full", "Maximize2");

// Additional marketing icons
export const Badge = createMaterialIcon("badge", "Badge");
export const Policy = createMaterialIcon("policy", "Policy");
export const Warehouse = createMaterialIcon("warehouse", "Warehouse");
export const ShoppingBag = createMaterialIcon("shopping_bag", "ShoppingBag");
export const Manufacturing = createMaterialIcon("manufacturing", "Manufacturing");
export const Gavel = createMaterialIcon("gavel", "Gavel");
export const Checkroom = createMaterialIcon("checkroom", "Checkroom");
export const Work = createMaterialIcon("work", "Work");
export const AccountTree = createMaterialIcon("account_tree", "AccountTree");
export const Lock = createMaterialIcon("lock", "Lock");
export const Replay = createMaterialIcon("replay", "Replay");
export const Rule = createMaterialIcon("rule", "Rule");
export const Assessment = createMaterialIcon("assessment", "Assessment");
export const Calculate = createMaterialIcon("calculate", "Calculate");
export const Layers = createMaterialIcon("layers", "Layers");
export const DomainAdd = createMaterialIcon("domain_add", "DomainAdd");
