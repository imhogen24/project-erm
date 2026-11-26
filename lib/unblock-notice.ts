// D3.10, the phase unblock notice: the last step of each payment milestone
// cycle. Once the cycle's receipt (D3.9) is sent, the Finance Officer
// confirms there are no financial holds, names the phase that may begin and
// submits; the PM, as Head of Finance, signs, which approves and locks it.

export const UNBLOCK_NOTICE = "D3.10"

export const PENDING = "Pending"

export const DONE = "Done"

export const pendingOrDone = [PENDING, DONE]

export const YES = "Yes"

export const NO = "No"

export const yesNo = [YES, NO]

// 4.0's tasks: the FO sets the first; the second is set Done as the PM
// signs. The FO may add rows below them.
export const routingTasks = [
  {
    task: 'Has the central tracking database been updated to "Active Engineering Phase"?',
    assignee: "Finance Officer",
  },
  {
    task: "Has the Project Manager formally acknowledged receipt of this Unblock Notice?",
    assignee: "Project Manager",
  },
]

// Where 3.0 starts: the D3.1 milestone after the one the cycle billed, as
// "Phase <N>: <Milestone Description>", N being its place in D3.1, so row
// 2.3 gives "Phase 3". Empty when the cycle billed the last milestone.
export function nextPhaseOf(
  schedule: readonly { milestone: string }[],
  billedIndex: number
): string {
  const next = schedule[billedIndex + 1]

  return billedIndex >= 0 && next?.milestone.trim()
    ? `Phase ${billedIndex + 2}: ${next.milestone.trim()}`
    : ""
}
