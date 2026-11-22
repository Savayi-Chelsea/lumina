// mammoth's prebuilt browser bundle (no Node.js built-ins), used by src/lib/cv-text.ts.
declare module "mammoth/mammoth.browser.min.js" {
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>;
}
