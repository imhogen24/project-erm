import type { RecordPdf } from "./record-pdf"

// The whole name for filename*, which may not hold ' ( ) or * as they are,
// though encodeURIComponent leaves them.
function extended(name: string) {
  return encodeURIComponent(name).replaceAll(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  )
}

// A PDF sent to the browser: downloaded as a file, or shown in the page, such
// as in a preview panel. Never cached, since it is one person's view.
export function pdfResponse(
  pdf: RecordPdf,
  disposition: "attachment" | "inline"
) {
  // The plain name keeps to ASCII for old browsers; filename* holds it whole.
  const ascii = pdf.fileName
    .replaceAll(/[^\x20-\x7e]/g, "_")
    .replaceAll('"', "'")

  return new Response(new Uint8Array(pdf.content), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${ascii}"; filename*=UTF-8''${extended(pdf.fileName)}`,
      "Cache-Control": "private, no-store",
    },
  })
}
