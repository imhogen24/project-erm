import { Grain } from "@/components/grain"
import { cn } from "@/lib/utils"

const corners = [
  "-top-2 -left-2",
  "-top-2 -right-2",
  "-bottom-2 -left-2",
  "-right-2 -bottom-2",
]

// The page content sits on a sheet with a registration mark at each corner,
// like a drawing laid on a drafting table.
export function Sheet({
  className,
  children,
}: Readonly<{ className?: string; children: React.ReactNode }>) {
  return (
    <div
      className={cn(
        "relative isolate border border-foreground/70 bg-background",
        className
      )}
    >
      <Grain />
      {corners.map((corner) => (
        <span
          key={corner}
          aria-hidden
          className={cn("reg-mark absolute hidden sm:block", corner)}
        />
      ))}
      {children}
    </div>
  )
}
