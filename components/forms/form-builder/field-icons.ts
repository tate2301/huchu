import type { LucideIcon } from "@/lib/icons";
import {
  At,
  Calendar,
  CheckCircle,
  Hash,
  ListBullets,
  ListChecks,
  Phone,
  Star,
  TextAlignLeft,
  TextT,
  Upload,
} from "@/lib/icons";
import type { FieldType } from "@/lib/forms/fields";

/** One filled glyph per kind of question, so the palette reads before its words do. */
export const FIELD_TYPE_ICONS: Record<FieldType, LucideIcon> = {
  text: TextT,
  longText: TextAlignLeft,
  number: Hash,
  email: At,
  phone: Phone,
  date: Calendar,
  select: ListBullets,
  multiSelect: ListChecks,
  checkbox: CheckCircle,
  file: Upload,
  rating: Star,
};

