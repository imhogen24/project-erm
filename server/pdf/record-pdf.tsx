import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer"
import { and, eq, inArray } from "drizzle-orm"

import type { Database } from "@/db"
import { files, projects, type RecordState } from "@/db/schema"
import { liveValues } from "@/lib/live-values"
import {
  getDocumentControl,
  type DocumentControl,
} from "@/server/document-control/document-control"
import {
  RecordNotFoundError,
  getRecord,
  hiddenFromClient,
} from "@/server/records/records"
import { withSignerNames } from "@/server/records/screen"
import { fillsOf } from "@/server/records/fills"
import { systemValuesOf } from "@/server/records/system-values"
import { tools } from "@/server/tools/registry"

import {
  EMPTY,
  sectionsOf,
  uploadIdsOf,
  withLive,
  type Section,
} from "./record-document"

// Words wrap whole: a broken word in a narrow table cell is hard to read.
Font.registerHyphenationCallback((word) => [word])

const stateLabels: Record<Exclude<RecordState, "void">, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  locked: "Locked",
}

// Every time is UTC, which is also Ghana's local time.
const whenFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
})

function when(value: Date | null) {
  return value ? whenFormat.format(value) : EMPTY
}

function who(person: DocumentControl["preparedBy"]) {
  if (!person) {
    return "Not assigned"
  }

  return person.role ? `${person.name} (${person.role})` : person.name
}

// The document control facts the tool page's bar shows.
function facts(control: DocumentControl) {
  return [
    { label: "Request ID", value: control.requestId },
    { label: "Prepared by", value: who(control.preparedBy) },
    { label: "Checked by", value: who(control.checkedBy) },
    { label: "Date checked", value: when(control.checkedAt) },
    { label: "Date approved", value: when(control.approvedAt) },
    { label: "Started", value: when(control.startedAt) },
    { label: "Completed", value: when(control.completedAt) },
    { label: "Iteration", value: String(control.iteration) },
  ]
}

// The page's inks: text, quieter text, rules, and the band behind a table's
// head and total.
const colours = {
  ink: "#1c1917",
  muted: "#57534e",
  line: "#d6d3d1",
  band: "#f5f5f4",
}

const { ink, muted, line, band } = colours

// Line height in points, set on each text. A plain multiple is taken of the
// wrong font size, and on the page it stops a page number being drawn.
function spaced(fontSize: number) {
  return { fontSize, lineHeight: `${(fontSize * 1.4).toFixed(1)}pt` }
}

const lineHeight = spaced(9.5).lineHeight

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 40,
    fontFamily: "Helvetica",
    fontSize: 9.5,
    color: ink,
  },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", lineHeight: "22pt" },
  subtitle: { marginTop: 4, fontSize: 11, color: muted },
  facts: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: line,
  },
  fact: {
    width: "25%",
    paddingVertical: 5,
    paddingHorizontal: 7,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: line,
  },
  factLabel: { fontSize: 7.5, color: muted },
  factValue: { marginTop: 2, fontFamily: "Helvetica-Bold" },
  section: { marginTop: 18 },
  heading: {
    fontSize: 11.5,
    fontFamily: "Helvetica-Bold",
    paddingBottom: 4,
    marginBottom: 6,
    borderBottomWidth: 1.5,
    borderColor: ink,
  },
  pair: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderColor: line,
  },
  pairLabel: { width: "34%", paddingRight: 10, color: muted, lineHeight },
  pairValue: { width: "66%", lineHeight },
  table: { borderTopWidth: 0.5, borderLeftWidth: 0.5, borderColor: line },
  row: { flexDirection: "row" },
  headRow: { flexDirection: "row", backgroundColor: band },
  cell: {
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 5,
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: line,
  },
  headCell: { fontFamily: "Helvetica-Bold" },
  totalCell: { fontFamily: "Helvetica-Bold", backgroundColor: band },
  text: { lineHeight },
  note: { marginTop: 18, color: muted, lineHeight },
  item: { flexDirection: "row", paddingVertical: 2 },
  bullet: { width: 12, color: muted },
  itemText: { flex: 1, lineHeight },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: muted,
  },
})

// A table with many columns sets its text smaller, so a wide table wraps its
// text in narrow columns instead of running off the page.
function tableSize(columns: number) {
  if (columns >= 7) {
    return 7
  }

  return columns >= 5 ? 8 : 9
}

function Heading({ title }: { title: string }) {
  // A heading needs room for some of its section under it, so it never sits
  // alone at the foot of a page.
  return (
    <Text style={styles.heading} minPresenceAhead={60}>
      {title}
    </Text>
  )
}

function TableBlock({
  section,
}: {
  section: Extract<Section, { kind: "table" }>
}) {
  const size = spaced(tableSize(section.columns.length))

  return (
    <View style={styles.table}>
      <View style={styles.headRow} wrap={false}>
        {section.columns.map((column, index) => (
          <Text key={index} style={[styles.cell, size, styles.headCell]}>
            {column}
          </Text>
        ))}
      </View>
      {section.rows.length === 0 ? (
        <View style={styles.row} wrap={false}>
          <Text style={[styles.cell, size]}>No rows</Text>
        </View>
      ) : (
        section.rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row} wrap={false}>
            {row.map((cell, index) => (
              <Text key={index} style={[styles.cell, size]}>
                {cell}
              </Text>
            ))}
          </View>
        ))
      )}
      {section.total && (
        <View style={styles.row} wrap={false}>
          {section.total.map((cell, index) => (
            <Text key={index} style={[styles.cell, size, styles.totalCell]}>
              {cell}
            </Text>
          ))}
        </View>
      )}
    </View>
  )
}

function SectionBlock({ section }: { section: Section }) {
  return (
    <View style={styles.section}>
      <Heading title={section.title} />
      {section.kind === "rows" &&
        section.rows.map((row, index) => (
          <View key={index} style={styles.pair} wrap={false}>
            <Text style={styles.pairLabel}>{row.label}</Text>
            <Text style={styles.pairValue}>{row.value}</Text>
          </View>
        ))}
      {section.kind === "table" && <TableBlock section={section} />}
      {section.kind === "text" && (
        <Text style={styles.text}>{section.text}</Text>
      )}
      {section.kind === "list" &&
        section.items.map((item, index) => (
          <View key={index} style={styles.item} wrap={false}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.itemText}>{item}</Text>
          </View>
        ))}
    </View>
  )
}

export type Content = {
  title: string
  projectName: string
  state: string
  control: DocumentControl
  sections: Section[]
  // Said in place of the sections, when the person may not read them yet.
  note?: string
}

export function RecordDocument({ content }: { content: Content }) {
  return (
    <Document title={content.title} subject={content.projectName}>
      <Page size="A4" style={styles.page}>
        <View>
          <Text style={styles.title}>{content.title}</Text>
          <Text style={styles.subtitle}>
            {content.projectName} · {content.state}
          </Text>
          <View style={styles.facts}>
            {facts(content.control).map((fact) => (
              <View key={fact.label} style={styles.fact}>
                <Text style={styles.factLabel}>{fact.label}</Text>
                <Text style={styles.factValue}>{fact.value}</Text>
              </View>
            ))}
          </View>
          {content.note && <Text style={styles.note}>{content.note}</Text>}
          {content.sections.map((section, index) => (
            <SectionBlock key={index} section={section} />
          ))}
        </View>
        <View style={styles.footer} fixed>
          <Text style={{ flex: 1 }}>{content.title}</Text>
          {/* A page number is laid out before its text is known, so it needs
              a width of its own. */}
          <Text
            style={{ width: 80, textAlign: "right" }}
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  )
}

// Characters a file name may not hold on Windows or macOS.
function safeName(name: string) {
  return name.replaceAll(/[\\/:*?"<>|]+/g, "-").trim()
}

export type RecordPdf = { fileName: string; content: Buffer }

// One tool record as a PDF, for this person: the fields they see on the tool
// page and nothing else, with the record's document control at the top. A
// record they may not read, a void record or an unknown tool is the same
// RecordNotFoundError, or the PermissionDeniedError of `getRecord`.
export async function recordPdf(
  database: Database,
  personId: string,
  recordId: string
): Promise<RecordPdf> {
  const record = await getRecord(database, personId, recordId)
  const tool = tools.getTool(record.toolId)

  if (!tool || record.state === "void") {
    throw new RecordNotFoundError(`No record with id ${recordId}`)
  }

  const [project] = await database
    .select({ name: projects.name })
    .from(projects)
    .where(eq(projects.id, record.projectId))

  const control = await getDocumentControl(database, personId, recordId)

  const title = `${tool.id} ${tool.name}`

  const base = {
    title,
    projectName: project!.name,
    state: stateLabels[record.state],
    control,
  }

  // A tool the client reads only once locked holds IMHOGEN's working notes
  // until then, so the client's PDF says so and holds none of them.
  if (await hiddenFromClient(database, personId, record)) {
    return {
      fileName: `${safeName(`${title} - ${project!.name}`)}.pdf`,
      content: await renderToBuffer(
        <RecordDocument
          content={{
            ...base,
            sections: [],
            note: "IMHOGEN shares this with you once it is approved.",
          }}
        />
      ),
    }
  }

  const payload = await withSignerNames(database, tool.id, record.payload)

  const shown = {
    ...payload,
    ...(await systemValuesOf(database, record.projectId, tool.id, {
      id: record.id,
      state: record.state,
      payload: record.payload,
    })),
  }

  const values = withLive(shown, liveValues(tool.id, shown))

  const ids = uploadIdsOf(tool, values)

  const names = new Map(
    ids.length === 0
      ? []
      : (
          await database
            .select({ id: files.id, name: files.name })
            .from(files)
            .where(
              and(inArray(files.id, ids), eq(files.projectId, record.projectId))
            )
        ).map((file) => [file.id, file.name])
  )

  return {
    fileName: `${safeName(`${title} - ${project!.name}`)}.pdf`,
    content: await renderToBuffer(
      <RecordDocument
        content={{
          ...base,
          sections: sectionsOf(
            tool,
            values,
            names,
            await fillsOf(database, record.projectId, tool.id, values)
          ),
        }}
      />
    ),
  }
}
