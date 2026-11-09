import type { ReactNode } from "react"

type Props = {
  // A short mark at the start: initials, a tier, a code.
  mark?: string
  label: ReactNode
  // Grey detail at the end, such as a request ID or a workload.
  meta?: ReactNode
}

// One option in a select, laid out the same way in every list: mark, name,
// detail. Once chosen it shows the same way in the closed field.
export function OptionRow({ mark, label, meta }: Props) {
  return (
    <span className="option-row">
      {mark && (
        <span aria-hidden className="option-mark">
          {mark}
        </span>
      )}
      <span className="option-label">{label}</span>
      {meta && <span className="option-meta">{meta}</span>}
    </span>
  )
}
