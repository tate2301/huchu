import * as React from "react";
import {
  AddressBook as PhosphorAddressBook,
  Archive as PhosphorArchive,
  ArrowBendUpLeft as PhosphorArrowBendUpLeft,
  ArrowDown as PhosphorArrowDown,
  ArrowElbowDownLeft as PhosphorArrowElbowDownLeft,
  ArrowLeft as PhosphorArrowLeft,
  ArrowLineDown as PhosphorArrowLineDown,
  ArrowLineUp as PhosphorArrowLineUp,
  ArrowRight as PhosphorArrowRight,
  ArrowSquareOut as PhosphorArrowSquareOut,
  ArrowUDownLeft as PhosphorArrowUDownLeft,
  ArrowUp as PhosphorArrowUp,
  ArrowUpRight as PhosphorArrowUpRight,
  ArrowsClockwise as PhosphorArrowsClockwise,
  ArrowsCounterClockwise as PhosphorArrowsCounterClockwise,
  ArrowsDownUp as PhosphorArrowsDownUp,
  ArrowsLeftRight as PhosphorArrowsLeftRight,
  ArrowsOut as PhosphorArrowsOut,
  At as PhosphorAt,
  Backspace as PhosphorBackspace,
  BagSimple as PhosphorBagSimple,
  Barcode as PhosphorBarcode,
  Bed as PhosphorBed,
  BeerBottle as PhosphorBeerBottle,
  BeerStein as PhosphorBeerStein,
  Bell as PhosphorBell,
  BellRinging as PhosphorBellRinging,
  BookOpen as PhosphorBookOpen,
  Bread as PhosphorBread,
  Briefcase as PhosphorBriefcase,
  BuildingOffice as PhosphorBuildingOffice,
  Buildings as PhosphorBuildings,
  Calculator as PhosphorCalculator,
  CalendarBlank as PhosphorCalendarBlank,
  CalendarCheck as PhosphorCalendarCheck,
  CalendarPlus as PhosphorCalendarPlus,
  Camera as PhosphorCamera,
  Car as PhosphorCar,
  CaretDown as PhosphorCaretDown,
  CaretLeft as PhosphorCaretLeft,
  CaretRight as PhosphorCaretRight,
  CaretUp as PhosphorCaretUp,
  Carrot as PhosphorCarrot,
  CashRegister as PhosphorCashRegister,
  Certificate as PhosphorCertificate,
  ChartBar as PhosphorChartBar,
  ChartBarHorizontal as PhosphorChartBarHorizontal,
  ChartLineUp as PhosphorChartLineUp,
  ChatCircle as PhosphorChatCircle,
  Check as PhosphorCheck,
  CheckCircle as PhosphorCheckCircle,
  CheckSquareOffset as PhosphorCheckSquareOffset,
  Checks as PhosphorChecks,
  Circle as PhosphorCircle,
  CircleDashed as PhosphorCircleDashed,
  ClipboardText as PhosphorClipboardText,
  Clock as PhosphorClock,
  ClockCounterClockwise as PhosphorClockCounterClockwise,
  CloudArrowDown as PhosphorCloudArrowDown,
  CloudArrowUp as PhosphorCloudArrowUp,
  CloudCheck as PhosphorCloudCheck,
  CloudSlash as PhosphorCloudSlash,
  Coins as PhosphorCoins,
  Columns as PhosphorColumns,
  Command as PhosphorCommand,
  Copy as PhosphorCopy,
  CopySimple as PhosphorCopySimple,
  CornersIn as PhosphorCornersIn,
  CornersOut as PhosphorCornersOut,
  CreditCard as PhosphorCreditCard,
  Crosshair as PhosphorCrosshair,
  Cube as PhosphorCube,
  CurrencyDollar as PhosphorCurrencyDollar,
  Database as PhosphorDatabase,
  DeviceMobile as PhosphorDeviceMobile,
  Diamond as PhosphorDiamond,
  DotsSixVertical as PhosphorDotsSixVertical,
  DotsThree as PhosphorDotsThree,
  DotsThreeOutline as PhosphorDotsThreeOutline,
  DownloadSimple as PhosphorDownloadSimple,
  Drop as PhosphorDrop,
  Egg as PhosphorEgg,
  Envelope as PhosphorEnvelope,
  EnvelopeSimpleOpen as PhosphorEnvelopeSimpleOpen,
  Eye as PhosphorEye,
  EyeSlash as PhosphorEyeSlash,
  Factory as PhosphorFactory,
  FileText as PhosphorFileText,
  Flag as PhosphorFlag,
  Flame as PhosphorFlame,
  FloppyDisk as PhosphorFloppyDisk,
  FlowArrow as PhosphorFlowArrow,
  Folder as PhosphorFolder,
  Funnel as PhosphorFunnel,
  GasPump as PhosphorGasPump,
  Gauge as PhosphorGauge,
  Gavel as PhosphorGavel,
  Gift as PhosphorGift,
  GearSix as PhosphorGearSix,
  GitDiff as PhosphorGitDiff,
  Globe as PhosphorGlobe,
  GraduationCap as PhosphorGraduationCap,
  Grains as PhosphorGrains,
  GridFour as PhosphorGridFour,
  HandCoins as PhosphorHandCoins,
  HardDrives as PhosphorHardDrives,
  Hash as PhosphorHash,
  Hexagon as PhosphorHexagon,
  HourglassMedium as PhosphorHourglassMedium,
  House as PhosphorHouse,
  IdentificationBadge as PhosphorIdentificationBadge,
  IdentificationCard as PhosphorIdentificationCard,
  Info as PhosphorInfo,
  Kanban as PhosphorKanban,
  Key as PhosphorKey,
  Keyboard as PhosphorKeyboard,
  Lifebuoy as PhosphorLifebuoy,
  Lightning as PhosphorLightning,
  Link as PhosphorLink,
  LinkBreak as PhosphorLinkBreak,
  List as PhosphorList,
  ListBullets as PhosphorListBullets,
  ListChecks as PhosphorListChecks,
  Lock as PhosphorLock,
  MagnifyingGlass as PhosphorMagnifyingGlass,
  MagnifyingGlassMinus as PhosphorMagnifyingGlassMinus,
  MapPin as PhosphorMapPin,
  MapTrifold as PhosphorMapTrifold,
  Martini as PhosphorMartini,
  Medal as PhosphorMedal,
  Megaphone as PhosphorMegaphone,
  Microphone as PhosphorMicrophone,
  Minus as PhosphorMinus,
  Money as PhosphorMoney,
  Monitor as PhosphorMonitor,
  Moon as PhosphorMoon,
  Note as PhosphorNote,
  NoteBlank as PhosphorNoteBlank,
  NotePencil as PhosphorNotePencil,
  Package as PhosphorPackage,
  Palette as PhosphorPalette,
  PaperPlaneTilt as PhosphorPaperPlaneTilt,
  Paperclip as PhosphorPaperclip,
  PauseCircle as PhosphorPauseCircle,
  PencilSimple as PhosphorPencilSimple,
  Percent as PhosphorPercent,
  Phone as PhosphorPhone,
  PintGlass as PhosphorPintGlass,
  Play as PhosphorPlay,
  PlayCircle as PhosphorPlayCircle,
  PlugsConnected as PhosphorPlugsConnected,
  Plus as PhosphorPlus,
  PlusCircle as PhosphorPlusCircle,
  Printer as PhosphorPrinter,
  Prohibit as PhosphorProhibit,
  PushPin as PhosphorPushPin,
  QrCode as PhosphorQrCode,
  Question as PhosphorQuestion,
  Radio as PhosphorRadio,
  Receipt as PhosphorReceipt,
  ReceiptX as PhosphorReceiptX,
  Recycle as PhosphorRecycle,
  Repeat as PhosphorRepeat,
  Rows as PhosphorRows,
  Scales as PhosphorScales,
  SealCheck as PhosphorSealCheck,
  ShareNetwork as PhosphorShareNetwork,
  Shield as PhosphorShield,
  ShieldCheck as PhosphorShieldCheck,
  ShieldWarning as PhosphorShieldWarning,
  ShirtFolded as PhosphorShirtFolded,
  ShoppingCart as PhosphorShoppingCart,
  SidebarSimple as PhosphorSidebarSimple,
  SignOut as PhosphorSignOut,
  SimCard as PhosphorSimCard,
  Sliders as PhosphorSliders,
  Smiley as PhosphorSmiley,
  Sparkle as PhosphorSparkle,
  SpeakerHigh as PhosphorSpeakerHigh,
  SpeakerSlash as PhosphorSpeakerSlash,
  SpinnerGap as PhosphorSpinnerGap,
  SquaresFour as PhosphorSquaresFour,
  Stack as PhosphorStack,
  StackSimple as PhosphorStackSimple,
  Stamp as PhosphorStamp,
  Star as PhosphorStar,
  Stop as PhosphorStop,
  Storefront as PhosphorStorefront,
  Sun as PhosphorSun,
  Tag as PhosphorTag,
  TextAlignLeft as PhosphorTextAlignLeft,
  TextT as PhosphorTextT,
  Ticket as PhosphorTicket,
  Timer as PhosphorTimer,
  ToggleLeft as PhosphorToggleLeft,
  ToggleRight as PhosphorToggleRight,
  Trash as PhosphorTrash,
  Tray as PhosphorTray,
  TrayArrowDown as PhosphorTrayArrowDown,
  TreeStructure as PhosphorTreeStructure,
  TrendDown as PhosphorTrendDown,
  TrendUp as PhosphorTrendUp,
  Truck as PhosphorTruck,
  UploadSimple as PhosphorUploadSimple,
  User as PhosphorUser,
  UserCheck as PhosphorUserCheck,
  UserCircle as PhosphorUserCircle,
  UserGear as PhosphorUserGear,
  UserMinus as PhosphorUserMinus,
  UserPlus as PhosphorUserPlus,
  UserSwitch as PhosphorUserSwitch,
  Users as PhosphorUsers,
  UsersThree as PhosphorUsersThree,
  Vault as PhosphorVault,
  VideoCamera as PhosphorVideoCamera,
  Wallet as PhosphorWallet,
  Warehouse as PhosphorWarehouse,
  Warning as PhosphorWarning,
  WarningCircle as PhosphorWarningCircle,
  WarningOctagon as PhosphorWarningOctagon,
  WifiHigh as PhosphorWifiHigh,
  WifiSlash as PhosphorWifiSlash,
  Wine as PhosphorWine,
  Wrench as PhosphorWrench,
  X as PhosphorX,
  XCircle as PhosphorXCircle,
} from "@phosphor-icons/react/ssr";

import { cn } from "@/lib/utils";

type PhosphorIconProps = React.ComponentProps<typeof PhosphorQuestion>;
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

/**
 * Only the icons the product draws, imported by name. The old namespace import
 * with a string lookup pulled every one of Phosphor's 1,500 icons into each
 * client bundle, because nothing could tell at build time which were used.
 */
const iconRegistry = {
  AddressBook: PhosphorAddressBook,
  Archive: PhosphorArchive,
  ArrowBendUpLeft: PhosphorArrowBendUpLeft,
  ArrowDown: PhosphorArrowDown,
  ArrowElbowDownLeft: PhosphorArrowElbowDownLeft,
  ArrowLeft: PhosphorArrowLeft,
  ArrowLineDown: PhosphorArrowLineDown,
  ArrowLineUp: PhosphorArrowLineUp,
  ArrowRight: PhosphorArrowRight,
  ArrowSquareOut: PhosphorArrowSquareOut,
  ArrowUDownLeft: PhosphorArrowUDownLeft,
  ArrowUp: PhosphorArrowUp,
  ArrowUpRight: PhosphorArrowUpRight,
  ArrowsClockwise: PhosphorArrowsClockwise,
  ArrowsCounterClockwise: PhosphorArrowsCounterClockwise,
  ArrowsDownUp: PhosphorArrowsDownUp,
  ArrowsLeftRight: PhosphorArrowsLeftRight,
  ArrowsOut: PhosphorArrowsOut,
  At: PhosphorAt,
  Backspace: PhosphorBackspace,
  BagSimple: PhosphorBagSimple,
  Barcode: PhosphorBarcode,
  Bed: PhosphorBed,
  BeerBottle: PhosphorBeerBottle,
  BeerStein: PhosphorBeerStein,
  Bell: PhosphorBell,
  BellRinging: PhosphorBellRinging,
  BookOpen: PhosphorBookOpen,
  Bread: PhosphorBread,
  Briefcase: PhosphorBriefcase,
  BuildingOffice: PhosphorBuildingOffice,
  Buildings: PhosphorBuildings,
  Calculator: PhosphorCalculator,
  CalendarBlank: PhosphorCalendarBlank,
  CalendarCheck: PhosphorCalendarCheck,
  CalendarPlus: PhosphorCalendarPlus,
  Camera: PhosphorCamera,
  Car: PhosphorCar,
  CaretDown: PhosphorCaretDown,
  CaretLeft: PhosphorCaretLeft,
  CaretRight: PhosphorCaretRight,
  CaretUp: PhosphorCaretUp,
  Carrot: PhosphorCarrot,
  CashRegister: PhosphorCashRegister,
  Certificate: PhosphorCertificate,
  ChartBar: PhosphorChartBar,
  ChartBarHorizontal: PhosphorChartBarHorizontal,
  ChartLineUp: PhosphorChartLineUp,
  ChatCircle: PhosphorChatCircle,
  Check: PhosphorCheck,
  CheckCircle: PhosphorCheckCircle,
  CheckSquareOffset: PhosphorCheckSquareOffset,
  Checks: PhosphorChecks,
  Circle: PhosphorCircle,
  CircleDashed: PhosphorCircleDashed,
  ClipboardText: PhosphorClipboardText,
  Clock: PhosphorClock,
  ClockCounterClockwise: PhosphorClockCounterClockwise,
  CloudArrowDown: PhosphorCloudArrowDown,
  CloudArrowUp: PhosphorCloudArrowUp,
  CloudCheck: PhosphorCloudCheck,
  CloudSlash: PhosphorCloudSlash,
  Coins: PhosphorCoins,
  Columns: PhosphorColumns,
  Command: PhosphorCommand,
  Copy: PhosphorCopy,
  CopySimple: PhosphorCopySimple,
  CornersIn: PhosphorCornersIn,
  CornersOut: PhosphorCornersOut,
  CreditCard: PhosphorCreditCard,
  Crosshair: PhosphorCrosshair,
  Cube: PhosphorCube,
  CurrencyDollar: PhosphorCurrencyDollar,
  Database: PhosphorDatabase,
  DeviceMobile: PhosphorDeviceMobile,
  Diamond: PhosphorDiamond,
  DotsSixVertical: PhosphorDotsSixVertical,
  DotsThree: PhosphorDotsThree,
  DotsThreeOutline: PhosphorDotsThreeOutline,
  DownloadSimple: PhosphorDownloadSimple,
  Drop: PhosphorDrop,
  Egg: PhosphorEgg,
  Envelope: PhosphorEnvelope,
  EnvelopeSimpleOpen: PhosphorEnvelopeSimpleOpen,
  Eye: PhosphorEye,
  EyeSlash: PhosphorEyeSlash,
  Factory: PhosphorFactory,
  FileText: PhosphorFileText,
  Flag: PhosphorFlag,
  Flame: PhosphorFlame,
  FloppyDisk: PhosphorFloppyDisk,
  FlowArrow: PhosphorFlowArrow,
  Folder: PhosphorFolder,
  Funnel: PhosphorFunnel,
  GasPump: PhosphorGasPump,
  Gauge: PhosphorGauge,
  Gavel: PhosphorGavel,
  GearSix: PhosphorGearSix,
  Gift: PhosphorGift,
  GitDiff: PhosphorGitDiff,
  Globe: PhosphorGlobe,
  GraduationCap: PhosphorGraduationCap,
  Grains: PhosphorGrains,
  GridFour: PhosphorGridFour,
  HandCoins: PhosphorHandCoins,
  HardDrives: PhosphorHardDrives,
  Hash: PhosphorHash,
  Hexagon: PhosphorHexagon,
  HourglassMedium: PhosphorHourglassMedium,
  House: PhosphorHouse,
  IdentificationBadge: PhosphorIdentificationBadge,
  IdentificationCard: PhosphorIdentificationCard,
  Info: PhosphorInfo,
  Kanban: PhosphorKanban,
  Key: PhosphorKey,
  Keyboard: PhosphorKeyboard,
  Lifebuoy: PhosphorLifebuoy,
  Lightning: PhosphorLightning,
  Link: PhosphorLink,
  LinkBreak: PhosphorLinkBreak,
  List: PhosphorList,
  ListBullets: PhosphorListBullets,
  ListChecks: PhosphorListChecks,
  Lock: PhosphorLock,
  MagnifyingGlass: PhosphorMagnifyingGlass,
  MagnifyingGlassMinus: PhosphorMagnifyingGlassMinus,
  MapPin: PhosphorMapPin,
  MapTrifold: PhosphorMapTrifold,
  Martini: PhosphorMartini,
  Medal: PhosphorMedal,
  Megaphone: PhosphorMegaphone,
  Microphone: PhosphorMicrophone,
  Minus: PhosphorMinus,
  Money: PhosphorMoney,
  Monitor: PhosphorMonitor,
  Moon: PhosphorMoon,
  Note: PhosphorNote,
  NoteBlank: PhosphorNoteBlank,
  NotePencil: PhosphorNotePencil,
  Package: PhosphorPackage,
  Palette: PhosphorPalette,
  PaperPlaneTilt: PhosphorPaperPlaneTilt,
  Paperclip: PhosphorPaperclip,
  PauseCircle: PhosphorPauseCircle,
  PencilSimple: PhosphorPencilSimple,
  Percent: PhosphorPercent,
  Phone: PhosphorPhone,
  PintGlass: PhosphorPintGlass,
  Play: PhosphorPlay,
  PlayCircle: PhosphorPlayCircle,
  PlugsConnected: PhosphorPlugsConnected,
  Plus: PhosphorPlus,
  PlusCircle: PhosphorPlusCircle,
  Printer: PhosphorPrinter,
  Prohibit: PhosphorProhibit,
  PushPin: PhosphorPushPin,
  QrCode: PhosphorQrCode,
  Question: PhosphorQuestion,
  Radio: PhosphorRadio,
  Receipt: PhosphorReceipt,
  ReceiptX: PhosphorReceiptX,
  Recycle: PhosphorRecycle,
  Repeat: PhosphorRepeat,
  Rows: PhosphorRows,
  Scales: PhosphorScales,
  SealCheck: PhosphorSealCheck,
  ShareNetwork: PhosphorShareNetwork,
  Shield: PhosphorShield,
  ShieldCheck: PhosphorShieldCheck,
  ShieldWarning: PhosphorShieldWarning,
  ShirtFolded: PhosphorShirtFolded,
  ShoppingCart: PhosphorShoppingCart,
  SidebarSimple: PhosphorSidebarSimple,
  SignOut: PhosphorSignOut,
  SimCard: PhosphorSimCard,
  Sliders: PhosphorSliders,
  Smiley: PhosphorSmiley,
  Sparkle: PhosphorSparkle,
  SpeakerHigh: PhosphorSpeakerHigh,
  SpeakerSlash: PhosphorSpeakerSlash,
  SpinnerGap: PhosphorSpinnerGap,
  SquaresFour: PhosphorSquaresFour,
  Stack: PhosphorStack,
  StackSimple: PhosphorStackSimple,
  Stamp: PhosphorStamp,
  Star: PhosphorStar,
  Stop: PhosphorStop,
  Storefront: PhosphorStorefront,
  Sun: PhosphorSun,
  Tag: PhosphorTag,
  TextAlignLeft: PhosphorTextAlignLeft,
  TextT: PhosphorTextT,
  Ticket: PhosphorTicket,
  Timer: PhosphorTimer,
  ToggleLeft: PhosphorToggleLeft,
  ToggleRight: PhosphorToggleRight,
  Trash: PhosphorTrash,
  Tray: PhosphorTray,
  TrayArrowDown: PhosphorTrayArrowDown,
  TreeStructure: PhosphorTreeStructure,
  TrendDown: PhosphorTrendDown,
  TrendUp: PhosphorTrendUp,
  Truck: PhosphorTruck,
  UploadSimple: PhosphorUploadSimple,
  User: PhosphorUser,
  UserCheck: PhosphorUserCheck,
  UserCircle: PhosphorUserCircle,
  UserGear: PhosphorUserGear,
  UserMinus: PhosphorUserMinus,
  UserPlus: PhosphorUserPlus,
  UserSwitch: PhosphorUserSwitch,
  Users: PhosphorUsers,
  UsersThree: PhosphorUsersThree,
  Vault: PhosphorVault,
  VideoCamera: PhosphorVideoCamera,
  Wallet: PhosphorWallet,
  Warehouse: PhosphorWarehouse,
  Warning: PhosphorWarning,
  WarningCircle: PhosphorWarningCircle,
  WarningOctagon: PhosphorWarningOctagon,
  WifiHigh: PhosphorWifiHigh,
  WifiSlash: PhosphorWifiSlash,
  Wine: PhosphorWine,
  Wrench: PhosphorWrench,
  X: PhosphorX,
  XCircle: PhosphorXCircle,
} satisfies Record<string, PhosphorIconComponent>;

type PhosphorIconName = keyof typeof iconRegistry;

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

/**
 * Marks drawn as outlines rather than solids.
 *
 * A filled magnifier is a black lollipop: the lens, which is the part that
 * says "search", is exactly the part the fill removes. It reads as heavier
 * than everything around it in a toolbar of quiet controls — and search is
 * the quietest thing in a toolbar, not the loudest.
 *
 * `regular` rather than `bold`: these are shapes with an interior, so they
 * want an outline weight, not a thickened stroke.
 */
const OUTLINE_WEIGHT_EXACT = new Set(["MagnifyingGlass"]);

function createPhosphorIcon(iconName: PhosphorIconName, displayName: string): LucideIcon {
  const IconComponent = iconRegistry[iconName];
  const defaultWeight: PhosphorIconProps["weight"] =
    STROKE_WEIGHT_PREFIX.test(iconName) || STROKE_WEIGHT_EXACT.has(iconName)
      ? "bold"
      : OUTLINE_WEIGHT_EXACT.has(iconName)
        ? "regular"
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
export const Plug = createPhosphorIcon("PlugsConnected", "Plug");
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
/* A town rather than an office: the mark on a "City" property, where the
   single office block reads as the company that owns the record. */
export const Buildings = createPhosphorIcon("Buildings", "Buildings");
export const Calendar = createPhosphorIcon("CalendarBlank", "Calendar");
export const CalendarIcon = createPhosphorIcon(
  "CalendarBlank",
  "CalendarIcon",
);
export const Camera = createPhosphorIcon("VideoCamera", "Camera");
/** A still camera — taking a photo, as opposed to `Camera`'s video feed. */
export const PhotoCamera = createPhosphorIcon("Camera", "PhotoCamera");
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
/* A pinned point on the ground, for a "Coordinates" property — the map pin
   itself belongs to the street address a row or two above it. */
export const Crosshair = createPhosphorIcon("Crosshair", "Crosshair");
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

/**
 * The same panel mark, for a rail on the right-hand edge.
 *
 * Phosphor draws `SidebarSimple` with its bar on the left, which is right for
 * the app's own sidebar and backwards for the record page's properties rail —
 * a control that collapses the pane on the right should not point at the pane
 * on the left. Mirrored rather than substituted, because the two controls are
 * the same gesture and have to read as one family; the chevron that used to
 * sit there read as "go forward", which is a different promise entirely.
 */
function SidebarRightIcon({ className, ...props }: MaterialIconProps) {
  return <SidebarLeft {...props} className={cn("-scale-x-100", className)} />;
}
export const SidebarRight: LucideIcon = SidebarRightIcon;
export const Sparkles = createPhosphorIcon("Sparkle", "Sparkles");
export const Spinner = createPhosphorIcon("SpinnerGap", "Spinner");
export const Square = createPhosphorIcon("Stop", "Square");
export const Storefront = createPhosphorIcon("Storefront", "Storefront");
export const Kanban = createPhosphorIcon("Kanban", "Kanban");
export const ListBullets = createPhosphorIcon("ListBullets", "ListBullets");
export const SortAscending = createPhosphorIcon("ArrowsDownUp", "SortAscending");
export const GripVertical = createPhosphorIcon("DotsSixVertical", "GripVertical");
export const Columns = createPhosphorIcon("Columns", "Columns");
export const Rows = createPhosphorIcon("Rows", "Rows");
export const TableRows = createPhosphorIcon("Rows", "TableRows");
/* Where an enquiry came from, on a record's "Source" property. */
export const Tag = createPhosphorIcon("Tag", "Tag");
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
export const Keyboard = createPhosphorIcon("Keyboard", "Keyboard");
export const Percent = createPhosphorIcon("Percent", "Percent");

/**
 * The campus expansion's own marks — conduct, exams and leavers.
 *
 * Each is the glyph `NAV` in `design/campus/lib/expansion-kit.mjs` names for
 * its sidebar row, so the rail and the artboard carry the same shape.
 */
export const Flag = createPhosphorIcon("Flag", "Flag");
export const Star = createPhosphorIcon("Star", "Star");
export const Timer = createPhosphorIcon("Timer", "Timer");
export const Certificate = createPhosphorIcon("Certificate", "Certificate");
export const SignOut = createPhosphorIcon("SignOut", "SignOut");
export const GraduationCap = createPhosphorIcon("GraduationCap", "GraduationCap");
export const Medal = createPhosphorIcon("Medal", "Medal");

/** Marks for a record's sections — the tab strip and the phone's section list. */
export const Paperclip = createPhosphorIcon("Paperclip", "Paperclip");
export const At = createPhosphorIcon("At", "At");
export const FlowArrow = createPhosphorIcon("FlowArrow", "FlowArrow");
export const Archive = createPhosphorIcon("Archive", "Archive");

/**
 * Marks for the school verbs.
 *
 * Added for `lib/schools/action-icons.ts`, which pairs every `SchoolAction`
 * with one of these so a verb wears the same mark on every screen. The names
 * are Phosphor's, not the verb's — `Prohibit` is what voiding looks like, and
 * calling the export `Void` would hide which glyph you are getting.
 */
export const ArrowUDownLeft = createPhosphorIcon("ArrowUDownLeft", "ArrowUDownLeft");
export const ArrowBendUpLeft = createPhosphorIcon("ArrowBendUpLeft", "ArrowBendUpLeft");
export const ArrowLineDown = createPhosphorIcon("ArrowLineDown", "ArrowLineDown");
export const ArrowLineUp = createPhosphorIcon("ArrowLineUp", "ArrowLineUp");
export const Money = createPhosphorIcon("Money", "Money");
export const Monitor = createPhosphorIcon("Monitor", "Monitor");
export const Prohibit = createPhosphorIcon("Prohibit", "Prohibit");
export const GearSix = createPhosphorIcon("GearSix", "GearSix");
export const CalendarPlus = createPhosphorIcon("CalendarPlus", "CalendarPlus");

/**
 * Marks for the record states — see `components/records/states.tsx`.
 *
 * A tray for "nothing has been put here", a warning circle for "something
 * broke". The funnel and the tick are already exported above.
 */
export const Tray = createPhosphorIcon("Tray", "Tray");
export const WarningCircle = createPhosphorIcon("WarningCircle", "WarningCircle");

/**
 * Marks for the conduct, exams and leavers verbs, which arrived with the
 * schools expansion after the first pass of `action-icons.tsx`.
 */
export const ListChecks = createPhosphorIcon("ListChecks", "ListChecks");
export const NotePencil = createPhosphorIcon("NotePencil", "NotePencil");
export const NoteBlank = createPhosphorIcon("NoteBlank", "NoteBlank");

/**
 * The warning triangle, for `components/schools/common/status-badge.tsx`.
 * Distinct from `WarningCircle`, which the error states use: the triangle says
 * "look at this", the circle says "this broke".
 */
export const Warning = createPhosphorIcon("Warning", "Warning");

/**
 * The marks the workspace rail navigates by.
 *
 * A tier-one icon is the only thing standing for its area — there is no label
 * beside it — so each one has to be read at 17px by somebody who has not been
 * told what it means. That rules out the generic set: a bar chart cannot mean
 * Results when it already means Insights, and a warning triangle cannot mean
 * Conduct when it also means an overdue invoice two rows below. These are the
 * specific ones. Where a mark is claimed by an area, nothing else in the same
 * column may use it — see `AREA_ICONS` in `lib/rail/areas.ts`.
 */
export const Sun = createPhosphorIcon("Sun", "Sun");
export const UsersThree = createPhosphorIcon("UsersThree", "UsersThree");
export const Bed = createPhosphorIcon("Bed", "Bed");
export const IdentificationCard = createPhosphorIcon(
  "IdentificationCard",
  "IdentificationCard",
);
export const TrayArrowDown = createPhosphorIcon(
  "TrayArrowDown",
  "TrayArrowDown",
);
export const ClipboardText = createPhosphorIcon(
  "ClipboardText",
  "ClipboardText",
);
export const Lightning = createPhosphorIcon("Lightning", "Lightning");
export const ChartLineUp = createPhosphorIcon("ChartLineUp", "ChartLineUp");
export const CashRegister = createPhosphorIcon("CashRegister", "CashRegister");
export const Drop = createPhosphorIcon("Drop", "Drop");
export const MagnifyingGlass = createPhosphorIcon(
  "MagnifyingGlass",
  "MagnifyingGlass",
);
export const SidebarSimple = createPhosphorIcon("SidebarSimple", "SidebarSimple");
export const CaretLeft = createPhosphorIcon("CaretLeft", "CaretLeft");

// The form builder's question types and its row controls.
export const TextT = createPhosphorIcon("TextT", "TextT");
export const TextAlignLeft = createPhosphorIcon("TextAlignLeft", "TextAlignLeft");
export const Hash = createPhosphorIcon("Hash", "Hash");
export const CopySimple = createPhosphorIcon("CopySimple", "CopySimple");
export const DotsSixVertical = createPhosphorIcon("DotsSixVertical", "DotsSixVertical");

/**
 * The retail shell's marks and items, by their Phosphor names
 * (00-foundations 5.3.4).
 */
export const SquaresFour = createPhosphorIcon("SquaresFour", "SquaresFour");
export const Stack = createPhosphorIcon("Stack", "Stack");
export const ChartBar = createPhosphorIcon("ChartBar", "ChartBar");
export const ArrowsLeftRight = createPhosphorIcon("ArrowsLeftRight", "ArrowsLeftRight");
export const Truck = createPhosphorIcon("Truck", "Truck");
export const Trash = createPhosphorIcon("Trash", "Trash");
export const Folder = createPhosphorIcon("Folder", "Folder");
export const DeviceMobile = createPhosphorIcon("DeviceMobile", "DeviceMobile");
export const Stamp = createPhosphorIcon("Stamp", "Stamp");
export const Ticket = createPhosphorIcon("Ticket", "Ticket");
export const Gift = createPhosphorIcon("Gift", "Gift");
export const CreditCard = createPhosphorIcon("CreditCard", "CreditCard");
export const List = createPhosphorIcon("List", "List");
/** Phosphor's two-person `Users` (the export named `Users` above is `UsersThree`). */
export const UsersPair = createPhosphorIcon("Users", "UsersPair");

// The till (components/retail/till): Phosphor names, as the canvas draws them.
export const ArrowsClockwise = createPhosphorIcon("ArrowsClockwise", "ArrowsClockwise");
export const ArrowsCounterClockwise = createPhosphorIcon("ArrowsCounterClockwise", "ArrowsCounterClockwise");
export const Backspace = createPhosphorIcon("Backspace", "Backspace");
export const Barcode = createPhosphorIcon("Barcode", "Barcode");
export const BeerBottle = createPhosphorIcon("BeerBottle", "BeerBottle");
export const BeerStein = createPhosphorIcon("BeerStein", "BeerStein");
export const Bread = createPhosphorIcon("Bread", "Bread");
export const CaretRight = createPhosphorIcon("CaretRight", "CaretRight");
export const Carrot = createPhosphorIcon("Carrot", "Carrot");
export const Cube = createPhosphorIcon("Cube", "Cube");
export const Egg = createPhosphorIcon("Egg", "Egg");
export const Flame = createPhosphorIcon("Flame", "Flame");
export const Grains = createPhosphorIcon("Grains", "Grains");
export const HandCoins = createPhosphorIcon("HandCoins", "HandCoins");
export const Key = createPhosphorIcon("Key", "Key");
export const Link = createPhosphorIcon("Link", "Link");
export const LinkBreak = createPhosphorIcon("LinkBreak", "LinkBreak");
export const Martini = createPhosphorIcon("Martini", "Martini");
export const Moon = createPhosphorIcon("Moon", "Moon");
export const PauseCircle = createPhosphorIcon("PauseCircle", "PauseCircle");
export const PintGlass = createPhosphorIcon("PintGlass", "PintGlass");
export const PlayCircle = createPhosphorIcon("PlayCircle", "PlayCircle");
export const Question = createPhosphorIcon("Question", "Question");
export const ReceiptX = createPhosphorIcon("ReceiptX", "ReceiptX");
export const SealCheck = createPhosphorIcon("SealCheck", "SealCheck");
export const ShoppingCart = createPhosphorIcon("ShoppingCart", "ShoppingCart");
export const SimCard = createPhosphorIcon("SimCard", "SimCard");
export const UserSwitch = createPhosphorIcon("UserSwitch", "UserSwitch");
export const Vault = createPhosphorIcon("Vault", "Vault");
export const WifiSlash = createPhosphorIcon("WifiSlash", "WifiSlash");
export const Wine = createPhosphorIcon("Wine", "Wine");
