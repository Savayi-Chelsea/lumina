/**
 * Turns a CV file into plain text in the member's browser. Nothing is uploaded:
 * PDFs are read with PDF.js (via unpdf) and Word files with mammoth, both loaded
 * only when a member picks a file.
 */
export const CV_MAX_BYTES = 5 * 1024 * 1024;
export class CvReadError extends Error {}

export type PdfTextItem = { str: string; x: number; y: number; width: number; hasEOL: boolean };

/**
 * Rebuilds lines from PDF text fragments, kept in document order so that a
 * two-column layout (such as LinkedIn's export) stays column by column. A new
 * line starts at an explicit end of line or when the baseline moves; a space is
 * inserted between fragments separated by a visible gap.
 */
export function linesFromItems(pages: PdfTextItem[][]) {
  const out: string[] = [];
  for (const items of pages) {
    let line = "", lastY: number | null = null, lastEnd: number | null = null;
    const flush = () => { if (line.trim()) out.push(line.replace(/\s+/g, " ").trim()); line = ""; lastY = null; lastEnd = null; };
    for (const item of items) {
      if (lastY !== null && Math.abs(item.y - lastY) > 2) flush();
      if (item.str) {
        const gap = lastEnd === null ? 0 : item.x - lastEnd;
        if (line && gap > 1 && !line.endsWith(" ") && !item.str.startsWith(" ")) line += " ";
        line += item.str;
        lastY = item.y; lastEnd = item.x + item.width;
      }
      if (item.hasEOL) flush();
    }
    flush();
  }
  return out.join("\n");
}

async function pdfText(buffer: ArrayBuffer) {
  const { extractTextItems, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  if (pdf.numPages > 12) throw new CvReadError("That PDF has more than 12 pages. Choose your CV rather than a longer document.");
  const { items } = await extractTextItems(pdf);
  return linesFromItems(items);
}

async function docxText(buffer: ArrayBuffer) {
  type Mammoth = { extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }> };
  // A CommonJS bundle: depending on the bundler its functions sit on the module or on `default`.
  const imported = await import("mammoth/mammoth.browser.min.js") as unknown as Mammoth & { default?: Mammoth };
  const mammoth = imported.default ?? imported;
  return (await mammoth.extractRawText({ arrayBuffer: buffer })).value;
}

/** Reads a PDF or Word (.docx) CV; checks the file's signature, not just its name. */
export async function readCvFile(file: File) {
  if (file.size > CV_MAX_BYTES) throw new CvReadError("Choose a file under 5 MB.");
  const buffer = await file.arrayBuffer();
  const head = new Uint8Array(buffer.slice(0, 4));
  const pdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46; // %PDF
  const zip = head[0] === 0x50 && head[1] === 0x4b; // PK: .docx is a zip package
  let text: string;
  try {
    if (pdf) text = await pdfText(buffer);
    else if (zip && /\.docx$/i.test(file.name)) text = await docxText(buffer);
    else throw new CvReadError("Choose a PDF or a Word (.docx) file. Older .doc files can be saved as .docx or PDF from Word.");
  } catch (error) {
    if (error instanceof CvReadError) throw error;
    throw new CvReadError("That file could not be read. If it is password-protected, save an unprotected copy and try again.");
  }
  if ((text.match(/\p{L}/gu) || []).length < 80) {
    throw new CvReadError("No text could be found in that file. It may be a scanned image; export your CV from Word or Google Docs as a PDF, or use LinkedIn's Save to PDF.");
  }
  return text;
}
