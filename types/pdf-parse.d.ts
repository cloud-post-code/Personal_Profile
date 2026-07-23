declare module "pdf-parse" {
  interface PdfParseResult {
    text: string;
    numpages: number;
    info?: { Title?: string; [k: string]: unknown };
    metadata?: unknown;
    version?: string;
  }
  function pdfParse(data: Buffer | Uint8Array, options?: unknown): Promise<PdfParseResult>;
  export default pdfParse;
}
