import type { AssetStatus } from './types/knowledge.ts';

export type AppLang = 'de' | 'en';

export const STATUS_LABELS: Record<AppLang, Record<AssetStatus, string>> = {
  de: {
    compliant: 'Prüfung aktuell',
    due_soon: 'Maßnahme / Frist geplant',
    overdue: 'Prüffrist überfällig',
    missing_proof: 'Nachweis fehlt (Datenlücke)',
    defect_reported: 'Mangel gemeldet',
  },
  en: {
    compliant: 'Inspection current',
    due_soon: 'Action / deadline planned',
    overdue: 'Inspection overdue',
    missing_proof: 'Missing proof (data gap)',
    defect_reported: 'Defect reported',
  },
};

export const PRESET_QUERIES: Record<
  AppLang,
  Array<{ shortLabel: string; query: string }>
> = {
  de: [
    {
      shortLabel: '01. Brandschutz & fehlende Prüfberichte',
      query:
        'Welche Einrichtungen des Brandschutzes müssen regelmäßig geprüft werden und wo fehlen Nachweise?',
    },
    {
      shortLabel: '02. Sanierungsfahrplan Flachdach',
      query:
        'Wie ist der Stand zum Sanierungsfahrplan Flachdach Neuses inklusive Kosten und offener Annahmen?',
    },
    {
      shortLabel: '03. Heizung Mängel & Widersprüche',
      query:
        'Welche Störungen oder widersprüchlichen Stammdaten liegen bei der Heizungsanlage vor?',
    },
  ],
  en: [
    {
      shortLabel: '01. Fire safety & missing inspection proofs',
      query:
        'Which fire protection systems require regular inspection and where are inspection proofs missing?',
    },
    {
      shortLabel: '02. Flat roof renovation roadmap',
      query:
        'What is the status of the Neuses flat roof renovation plan including estimated costs and open assumptions?',
    },
    {
      shortLabel: '03. Heating defects & conflicting records',
      query:
        'What faults or conflicting master data exist for the heating system?',
    },
  ],
};

export const UI_COPY = {
  de: {
    brand: 'Coburg Liegenschafts-KI',
    municipality: 'Stadt Coburg',
    languageLabel: 'Sprache',
    nav: {
      search: 'KI-Suche & Analyse',
      assets: 'Anlagen & Prüfungen',
      documents: 'Dokumente & Upload',
      reviews: 'Prüfbedarf / Konflikte',
    },
    header: {
      allBuildings: 'Alle Liegenschaften',
      uploadCta: 'Dokument hochladen',
      openNav: 'Navigation öffnen',
      closeNav: 'Menü schließen',
    },
    sidebarSummary: {
      title: 'Bestandsübersicht',
      docsIndexed: 'Dokumente indiziert',
      openIssues: 'Prüffrist / Lücke offen',
      conflictsToReview: 'Konflikte zu prüfen',
    },
    loadingError: 'Wissensbasis nicht erreichbar',
    searchView: {
      heading: 'Quellenbasierte KI-Suche & Bestandsanalyse',
      subheading:
        'Durchsuchen Sie verknüpfte Dokumente und Anlagenstammdaten in natürlicher Sprache. Fehlende Prüfberichte werden strikt als Datenlücke ausgewiesen.',
      placeholder: 'Frage zu Prüfpflichten, Mängeln, Verträgen oder Sanierung stellen...',
      analyzing: 'Analysiere...',
      startAnalysis: 'KI-Analyse starten',
      examplesLabel: 'Beispielfragen:',
      errorTitle: 'KI-Abfrage fehlgeschlagen',
      synthesisLabel: 'KI-Synthese',
      docsWord: 'Dokumente',
      assetsCheckedWord: 'Anlagen geprüft',
      findingsHeading: 'Strukturierte Prüfbefunde',
      viewSource: 'Quelle im Original ansehen',
      dataGapsHeading: 'Erkannte Datenlücken',
      uncertaintiesHeading: 'Offene Zuordnungs-Unsicherheiten',
      reviewAction: 'Prüfen',
      citationsHeading: 'Verwendete Quellennachweise',
      emptyTitle: 'Bereit für Ihre erste Bestandsabfrage',
      emptyBody:
        'Klicken Sie auf „KI-Analyse starten“ oder wählen Sie oben eine der drei Beispielfragen zu Brandschutz, Sanierungsfahrplan oder Störungen.',
      emptyCta: 'Beispielabfrage jetzt ausführen',
      hitsHeading: 'Direkttreffer in Dokumentpassagen',
      hitsSubheading: 'Live-Volltextabgleich über alle indizierten Formate',
      hitsWord: 'Treffer',
      noHits:
        'Keine direkten Schlüsselwort-Treffer. Starten Sie eine KI-Analyse für semantische Auswertung über alle Anlagendaten.',
    },
    assetsView: {
      reviewsTitle: 'Prüfbedarf & unsichere Verknüpfungen',
      allTitle: 'Anlagenkataster & Prüffristen',
      reviewsSubtitle:
        'Bestätigen oder korrigieren Sie widersprüchliche KI-Extraktionen. Korrekturen fließen dauerhaft in alle Abfragen ein.',
      allSubtitle:
        'Eindeutige Anlagen-IDs über alle Gebäude mit verknüpften Nachweisen und Prüfstatus.',
      filters: {
        all: 'Alle',
        action: 'Handlungsbedarf',
        missing: 'Nachweis fehlt',
        ok: 'Aktuell',
      },
      emptyReviewsTitle: 'Alle KI-Zuordnungen bestätigt',
      emptyAllTitle: 'Keine Anlagen in diesem Filter',
      emptyReviewsBody:
        'Aktuell liegen keine widersprüchlichen Stammdaten oder unsicheren Verknüpfungen vor.',
      emptyAllBody: 'Wählen Sie einen anderen Filter oder laden Sie neue Dokumente hoch.',
      cols: {
        asset: 'Anlage / ID',
        buildingRoom: 'Gebäude & Raum',
        manufacturer: 'Hersteller / Typ',
        inspections: 'Letzte / Nächste Prüfung',
        status: 'Status',
        estimate: 'Schätzwert',
        confidenceAction: 'Konfidenz & Aktion',
      },
      lastPrefix: 'Letzte:',
      duePrefix: 'Fällig:',
      verifiedPrefix: 'Verifiziert:',
      confirmedTag: 'bestätigt',
      cancel: 'Abbrechen',
      resolveConflict: 'Konflikt lösen',
      edit: 'Bearbeiten',
      editHeading: 'Stammdaten prüfen & bestätigen',
      fieldManufacturer: 'Führender Hersteller',
      fieldRoom: 'Korrekter Raum / Standort',
      fieldStatus: 'Prüfstatus',
      fieldNote: 'Prüfvermerk',
      fieldNotePlaceholder: 'z. B. Laut Typenschild bestätigt',
      saving: 'Speichere...',
      confirmSave: 'Zuordnung dauerhaft bestätigen',
    },
    documentsView: {
      heading: 'Dokumenten-Ingestion & Quellenverzeichnis',
      subheading:
        'Laden Sie Rohdaten hoch (.pdf, .docx, .doc, .msg, .x83 GAEB, .xlsx, .jpg). Die lokale Analyse-Engine klassifiziert, extrahiert Fakten und verknüpft sie mit Anlagen-IDs.',
      resetting: 'Setze zurück...',
      resetSample: 'Beispielbestand zurücksetzen',
      buildingHintLabel: 'Gebäude-Zuordnung (optional — sonst erkennt System aus Inhalt)',
      buildingHintPlaceholder: 'z. B. Grundschule Coburg-Neuses',
      supportedFormats:
        'Unterstützte Formate: PDF (Text), Word (.docx / .doc), GAEB XML (.x83, .p83), Excel/CSV (.xlsx, .xls), Outlook (.msg), Fotos (.jpg, .png).',
      extractingHint: 'Extrahiere Textpassagen, Anlagenbezüge und Konfidenzwerte lokal...',
      selectFiles: 'Dateien auswählen & indizieren',
      dropHint:
        'Oder Dateien aus Ihrem Coburg-Datenordner direkt hierher ziehen (max. 20 MB/Datei)',
      viewExtraction: 'Extraktion ansehen',
      indexedDocs: 'Indizierte Dokumente',
      docTypeLabel: 'Dokumenttyp:',
      allTypes: 'Alle Typen',
      cols: {
        doc: 'Dokument',
        typeDate: 'Typ & Datum',
        building: 'Gebäude',
        summary: 'Zusammenfassung',
        chunksAssets: 'Passagen / Anlagen',
        action: 'Aktion',
      },
      originUpload: 'Upload',
      originSample: 'Beispiel',
      passagesWord: 'Passagen',
      assetsWord: 'Anlagen',
      inspect: 'Ansehen',
    },
    drawer: {
      closeLabel: 'Dokumentenansicht schließen',
      buildingSummary: 'Gebäude & Zusammenfassung',
      linkedAssets: 'Verknüpfte Anlagen',
      openAsset: 'Öffnen',
      extractedFacts: 'Extrahierte Fakten',
      indexedPassages: 'Indizierte Originalpassagen',
      citedPassage: 'Zitierte Fundstelle',
      translateToEn: 'Ins Englische übersetzen',
      translating: 'Übersetze...',
      showOriginal: 'Originaltext anzeigen',
      translatedBadge: 'Englische Übersetzung aktiv (lokal)',
    },
  },
  en: {
    brand: 'Coburg Property AI',
    municipality: 'City of Coburg',
    languageLabel: 'Language',
    nav: {
      search: 'AI Search & Analysis',
      assets: 'Assets & Inspections',
      documents: 'Documents & Upload',
      reviews: 'Review / Conflicts',
    },
    header: {
      allBuildings: 'All Properties',
      uploadCta: 'Upload Document',
      openNav: 'Open navigation',
      closeNav: 'Close menu',
    },
    sidebarSummary: {
      title: 'Portfolio Overview',
      docsIndexed: 'Documents indexed',
      openIssues: 'Overdue / missing proof',
      conflictsToReview: 'Conflicts to review',
    },
    loadingError: 'Knowledge base unreachable',
    searchView: {
      heading: 'Source-Grounded AI Search & Portfolio Analysis',
      subheading:
        'Query linked facility documents and asset records in natural language. Missing inspection certificates are strictly reported as data gaps.',
      placeholder:
        'Ask about inspection obligations, reported defects, contracts, or renovation plans...',
      analyzing: 'Analyzing...',
      startAnalysis: 'Run AI Analysis',
      examplesLabel: 'Sample queries:',
      errorTitle: 'AI query failed',
      synthesisLabel: 'AI Synthesis',
      docsWord: 'documents',
      assetsCheckedWord: 'assets checked',
      findingsHeading: 'Structured Audit Findings',
      viewSource: 'View original source',
      dataGapsHeading: 'Detected Data Gaps',
      uncertaintiesHeading: 'Open Mapping Uncertainties',
      reviewAction: 'Review',
      citationsHeading: 'Source Citations',
      emptyTitle: 'Ready for your first portfolio query',
      emptyBody:
        'Click "Run AI Analysis" or pick one of the three sample queries above covering fire safety, roof renovation, or heating defects.',
      emptyCta: 'Run sample query now',
      hitsHeading: 'Direct Passage Matches',
      hitsSubheading: 'Live full-text search across all indexed formats',
      hitsWord: 'hits',
      noHits:
        'No direct keyword matches. Click "Run AI Analysis" for semantic synthesis across all asset records.',
    },
    assetsView: {
      reviewsTitle: 'Review Queue & Uncertain Links',
      allTitle: 'Asset Register & Inspection Schedule',
      reviewsSubtitle:
        'Confirm or correct conflicting AI extractions. Verified updates persist across all future queries.',
      allSubtitle:
        'Canonical Asset IDs across all buildings with linked documentary evidence and inspection status.',
      filters: {
        all: 'All',
        action: 'Needs Action',
        missing: 'Missing Proof',
        ok: 'Compliant',
      },
      emptyReviewsTitle: 'All AI mappings verified',
      emptyAllTitle: 'No assets match this filter',
      emptyReviewsBody:
        'There are currently no conflicting master records or uncertain document links.',
      emptyAllBody: 'Choose another filter or upload new property documents.',
      cols: {
        asset: 'Asset / ID',
        buildingRoom: 'Building & Room',
        manufacturer: 'Manufacturer / Model',
        inspections: 'Last / Next Inspection',
        status: 'Status',
        estimate: 'Est. Value',
        confidenceAction: 'Confidence & Action',
      },
      lastPrefix: 'Last:',
      duePrefix: 'Due:',
      verifiedPrefix: 'Verified:',
      confirmedTag: 'verified',
      cancel: 'Cancel',
      resolveConflict: 'Resolve conflict',
      edit: 'Edit',
      editHeading: 'Verify & confirm asset master data',
      fieldManufacturer: 'Authoritative Manufacturer',
      fieldRoom: 'Confirmed Room / Location',
      fieldStatus: 'Inspection Status',
      fieldNote: 'Verification Note',
      fieldNotePlaceholder: 'e.g. Confirmed against nameplate photo',
      saving: 'Saving...',
      confirmSave: 'Confirm mapping permanently',
    },
    documentsView: {
      heading: 'Document Ingestion & Source Directory',
      subheading:
        'Upload raw files (.pdf, .docx, .doc, .msg, .x83 GAEB, .xlsx, .jpg). The local engine classifies documents, extracts facts, and links Asset IDs.',
      resetting: 'Resetting...',
      resetSample: 'Reset sample dataset',
      buildingHintLabel: 'Building assignment (optional — auto-detected from content otherwise)',
      buildingHintPlaceholder: 'e.g. Grundschule Coburg-Neuses',
      supportedFormats:
        'Supported formats: PDF (text), Word (.docx / .doc), GAEB XML (.x83, .p83), Excel/CSV (.xlsx, .xls), Outlook (.msg), Photos (.jpg, .png).',
      extractingHint: 'Extracting passages, asset links, and confidence scores locally...',
      selectFiles: 'Select & index files',
      dropHint:
        'Or drag and drop files directly from your Coburg dataset folder (max 20 MB/file)',
      viewExtraction: 'Inspect extraction',
      indexedDocs: 'Indexed Documents',
      docTypeLabel: 'Document type:',
      allTypes: 'All types',
      cols: {
        doc: 'Document',
        typeDate: 'Type & Date',
        building: 'Building',
        summary: 'Summary',
        chunksAssets: 'Passages / Assets',
        action: 'Action',
      },
      originUpload: 'Upload',
      originSample: 'Sample',
      passagesWord: 'passages',
      assetsWord: 'assets',
      inspect: 'Inspect',
    },
    drawer: {
      closeLabel: 'Close document viewer',
      buildingSummary: 'Building & Summary',
      linkedAssets: 'Linked Assets',
      openAsset: 'Open',
      extractedFacts: 'Extracted Facts',
      indexedPassages: 'Indexed Original Passages',
      citedPassage: 'Cited passage',
      translateToEn: 'Translate to English',
      translating: 'Translating...',
      showOriginal: 'Show original (DE)',
      translatedBadge: 'Translated to English locally',
    },
  },
} as const;
