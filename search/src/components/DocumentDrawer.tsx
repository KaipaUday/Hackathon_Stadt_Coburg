import { useEffect, useState } from 'react';
import { X, FileText, Link2, ExternalLink, Languages, Loader2 } from 'lucide-react';
import type { AssetRecord, DocumentRecord } from '../types/knowledge.ts';
import { UI_COPY, type AppLang } from '../i18n.ts';

interface TranslatedContent {
  doc_id: string;
  target_language: 'de' | 'en';
  summary: string;
  extracted_facts: DocumentRecord['extracted_facts'];
  chunks: DocumentRecord['chunks'];
}

interface DocumentDrawerProps {
  doc: DocumentRecord | null;
  highlightQuote?: string;
  highlightSection?: string;
  assets: AssetRecord[];
  lang: AppLang;
  onClose: () => void;
  onSelectAsset?: (assetId: string) => void;
}

export function DocumentDrawer({
  doc,
  highlightQuote,
  highlightSection,
  assets,
  lang,
  onClose,
  onSelectAsset,
}: DocumentDrawerProps) {
  const t = UI_COPY[lang].drawer;
  const [translated, setTranslated] = useState<TranslatedContent | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);

  useEffect(() => {
    setTranslated(null);
    setTranslateError(null);
  }, [doc?.doc_id]);

  if (!doc) return null;

  const activeDoc = doc;
  const linkedAssets = assets.filter((a) => activeDoc.linked_asset_ids.includes(a.asset_id));

  const showingEnglish = translated?.target_language === 'en';
  const displaySummary = translated ? translated.summary : activeDoc.summary;
  const displayFacts = translated ? translated.extracted_facts : activeDoc.extracted_facts;
  const displayChunks = translated ? translated.chunks : activeDoc.chunks;

  async function handleTranslate() {
    if (showingEnglish) {
      setTranslated(null);
      return;
    }
    setTranslating(true);
    setTranslateError(null);
    try {
      const res = await fetch(`/api/documents/${encodeURIComponent(activeDoc.doc_id)}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'en' }),
      });
      const json = (await res.json()) as TranslatedContent & { error?: string };
      if (!res.ok) {
        throw new Error(json.error || 'Translation failed.');
      }
      setTranslated(json);
    } catch (err) {
      setTranslateError(err instanceof Error ? err.message : 'Translation failed.');
    } finally {
      setTranslating(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/25"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-doc-title"
    >
      <div className="w-full max-w-2xl bg-white h-full border-l border-slate-200 flex flex-col shadow-xl">
        <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
              <span>{activeDoc.doc_id}</span>
              <span aria-hidden="true">·</span>
              <span>{activeDoc.doc_type}</span>
              <span aria-hidden="true">·</span>
              <span>{activeDoc.doc_date}</span>
            </div>
            <h2
              id="drawer-doc-title"
              className="mt-1 text-base font-semibold text-slate-900 truncate"
            >
              {activeDoc.filename}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 truncate">{activeDoc.file_path}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={translating}
              onClick={() => void handleTranslate()}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                showingEnglish
                  ? 'border-blue-700 bg-blue-50 text-blue-800'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-blue-700 hover:text-blue-700'
              }`}
            >
              {translating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Languages className="w-3.5 h-3.5" />
              )}
              <span>
                {translating
                  ? t.translating
                  : showingEnglish
                    ? t.showOriginal
                    : t.translateToEn}
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-blue-700 cursor-pointer"
              aria-label={t.closeLabel}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {translateError && (
            <div className="p-3 border border-red-200 bg-red-50 rounded-md text-xs text-red-900">
              {translateError}
            </div>
          )}

          {showingEnglish && (
            <div className="text-xs font-medium text-blue-800 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
              {t.translatedBadge}
            </div>
          )}

          <div>
            <h3 className="text-xs font-semibold text-slate-500 mb-1.5">
              {t.buildingSummary}
            </h3>
            <p className="text-sm font-medium text-slate-900">{activeDoc.building}</p>
            <p className="mt-1 text-sm text-slate-600 leading-relaxed">{displaySummary}</p>
          </div>

          {linkedAssets.length > 0 && (
            <div className="pt-4 border-t border-slate-200">
              <h3 className="text-xs font-semibold text-slate-500 mb-2">
                {t.linkedAssets} ({linkedAssets.length})
              </h3>
              <div className="space-y-2">
                {linkedAssets.map((asset) => (
                  <button
                    key={asset.asset_id}
                    type="button"
                    onClick={() => onSelectAsset?.(asset.asset_id)}
                    className="w-full text-left px-3 py-2.5 border border-slate-200 rounded-md hover:border-blue-600 hover:bg-blue-50/30 transition-colors flex items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-mono text-slate-500">{asset.asset_id}</div>
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {asset.name}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 shrink-0">
                      <Link2 className="w-3.5 h-3.5" />
                      {t.openAsset}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {displayFacts.length > 0 && (
            <div className="pt-4 border-t border-slate-200">
              <h3 className="text-xs font-semibold text-slate-500 mb-2">
                {t.extractedFacts}
              </h3>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                {displayFacts.map((fact, idx) => (
                  <div key={idx} className="px-3.5 py-2.5 text-sm">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="font-medium text-slate-700">{fact.label}</span>
                      <span className="text-xs text-slate-500 shrink-0">
                        {fact.page_or_section}
                      </span>
                    </div>
                    <div className="mt-0.5 font-medium text-slate-900">{fact.value}</div>
                    {fact.quote && (
                      <p className="mt-1 text-xs text-slate-500 italic">“{fact.quote}”</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-slate-200">
            <h3 className="text-xs font-semibold text-slate-500 mb-2">
              {t.indexedPassages} ({displayChunks.length})
            </h3>
            <div className="space-y-3">
              {displayChunks.map((chunk) => {
                const origChunk = activeDoc.chunks.find(
                  (c) => c.chunk_id === chunk.chunk_id
                );
                const matchText = origChunk?.text ?? chunk.text;
                const matchSection = origChunk?.page_or_section ?? chunk.page_or_section;
                const isHighlighted =
                  (highlightSection &&
                    matchSection.toLowerCase().includes(highlightSection.toLowerCase())) ||
                  (highlightQuote &&
                    highlightQuote.length > 12 &&
                    matchText
                      .toLowerCase()
                      .includes(highlightQuote.slice(0, 28).toLowerCase()));

                return (
                  <div
                    key={chunk.chunk_id}
                    className={`p-3.5 rounded-md border text-sm leading-relaxed ${
                      isHighlighted
                        ? 'border-blue-600 bg-blue-50/50 text-slate-900'
                        : 'border-slate-200 bg-slate-50/50 text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5 text-xs">
                      <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
                        <FileText className="w-3.5 h-3.5 text-slate-500" />
                        {chunk.page_or_section}
                      </span>
                      {isHighlighted && (
                        <span className="inline-flex items-center gap-1 text-blue-700 font-medium">
                          <ExternalLink className="w-3 h-3" />
                          {t.citedPassage}
                        </span>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap">{chunk.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
