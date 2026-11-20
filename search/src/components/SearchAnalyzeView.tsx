import { useState, useEffect } from 'react';
import {
  Search,
  ArrowRight,
  FileSearch,
  AlertCircle,
  BookOpen,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import type {
  AskResponse,
  AssetStatus,
  ChunkSearchHit,
  DocumentRecord,
} from '../types/knowledge.ts';
import { StatusLabel } from './StatusLabel.tsx';
import { PRESET_QUERIES, UI_COPY, type AppLang } from '../i18n.ts';

interface SearchAnalyzeViewProps {
  buildingFilter: string;
  documents: DocumentRecord[];
  lang: AppLang;
  onOpenCitation: (docId: string, section?: string, quote?: string) => void;
  onJumpToReviews: () => void;
}

export function SearchAnalyzeView({
  buildingFilter,
  lang,
  onOpenCitation,
  onJumpToReviews,
}: SearchAnalyzeViewProps) {
  const t = UI_COPY[lang].searchView;
  const presets = PRESET_QUERIES[lang];

  const [query, setQuery] = useState(PRESET_QUERIES[lang][0].query);
  const [liveHits, setLiveHits] = useState<ChunkSearchHit[]>([]);
  const [loadingHits, setLoadingHits] = useState(false);
  const [asking, setAsking] = useState(false);
  const [askResult, setAskResult] = useState<AskResponse | null>(null);
  const [askError, setAskError] = useState<string | null>(null);

  useEffect(() => {
    const otherLangPresets = PRESET_QUERIES[lang === 'en' ? 'de' : 'en'];
    const matchingIdx = otherLangPresets.findIndex((p) => p.query === query);
    if (matchingIdx !== -1) {
      setQuery(PRESET_QUERIES[lang][matchingIdx].query);
    }
  }, [lang, query]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoadingHits(true);
      try {
        const params = new URLSearchParams({
          q: query,
          building: buildingFilter,
        });
        const res = await fetch(`/api/search?${params.toString()}`);
        if (!res.ok) return;
        const json = (await res.json()) as { hits: ChunkSearchHit[] };
        if (!cancelled) {
          setLiveHits(json.hits ?? []);
        }
      } catch {
        // Ignore transient typing search errors
      } finally {
        if (!cancelled) setLoadingHits(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, buildingFilter]);

  async function runAiAnalysis(customQuery?: string) {
    const q = (customQuery ?? query).trim();
    if (!q) return;
    if (customQuery) setQuery(customQuery);

    setAsking(true);
    setAskError(null);

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          building: buildingFilter,
          language: lang,
        }),
      });
      const json = (await res.json()) as AskResponse & { error?: string };
      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setAskResult(json);
    } catch (err) {
      setAskError(err instanceof Error ? err.message : t.errorTitle);
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="max-w-3xl">
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight text-balance">
            {t.heading}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{t.subheading}</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void runAiAnalysis();
          }}
          className="mt-4 flex flex-col sm:flex-row gap-3"
        >
          <div className="relative flex-1">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.placeholder}
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-700 focus:ring-1 focus:ring-blue-700"
            />
          </div>
          <button
            type="submit"
            disabled={asking || !query.trim()}
            className="px-5 py-2.5 bg-blue-700 text-white text-sm font-medium rounded-md hover:bg-blue-800 disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {asking ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t.analyzing}</span>
              </>
            ) : (
              <>
                <span>{t.startAnalysis}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          <span className="text-slate-500 font-medium shrink-0">{t.examplesLabel}</span>
          {presets.map((preset, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => void runAiAnalysis(preset.query)}
              className="text-left text-blue-700 hover:text-blue-900 hover:underline cursor-pointer"
            >
              {preset.shortLabel}
            </button>
          ))}
        </div>
      </section>

      {askError && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 text-sm text-red-900"
        >
          <AlertCircle className="w-4 h-4 text-red-700 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">{t.errorTitle}</div>
            <p className="mt-0.5 text-red-800">{askError}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-6">
          {asking && (
            <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-4">
              <div className="h-4 w-48 bg-slate-200 rounded animate-pulse" />
              <div className="h-3 w-full bg-slate-100 rounded animate-pulse" />
              <div className="h-3 w-5/6 bg-slate-100 rounded animate-pulse" />
              <div className="h-24 w-full bg-slate-100 rounded animate-pulse" />
            </div>
          )}

          {!asking && askResult && (
            <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
              <div className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 tabular-nums mb-2">
                  <span>{t.synthesisLabel}</span>
                  <span>
                    {askResult.retrieved_doc_count} {t.docsWord} ·{' '}
                    {askResult.analyzed_asset_count} {t.assetsCheckedWord}
                  </span>
                </div>
                <p className="text-sm sm:text-[15px] text-slate-900 leading-relaxed whitespace-pre-wrap">
                  {askResult.answer}
                </p>
              </div>

              {askResult.findings.length > 0 && (
                <div className="p-6">
                  <h2 className="text-sm font-semibold text-slate-900 mb-3">
                    {t.findingsHeading} ({askResult.findings.length})
                  </h2>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-md">
                    {askResult.findings.map((finding, idx) => (
                      <div key={idx} className="p-3.5 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium text-slate-900">{finding.title}</span>
                          <StatusLabel
                            status={finding.finding_type as AssetStatus}
                            lang={lang}
                          />
                        </div>
                        <div className="mt-1 text-xs text-slate-500 font-mono">
                          {finding.asset_id} · {finding.building}
                        </div>
                        <p className="mt-1.5 text-slate-700 leading-relaxed">{finding.detail}</p>
                        {finding.doc_id && (
                          <button
                            type="button"
                            onClick={() => onOpenCitation(finding.doc_id, undefined, finding.quote)}
                            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline cursor-pointer"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>
                              {t.viewSource} ({finding.doc_id})
                            </span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(askResult.data_gaps.length > 0 || askResult.uncertainties_noted.length > 0) && (
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 bg-amber-50/40">
                  {askResult.data_gaps.length > 0 && (
                    <div className="border border-amber-200 bg-white rounded-md p-4">
                      <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
                        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                        <span>
                          {t.dataGapsHeading} ({askResult.data_gaps.length})
                        </span>
                      </div>
                      <ul className="mt-2 space-y-1.5 text-xs text-slate-700 list-disc pl-4">
                        {askResult.data_gaps.map((gap, i) => (
                          <li key={i}>{gap}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {askResult.uncertainties_noted.length > 0 && (
                    <div className="border border-amber-200 bg-white rounded-md p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-amber-900">
                          {t.uncertaintiesHeading}
                        </span>
                        <button
                          type="button"
                          onClick={onJumpToReviews}
                          className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
                        >
                          {t.reviewAction}
                        </button>
                      </div>
                      <ul className="mt-2 space-y-1.5 text-xs text-slate-700 list-disc pl-4">
                        {askResult.uncertainties_noted.map((u, i) => (
                          <li key={i}>{u}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {askResult.citations.length > 0 && (
                <div className="p-6">
                  <h2 className="text-sm font-semibold text-slate-900 mb-3">
                    {t.citationsHeading} ({askResult.citations.length})
                  </h2>
                  <div className="space-y-2">
                    {askResult.citations.map((cit, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() =>
                          onOpenCitation(cit.doc_id, cit.page_or_section, cit.quote)
                        }
                        className="w-full text-left p-3 border border-slate-200 rounded-md hover:border-blue-600 hover:bg-blue-50/30 transition-colors cursor-pointer"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-slate-900">{cit.filename}</span>
                          <span className="text-slate-500 font-mono">
                            {cit.doc_id} · {cit.page_or_section}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600 italic">“{cit.quote}”</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!asking && !askResult && (
            <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
              <FileSearch className="w-8 h-8 text-slate-400 mx-auto" />
              <h2 className="mt-3 text-sm font-semibold text-slate-900">{t.emptyTitle}</h2>
              <p className="mt-1 text-sm text-slate-600 max-w-md mx-auto">{t.emptyBody}</p>
              <button
                type="button"
                onClick={() => void runAiAnalysis()}
                className="mt-4 px-4 py-2 bg-blue-700 text-white text-xs font-medium rounded-md hover:bg-blue-800 transition-colors cursor-pointer"
              >
                {t.emptyCta}
              </button>
            </div>
          )}
        </div>

        <aside className="lg:col-span-5 bg-white border border-slate-200 rounded-lg">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{t.hitsHeading}</h2>
              <p className="text-xs text-slate-500">{t.hitsSubheading}</p>
            </div>
            <span className="text-xs font-mono text-slate-500 tabular-nums">
              {loadingHits ? '...' : `${liveHits.length} ${t.hitsWord}`}
            </span>
          </div>

          <div className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
            {liveHits.length === 0 ? (
              <div className="p-6 text-sm text-slate-500 text-center">{t.noHits}</div>
            ) : (
              liveHits.map((hit) => (
                <button
                  key={hit.chunk_id}
                  type="button"
                  onClick={() =>
                    onOpenCitation(hit.doc_id, hit.page_or_section, hit.snippet)
                  }
                  className="w-full text-left px-5 py-3.5 hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-800 truncate">{hit.filename}</span>
                    <span className="font-mono shrink-0">{hit.doc_type}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {hit.building} · {hit.page_or_section} · {hit.doc_date}
                  </div>
                  <p className="mt-1.5 text-xs text-slate-700 line-clamp-3 leading-relaxed">
                    {hit.snippet}
                  </p>
                </button>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
