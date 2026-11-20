import type {
  AnalysisFinding,
  AskResponse,
  AssetRecord,
  AssetStatus,
  ChunkSearchHit,
  DocType,
  DocumentRecord,
  ExtractedFact,
  SearchCitation,
} from '../src/types/knowledge.ts';
import type { ParsedUpload } from './parsers.ts';

export interface TranslatedDocumentView {
  doc_id: string;
  target_language: 'de' | 'en';
  summary: string;
  extracted_facts: ExtractedFact[];
  chunks: Array<{
    chunk_id: string;
    page_or_section: string;
    text: string;
  }>;
}

const KNOWN_MANUFACTURERS = [
  'Viessmann',
  'Buderus',
  'Honeywell',
  'Esser',
  'Hörmann',
  'GEZE',
  'Siemens',
  'Bosch',
  'Hekatron',
  'Vaillant',
  'Schüco',
  'Grundfos',
  'Wilo',
  'Wolf',
  'Stiebel Eltron',
];

const ASSET_PATTERNS: Array<{
  regex: RegExp;
  category: string;
  defaultName: string;
  code: string;
  interval: string;
}> = [
  {
    regex: /\b(brandmeldeanlage|bma|rauchmelder|handfeuermelder)\b/i,
    category: 'Brandschutz',
    defaultName: 'Brandmeldeanlage (BMA)',
    code: 'BMA',
    interval: 'Jährlich (DIN 14675)',
  },
  {
    regex: /\b(rwa|rauch-?\s*und\s*wärmeabzug|lichtkuppel)\b/i,
    category: 'Brandschutz',
    defaultName: 'Rauch- und Wärmeabzugsanlage (RWA)',
    code: 'RWA',
    interval: 'Jährlich',
  },
  {
    regex: /\b(brandschutztür|feuerschutzabschluss|t30|t90|feststellanlage)\b/i,
    category: 'Brandschutz',
    defaultName: 'Feuerschutzabschlüsse / Brandschutztüren',
    code: 'T30',
    interval: 'Jährlich (monatliche Sichtprüfung)',
  },
  {
    regex: /\b(heizkessel|brennwertkessel|heizung|kessel|ausdehnungsgefäß|wärmepumpe)\b/i,
    category: 'Heizung / TGA',
    defaultName: 'Heizungsanlage / Wärmeerzeuger',
    code: 'HZ',
    interval: 'Jährliche Wartung',
  },
  {
    regex: /\b(flachdach|dachfläche|bitumen|dachsanierung|attika|dämmung)\b/i,
    category: 'Baukonstruktion / Sanierung',
    defaultName: 'Dachkonstruktion / Flachdach',
    code: 'DACH',
    interval: 'Zustandsbegehung / Sanierungsfahrplan',
  },
  {
    regex: /\b(lüftungsanlage|rlt|klima|lüftung)\b/i,
    category: 'Lüftung / TGA',
    defaultName: 'Raumlufttechnische Anlage (RLT)',
    code: 'RLT',
    interval: 'Jährlich (VDI 6022)',
  },
  {
    regex: /\b(sicherheitsbeleuchtung|notbeleuchtung|fluchtweg)\b/i,
    category: 'Brandschutz / Elektro',
    defaultName: 'Sicherheitsbeleuchtung',
    code: 'SIBE',
    interval: 'Jährlich',
  },
  {
    regex: /\b(aufzug|personenaufzug|fahrstuhl)\b/i,
    category: 'Fördertechnik',
    defaultName: 'Aufzugsanlage',
    code: 'AUF',
    interval: 'Jährlich (TÜV/ZÜS)',
  },
];

function classifyDocType(filename: string, ext: string, text: string): DocType {
  const hay = `${filename} ${text}`.toLowerCase();
  if (['.x81', '.x82', '.x83', '.x84', '.p81', '.p83', '.d81', '.d83', '.d84'].includes(ext)) {
    return 'GAEB-LV';
  }
  if (['.msg', '.eml'].includes(ext) || hay.includes('betreff:') || hay.includes('von:')) {
    return 'E-Mail';
  }
  if (['.jpg', '.jpeg', '.png', '.webp', '.tif'].includes(ext)) {
    return 'Typenschild-Foto';
  }
  if (['.xlsx', '.xls', '.xlsm', '.csv'].includes(ext) || hay.includes('anlagenkataster')) {
    return 'Anlagenkataster';
  }
  if (hay.includes('brandschutzkonzept')) return 'Brandschutzkonzept';
  if (hay.includes('prüfbericht') || hay.includes('pruefbericht') || hay.includes('prüfergebnis')) {
    return 'Prüfbericht';
  }
  if (hay.includes('wartungsvertrag') || hay.includes('wartungspauschale')) {
    return 'Wartungsvertrag';
  }
  if (hay.includes('rechnung') || hay.includes('rechnungsnummer')) return 'Rechnung';
  if (hay.includes('grundriss') || hay.includes('bauplan') || ext === '.dwg' || ext === '.dxf') {
    return 'Bauplan';
  }
  return 'Aktenvermerk';
}

function extractDateIso(text: string, filename: string): string {
  const combined = `${filename} ${text}`;
  const isoMatch = combined.match(/\b(20\d{2}|19\d{2})-(\d{2})-(\d{2})\b/);
  if (isoMatch) return isoMatch[0];

  const deMatch = combined.match(/\b(\d{2})\.(\d{2})\.(20\d{2}|19\d{2})\b/);
  if (deMatch) return `${deMatch[3]}-${deMatch[2]}-${deMatch[1]}`;

  return new Date().toISOString().slice(0, 10);
}

function detectBuilding(
  buildingHint: string | undefined,
  filename: string,
  text: string,
  existingAssets: AssetRecord[]
): string {
  if (buildingHint && buildingHint.trim()) return buildingHint.trim();

  const hay = `${filename} ${text}`.toLowerCase();
  const knownBuildings = Array.from(new Set(existingAssets.map((a) => a.building)));
  for (const b of knownBuildings) {
    const tokens = b
      .toLowerCase()
      .split(/[\s\-.,]+/)
      .filter((t) => t.length >= 4);
    if (tokens.some((tok) => hay.includes(tok))) {
      return b;
    }
  }

  const buildingMatch = text.match(
    /(?:Grundschule|Gymnasium|Realschule|Rathaus|Verwaltungsgebäude|Kita|Feuerwehrhaus)\s+[A-ZÄÖÜa-zäöüß0-9\-. ]{3,40}/
  );
  if (buildingMatch) return buildingMatch[0].trim();

  return 'Allgemeiner Bestand Coburg';
}

function extractEurAmount(text: string): number | null {
  const matches = text.match(/(\d{1,3}(?:\.\d{3})+|\d{3,6})(?:,\d{2})?\s*(?:EUR|€)/gi);
  if (!matches || matches.length === 0) return null;
  const first = matches[0].replace(/[^\d,]/g, '').replace(',', '.');
  const num = Number.parseFloat(first);
  return Number.isFinite(num) ? Math.round(num) : null;
}

function detectManufacturers(text: string): string[] {
  const found: string[] = [];
  for (const m of KNOWN_MANUFACTURERS) {
    if (new RegExp(`\\b${m}\\b`, 'i').test(text)) {
      found.push(m);
    }
  }
  return found;
}

function detectRoom(text: string): string {
  const roomMatch = text.match(
    /\b(?:UG|EG|OG|DG)\s+[A-ZÄÖÜa-zäöüß0-9\-/ ]{3,28}|\b(?:Heizraum|Hausmeisterraum|Technikraum|Treppenhaus\s+\w+|Flur\s+\w+)\b/i
  );
  return roomMatch ? roomMatch[0].trim() : 'Nicht spezifiziert';
}

function inferStatus(text: string): { status: AssetStatus; note: string } {
  const lower = text.toLowerCase();
  if (/\b(störung|fehlercode|ausgefallen|mangel|mängel|defekt|leck|druckabfall|versprödung)\b/.test(lower)) {
    return {
      status: 'defect_reported',
      note: 'Hinweis auf Störung, Mangel oder akuten Instandhaltungsbedarf im Dokument erkannt.',
    };
  }
  if (/\b(überfällig|frist abgelaufen)\b/.test(lower)) {
    return {
      status: 'overdue',
      note: 'Hinweis auf abgelaufene Prüffrist im Dokument erkannt.',
    };
  }
  if (/\b(ohne mängel|bestanden|i\.o\.|mängelfrei|aktuell geprüft)\b/.test(lower)) {
    return {
      status: 'compliant',
      note: 'Prüfung bzw. Funktionskontrolle laut Dokument ohne Mängel.',
    };
  }
  if (/\b(sanierung|maßnahme|geplant|bis 202\d)\b/.test(lower)) {
    return {
      status: 'due_soon',
      note: 'Geplante Maßnahme oder Sanierungsbedarf im Dokument erwähnt.',
    };
  }
  return {
    status: 'missing_proof',
    note: 'Dokument indiziert; aktueller Prüf- oder Abnahmenachweis noch zu verifizieren.',
  };
}

export async function extractDocumentLocally(params: {
  parsed: ParsedUpload;
  buildingHint?: string;
  existingAssets: AssetRecord[];
}): Promise<{
  document: DocumentRecord;
  candidateAssets: AssetRecord[];
}> {
  const docId = `DOC-LOC-${Date.now().toString(36).toUpperCase()}`;
  const text = params.parsed.extractedText || '';
  const docType = classifyDocType(params.parsed.filename, params.parsed.extension, text);
  const docDate = extractDateIso(text, params.parsed.filename);
  const building = detectBuilding(
    params.buildingHint,
    params.parsed.filename,
    text,
    params.existingAssets
  );
  const manufacturers = detectManufacturers(text);
  const room = detectRoom(text);
  const costEur = extractEurAmount(text);
  const { status, note } = inferStatus(text);

  const chunks =
    params.parsed.pageChunks.length > 0
      ? params.parsed.pageChunks.map((c, idx) => ({
          chunk_id: `${docId}-c${idx + 1}`,
          page_or_section: c.page_or_section,
          text: c.text,
        }))
      : [
          {
            chunk_id: `${docId}-c1`,
            page_or_section: 'Dokumenttext',
            text: text.slice(0, 1500) || params.parsed.parserNotes,
          },
        ];

  const extractedFacts: ExtractedFact[] = [];
  const normMatches = text.match(/\b(?:DIN\s*\d+|VDI\s*\d+|GEG|DIBt|T30-RS|T90)\b/gi);
  if (normMatches?.length) {
    extractedFacts.push({
      label: 'Erkannte Normen / Standards',
      value: Array.from(new Set(normMatches)).slice(0, 5).join(', '),
      page_or_section: chunks[0].page_or_section,
      quote: chunks[0].text.slice(0, 180),
    });
  }
  if (manufacturers.length) {
    extractedFacts.push({
      label: 'Erkannte Hersteller',
      value: manufacturers.join(', '),
      page_or_section: chunks[0].page_or_section,
      quote: chunks[0].text.slice(0, 180),
    });
  }
  if (costEur != null) {
    extractedFacts.push({
      label: 'Kosten / Betrag erkannt',
      value: `${costEur.toLocaleString('de-DE')} EUR`,
      page_or_section: chunks[0].page_or_section,
      quote: chunks[0].text.slice(0, 180),
    });
  }

  const candidateAssets: AssetRecord[] = [];
  const matchedCodes = new Set<string>();

  for (const pat of ASSET_PATTERNS) {
    if (pat.regex.test(`${params.parsed.filename} ${text}`)) {
      matchedCodes.add(pat.code);

      const existing = params.existingAssets.find(
        (a) =>
          a.building.toLowerCase() === building.toLowerCase() &&
          (a.asset_id.includes(`-${pat.code}-`) ||
            pat.regex.test(`${a.name} ${a.category}`))
      );

      const detectedMfr = manufacturers[0] || existing?.manufacturer || 'Unbekannt';
      const hasMfrConflict =
        Boolean(existing) &&
        manufacturers.length > 0 &&
        existing!.manufacturer !== 'Unbekannt' &&
        !existing!.manufacturer.toLowerCase().includes(manufacturers[0].toLowerCase());

      const hasRoomConflict =
        Boolean(existing) &&
        room !== 'Nicht spezifiziert' &&
        !existing!.floor_room.toLowerCase().includes(room.toLowerCase());

      const needsReview = hasMfrConflict || hasRoomConflict || !existing;
      const reviewReason = hasMfrConflict
        ? `Hersteller im neuen Dokument (${manufacturers[0]}) weicht vom Bestand (${existing!.manufacturer}) ab.`
        : hasRoomConflict
          ? `Raumangabe (${room}) weicht vom Bestand (${existing!.floor_room}) ab.`
          : !existing
            ? 'Neu durch lokalen Parser erkannte Anlage — Verknüpfung bitte kurz prüfen.'
            : '';

      candidateAssets.push({
        asset_id:
          existing?.asset_id ??
          `COB-${building.replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase() || 'OBJ'}-${pat.code}-${String(
            Math.floor(10 + Math.random() * 89)
          )}`,
        building,
        floor_room: room !== 'Nicht spezifiziert' ? room : existing?.floor_room ?? 'Nicht spezifiziert',
        category: pat.category,
        name: existing?.name ?? pat.defaultName,
        manufacturer: detectedMfr,
        model_or_spec: existing?.model_or_spec ?? '',
        install_year: existing?.install_year ?? 'Unbekannt',
        inspection_interval: pat.interval,
        last_inspection: docType === 'Prüfbericht' ? docDate : existing?.last_inspection ?? 'Unbekannt',
        next_inspection_due: existing?.next_inspection_due ?? 'Unbekannt',
        status,
        status_note: note,
        estimated_cost_eur: costEur ?? existing?.estimated_cost_eur ?? null,
        linked_doc_ids: [docId],
        confidence: hasMfrConflict || hasRoomConflict ? 0.62 : existing ? 0.88 : 0.72,
        needs_review: needsReview,
        review_reason: reviewReason,
        human_verified: false,
      });
    }
  }

  const firstSentence =
    chunks[0]?.text.split(/(?<=[.!?])\s+/)[0]?.slice(0, 220) ||
    params.parsed.parserNotes;

  const document: DocumentRecord = {
    doc_id: docId,
    filename: params.parsed.filename,
    extension: params.parsed.extension,
    file_path: `Upload/${building}/${params.parsed.filename}`,
    doc_type: docType,
    doc_date: docDate,
    building,
    summary: `${docType}: ${firstSentence}`,
    source_origin: 'uploaded',
    uploaded_at: new Date().toISOString(),
    linked_asset_ids: candidateAssets.map((a) => a.asset_id),
    chunks,
    extracted_facts: extractedFacts,
  };

  return { document, candidateAssets };
}

const BILINGUAL_SYNONYMS: Array<[string[], string[]]> = [
  [['fire', 'safety', 'alarm', 'protection', 'smoke'], ['brandschutz', 'bma', 'rwa', 't30', 'feuerschutz', 'brandmeldeanlage', 'rauchabzug']],
  [['roof', 'renovation', 'roadmap', 'cost', 'costs', 'budget'], ['dach', 'flachdach', 'sanierung', 'sanierungsfahrplan', 'kosten', 'kostenschätzung', 'eur', 'dämmung']],
  [['heating', 'boiler', 'fault', 'defect', 'conflict', 'mismatch'], ['heizung', 'heizkessel', 'brennwertkessel', 'störung', 'mangel', 'f04', 'viessmann', 'buderus', 'konflikt']],
  [['inspection', 'inspect', 'proof', 'missing', 'overdue', 'maintenance'], ['prüfung', 'prüfbericht', 'prüfpflicht', 'nachweis', 'fehlt', 'überfällig', 'wartung', 'datenlücke']],
];

const STOPWORDS = new Set([
  'which', 'what', 'where', 'when', 'how', 'with', 'that', 'this', 'from', 'have', 'been',
  'they', 'their', 'about', 'into', 'are', 'the', 'and', 'for', 'require', 'regular',
  'welche', 'welcher', 'welches', 'was', 'wie', 'wo', 'wann', 'mit', 'und', 'oder', 'der',
  'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'einer', 'müssen',
  'sind', 'ist', 'zum', 'zur', 'bei', 'von', 'für', 'über', 'noch', 'gibt', 'liegen',
  'vor', 'stand', 'inklusive', 'offener', 'bekannt',
]);

function expandQueryTokens(query: string): string[] {
  const baseTokens = query
    .toLowerCase()
    .split(/[\s,.;:!?/()-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));

  const expanded = new Set<string>(baseTokens);
  for (const [enTerms, deTerms] of BILINGUAL_SYNONYMS) {
    const allTerms = [...enTerms, ...deTerms];
    if (baseTokens.some((tok) => allTerms.some((term) => term.includes(tok) || tok.includes(term)))) {
      for (const term of allTerms) expanded.add(term);
    }
  }
  return Array.from(expanded);
}

const DE_EN_PHRASES: Array<[RegExp, string]> = [
  [/Genehmigtes Brandschutzkonzept mit Auflagen zu/gi, 'Approved fire safety concept with requirements for'],
  [/Wiederkehrende Prüfung der/gi, 'Recurring inspection of the'],
  [/Zustandsbegehung Hauptdach/gi, 'Condition survey of main roof'],
  [/Angebotsaufforderung \(83\) für/gi, 'Request for tender (GAEB 83) for'],
  [/E-Mail von Hausmeister Hr\. Müller an Hochbauamt/gi, 'Email from caretaker Mr. Müller to Building Authority'],
  [/Zentrales Excel-Anlagenkataster mit Kostenstellen und historischen Bestandsdaten\./gi, 'Central Excel asset register with cost centers and historical inventory records.'],
  [/Enthält älteren Eintrag/gi, 'Contains legacy entry'],
  [/weicht von Excel-Bestandsliste ab/gi, 'differs from Excel inventory register'],
  [/dort als (.+?) geführt/gi, 'listed there as $1'],
  [/Letzte Sachkundigenprüfung/gi, 'Last competent-person inspection'],
  [/Letzter Prüfbericht vom/gi, 'Latest inspection report dated'],
  [/Folgeprüfung/gi, 'Follow-up inspection'],
  [/überfällig oder noch nicht abgelegt/gi, 'overdue or not yet filed'],
  [/Im Brandschutzkonzept 2019 gefordert, jedoch kein Prüf- oder Wartungsbericht im Datenbestand gefunden\./gi, 'Required in the 2019 fire safety concept, but no inspection or maintenance report was found in the files.'],
  [/Versprödung und stehendes Wasser festgestellt/gi, 'Embrittlement and standing water observed'],
  [/PIR-Vollsanierung/gi, 'Full PIR insulation & roof replacement'],
  [/inkl\. PV-Vorbereitung empfohlen/gi, 'recommended incl. PV preparation'],
  [/Hausmeister-E-Mail vom/gi, 'Caretaker email dated'],
  [/meldet Störung F04 und Druckverlust/gi, 'reports fault code F04 and pressure loss'],
  [/Wartung 10\/2026 offen/gi, '10/2026 maintenance still pending'],
  [/Brandschutzkonzept/gi, 'Fire Safety Concept'],
  [/Prüfbericht/gi, 'Inspection Report'],
  [/Prüfgegenstand/gi, 'Inspected Asset'],
  [/Prüfergebnis/gi, 'Inspection Result'],
  [/Prüfdatum/gi, 'Inspection Date'],
  [/Prüfpflicht/gi, 'Inspection Requirement'],
  [/Prüfbuch/gi, 'Inspection Logbook'],
  [/Nächste fällige Prüfung gemäß/gi, 'Next inspection due per'],
  [/Nächste fällige Prüfung/gi, 'Next inspection due'],
  [/Nächste Prüfung/gi, 'Next inspection'],
  [/Brandmeldeanlage/gi, 'Fire Alarm System'],
  [/Rauch- und Wärmeabzugsanlage/gi, 'Smoke & Heat Extraction System'],
  [/Feuerschutzabschlüsse/gi, 'Fire-Rated Doors'],
  [/Rohrrahmentüren/gi, 'tubular frame doors'],
  [/Obentürschließer mit elektrischer Feststellanlage/gi, 'overhead door closers with electric hold-open device'],
  [/Feststellanlage/gi, 'Hold-Open Device'],
  [/Sturzrauchmelder/gi, 'lintel smoke detector'],
  [/Anlagentechnischer Brandschutz/gi, 'Technical Fire Protection'],
  [/keine Mängel festgestellt/gi, 'no defects found'],
  [/ohne sicherheitsrelevante Mängel/gi, 'without safety-relevant defects'],
  [/ohne Mängel/gi, 'without defects'],
  [/jährliche Prüfung/gi, 'annual inspection'],
  [/Jährliche Wartung & Funktionsprüfung/gi, 'Annual maintenance & functional test'],
  [/Jährliche Wartung/gi, 'Annual maintenance'],
  [/einmal jährlich dokumentiert werden/gi, 'be documented once a year'],
  [/jährlich/gi, 'annually'],
  [/monatliche Sichtprüfung/gi, 'monthly visual inspection'],
  [/monatlich auf Leichtgängigkeit/gi, 'monthly for smooth operation'],
  [/Flachdach des Altbaus/gi, 'Flat roof of the historic wing'],
  [/Flachdach/gi, 'Flat roof'],
  [/Dachsanierung/gi, 'Roof renovation'],
  [/Sanierungsfahrplan & Kostenannahmen/gi, 'Renovation Roadmap & Cost Assumptions'],
  [/Sanierungsfahrplan/gi, 'Renovation roadmap'],
  [/Bestandsaufnahme/gi, 'Condition survey'],
  [/Kostenschätzung brutto/gi, 'Gross cost estimate'],
  [/Sanierungskosten geschätzt/gi, 'Estimated renovation cost'],
  [/Kostenansatz netto/gi, 'Net cost estimate'],
  [/Statik-Nachweis noch ausstehend/gi, 'Structural engineering verification still pending'],
  [/kein Schadstofffund im Altbestand/gi, 'no hazardous materials in existing structure'],
  [/Geschätzte Heizenergie-Einsparung/gi, 'Estimated heating energy savings'],
  [/Gas-Brennwertkessel/gi, 'Gas Condensing Boiler'],
  [/Heizkessel/gi, 'Heating Boiler'],
  [/Heizraum/gi, 'Boiler Room'],
  [/Hausmeisterraum/gi, 'Caretaker Room'],
  [/Technikraum/gi, 'Utility Room'],
  [/Treppenhaus West/gi, 'West Stairwell'],
  [/Treppenhaus/gi, 'Stairwell'],
  [/Flurabschlüsse/gi, 'Corridor fire doors'],
  [/Brennerstörung/gi, 'Burner fault'],
  [/Fehlercode/gi, 'Error code'],
  [/Druckabfall/gi, 'Pressure drop'],
  [/Druckverlust/gi, 'Pressure loss'],
  [/verliert zudem Druck/gi, 'is also losing pressure'],
  [/Bitte Wartungsfirma dringend beauftragen/gi, 'Please commission maintenance contractor urgently'],
  [/Ausdehnungsgefäß/gi, 'Expansion vessel'],
  [/Typenschild/gi, 'Nameplate'],
  [/Hersteller/gi, 'Manufacturer'],
  [/Baujahr/gi, 'Year of construction'],
  [/Anlagenkataster/gi, 'Asset Register'],
  [/Anlagenstammdaten/gi, 'Asset Master Data'],
  [/Standortabweichung/gi, 'Location discrepancy'],
  [/Altdaten/gi, 'Legacy records'],
  [/Tabellenblatt/gi, 'Spreadsheet'],
  [/Zeile/gi, 'Row'],
  [/Seite/gi, 'Page'],
  [/Abschnitt/gi, 'Section'],
  [/Grundschule/gi, 'Primary School'],
  [/Verwaltungsgebäude/gi, 'Administration Building'],
  [/Liegenschaftsamt/gi, 'Municipal Property Office'],
  [/Stadt Coburg/gi, 'City of Coburg'],
  [/überfällig/gi, 'overdue'],
  [/Nachweis fehlt/gi, 'Proof missing'],
  [/Datenlücke/gi, 'Data gap'],
  [/Unbekannt/gi, 'Unknown'],
];

function translateTextOffline(input: string, targetLang: 'de' | 'en'): string {
  if (targetLang === 'de') return input;
  let out = input;
  for (const [pattern, replacement] of DE_EN_PHRASES) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

async function tryLocalOllamaJson<T>(prompt: string): Promise<T | null> {
  const ollamaUrl = process.env.OLLAMA_URL?.trim();
  if (!ollamaUrl) return null;

  const model = process.env.OLLAMA_MODEL?.trim() || 'llama3.1';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        prompt,
        format: 'json',
        stream: false,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { response?: string };
    if (!data.response) return null;
    return JSON.parse(data.response) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function askKnowledgeBaseLocally(params: {
  query: string;
  buildingFilter?: string;
  language?: 'de' | 'en';
  hits: ChunkSearchHit[];
  assets: AssetRecord[];
  allDocsMeta: Array<{
    doc_id: string;
    filename: string;
    doc_type: string;
    doc_date: string;
    building: string;
  }>;
}): Promise<AskResponse> {
  const lang = params.language === 'en' ? 'en' : 'de';
  const tokens = expandQueryTokens(params.query);

  const relevantAssets = params.assets.filter(
    (a) =>
      !params.buildingFilter ||
      params.buildingFilter === 'all' ||
      a.building === params.buildingFilter
  );

  // Weight core asset identity fields higher than generic status words
  const scoredAssets = relevantAssets
    .map((asset) => {
      const identityHay = `${asset.asset_id} ${asset.name} ${asset.category} ${asset.manufacturer} ${asset.model_or_spec}`.toLowerCase();
      const contextHay = `${asset.floor_room} ${asset.status_note} ${asset.review_reason}`.toLowerCase();
      let score = 0;
      for (const tok of tokens) {
        if (identityHay.includes(tok)) score += 5;
        else if (contextHay.includes(tok)) score += 1;
      }
      return { asset, score };
    })
    .sort((a, b) => b.score - a.score);

  const maxAssetScore = scoredAssets[0]?.score ?? 0;
  const threshold = maxAssetScore >= 5 ? 4 : 1;

  const selectedAssets =
    maxAssetScore > 0
      ? scoredAssets.filter((s) => s.score >= threshold).map((s) => s.asset)
      : relevantAssets;

  // Score chunks against expanded tokens across all hits
  const scoredHits = params.hits
    .map((hit) => {
      const hay = `${hit.filename} ${hit.doc_type} ${hit.building} ${hit.snippet}`.toLowerCase();
      let score = hit.score;
      for (const tok of tokens) {
        if (hay.includes(tok)) score += 3;
      }
      return { hit, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => x.hit);

  // Optional local Ollama synthesis if OLLAMA_URL is explicitly configured
  const ollamaResult = await tryLocalOllamaJson<{
    answer: string;
    findings: AnalysisFinding[];
    citations: SearchCitation[];
    data_gaps: string[];
    uncertainties_noted: string[];
  }>(
    `Respond strictly in JSON with keys {answer, findings, citations, data_gaps, uncertainties_noted} in ${
      lang === 'en' ? 'English' : 'German'
    } for query "${params.query}". Assets: ${JSON.stringify(
      selectedAssets
    )}. Passages: ${JSON.stringify(scoredHits)}`
  );

  if (ollamaResult && ollamaResult.answer) {
    return {
      query: params.query,
      answer: ollamaResult.answer,
      findings: ollamaResult.findings ?? [],
      citations: ollamaResult.citations ?? [],
      data_gaps: ollamaResult.data_gaps ?? [],
      uncertainties_noted: ollamaResult.uncertainties_noted ?? [],
      retrieved_doc_count: new Set(scoredHits.map((h) => h.doc_id)).size,
      analyzed_asset_count: relevantAssets.length,
    };
  }

  // Deterministic Local Retrieval & Synthesis (Zero API Keys)
  const docMap = new Map(params.allDocsMeta.map((d) => [d.doc_id, d]));

  const findings: AnalysisFinding[] = selectedAssets.map((asset) => {
    const primaryDocId = asset.linked_doc_ids[0] ?? '';
    const matchingHit =
      scoredHits.find((h) => h.linked_asset_ids.includes(asset.asset_id)) ??
      scoredHits.find((h) => h.doc_id === primaryDocId);

    const detail =
      lang === 'en'
        ? translateTextOffline(asset.status_note, 'en')
        : asset.status_note;

    return {
      title: lang === 'en' ? translateTextOffline(asset.name, 'en') : asset.name,
      asset_id: asset.asset_id,
      building: asset.building,
      finding_type: asset.status,
      detail,
      doc_id: matchingHit?.doc_id ?? primaryDocId,
      quote: matchingHit?.snippet.slice(0, 220) ?? asset.status_note,
    };
  });

  const citations: SearchCitation[] = scoredHits.slice(0, 5).map((h) => ({
    doc_id: h.doc_id,
    filename: h.filename,
    doc_type: h.doc_type,
    page_or_section: h.page_or_section,
    quote: h.snippet.slice(0, 240),
  }));

  const dataGaps: string[] = [];
  for (const a of selectedAssets) {
    if (a.status === 'missing_proof') {
      dataGaps.push(
        lang === 'en'
          ? `${a.name} (${a.asset_id}): Required in concept/register, but no inspection report was found in the indexed files.`
          : `${a.name} (${a.asset_id}): Im Bestand/Konzept gefordert, jedoch kein Prüf- oder Wartungsbericht in den Dokumenten vorhanden.`
      );
    } else if (a.status === 'overdue') {
      dataGaps.push(
        lang === 'en'
          ? `${a.name} (${a.asset_id}): Last inspection ${a.last_inspection}, follow-up due ${a.next_inspection_due} — newer certificate missing.`
          : `${a.name} (${a.asset_id}): Letzte Prüfung ${a.last_inspection}, fällig ${a.next_inspection_due} — neuerer Nachweis fehlt noch.`
      );
    } else if (a.manufacturer.includes('Unbekannt')) {
      dataGaps.push(
        lang === 'en'
          ? `${a.name} (${a.asset_id}): Manufacturer / model not recorded in available documents.`
          : `${a.name} (${a.asset_id}): Hersteller / Modellangabe in den vorliegenden Dokumenten nicht erfasst.`
      );
    }
  }

  const uncertainties: string[] = selectedAssets
    .filter((a) => a.needs_review)
    .map((a) =>
      lang === 'en'
        ? `${a.name} (${a.asset_id}): ${translateTextOffline(a.review_reason, 'en')}`
        : `${a.name} (${a.asset_id}): ${a.review_reason}`
    );

  const summaryLines = selectedAssets.map((a) => {
    const docsText = a.linked_doc_ids
      .map((id) => docMap.get(id)?.filename ?? id)
      .join(', ');
    if (lang === 'en') {
      return `• ${translateTextOffline(a.name, 'en')} [${a.asset_id}] (${a.building}): ${translateTextOffline(
        a.status_note,
        'en'
      )} (Sources: ${docsText || 'none'})`;
    }
    return `• ${a.name} [${a.asset_id}] (${a.building}): ${a.status_note} (Quellen: ${
      docsText || 'keine'
    })`;
  });

  const intro =
    lang === 'en'
      ? `Local analysis across ${selectedAssets.length} matching asset(s) and ${new Set(
          scoredHits.map((h) => h.doc_id)
        ).size} document(s):\n\n`
      : `Lokale Auswertung über ${selectedAssets.length} passende Anlage(n) und ${new Set(
          scoredHits.map((h) => h.doc_id)
        ).size} Dokument(e):\n\n`;

  const answer =
    selectedAssets.length > 0
      ? `${intro}${summaryLines.join('\n')}`
      : lang === 'en'
        ? 'No matching assets or passages were found for this query in the current building filter.'
        : 'Für diese Suchanfrage wurden im gewählten Gebäudefilter keine passenden Anlagen oder Textpassagen gefunden.';

  return {
    query: params.query,
    answer,
    findings,
    citations,
    data_gaps: dataGaps,
    uncertainties_noted: uncertainties,
    retrieved_doc_count: new Set(scoredHits.map((h) => h.doc_id)).size,
    analyzed_asset_count: relevantAssets.length,
  };
}

export async function translateDocumentLocally(
  doc: DocumentRecord,
  targetLanguage: 'de' | 'en'
): Promise<TranslatedDocumentView> {
  const ollamaTranslated = await tryLocalOllamaJson<{
    summary: string;
    extracted_facts: ExtractedFact[];
    chunks: Array<{ chunk_id: string; page_or_section: string; text: string }>;
  }>(
    `Translate the fields into ${
      targetLanguage === 'en' ? 'English' : 'German'
    } and return valid JSON with keys {summary, extracted_facts, chunks}: ${JSON.stringify({
      summary: doc.summary,
      extracted_facts: doc.extracted_facts,
      chunks: doc.chunks,
    })}`
  );

  if (ollamaTranslated && ollamaTranslated.summary) {
    return {
      doc_id: doc.doc_id,
      target_language: targetLanguage,
      summary: ollamaTranslated.summary,
      extracted_facts: ollamaTranslated.extracted_facts ?? doc.extracted_facts,
      chunks: ollamaTranslated.chunks ?? doc.chunks,
    };
  }

  return {
    doc_id: doc.doc_id,
    target_language: targetLanguage,
    summary: translateTextOffline(doc.summary, targetLanguage),
    extracted_facts: doc.extracted_facts.map((f) => ({
      label: translateTextOffline(f.label, targetLanguage),
      value: translateTextOffline(f.value, targetLanguage),
      page_or_section: translateTextOffline(f.page_or_section, targetLanguage),
      quote: translateTextOffline(f.quote, targetLanguage),
    })),
    chunks: doc.chunks.map((c) => ({
      chunk_id: c.chunk_id,
      page_or_section: translateTextOffline(c.page_or_section, targetLanguage),
      text: translateTextOffline(c.text, targetLanguage),
    })),
  };
}
