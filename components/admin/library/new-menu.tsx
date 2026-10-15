"use client";

import { useRouter } from "next/navigation";

import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/workspace/menu";
import { KIND_SLUG, LIBRARY_KIND_ORDER, LIBRARY_KINDS } from "@/lib/library/kinds";
import { Plus } from "@/lib/icons";

/** "New" in the Library's header: one item per kind, each opening its builder. */
export function LibraryNewMenu() {
  const router = useRouter();
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" className="btn btn-primary">
          <Plus aria-hidden="true" />
          New
        </button>
      </MenuTrigger>
      <MenuContent align="end">
        {LIBRARY_KIND_ORDER.map((kind) => (
          <MenuItem key={kind} onSelect={() => router.push(`/admin/library/${KIND_SLUG[kind]}/new`)}>
            {LIBRARY_KINDS[kind].label}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
