import * as React from "react";
import * as Phosphor from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";

type PhosphorIconProps = React.ComponentProps<typeof Phosphor.Question>;
type PhosphorIconComponent = React.ComponentType<PhosphorIconProps>;

export type MaterialIconProps = Omit<
  PhosphorIconProps,
  "children" | "ref" | "weight"
> & {
  weight?: PhosphorIconProps["weight"];
  strokeWidth?: number | string;
  absoluteStrokeWidth?: boolean;
};

export type LucideIcon = React.ComponentType<MaterialIconProps>;

const iconRegistry = Phosphor as unknown as Record<string, PhosphorIconComponent>;

function getIconComponent(iconName: string) {
  return iconRegistry[iconName] ?? Phosphor.Question;
}

/**
 * Marks that are strokes rather than shapes.
 *
 * A chevron is two strokes meeting at a point; an X is two strokes crossing;
 * a plus is two strokes meeting at right angles. Phosphor's `fill` weight has
 * nothing to fill in a glyph made only of lines, so it fills the *box* — a
 * solid triangle where the chevron should be, a solid rounded square with the
 * X or the + knocked out of it. That is what had been shipping in every
 * dropdown trigger, every close button and every "New …" button in the
 * product.
 *
 * Exact names rather than prefixes: `XCircle`, `PlusCircle` and `CheckCircle`
 * are genuinely shapes — a circle carrying a mark — and are meant to be
 * filled. Only the bare marks belong here. Everything else in the set keeps
 * the fill weight, which is how the product is drawn.
 */
const STROKE_WEIGHT_PREFIX = /^Caret/;
const STROKE_WEIGHT_EXACT = new Set(["X", "Plus", "Minus", "Check", "Checks", "Equals"]);

function createPhosphorIcon(iconName: string, displayName: string): LucideIcon {
  const IconComponent = getIconComponent(iconName);
  const defaultWeight: PhosphorIconProps["weight"] =
    STROKE_WEIGHT_PREFIX.test(iconName) || STROKE_WEIGHT_EXACT.has(iconName)
      ? "bold"
      : "fill";

  const Icon = ({
    className,
    size,
    style,
    weight,
    strokeWidth,
    absoluteStrokeWidth,
    ...props
  }: MaterialIconProps) => {
    void strokeWidth;
    void absoluteStrokeWidth;

    return (
      <IconComponent
        {...props}
        aria-hidden={props["aria-label"] ? undefined : true}
        className={cn(
          "inline-flex h-[1em] w-[1em] shrink-0 select-none items-center justify-center align-middle leading-none text-current",
          className,
        )}
        focusable="false"
        size={size}
        style={{
          color: "currentColor",
          ...style,
        }}
        weight={weight ?? defaultWeight}
      />
    );
  };

  Icon.displayName = displayName;
  return Icon;
}

export const Share = createPhosphorIcon("ShareNetwork", "Share");
export const Smiley = createPhosphorIcon("Smiley", "Smiley");

export const MedusaAcademicCapIcon = createPhosphorIcon(
  "GraduationCap",
  "MedusaAcademicCapIcon",
);
export const MedusaArrowRightOnRectangleIcon = createPhosphorIcon(
  "SignOut",
  "MedusaArrowRightOnRectangleIcon",
);
export const MedusaBookOpenIcon = createPhosphorIcon(
  "BookOpen",
  "MedusaBookOpenIcon",
);
export const MedusaBuildingsIcon = createPhosphorIcon(
  "Buildings",
  "MedusaBuildingsIcon",
);
export const MedusaBuildingStorefrontIcon = createPhosphorIcon(
  "Storefront",
  "MedusaBuildingStorefrontIcon",
);
export const MedusaCashIcon = createPhosphorIcon("Money", "MedusaCashIcon");
export const MedusaChevronDownIcon = createPhosphorIcon(
  "CaretDown",
  "MedusaChevronDownIcon",
);
export const MedusaChevronRightIcon = createPhosphorIcon(
  "CaretRight",
  "MedusaChevronRightIcon",
);
export const MedusaChartBarIcon = createPhosphorIcon(
  "ChartBar",
  "MedusaChartBarIcon",
);
export const MedusaCirclePlusIcon = createPhosphorIcon(
  "PlusCircle",
  "MedusaCirclePlusIcon",
);
export const MedusaCircleSlidersIcon = createPhosphorIcon(
  "Sliders",
  "MedusaCircleSlidersIcon",
);
export const MedusaCircleStackIcon = createPhosphorIcon(
  "Stack",
  "MedusaCircleStackIcon",
);
export const MedusaCogSixToothIcon = createPhosphorIcon(
  "GearSix",
  "MedusaCogSixToothIcon",
);
export const MedusaDirectionsIcon = createPhosphorIcon(
  "MapTrifold",
  "MedusaDirectionsIcon",
);
export const MedusaGridListIcon = createPhosphorIcon(
  "SquaresFour",
  "MedusaGridListIcon",
);
export const MedusaHandTruckIcon = createPhosphorIcon(
  "Truck",
  "MedusaHandTruckIcon",
);
export const MedusaHouseIcon = createPhosphorIcon("House", "MedusaHouseIcon");
export const MedusaIdBadgeIcon = createPhosphorIcon(
  "IdentificationBadge",
  "MedusaIdBadgeIcon",
);
export const MedusaLifebuoyIcon = createPhosphorIcon(
  "Lifebuoy",
  "MedusaLifebuoyIcon",
);

export const ArrowUploadProgress = createPhosphorIcon(
  "UploadSimple",
  "ArrowUploadProgress",
);
export const AlertCircle = createPhosphorIcon("WarningCircle", "AlertCircle");
export const AlertTriangle = createPhosphorIcon("Warning", "AlertTriangle");
export const ArrowLeft = createPhosphorIcon("ArrowLeft", "ArrowLeft");
export const ArrowRight = createPhosphorIcon("ArrowRight", "ArrowRight");
export const ArrowRightLeft = createPhosphorIcon(
  "ArrowsLeftRight",
  "ArrowRightLeft",
);
export const ArrowRightUp = createPhosphorIcon("ArrowUpRight", "ArrowRightUp");
export const ArrowDownward = createPhosphorIcon("ArrowDown", "ArrowDownward");
export const ArrowUpward = createPhosphorIcon("ArrowUp", "ArrowUpward");
export const BarChart3 = createPhosphorIcon("ChartBar", "BarChart3");
export const Funnel = createPhosphorIcon("Funnel", "Funnel");
export const SlidersHorizontal = createPhosphorIcon("Sliders", "SlidersHorizontal");
export const AddressBook = createPhosphorIcon("AddressBook", "AddressBook");
export const Megaphone = createPhosphorIcon("Megaphone", "Megaphone");
export const CalendarCheck = createPhosphorIcon("CalendarCheck", "CalendarCheck");
export const Bell = createPhosphorIcon("Bell", "Bell");
export const BellRing = createPhosphorIcon("BellRinging", "BellRing");
export const Building2 = createPhosphorIcon("BuildingOffice", "Building2");
export const Calendar = createPhosphorIcon("CalendarBlank", "Calendar");
export const CalendarIcon = createPhosphorIcon(
  "CalendarBlank",
  "CalendarIcon",
);
export const Camera = createPhosphorIcon("VideoCamera", "Camera");
export const Nvr = createPhosphorIcon("HardDrives", "Nvr");
export const ChartLine = createPhosphorIcon("ChartLineUp", "ChartLine");
export const Check = createPhosphorIcon("Check", "Check");
export const CheckCircle = createPhosphorIcon("CheckCircle", "CheckCircle");
export const CheckCircle2 = createPhosphorIcon("CheckCircle", "CheckCircle2");
export const CheckCircleSolid = createPhosphorIcon(
  "CheckCircle",
  "CheckCircleSolid",
);
export const CheckIcon = createPhosphorIcon("Check", "CheckIcon");
export const Checklist = createPhosphorIcon("Checks", "Checklist");
export const ChevronDown = createPhosphorIcon("CaretDown", "ChevronDown");
export const ChevronDownIcon = createPhosphorIcon(
  "CaretDown",
  "ChevronDownIcon",
);
export const ChevronLeftIcon = createPhosphorIcon(
  "CaretLeft",
  "ChevronLeftIcon",
);
export const ChevronRight = createPhosphorIcon("CaretRight", "ChevronRight");
export const ChevronRightIcon = createPhosphorIcon(
  "CaretRight",
  "ChevronRightIcon",
);
export const ChevronUpIcon = createPhosphorIcon("CaretUp", "ChevronUpIcon");
export const Circle = createPhosphorIcon("Circle", "Circle");
export const CircleDottedLine = createPhosphorIcon(
  "CircleDashed",
  "CircleDottedLine",
);
export const CircleHalfDottedClock = createPhosphorIcon(
  "HourglassMedium",
  "CircleHalfDottedClock",
);
export const CircleIcon = createPhosphorIcon("Circle", "CircleIcon");
export const CircleThreeQuartersSolid = createPhosphorIcon(
  "SpinnerGap",
  "CircleThreeQuartersSolid",
);
export const CircleUserRound = createPhosphorIcon(
  "UserCircle",
  "CircleUserRound",
);
export const ClipboardList = createPhosphorIcon(
  "ClipboardText",
  "ClipboardList",
);
export const Clock = createPhosphorIcon("Clock", "Clock");
export const Clock3 = createPhosphorIcon("Clock", "Clock3");
export const CloudAlert = createPhosphorIcon("CloudSlash", "CloudAlert");
export const CloudArrowDown = createPhosphorIcon(
  "CloudArrowDown",
  "CloudArrowDown",
);
export const CloudCheck = createPhosphorIcon("CloudCheck", "CloudCheck");
export const CloudOff = createPhosphorIcon("CloudSlash", "CloudOff");
export const CloudSync = createPhosphorIcon("CloudArrowUp", "CloudSync");
export const Coins = createPhosphorIcon("Coins", "Coins");
export const CommandIcon = createPhosphorIcon("Command", "CommandIcon");
export const CornerDownLeft = createPhosphorIcon(
  "ArrowElbowDownLeft",
  "CornerDownLeft",
);
export const Delete = createPhosphorIcon("Backspace", "Delete");
export const DeployedCodeUpdate = createPhosphorIcon(
  "CloudArrowDown",
  "DeployedCodeUpdate",
);
export const Dashboard = createPhosphorIcon("Gauge", "Dashboard");
export const Dataset = createPhosphorIcon("Database", "Dataset");
export const DirectionsCar = createPhosphorIcon("Car", "DirectionsCar");
export const DotsThree = createPhosphorIcon("DotsThree", "DotsThree");
export const Download = createPhosphorIcon("DownloadSimple", "Download");
export const EditSquare = createPhosphorIcon("NotePencil", "EditSquare");
export const EventNote = createPhosphorIcon("Note", "EventNote");
export const Eye = createPhosphorIcon("Eye", "Eye");
export const EyeOff = createPhosphorIcon("EyeSlash", "EyeOff");
export const Mail = createPhosphorIcon("Envelope", "Mail");
export const Hexagon = createPhosphorIcon("Hexagon", "Hexagon");
export const ExternalLink = createPhosphorIcon(
  "ArrowSquareOut",
  "ExternalLink",
);
export const ExclamationCircleSolid = createPhosphorIcon(
  "WarningCircle",
  "ExclamationCircleSolid",
);
export const Factory = createPhosphorIcon("Factory", "Factory");
export const FileCheck = createPhosphorIcon(
  "CheckSquareOffset",
  "FileCheck",
);
export const FileText = createPhosphorIcon("FileText", "FileText");
export const Fullscreen = createPhosphorIcon("CornersOut", "Fullscreen");
export const FullscreenExit = createPhosphorIcon(
  "CornersIn",
  "FullscreenExit",
);
export const Fuel = createPhosphorIcon("GasPump", "Fuel");
export const Gem = createPhosphorIcon("Diamond", "Gem");
export const GitCompare = createPhosphorIcon("GitDiff", "GitCompare");
export const Globe = createPhosphorIcon("Globe", "Globe");
export const Grid3x3 = createPhosphorIcon("GridFour", "Grid3x3");
export const HelpCircle = createPhosphorIcon("Question", "HelpCircle");
export const History = createPhosphorIcon(
  "ClockCounterClockwise",
  "History",
);
export const Home = createPhosphorIcon("House", "Home");
export const Info = createPhosphorIcon("Info", "Info");
export const Layers = createPhosphorIcon("StackSimple", "Layers");
export const LifeBuoy = createPhosphorIcon("Lifebuoy", "LifeBuoy");
export const Loader2 = createPhosphorIcon("SpinnerGap", "Loader2");
export const LocalShipping = createPhosphorIcon("Truck", "LocalShipping");
export const LogOut = createPhosphorIcon("SignOut", "LogOut");
export const MailCheck = createPhosphorIcon(
  "EnvelopeSimpleOpen",
  "MailCheck",
);
export const ManageAccounts = createPhosphorIcon("UserGear", "ManageAccounts");
export const Maximize2 = createPhosphorIcon("ArrowsOut", "Maximize2");
export const MapPin = createPhosphorIcon("MapPin", "MapPin");
export const Menu = createPhosphorIcon("List", "Menu");
export const Mic = createPhosphorIcon("Microphone", "Mic");
export const Minimize2 = createPhosphorIcon("CornersIn", "Minimize2");
export const Minus = createPhosphorIcon("Minus", "Minus");
export const MinusIcon = createPhosphorIcon("Minus", "MinusIcon");
export const MoreHorizontal = createPhosphorIcon(
  "DotsThreeOutline",
  "MoreHorizontal",
);
export const NoteAdd = createPhosphorIcon("NotePencil", "NoteAdd");
export const Package = createPhosphorIcon("Package", "Package");
export const PackageCheck = createPhosphorIcon("Package", "PackageCheck");
export const Palette = createPhosphorIcon("Palette", "Palette");
export const PanelLeft = createPhosphorIcon("SidebarSimple", "PanelLeft");
export const Payments = createPhosphorIcon("CurrencyDollar", "Payments");
export const Pencil = createPhosphorIcon("PencilSimple", "Pencil");
export const Phone = createPhosphorIcon("Phone", "Phone");
export const Play = createPhosphorIcon("Play", "Play");
export const Plus = createPhosphorIcon("Plus", "Plus");
export const CopyLink = createPhosphorIcon("Copy", "CopyLink");
export const PlusCircle = createPhosphorIcon("PlusCircle", "PlusCircle");
export const Printer = createPhosphorIcon("Printer", "Printer");
export const QrCode = createPhosphorIcon("QrCode", "QrCode");
export const Radio = createPhosphorIcon("Radio", "Radio");
export const Receipt = createPhosphorIcon("Receipt", "Receipt");
export const ReceiptLong = createPhosphorIcon("Receipt", "ReceiptLong");
export const Recycle = createPhosphorIcon("Recycle", "Recycle");
export const RefreshCcw = createPhosphorIcon(
  "ArrowsClockwise",
  "RefreshCcw",
);
export const RefreshCw = createPhosphorIcon(
  "ArrowsClockwise",
  "RefreshCw",
);
export const RotateCcw = createPhosphorIcon("ArrowsClockwise", "RotateCcw");
export const Replay = createPhosphorIcon("ArrowsClockwise", "Replay");
export const ReportProblem = createPhosphorIcon(
  "WarningOctagon",
  "ReportProblem",
);
export const Rule = createPhosphorIcon("Scales", "Rule");
export const Save = createPhosphorIcon("FloppyDisk", "Save");
export const Scale = createPhosphorIcon("Scales", "Scale");
export const Search = createPhosphorIcon("MagnifyingGlass", "Search");
export const SearchX = createPhosphorIcon(
  "MagnifyingGlassMinus",
  "SearchX",
);
export const Send = createPhosphorIcon("PaperPlaneTilt", "Send");
export const Server = createPhosphorIcon("HardDrives", "Server");
export const Settings2 = createPhosphorIcon("GearSix", "Settings2");
export const Shield = createPhosphorIcon("Shield", "Shield");
export const ShieldAlert = createPhosphorIcon(
  "ShieldWarning",
  "ShieldAlert",
);
export const ShieldCheck = createPhosphorIcon("ShieldCheck", "ShieldCheck");
export const SignalWifiOff = createPhosphorIcon("WifiSlash", "SignalWifiOff");
export const SidebarLeft = createPhosphorIcon("SidebarSimple", "SidebarLeft");
export const Sparkles = createPhosphorIcon("Sparkle", "Sparkles");
export const Spinner = createPhosphorIcon("SpinnerGap", "Spinner");
export const Square = createPhosphorIcon("Stop", "Square");
export const Storefront = createPhosphorIcon("Storefront", "Storefront");
export const Kanban = createPhosphorIcon("Kanban", "Kanban");
export const ListBullets = createPhosphorIcon("ListBullets", "ListBullets");
export const SortAscending = createPhosphorIcon("ArrowsDownUp", "SortAscending");
export const TableRows = createPhosphorIcon("Rows", "TableRows");
export const ToggleLeft = createPhosphorIcon("ToggleLeft", "ToggleLeft");
export const ToggleRight = createPhosphorIcon("ToggleRight", "ToggleRight");
export const Trash2 = createPhosphorIcon("Trash", "Trash2");
export const TrendingDown = createPhosphorIcon("TrendDown", "TrendingDown");
export const TrendingUp = createPhosphorIcon("TrendUp", "TrendingUp");
export const TriangleAlert = createPhosphorIcon(
  "Warning",
  "TriangleAlert",
);
export const User = createPhosphorIcon("User", "User");
export const UserCheck = createPhosphorIcon("UserCheck", "UserCheck");
export const UserPlus = createPhosphorIcon("UserPlus", "UserPlus");
export const UserRound = createPhosphorIcon("UserCircle", "UserRound");
export const UserX = createPhosphorIcon("UserMinus", "UserX");
export const Users = createPhosphorIcon("UsersThree", "Users");
export const Video = createPhosphorIcon("VideoCamera", "Video");
export const Volume2 = createPhosphorIcon("SpeakerHigh", "Volume2");
export const VolumeOff = createPhosphorIcon("SpeakerSlash", "VolumeOff");
export const Wallet = createPhosphorIcon("Wallet", "Wallet");
export const Wifi = createPhosphorIcon("WifiHigh", "Wifi");
export const WifiOff = createPhosphorIcon("WifiSlash", "WifiOff");
export const Wrench = createPhosphorIcon("Wrench", "Wrench");
export const X = createPhosphorIcon("X", "X");
export const XCircle = createPhosphorIcon("XCircle", "XCircle");
export const XIcon = createPhosphorIcon("X", "XIcon");
export const Zap = createPhosphorIcon("Lightning", "Zap");

export const Badge = createPhosphorIcon("IdentificationBadge", "Badge");
export const Policy = createPhosphorIcon("ShieldCheck", "Policy");
export const Warehouse = createPhosphorIcon("Warehouse", "Warehouse");
export const ShoppingBag = createPhosphorIcon("BagSimple", "ShoppingBag");
export const Manufacturing = createPhosphorIcon(
  "Factory",
  "Manufacturing",
);
export const Gavel = createPhosphorIcon("Gavel", "Gavel");
export const Checkroom = createPhosphorIcon("ShirtFolded", "Checkroom");
export const Work = createPhosphorIcon("Briefcase", "Work");
export const AccountTree = createPhosphorIcon("TreeStructure", "AccountTree");
export const Lock = createPhosphorIcon("Lock", "Lock");
export const Assessment = createPhosphorIcon(
  "ChartBarHorizontal",
  "Assessment",
);
export const Calculate = createPhosphorIcon("Calculator", "Calculate");
export const DomainAdd = createPhosphorIcon("Buildings", "DomainAdd");
export const ChatCircle = createPhosphorIcon("ChatCircle", "ChatCircle");
export const PushPin = createPhosphorIcon("PushPin", "PushPin");
export const Repeat = createPhosphorIcon("Repeat", "Repeat");
export const Upload = createPhosphorIcon("UploadSimple", "Upload");
