import { cn } from "@/lib/utils"

type PageHeadingProps = {
  title: string
  description?: string
  className?: string
}

export function PageHeading({ title, description, className }: PageHeadingProps) {
  return (
    <div className={cn("mb-6 space-y-1", className)}>
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      {description ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}
