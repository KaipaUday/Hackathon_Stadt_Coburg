import path from 'path';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { XMLParser } from 'fast-xml-parser';
import { extractText } from 'unpdf';

export interface ParsedPageChunk {
  page_or_section: string;
  text: string;
}

export interface ParsedUpload {
  filename: string;
  extension: string;
  extractedText: string;
  pageChunks: ParsedPageChunk[];
  parserNotes: string;
}

function extractReadableRunsFromBinary(buffer: Buffer): string {
  const utf16Runs: string[] = [];
  const utf16Text = buffer.toString('utf16le');
  const utf16Matches = utf16Text.match(/[\p{L}\p{N}\s.,:;!?()\-/€%°"'„“]{18,}/gu);
  if (utf16Matches) {
    for (const m of utf16Matches) {
      const cleaned = m.replace(/\s+/g, ' ').trim();
      if (cleaned.length >= 18 && !/^[\x00-\x1F]+$/.test(cleaned)) {
        utf16Runs.push(cleaned);
      }
    }
  }

  const latinText = buffer.toString('latin1');
  const latinMatches = latinText.match(
    /[A-Za-zÄÖÜäöüß0-9][A-Za-zÄÖÜäöüß0-9\s.,:;!?()\-/€%°"']{18,}/g
  );
  const latinRuns: string[] = [];
  if (latinMatches) {
    for (const m of latinMatches) {
      const cleaned = m.replace(/\s+/g, ' ').trim();
      if (cleaned.length >= 18) {
        latinRuns.push(cleaned);
      }
    }
  }

  const combined = [...new Set([...utf16Runs, ...latinRuns])];
  return combined.join('\n').slice(0, 60000);
}

function flattenGaebXml(node: unknown, prefix = '', out: string[] = []): string[] {
  if (out.length > 500) return out;
  if (node == null) return out;

  if (
    typeof node === 'string' ||
    typeof node === 'number' ||
    typeof node === 'boolean'
  ) {
    const val = String(node).replace(/\s+/g, ' ').trim();
    if (val) out.push(`${prefix}: ${val}`);
    return out;
  }

  if (Array.isArray(node)) {
    node.forEach((item, idx) => flattenGaebXml(item, `${prefix}[${idx + 1}]`, out));
    return out;
  }

  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('@_')) continue;
      flattenGaebXml(v, prefix ? `${prefix}.${k}` : k, out);
    }
  }
  return out;
}

function splitPlainTextIntoChunks(text: string, prefix = 'Abschnitt'): ParsedPageChunk[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const paragraphs = normalized.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: ParsedPageChunk[] = [];
  let buffer = '';
  let idx = 1;

  for (const para of paragraphs) {
    if (buffer && buffer.length + para.length > 900) {
      chunks.push({
        page_or_section: `${prefix} ${idx}`,
        text: buffer.trim(),
      });
      idx += 1;
      buffer = para;
    } else {
      buffer = buffer ? `${buffer}\n\n${para}` : para;
    }
  }

  if (buffer.trim()) {
    chunks.push({
      page_or_section: `${prefix} ${idx}`,
      text: buffer.trim(),
    });
  }

  return chunks.slice(0, 20);
}

export async function parseUploadedFile(
  buffer: Buffer,
  originalName: string
): Promise<ParsedUpload> {
  const ext = path.extname(originalName).toLowerCase();

  if (ext === '.pdf') {
    const pdfResult = await extractText(new Uint8Array(buffer), { mergePages: false });
    const pages = Array.isArray(pdfResult.text)
      ? pdfResult.text
      : [String(pdfResult.text ?? '')];

    const pageChunks: ParsedPageChunk[] = [];
    pages.forEach((pageText, idx) => {
      const cleaned = pageText.replace(/\s+/g, ' ').trim();
      if (cleaned) {
        pageChunks.push({
          page_or_section: `Seite ${idx + 1}`,
          text: cleaned.slice(0, 2000),
        });
      }
    });

    const joined = pageChunks.map((c) => c.text).join('\n\n');
    if (!joined.trim()) {
      return {
        filename: originalName,
        extension: ext,
        extractedText: `PDF-Datei ${originalName} (${pages.length} Seiten) enthält keine auslesbare Textebene (vermutlich reiner Bild-Scan).`,
        pageChunks: [
          {
            page_or_section: 'Scan-Hinweis',
            text: `Die PDF-Datei ${originalName} (${pages.length} Seiten) enthält keinen eingebetteten Text und sollte lokal über OCR (z. B. Tesseract / OCRmyPDF) vorverarbeitet werden.`,
          },
        ],
        parserNotes: `Lokaler PDF-Parser (${pages.length} Seiten) — kein eingebetteter Text (Scan erkannt).`,
      };
    }

    return {
      filename: originalName,
      extension: ext,
      extractedText: joined.slice(0, 60000),
      pageChunks: pageChunks.slice(0, 20),
      parserNotes: `PDF lokal über unpdf geparst (${pages.length} Seiten, ${pageChunks.length} Textabschnitte).`,
    };
  }

  if (['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff'].includes(ext)) {
    const readable = extractReadableRunsFromBinary(buffer);
    const sizeKb = Math.max(1, Math.round(buffer.length / 1024));
    const fallbackText =
      readable.length > 40
        ? `Bilddatei ${originalName} (${sizeKb} KB). Erkannte Metadaten/EXIF-Texte:\n${readable}`
        : `Bilddatei ${originalName} (${sizeKb} KB). Für automatische Texterkennung (Typenschild/Scan) lokal OCR (Tesseract) oder Ollama Vision anschließen.`;
    return {
      filename: originalName,
      extension: ext,
      extractedText: fallbackText,
      pageChunks: [
        {
          page_or_section: 'Bilddatei / Metadaten',
          text: fallbackText.slice(0, 1800),
        },
      ],
      parserNotes: `Bilddatei (${ext}, ${sizeKb} KB) lokal indiziert (ohne externe Vision-API).`,
    };
  }

  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.slice(0, 60000);
    return {
      filename: originalName,
      extension: ext,
      extractedText: text,
      pageChunks: splitPlainTextIntoChunks(text, 'Abschnitt'),
      parserNotes: 'Word (.docx) lokal über Mammoth ausgelesen.',
    };
  }

  if (['.xlsx', '.xls', '.xlsm', '.csv'].includes(ext)) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const pageChunks: ParsedPageChunk[] = [];
    const parts: string[] = [];

    for (const sheetName of workbook.SheetNames.slice(0, 8)) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ' | ', blankrows: false });
      if (csv.trim()) {
        const block = csv.trim().slice(0, 2500);
        parts.push(`=== Tabellenblatt: ${sheetName} ===\n${block}`);
        pageChunks.push({
          page_or_section: `Tabellenblatt "${sheetName}"`,
          text: block,
        });
      }
    }

    return {
      filename: originalName,
      extension: ext,
      extractedText: parts.join('\n\n').slice(0, 60000),
      pageChunks,
      parserNotes: `Tabellendokument (${workbook.SheetNames.length} Blätter) lokal geparst.`,
    };
  }

  if (['.x81', '.x82', '.x83', '.x84', '.p81', '.p83', '.xml'].includes(ext)) {
    const xmlStr = buffer.toString('utf-8');
    const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
    try {
      const parsed = parser.parse(xmlStr);
      const lines = flattenGaebXml(parsed);
      const text = lines.join('\n').slice(0, 60000);
      return {
        filename: originalName,
        extension: ext,
        extractedText: text,
        pageChunks: splitPlainTextIntoChunks(text, 'GAEB-Abschnitt'),
        parserNotes: `GAEB/XML-Datei (${ext}) lokal strukturiert extrahiert.`,
      };
    } catch {
      return {
        filename: originalName,
        extension: ext,
        extractedText: xmlStr.slice(0, 60000),
        pageChunks: splitPlainTextIntoChunks(xmlStr, 'XML-Abschnitt'),
        parserNotes: 'XML als Rohtext lokal eingelesen.',
      };
    }
  }

  if (['.doc', '.msg'].includes(ext)) {
    const recovered = extractReadableRunsFromBinary(buffer);
    const text =
      recovered ||
      `Binärdatei ${originalName} (${buffer.length} Bytes). Kein direkter Klartext gefunden — für vollständige Konvertierung LibreOffice/extract-msg lokal empfohlen.`;
    return {
      filename: originalName,
      extension: ext,
      extractedText: text,
      pageChunks: splitPlainTextIntoChunks(text, 'Textlauf'),
      parserNotes: `Legacy-Binärformat (${ext}) lokal über Textlauf-Extraktion eingelesen.`,
    };
  }

  const rawText = buffer.toString('utf-8').replace(/\0/g, '').slice(0, 60000);
  return {
    filename: originalName,
    extension: ext || '.txt',
    extractedText: rawText,
    pageChunks: splitPlainTextIntoChunks(rawText, 'Abschnitt'),
    parserNotes: 'Textdokument lokal als UTF-8 eingelesen.',
  };
}
