import { asc, eq, inArray } from "drizzle-orm"

import { people, personCompanyRoles } from "@/db/schema"
import type { Transaction } from "@/server/audit/audit"
import type {
  Field,
  PeopleSource,
  ToolDefinition,
} from "@/server/tools/define-tool"

type Reader = Pick<Transaction, "select">

type Select = { optionsFromPeople?: PeopleSource; options: string[] }

// The names a people source lists now, in name order, each once: for
// "staff", everyone holding one of its roles as a company role.
export async function peopleOf(
  database: Reader,
  source: PeopleSource
): Promise<string[]> {
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

// The tool as the form shows it, each select of people listing them, such as
// D4.2's engineers. The same tool when it has none.
export async function withPeopleOptions(
  database: Reader,
  tool: ToolDefinition
): Promise<ToolDefinition> {
  const selects = peopleSelects(tool)

  if (selects.length === 0) {
    return tool
  }

  const names = new Map(
    await Promise.all(
      selects.map(
        async ([key, source]) =>
          [key, await peopleOf(database, source)] as const
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
