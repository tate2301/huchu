import { cn } from "@/lib/utils"

type PageHeadingProps = {
  title: string
  description?: string
  className?: string
}

export function PageHeading({ title, description, className }: PageHeadingProps) {
  return (
    <div className={cn("mb-6 space-y-2", className)}>
      <h1 className="text-page-title text-foreground">{title}</h1>
      {description ? (
        <p className="text-field-help text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}
