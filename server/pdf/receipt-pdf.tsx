import { Document, Page, Text, View, renderToBuffer } from "@react-pdf/renderer"

import { ghs } from "@/lib/cost-estimation"
import type { Receipt } from "@/server/payments/payment-receipt"

import { styles } from "./invoice-pdf"
import type { RecordPdf } from "./record-pdf"

// The receipt the client receives for one payment milestone, laid out as the
// invoice is: IMHOGEN, PAYMENT RECEIPT, its number and the day it was
// issued, who paid and for which project, the invoice and milestone it pays,
// then the amount received and how it was paid. D3.9 attaches it.
export function ReceiptDocument({ receipt }: { receipt: Receipt }) {
  return (
    <Document title={receipt.fileName.replace(/\.pdf$/, "")} author="IMHOGEN">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.company}>IMHOGEN LTD</Text>
          <View>
            <Text style={styles.title}>PAYMENT RECEIPT</Text>
            <Text style={styles.facts}>
              Receipt Number: {receipt.receiptNumber}
            </Text>
            <Text style={styles.facts}>Date Issued: {receipt.dateIssued}</Text>
          </View>
        </View>

        <View style={styles.block}>
          <Text style={styles.label}>Received From</Text>
          <Text>{receipt.clientName}</Text>
        </View>

        <View style={styles.block}>
          <Text style={styles.label}>Project</Text>
          <Text>{receipt.projectName}</Text>
        </View>

        <View style={styles.table}>
          <View style={[styles.row, styles.head]}>
            <Text style={styles.description}>Paid Against</Text>
            <Text style={styles.number}>Invoice</Text>
          </View>
          <View style={styles.row} wrap={false}>
            <Text style={styles.description}>{receipt.milestone}</Text>
            <Text style={styles.number}>{receipt.invoiceNumber}</Text>
          </View>
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text>PAYMENT METHOD</Text>
            <Text>{receipt.paymentMethod}</Text>
          </View>
          <View style={[styles.totalRow, styles.due]}>
            <Text>AMOUNT RECEIVED</Text>
            <Text>{ghs(receipt.amountReceived)}</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}

// The payment receipt as a PDF file, under its standard name.
export async function receiptPdf(receipt: Receipt): Promise<RecordPdf> {
  return {
    fileName: receipt.fileName,
    content: await renderToBuffer(<ReceiptDocument receipt={receipt} />),
  }
}
