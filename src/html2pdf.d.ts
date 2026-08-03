declare module 'html2pdf.js' {
  type Html2PdfOptions = {
    margin?: number | number[]
    filename?: string
    image?: { type?: string; quality?: number }
    html2canvas?: Record<string, unknown>
    jsPDF?: Record<string, unknown>
    pagebreak?: Record<string, unknown>
  }

  type Html2PdfWorker = {
    set(options: Html2PdfOptions): Html2PdfWorker
    from(element: HTMLElement): Html2PdfWorker
    toPdf(): Html2PdfWorker
    outputPdf(type: 'blob'): Promise<Blob>
    save(): Promise<void>
  }

  export default function html2pdf(): Html2PdfWorker
}
