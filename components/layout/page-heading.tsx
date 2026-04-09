import { cn } from "@/lib/utils"

type PageHeadingProps = {
  title: string
  description?: string
  className?: string
}

export function PageHeading(props: PageHeadingProps) {
  const { title, className } = props;

  return (
    <div className={cn("mb-5 space-y-1", className)}>
      <h1 className="text-page-title text-foreground font-semibold tracking-[-0.01em]">{title}</h1>
    </div>
  )
}
