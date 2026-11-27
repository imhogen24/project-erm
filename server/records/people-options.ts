import { and, asc, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { people, personCompanyRoles, personProjectRoles } from "@/db/schema"
import type { Transaction } from "@/server/audit/audit"
import { lockedPayload } from "@/server/handoff/handoff"
import type {
  Field,
  PeopleSource,
  ToolDefinition,
} from "@/server/tools/define-tool"

type Reader = Pick<Transaction, "select">

type Select = { optionsFromPeople?: PeopleSource; options: string[] }

const cells = z.array(z.record(z.string(), z.json()).catch({})).catch([])

const rosterName = z.string().trim().min(1)

// For a "roster" source, the names in the column of the project's locked
// record, in its order, then the project's holders of its roles in name
// order, each once.
async function rosterOf(
  database: Reader,
  source: Extract<PeopleSource, { from: "roster" }>,
  projectId: string
): Promise<string[]> {
  const [payload, holders] = await Promise.all([
    lockedPayload(database, projectId, source.tool),
    source.roles
      ? database
          .select({ name: people.name })
          .from(personProjectRoles)
          .innerJoin(people, eq(people.id, personProjectRoles.personId))
          .where(
            and(
              eq(personProjectRoles.projectId, projectId),
              inArray(personProjectRoles.role, source.roles)
            )
          )
          .orderBy(asc(people.name))
      : [],
  ])

  const rostered = cells.parse(payload[source.field]).flatMap((row) => {
    const name = rosterName.safeParse(row[source.column])

    return name.success ? [name.data] : []
  })

  return [...new Set([...rostered, ...holders.map((row) => row.name)])]
}

// The names a people source lists now, each once: for "staff", everyone
// holding one of its roles as a company role, in name order; for "roster",
// the project's locked roster and role holders, which need the project. A
// "column" source lists what the form holds as it is typed
// (lib/people-columns), so nothing here.
export async function peopleOf(
  database: Reader,
  source: PeopleSource,
  projectId?: string
): Promise<string[]> {
  if (source.from === "roster") {
    return projectId ? await rosterOf(database, source, projectId) : []
  }

  if (source.from !== "staff") {
    return []
  }

  const rows = await database
    .select({ name: people.name })
    .from(personCompanyRoles)
    .innerJoin(people, eq(people.id, personCompanyRoles.personId))
    .where(inArray(personCompanyRoles.role, source.roles))
    .orderBy(asc(people.name))

  return [...new Set(rows.map((row) => row.name))]
}

// Every select of the tool, and select column of its tables, that lists
// people, as "<field>" or "<field>.<column>".
function peopleSelects(tool: ToolDefinition): [string, PeopleSource][] {
  return tool.fields.flatMap((field): [string, PeopleSource][] => {
    if (field.type === "select" && field.optionsFromPeople) {
      return [[field.key, field.optionsFromPeople]]
    }

    if (field.type !== "table") {
      return []
    }

    return field.columns.flatMap((column): [string, PeopleSource][] =>
      column.type === "select" && column.optionsFromPeople
        ? [[`${field.key}.${column.key}`, column.optionsFromPeople]]
        : []
    )
  })
}

// The options as shown: the people first, then the select's own options,
// such as "Any available", leaving out a name that is also an option.
function withPeople<T extends Select>(select: T, names: string[]): T {
  return {
    ...select,
    options: [
      ...names.filter((name) => !select.options.includes(name)),
      ...select.options,
    ],
  }
}

// The tool as the form shows it on `projectId`, each select of people
// listing them, such as D4.2's engineers. The same tool when it has none.
export async function withPeopleOptions(
  database: Reader,
  tool: ToolDefinition,
  projectId?: string
): Promise<ToolDefinition> {
  const selects = peopleSelects(tool)

  if (selects.length === 0) {
    return tool
  }

  const names = new Map(
    await Promise.all(
      selects.map(
        async ([key, source]) =>
          [key, await peopleOf(database, source, projectId)] as const
      )
    )
  )

  return {
    ...tool,
    fields: tool.fields.map((field): Field => {
      if (field.type === "select" && names.has(field.key)) {
        return withPeople(field, names.get(field.key)!)
      }

      if (field.type !== "table") {
        return field
      }

      return {
        ...field,
        columns: field.columns.map((column) => {
          const listed = names.get(`${field.key}.${column.key}`)

          return column.type === "select" && listed
            ? withPeople(column, listed)
            : column
        }),
      }
    }),
  }
}
