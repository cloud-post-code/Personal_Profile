interface PdfParseResult {
  text: string;
  numpages: number;
  info?: { Title?: string; [k: string]: unknown };
  metadata?: unknown;
  version?: string;
}

declare module "pdf-parse" {
  function pdfParse(data: Buffer | Uint8Array, options?: unknown): Promise<PdfParseResult>;
  export default pdfParse;
}

// The package index runs debug code at import (reads a bundled test PDF) and
// throws in production. Import the lib entry directly to avoid that.
declare module "pdf-parse/lib/pdf-parse.js" {
  function pdfParse(data: Buffer | Uint8Array, options?: unknown): Promise<PdfParseResult>;
  export default pdfParse;
}
