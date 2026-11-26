import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer"

import { ghs } from "@/lib/cost-estimation"
import type { Invoice } from "@/server/payments/approved-invoice"

import type { RecordPdf } from "./record-pdf"

// The look of every document IMHOGEN sends a client, such as the invoice
// and the payment receipt (server/pdf/receipt-pdf).
export const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 10,
    lineHeight: 1.4,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  company: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", textAlign: "right" },
  facts: { textAlign: "right", color: "#444" },
  label: { fontFamily: "Helvetica-Bold", marginBottom: 2 },
  block: { marginBottom: 16 },
  table: { borderTop: "1pt solid #222", marginTop: 8 },
  row: { flexDirection: "row", borderBottom: "0.5pt solid #999" },
  head: { fontFamily: "Helvetica-Bold" },
  description: { flex: 3, paddingVertical: 6, paddingRight: 8 },
  number: { flex: 1, paddingVertical: 6, paddingRight: 8, textAlign: "right" },
  totals: { marginTop: 8, alignSelf: "flex-end", width: "50%" },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  due: { fontFamily: "Helvetica-Bold", borderTop: "1pt solid #222" },
  terms: { marginTop: 24 },
})

function money(value: number | undefined) {
  return value === undefined ? "" : ghs(value)
}

// The invoice the client receives for one payment milestone, laid out as an
// invoice rather than as the tool's form: IMHOGEN, INVOICE, its number and
// date, who it is billed to, the lines and totals, then how and when to pay.
// D3.6 attaches it, and D3.9's receipt follows the same layout.
export function InvoiceDocument({ invoice }: { invoice: Invoice }) {
  return (
    <Document title={invoice.fileName.replace(/\.pdf$/, "")} author="IMHOGEN">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.company}>IMHOGEN LTD</Text>
          <View>
            <Text style={styles.title}>INVOICE</Text>
            <Text style={styles.facts}>
              Invoice Number: {invoice.invoiceNumber}
            </Text>
            <Text style={styles.facts}>
              Invoice Date: {invoice.invoiceDate}
            </Text>
          </View>
        </View>

        <View style={styles.block}>
          <Text style={styles.label}>Bill To</Text>
          <Text>{invoice.clientName}</Text>
          {invoice.billingAddress
            .split("\n")
            .filter((line) => line.trim() !== "")
            .map((line, index) => (
              <Text key={index}>{line}</Text>
            ))}
        </View>

        <View style={styles.block}>
          <Text style={styles.label}>Project</Text>
          <Text>{invoice.projectName}</Text>
        </View>

        <View style={styles.table}>
          <View style={[styles.row, styles.head]}>
            <Text style={styles.description}>Description</Text>
            <Text style={styles.number}>Quantity</Text>
            <Text style={styles.number}>Unit Price</Text>
            <Text style={styles.number}>Total Amount</Text>
          </View>
          {invoice.lines.map((line, index) => (
            <View key={index} style={styles.row} wrap={false}>
              <Text style={styles.description}>{line.description}</Text>
              <Text style={styles.number}>{line.quantity ?? ""}</Text>
              <Text style={styles.number}>{money(line.unitPrice)}</Text>
              <Text style={styles.number}>{money(line.total)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text>SUBTOTAL</Text>
            <Text>{ghs(invoice.subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>VAT/TAX</Text>
            <Text>{ghs(invoice.vat)}</Text>
          </View>
          <View style={[styles.totalRow, styles.due]}>
            <Text>TOTAL AMOUNT DUE</Text>
            <Text>{ghs(invoice.total)}</Text>
          </View>
        </View>

        <View style={styles.terms} wrap={false}>
          <Text style={styles.label}>Payment Details</Text>
          <Text>Bank Name: {invoice.bank.bankName}</Text>
          <Text>Account Name: {invoice.bank.accountName}</Text>
          <Text>Account Number: {invoice.bank.accountNumber}</Text>
          <Text>Branch: {invoice.bank.branch}</Text>
          {invoice.paymentTerms && (
            <Text>Payment Terms: {invoice.paymentTerms}</Text>
          )}
          {invoice.latePenalty && (
            <Text>Late Penalty: {invoice.latePenalty}</Text>
          )}
        </View>
      </Page>
    </Document>
  )
}

// The approved invoice as a PDF file, under its standard name.
export async function invoicePdf(invoice: Invoice): Promise<RecordPdf> {
  return {
    fileName: invoice.fileName,
    content: await renderToBuffer(<InvoiceDocument invoice={invoice} />),
  }
}
