import { TableBox } from "@/components/sheet-table"
import type { RequestSheet } from "@/lib/request-sheet"

// What the client filled in on the web form, as ruled tables of label and
// answer, one per group. An answer left blank says so.
export function ClientRequestTables({ request }: { request: RequestSheet }) {
  return (
    <div className="flex flex-col gap-6">
      {request.groups.map((group) => (
        <TableBox key={group.title} title={group.title}>
          <dl>
            {group.rows.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] not-last:border-b not-last:border-foreground/20"
              >
                <dt className="border-r border-foreground/20 bg-muted/30 px-4 py-2.5 text-sm text-muted-foreground">
                  {row.label}
                </dt>
                <dd
                  className={
                    row.value === ""
                      ? "px-4 py-2.5 text-sm text-muted-foreground"
                      : "px-4 py-2.5 text-sm break-words"
                  }
                >
                  {row.value === "" ? "Not given" : row.value}
                </dd>
              </div>
            ))}
          </dl>
        </TableBox>
      ))}
    </div>
  )
}
