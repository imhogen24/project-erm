// What a PDF preview field shows one person: View, or why there is nothing to
// view. `name` is what the field points to, such as "D1.15 Project Brief &
// Draft Budget". The server works it out; the screen only shows it.
export type PreviewState =
  | { status: "ready"; name: string; href: string }
  | { status: "notStarted"; name: string }
  | { status: "noAccess"; name: string }

// Each PDF preview field of a tool, by its key.
export type PreviewStates = Record<string, PreviewState>

export const previewNotes = {
  notStarted: "Not started",
  noAccess: "No access",
} as const
