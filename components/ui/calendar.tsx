"use client"

import * as React from "react"
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"
import {
  DayPicker,
  getDefaultClassNames,
  type DayButton,
} from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "outline",
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "group/calendar rounded-[var(--card-radius)] bg-transparent p-0 text-[var(--text-body)] [--cell-size:2.375rem] [[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn(
          "relative flex flex-col gap-4 md:flex-row",
          defaultClassNames.months
        ),
        month: cn("flex w-full flex-col gap-4", defaultClassNames.month),
        nav: cn(
          "absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-8 rounded-[10px] border-[var(--border-default)] bg-[var(--surface-base)] p-0 text-[var(--text-body)] shadow-none aria-disabled:opacity-50 select-none hover:bg-[var(--surface-subtle)]",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-8 rounded-[10px] border-[var(--border-default)] bg-[var(--surface-base)] p-0 text-[var(--text-body)] shadow-none aria-disabled:opacity-50 select-none hover:bg-[var(--surface-subtle)]",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex h-8 w-full items-center justify-center px-10",
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          "flex h-8 w-full items-center justify-center gap-1.5 text-sm font-semibold",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "relative rounded-[10px] border border-[var(--border-default)] bg-[var(--surface-base)] has-focus:border-[var(--focus-ring)] has-focus:ring-2 has-focus:ring-ring/20 has-focus:ring-offset-0",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "absolute bg-popover inset-0 opacity-0",
          defaultClassNames.dropdown
        ),
        caption_label: cn(
          "select-none font-semibold text-[var(--text-strong)]",
          captionLayout === "label"
            ? "text-sm"
            : "flex h-8 items-center gap-1 rounded-[10px] pl-2 pr-1 text-sm [&>svg]:size-3.5 [&>svg]:text-[var(--text-muted)]",
          defaultClassNames.caption_label
        ),
        table: "w-full border-collapse",
        weekdays: cn("mb-1 flex", defaultClassNames.weekdays),
        weekday: cn(
          "flex-1 select-none rounded-md text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]",
          defaultClassNames.weekday
        ),
        week: cn("mt-1.5 flex w-full", defaultClassNames.week),
        week_number_header: cn(
          "select-none w-(--cell-size)",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "text-[0.8rem] select-none text-muted-foreground",
          defaultClassNames.week_number
        ),
        day: cn(
          "group/day relative aspect-square h-full w-full select-none p-0 text-center [&:last-child[data-selected=true]_button]:rounded-r-[10px]",
          props.showWeekNumber
            ? "[&:nth-child(2)[data-selected=true]_button]:rounded-l-[10px]"
            : "[&:first-child[data-selected=true]_button]:rounded-l-[10px]",
          defaultClassNames.day
        ),
        range_start: cn(
          "rounded-l-[10px] bg-[var(--status-info-bg)]",
          defaultClassNames.range_start
        ),
        range_middle: cn("rounded-none bg-[color-mix(in_srgb,var(--status-info-bg)_72%,white)]", defaultClassNames.range_middle),
        range_end: cn("rounded-r-[10px] bg-[var(--status-info-bg)]", defaultClassNames.range_end),
        today: cn(
          "text-[var(--text-strong)]",
          defaultClassNames.today
        ),
        outside: cn(
          "text-[var(--text-subtle)] aria-selected:text-[var(--text-subtle)]",
          defaultClassNames.outside
        ),
        disabled: cn(
          "text-[var(--text-subtle)] opacity-50",
          defaultClassNames.disabled
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          )
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon className={cn("size-4", className)} {...props} />
            )
          }

          if (orientation === "right") {
            return (
              <ChevronRightIcon
                className={cn("size-4", className)}
                {...props}
              />
            )
          }

          return (
            <ChevronDownIcon className={cn("size-4", className)} {...props} />
          )
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-[var(--cell-size)] items-center justify-center text-center">
                {children}
              </div>
            </td>
          )
        },
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames()

  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "flex size-auto min-w-[var(--cell-size)] w-full flex-col gap-1 rounded-[10px] border border-transparent leading-none font-medium text-[var(--text-body)] shadow-none transition-colors hover:bg-[var(--surface-subtle)]",
        "data-[selected-single=true]:border-[var(--action-primary-bg)] data-[selected-single=true]:bg-[var(--action-primary-bg)] data-[selected-single=true]:text-[var(--action-primary-fg)]",
        "data-[range-middle=true]:bg-[color-mix(in_srgb,var(--status-info-bg)_72%,white)] data-[range-middle=true]:text-[var(--text-strong)]",
        "data-[range-start=true]:border-[var(--action-primary-bg)] data-[range-start=true]:bg-[var(--action-primary-bg)] data-[range-start=true]:text-[var(--action-primary-fg)]",
        "data-[range-end=true]:border-[var(--action-primary-bg)] data-[range-end=true]:bg-[var(--action-primary-bg)] data-[range-end=true]:text-[var(--action-primary-fg)]",
        "group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-2 group-data-[focused=true]/day:ring-ring/20",
        "data-[range-end=true]:rounded-[10px] data-[range-end=true]:rounded-r-[10px] data-[range-middle=true]:rounded-none data-[range-start=true]:rounded-[10px] data-[range-start=true]:rounded-l-[10px]",
        "data-[today=true]:border-[var(--border-default)] data-[today=true]:bg-[var(--surface-subtle)]",
        "[&>span]:text-[10px] [&>span]:font-medium [&>span]:opacity-70",
        defaultClassNames.day,
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
