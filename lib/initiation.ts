// D2.14, the phase initiation notice: once the advance payment clears, the
// Contract Admin records it and the launch dates, the Finance Officer signs
// that the money cleared, and the PM signs the green light, which locks it.

export const INITIATION = "D2.14"

export const PENDING = "Pending"

export const DONE = "Done"

export const pendingOrDone = [PENDING, DONE]

export const yesNo = ["Yes", "No"]

// 4.0's tasks: the CA sets the first; the second is set Done as the PM signs.
export const launchTasks = [
  {
    task: 'Has the central tracking database been updated to "Active Engineering Phase"?',
    assignee: "Contract Admin",
  },
  {
    task: "Has the Project Manager formally received this Initiation Notice?",
    assignee: "Project Manager",
  },
]
