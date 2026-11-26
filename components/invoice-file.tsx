import { DownloadSimpleIcon, FilePdfIcon } from "@phosphor-icons/react/ssr"

import { Button } from "@/components/ui/button"

// The approved invoice of a milestone, as the client receives it: its file
// name, with View to open it in a new tab and Download to save it.
export function InvoiceFile({
  fileName,
  href,
  downloadHref,
}: {
  fileName: string
  href: string
  downloadHref: string
}) {
  return (
    <section
      aria-label="Approved invoice"
      className="flex flex-col gap-3 border border-foreground/20 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
        <FilePdfIcon aria-hidden className="size-5 shrink-0" />
        <span className="min-w-0 truncate">{fileName}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={href} target="_blank" rel="noreferrer">
            View
          </a>
        </Button>
        <Button asChild size="sm">
          <a href={downloadHref} download={fileName}>
            <DownloadSimpleIcon aria-hidden />
            Download
          </a>
        </Button>
      </div>
    </section>
  )
}
