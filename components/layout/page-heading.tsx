import { cn } from "@/lib/utils"

type PageHeadingProps = {
  title: string
  description?: string
  className?: string
}

export function PageHeading({ title, description, className }: PageHeadingProps) {
  void description;

  return (
    <div className={cn("mb-5", className)}>
      <h1 className="text-page-title text-foreground font-semibold tracking-[-0.01em]">{title}</h1>
    </div>
  )
}
