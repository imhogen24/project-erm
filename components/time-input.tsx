import { ClockIcon } from "@phosphor-icons/react/dist/ssr"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

// A time reads like a date: the icon on the left, the value beside it. The
// browser's own time button is hidden; typing or the arrow keys set it.
export function TimeInput({
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "type">) {
  return (
    <div className="relative">
      <ClockIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="time"
        className={cn(
          "h-12 appearance-none bg-background pl-10 text-base md:text-base [&::-webkit-calendar-picker-indicator]:hidden",
          className
        )}
        {...props}
      />
    </div>
  )
}
