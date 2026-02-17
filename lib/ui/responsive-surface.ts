export const TABLET_BREAKPOINTS = {
  min: 768,
  max: 1023,
} as const

export type ResponsiveSurfaceSize = "sm" | "md" | "lg" | "xl" | "full"
export type DialogTabletBehavior = "adaptive" | "centered" | "fullscreen"
export type SheetTabletBehavior = "adaptive" | "side" | "bottom" | "fullscreen"

export const SHEET_SIZE_CLASSNAMES: Record<ResponsiveSurfaceSize, string> = {
  sm: "[--sheet-size-mobile:100vw] [--sheet-size-sm:min(92vw,24rem)] [--sheet-size-md:min(76vw,30rem)] [--sheet-size-lg:min(34rem,48vw)]",
  md: "[--sheet-size-mobile:100vw] [--sheet-size-sm:min(94vw,28rem)] [--sheet-size-md:min(82vw,38rem)] [--sheet-size-lg:min(42rem,56vw)]",
  lg: "[--sheet-size-mobile:100vw] [--sheet-size-sm:min(96vw,32rem)] [--sheet-size-md:min(88vw,46rem)] [--sheet-size-lg:min(52rem,68vw)]",
  xl: "[--sheet-size-mobile:100vw] [--sheet-size-sm:min(98vw,38rem)] [--sheet-size-md:min(94vw,56rem)] [--sheet-size-lg:min(64rem,78vw)]",
  full: "[--sheet-size-mobile:100vw] [--sheet-size-sm:100vw] [--sheet-size-md:100vw] [--sheet-size-lg:100vw]",
}

export const DIALOG_SIZE_CLASSNAMES: Record<ResponsiveSurfaceSize, string> = {
  sm: "[--dialog-max-w-sm:28rem] [--dialog-max-w-md:32rem] [--dialog-max-w-lg:34rem]",
  md: "[--dialog-max-w-sm:34rem] [--dialog-max-w-md:40rem] [--dialog-max-w-lg:44rem]",
  lg: "[--dialog-max-w-sm:40rem] [--dialog-max-w-md:50rem] [--dialog-max-w-lg:56rem]",
  xl: "[--dialog-max-w-sm:48rem] [--dialog-max-w-md:62rem] [--dialog-max-w-lg:72rem]",
  full: "[--dialog-max-w-sm:calc(100vw-1.5rem)] [--dialog-max-w-md:calc(100vw-2.5rem)] [--dialog-max-w-lg:calc(100vw-4rem)]",
}

export const DIALOG_TABLET_VIEWPORT_CLASSNAMES: Record<DialogTabletBehavior, string> = {
  adaptive: "items-end sm:items-center",
  centered: "items-center",
  fullscreen: "items-stretch lg:items-center",
}

export const DIALOG_TABLET_CONTENT_CLASSNAMES: Record<DialogTabletBehavior, string> = {
  adaptive: "rounded-t-2xl sm:rounded-2xl md:max-lg:max-h-[min(90dvh,56rem)]",
  centered: "rounded-2xl md:max-lg:max-h-[min(92dvh,58rem)]",
  fullscreen:
    "rounded-none md:max-lg:!h-[calc(100dvh-1rem)] md:max-lg:!max-h-[calc(100dvh-1rem)] md:max-lg:!w-[calc(100vw-1rem)] md:max-lg:!max-w-none lg:rounded-2xl",
}

export const DIALOG_INSET_VIEWPORT_CLASSNAMES = {
  true: "p-0 sm:p-6 md:max-lg:p-4",
  false: "p-0",
} as const

