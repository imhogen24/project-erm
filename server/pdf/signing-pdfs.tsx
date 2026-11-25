import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer"
import { PDFDocument } from "pdf-lib"

// One person who signed a contract in the app, and when.
export type Signer = {
  name: string
  role: string
  viewedOn?: string
  signedOn?: string
}

export type SigningRecord = {
  projectName: string
  requestId: string
  sentOn?: string
  signers: Signer[]
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 10,
    lineHeight: 1.4,
  },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  subtitle: { color: "#444", marginBottom: 20 },
  line: { marginBottom: 4 },
  table: { borderTop: "1pt solid #222", marginTop: 12 },
  row: { flexDirection: "row", borderBottom: "0.5pt solid #999" },
  head: { fontFamily: "Helvetica-Bold" },
  cell: { flex: 1, paddingVertical: 6, paddingRight: 8 },
  note: { marginTop: 24, color: "#444" },
})

function Table({ columns, rows }: { columns: string[]; rows: string[][] }) {
  return (
    <View style={styles.table}>
      <View style={[styles.row, styles.head]}>
        {columns.map((column) => (
          <Text key={column} style={styles.cell}>
            {column}
          </Text>
        ))}
      </View>
      {rows.map((row, index) => (
        <View key={index} style={styles.row} wrap={false}>
          {row.map((cell, column) => (
            <Text key={column} style={styles.cell}>
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </View>
  )
}

// The page added at the end of the final contract once both sides have
// signed it in the app: each signer, their role and the day they signed.
export async function signaturePage(record: SigningRecord): Promise<Buffer> {
  return renderToBuffer(
    <Document title={`Signatures: ${record.projectName}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Execution page</Text>
        <Text style={styles.subtitle}>
          {record.projectName} ({record.requestId})
        </Text>
        <Table
          columns={["Signatory", "Role", "Date signed"]}
          rows={record.signers.map((signer) => [
            signer.name,
            signer.role,
            signer.signedOn ?? "",
          ])}
        />
        <Text style={styles.note}>
          Signed in the IMHOGEN app. The signing log records when the contract
          was sent and when each signatory viewed and signed it.
        </Text>
      </Page>
    </Document>
  )
}

// The signing log: when the contract was sent, and when each signer viewed
// and signed it.
export async function signingLog(record: SigningRecord): Promise<Buffer> {
  return renderToBuffer(
    <Document title={`Signing log: ${record.projectName}`}>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Digital audit certificate</Text>
        <Text style={styles.subtitle}>
          {record.projectName} ({record.requestId})
        </Text>
        <Text style={styles.line}>
          Sent for signature: {record.sentOn ?? "not recorded"}
        </Text>
        <Table
          columns={["Signatory", "Role", "Date viewed", "Date signed"]}
          rows={record.signers.map((signer) => [
            signer.name,
            signer.role,
            signer.viewedOn ?? "",
            signer.signedOn ?? "",
          ])}
        />
      </Page>
    </Document>
  )
}

// The contract with the signature page added at the end.
export async function withPageAdded(
  contract: Buffer,
  page: Buffer
): Promise<Buffer> {
  const merged = await PDFDocument.load(contract)
  const added = await PDFDocument.load(page)

  for (const copied of await merged.copyPages(added, added.getPageIndices())) {
    merged.addPage(copied)
  }

  return Buffer.from(await merged.save())
}
