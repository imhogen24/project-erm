import { CheckIcon, LockSimpleIcon } from "@phosphor-icons/react/ssr"

import type { ToolState } from "@/lib/tool-state"

// A state is a filled chip that gets stronger as the tool firms up: grey for
// not started, darker for draft, soft orange once submitted, soft orange with a
// tick once approved, and solid orange with a padlock once locked. Drawn by
// .state-badge in globals.css, keyed by data-state.
const labels: Record<ToolState, string> = {
  notStarted: "Not started",
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  locked: "Locked",
}

export function stateLabel(state: ToolState) {
  return labels[state]
}

export function StateBadge({ state }: { state: ToolState }) {
  return (
    <span data-state={state} className="state-badge">
      {state === "approved" && (
        <CheckIcon aria-hidden weight="bold" className="state-badge-icon" />
      )}
      {state === "locked" && (
        <LockSimpleIcon
          aria-hidden
          weight="fill"
          className="state-badge-icon"
        />
      )}
      {labels[state]}
    </span>
  )
}
