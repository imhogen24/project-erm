import { ArrowLeftIcon } from "@phosphor-icons/react/ssr"
import Link from "next/link"

import { cn } from "@/lib/utils"

// A back link drawn as two cells: a square holding the arrow, then the label.
// The arrow slides left on hover, which shows where the link goes.
export function BackLink({
  href,
  className,
  children,
}: Readonly<{ href: string; className?: string; children: React.ReactNode }>) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex h-12 items-stretch text-sm text-muted-foreground transition-colors outline-none hover:bg-primary/5 hover:text-foreground focus-visible:bg-primary/10 focus-visible:text-foreground",
        className
      )}
    >
      <span className="flex w-12 shrink-0 items-center justify-center border-r">
        <ArrowLeftIcon
          weight="bold"
          className="size-4 transition-transform group-hover:-translate-x-0.5 group-hover:text-primary motion-reduce:transition-none"
        />
      </span>
      <span className="flex items-center px-4">{children}</span>
    </Link>
  )
}
