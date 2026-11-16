import { TableBox } from "@/components/sheet-table"
import type { RequestSheet } from "@/lib/request-sheet"
import { cn } from "@/lib/utils"

export type ChangedFile = { name: string; change: "Added" | "Removed" }

const rowClass =
  "grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] not-last:border-b not-last:border-foreground/20 @xl:grid-cols-[minmax(0,calc(100%/var(--page-columns,3)))_minmax(0,1fr)]"

const labelClass =
  "border-r border-foreground/20 bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground"

function shown(value: string) {
  return value === "" ? "Not given" : value
}

// What the client filled in on the web form, as ruled tables of label and
// answer, one per group. An answer left blank says so. An answer the client
// changed the last time they sent the form again is tinted, with what it was
// under it, and the files they added or took off follow in their own table.
export function ClientRequestTables({
  request,
  changedFiles = [],
}: {
  request: RequestSheet
  changedFiles?: ChangedFile[]
}) {
  return (
    <div className="flex flex-col gap-6">
      {request.groups.map((group) => (
        <TableBox key={group.title} title={group.title}>
          <dl>
            {group.rows.map((row) => (
              <div key={row.label} className={rowClass}>
                <dt className={labelClass}>{row.label}</dt>
                <dd
                  className={cn(
                    "px-4 py-2.5 text-sm break-words",
                    row.value === "" && "text-muted-foreground",
                    row.was !== undefined && "changed-answer"
                  )}
                >
                  {shown(row.value)}
                  {row.was !== undefined && (
                    <span className="mt-1 block text-muted-foreground">
                      Was: {shown(row.was)}
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </TableBox>
      ))}
      {changedFiles.length > 0 && (
        <TableBox title="Changed files">
          <dl>
            {changedFiles.map((file) => (
              <div key={`${file.change}-${file.name}`} className={rowClass}>
                <dt className={cn(labelClass, "break-words")}>{file.name}</dt>
                <dd className="changed-answer px-4 py-2.5 text-sm">
                  {file.change}
                </dd>
              </div>
            ))}
          </dl>
        </TableBox>
      )}
    </div>
  )
}
