import { useRef, useState } from 'react';
import {
  UploadCloud,
  FileText,
  Trash2,
  RotateCcw,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import type { AssetRecord, DocumentRecord } from '../types/knowledge.ts';
import { UI_COPY, type AppLang } from '../i18n.ts';

interface DocumentsUploadViewProps {
  documents: DocumentRecord[];
  buildings: string[];
  buildingFilter: string;
  lang: AppLang;
  onOpenDocument: (docId: string) => void;
  onIngested: (doc: DocumentRecord, assetsAffected: AssetRecord[]) => void;
  onDeleteDocument: (docId: string) => Promise<void>;
  onResetSample: () => Promise<void>;
}

interface IngestFeedback {
  filename: string;
  docId: string;
  docType: string;
  building: string;
  parserNotes: string;
  assetCount: number;
}

export function DocumentsUploadView({
  documents,
  buildings,
  buildingFilter,
  lang,
  onOpenDocument,
  onIngested,
  onDeleteDocument,
  onResetSample,
}: DocumentsUploadViewProps) {
  const t = UI_COPY[lang].documentsView;

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [buildingHint, setBuildingHint] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [recentIngest, setRecentIngest] = useState<IngestFeedback | null>(null);
  const [docTypeFilter, setDocTypeFilter] = useState<string>('all');
  const [resetting, setResetting] = useState(false);

  const visibleDocs = documents.filter((d) => {
    if (buildingFilter !== 'all' && d.building !== buildingFilter) return false;
    if (docTypeFilter !== 'all' && d.doc_type !== docTypeFilter) return false;
    return true;
  });

  const docTypes = Array.from(new Set(documents.map((d) => d.doc_type))).sort();

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    setUploading(true);
    setErrorMsg(null);
    setRecentIngest(null);

    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        setUploadStatus(`${file.name} (${i + 1}/${fileList.length})...`);

        const formData = new FormData();
        formData.append('file', file);
        if (buildingHint.trim()) {
          formData.append('building', buildingHint.trim());
        } else if (buildingFilter !== 'all') {
          formData.append('building', buildingFilter);
        }

        const res = await fetch('/api/ingest', {
          method: 'POST',
          body: formData,
        });
        const json = (await res.json()) as {
          document?: DocumentRecord;
          assetsAffected?: AssetRecord[];
          parserNotes?: string;
          error?: string;
        };

        if (!res.ok || !json.document) {
          throw new Error(json.error || `Upload failed: ${file.name}`);
        }

        onIngested(json.document, json.assetsAffected ?? []);
        setRecentIngest({
          filename: json.document.filename,
          docId: json.document.doc_id,
          docType: json.document.doc_type,
          building: json.document.building,
          parserNotes: json.parserNotes || '',
          assetCount: json.assetsAffected?.length ?? 0,
        });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'File ingest failed.');
    } finally {
      setUploading(false);
      setUploadStatus('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handleReset() {
    setResetting(true);
    try {
      await onResetSample();
      setRecentIngest(null);
      setErrorMsg(null);
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
            {t.heading}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{t.subheading}</p>
        </div>

        <button
          type="button"
          disabled={resetting}
          onClick={() => void handleReset()}
          className="px-3.5 py-2 border border-slate-300 bg-white text-slate-700 text-xs font-medium rounded-md hover:bg-slate-50 inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{resetting ? t.resetting : t.resetSample}</span>
        </button>
      </div>

      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-4 space-y-3">
            <label className="block text-xs font-medium text-slate-700">
              {t.buildingHintLabel}
              <input
                type="text"
                list="coburg-buildings-list"
                value={buildingHint}
                onChange={(e) => setBuildingHint(e.target.value)}
                placeholder={t.buildingHintPlaceholder}
                className="mt-1.5 w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:border-blue-700"
              />
              <datalist id="coburg-buildings-list">
                {buildings.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </label>
            <p className="text-xs text-slate-500 leading-relaxed">{t.supportedFormats}</p>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void handleFiles(e.dataTransfer.files);
            }}
            className="lg:col-span-8 border border-dashed border-slate-300 rounded-lg p-6 text-center bg-slate-50/60 hover:border-blue-600 transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.msg,.eml,.xlsx,.xls,.xlsm,.csv,.x81,.x82,.x83,.x84,.p81,.p83,.xml,.txt,.md,.rtf,.jpg,.jpeg,.png,.webp"
              onChange={(e) => void handleFiles(e.target.files)}
              className="hidden"
              id="ingest-file-input"
            />

            {uploading ? (
              <div className="py-3 space-y-2">
                <Loader2 className="w-6 h-6 text-blue-700 animate-spin mx-auto" />
                <div className="text-sm font-medium text-slate-900">{uploadStatus}</div>
                <p className="text-xs text-slate-500">{t.extractingHint}</p>
              </div>
            ) : (
              <div className="space-y-3">
                <UploadCloud className="w-7 h-7 text-slate-400 mx-auto" />
                <div>
                  <label
                    htmlFor="ingest-file-input"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-xs font-medium rounded-md hover:bg-blue-800 transition-colors cursor-pointer"
                  >
                    {t.selectFiles}
                  </label>
                </div>
                <p className="text-xs text-slate-500">{t.dropHint}</p>
              </div>
            )}
          </div>
        </div>

        {errorMsg && (
          <div className="mt-4 p-3.5 border border-red-200 bg-red-50 rounded-md flex items-start gap-2.5 text-xs text-red-900">
            <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {recentIngest && (
          <div className="mt-4 p-3.5 border border-emerald-200 bg-emerald-50/50 rounded-md flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-2.5 text-emerald-950">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">{recentIngest.filename}</span> ·{' '}
                <span className="font-medium">{recentIngest.docType}</span> ·{' '}
                <span className="font-medium">{recentIngest.building}</span> (
                {recentIngest.assetCount} {t.assetsWord}).{' '}
                <span className="text-slate-600">{recentIngest.parserNotes}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenDocument(recentIngest.docId)}
              className="font-medium text-blue-700 hover:underline whitespace-nowrap cursor-pointer"
            >
              {t.viewExtraction}
            </button>
          </div>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900 tabular-nums">
            {t.indexedDocs} ({visibleDocs.length})
          </div>

          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="doctype-filter" className="text-slate-500">
              {t.docTypeLabel}
            </label>
            <select
              id="doctype-filter"
              value={docTypeFilter}
              onChange={(e) => setDocTypeFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-slate-800"
            >
              <option value="all">{t.allTypes}</option>
              {docTypes.map((dt) => (
                <option key={dt} value={dt}>
                  {dt}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">{t.cols.doc}</th>
                <th className="py-3 px-4">{t.cols.typeDate}</th>
                <th className="py-3 px-4">{t.cols.building}</th>
                <th className="py-3 px-4">{t.cols.summary}</th>
                <th className="py-3 px-4 text-right">{t.cols.chunksAssets}</th>
                <th className="py-3 px-4 text-right">{t.cols.action}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleDocs.map((doc) => (
                <tr key={doc.doc_id} className="hover:bg-slate-50/70 align-top transition-colors">
                  <td className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => onOpenDocument(doc.doc_id)}
                      className="text-left group cursor-pointer"
                    >
                      <div className="font-mono text-xs text-slate-500">
                        {doc.doc_id} ·{' '}
                        {doc.source_origin === 'uploaded' ? t.originUpload : t.originSample}
                      </div>
                      <div className="font-medium text-blue-700 group-hover:underline flex items-center gap-1.5 mt-0.5">
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                        <span>{doc.filename}</span>
                      </div>
                    </button>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap text-xs">
                    <div className="font-medium text-slate-900">{doc.doc_type}</div>
                    <div className="font-mono tabular-nums text-slate-500 mt-0.5">
                      {doc.doc_date}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs font-medium text-slate-800">{doc.building}</td>
                  <td className="py-3 px-4 text-xs text-slate-600 max-w-md leading-relaxed">
                    {doc.summary}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs tabular-nums text-slate-700 whitespace-nowrap">
                    {doc.chunks.length} {t.passagesWord} · {doc.linked_asset_ids.length}{' '}
                    {t.assetsWord}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenDocument(doc.doc_id)}
                        className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
                      >
                        {t.inspect}
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDeleteDocument(doc.doc_id)}
                        aria-label={`${doc.filename} entfernen`}
                        className="p-1.5 text-slate-400 hover:text-red-700 rounded transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
