// What a PDF preview field shows one person: View, or why there is nothing to
// view. `name` is what the field points to, such as "D1.15 Project Brief &
// Draft Budget". The server works it out; the screen only shows it.
export type PreviewState =
  | { status: "ready"; name: string; href: string }
  | { status: "notStarted"; name: string }
  | { status: "noAccess"; name: string }

// Each PDF preview of a tool: a field by its key, and a table cell by
// `previewCellKey`.
export type PreviewStates = Record<string, PreviewState>

export const previewNotes = {
  notStarted: "Not started",
  noAccess: "No access",
} as const

// The key of a table cell's PDF preview among a tool's previews, such as
// "coreVariables.0.source". A field key holds no dot, so the two never meet.
export function previewCellKey(table: string, row: number, column: string) {
  return `${table}.${row}.${column}`
}
