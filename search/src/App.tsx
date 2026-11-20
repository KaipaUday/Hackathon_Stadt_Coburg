import { useEffect, useState } from 'react';
import {
  Search,
  Layers,
  FolderOpen,
  AlertTriangle,
  Building2,
  UploadCloud,
  Menu,
  X,
  Languages,
} from 'lucide-react';
import type { AssetRecord, DocumentRecord, KnowledgeBase } from './types/knowledge.ts';
import { SearchAnalyzeView } from './components/SearchAnalyzeView.tsx';
import { AssetsView } from './components/AssetsView.tsx';
import { DocumentsUploadView } from './components/DocumentsUploadView.tsx';
import { DocumentDrawer } from './components/DocumentDrawer.tsx';
import { UI_COPY, type AppLang } from './i18n.ts';

type NavTab = 'search' | 'assets' | 'documents' | 'reviews';

export default function App() {
  const [lang, setLang] = useState<AppLang>(() => {
    try {
      const saved = window.localStorage.getItem('coburg_lang');
      return saved === 'en' ? 'en' : 'de';
    } catch {
      return 'de';
    }
  });

  const t = UI_COPY[lang];

  const [knowledge, setKnowledge] = useState<KnowledgeBase | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<NavTab>('search');
  const [buildingFilter, setBuildingFilter] = useState<string>('all');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [drawerDocId, setDrawerDocId] = useState<string | null>(null);
  const [drawerSection, setDrawerSection] = useState<string | undefined>(undefined);
  const [drawerQuote, setDrawerQuote] = useState<string | undefined>(undefined);
  const [highlightedAssetId, setHighlightedAssetId] = useState<string | null>(null);

  function updateLang(next: AppLang) {
    setLang(next);
    try {
      window.localStorage.setItem('coburg_lang', next);
    } catch {
      // ignore storage errors
    }
  }

  async function fetchKnowledge() {
    try {
      setLoading(true);
      const res = await fetch('/api/knowledge');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as KnowledgeBase;
      setKnowledge(json);
      setLoadError(null);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : t.loadingError
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchKnowledge();
  }, []);

  const documents = knowledge?.documents ?? [];
  const assets = knowledge?.assets ?? [];
  const buildings = knowledge?.buildings ?? [];

  const scopedAssets =
    buildingFilter === 'all'
      ? assets
      : assets.filter((a) => a.building === buildingFilter);
  const reviewCount = scopedAssets.filter((a) => a.needs_review).length;
  const actionCount = scopedAssets.filter(
    (a) =>
      a.status === 'overdue' ||
      a.status === 'defect_reported' ||
      a.status === 'missing_proof'
  ).length;

  const activeDrawerDoc =
    drawerDocId ? documents.find((d) => d.doc_id === drawerDocId) ?? null : null;

  function handleOpenCitation(docId: string, section?: string, quote?: string) {
    setDrawerDocId(docId);
    setDrawerSection(section);
    setDrawerQuote(quote);
  }

  function handleAssetUpdated(updated: AssetRecord) {
    setKnowledge((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        assets: prev.assets.map((a) => (a.asset_id === updated.asset_id ? updated : a)),
      };
    });
  }

  function handleIngested(doc: DocumentRecord, _affected: AssetRecord[]) {
    void _affected;
    void fetchKnowledge();
    setDrawerDocId(doc.doc_id);
    setDrawerSection(undefined);
    setDrawerQuote(undefined);
  }

  async function handleDeleteDocument(docId: string) {
    const res = await fetch(`/api/documents/${encodeURIComponent(docId)}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      if (drawerDocId === docId) setDrawerDocId(null);
      await fetchKnowledge();
    }
  }

  async function handleResetSample() {
    const res = await fetch('/api/reset', { method: 'POST' });
    if (res.ok) {
      const next = (await res.json()) as KnowledgeBase;
      setKnowledge(next);
      setDrawerDocId(null);
    }
  }

  const navItems: Array<{
    id: NavTab;
    label: string;
    Icon: typeof Search;
    count?: number;
  }> = [
    { id: 'search', label: t.nav.search, Icon: Search },
    { id: 'assets', label: t.nav.assets, Icon: Layers, count: scopedAssets.length },
    { id: 'documents', label: t.nav.documents, Icon: FolderOpen, count: documents.length },
    { id: 'reviews', label: t.nav.reviews, Icon: AlertTriangle, count: reviewCount },
  ];

  const tabTitles: Record<NavTab, string> = {
    search: t.nav.search,
    assets: t.nav.assets,
    documents: t.nav.documents,
    reviews: t.nav.reviews,
  };

  const renderLanguageControl = () => (
    <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
        <Languages className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
        <span>{t.languageLabel}</span>
      </span>
      <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-md" role="group" aria-label={t.languageLabel}>
        <button
          type="button"
          onClick={() => updateLang('de')}
          className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
            lang === 'de'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          DE
        </button>
        <button
          type="button"
          onClick={() => updateLang('en')}
          className={`px-2.5 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
            lang === 'en'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          EN
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Left Sidebar (Desktop 260px) */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-slate-200">
        <div className="h-16 px-5 border-b border-slate-200 flex items-center gap-2.5">
          <Building2 className="w-5 h-5 text-blue-700 shrink-0" aria-hidden="true" />
          <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap">
            {t.brand}
          </span>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-1" aria-label="Main navigation">
          {navItems.map(({ id, label, Icon, count }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setActiveTab(id);
                  setHighlightedAssetId(null);
                }}
                className={`w-full px-3 py-2.5 rounded-md text-sm font-medium flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                  active
                    ? 'bg-blue-50 text-blue-800'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <span className="inline-flex items-center gap-2.5 truncate">
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{label}</span>
                </span>
                {typeof count === 'number' && (
                  <span className="font-mono text-xs tabular-nums text-slate-500 shrink-0">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-2.5 text-xs text-slate-600">
          <div className="font-semibold text-slate-800">{t.sidebarSummary.title}</div>
          <div className="flex justify-between tabular-nums">
            <span>{t.sidebarSummary.docsIndexed}</span>
            <span className="font-mono font-medium text-slate-900">{documents.length}</span>
          </div>
          <div className="flex justify-between tabular-nums">
            <span>{t.sidebarSummary.openIssues}</span>
            <span className="font-mono font-medium text-red-700">{actionCount}</span>
          </div>
          <div className="flex justify-between tabular-nums">
            <span>{t.sidebarSummary.conflictsToReview}</span>
            <span className="font-mono font-medium text-amber-800">{reviewCount}</span>
          </div>

          {renderLanguageControl()}
        </div>
      </aside>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/30"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-64 bg-white h-full border-r border-slate-200 flex flex-col z-50">
            <div className="h-16 px-4 border-b border-slate-200 flex items-center justify-between">
              <span className="font-display text-sm font-bold text-slate-900">
                {t.brand}
              </span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-slate-500 hover:text-slate-900"
                aria-label={t.header.closeNav}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {navItems.map(({ id, label, Icon, count }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setActiveTab(id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full px-3 py-2.5 rounded-md text-sm font-medium flex items-center justify-between ${
                    activeTab === id
                      ? 'bg-blue-50 text-blue-800'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="inline-flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{label}</span>
                  </span>
                  {typeof count === 'number' && (
                    <span className="font-mono text-xs tabular-nums">{count}</span>
                  )}
                </button>
              ))}
            </nav>
            <div className="p-4">{renderLanguageControl()}</div>
          </div>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900"
              aria-label={t.header.openNav}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-xs sm:text-sm text-slate-500 truncate">
              <span>{t.municipality}</span>
              <span className="mx-2" aria-hidden="true">
                /
              </span>
              <span className="font-medium text-slate-900">{tabTitles[activeTab]}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <label className="sr-only" htmlFor="header-building-select">
              Building filter
            </label>
            <select
              id="header-building-select"
              value={buildingFilter}
              onChange={(e) => setBuildingFilter(e.target.value)}
              className="hidden sm:block px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md text-slate-800 max-w-56 truncate"
            >
              <option value="all">
                {t.header.allBuildings} ({buildings.length})
              </option>
              {buildings.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setActiveTab('documents')}
              className="px-3.5 py-2 bg-blue-700 text-white text-xs font-medium rounded-md hover:bg-blue-800 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.header.uploadCta}</span>
            </button>
          </div>
        </header>

        {/* Workspace Language Bar for narrow screens */}
        <div className="lg:hidden px-4 py-2 bg-white border-b border-slate-200 flex items-center justify-between text-xs">
          <span className="text-slate-500">{t.languageLabel}:</span>
          <div className="inline-flex items-center p-0.5 bg-slate-100 rounded-md">
            <button
              type="button"
              onClick={() => updateLang('de')}
              className={`px-2.5 py-1 text-xs font-medium rounded ${
                lang === 'de' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Deutsch
            </button>
            <button
              type="button"
              onClick={() => updateLang('en')}
              className={`px-2.5 py-1 text-xs font-medium rounded ${
                lang === 'en' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              English
            </button>
          </div>
        </div>

        {/* Workspace Viewport */}
        <main className="flex-1 px-4 sm:px-6 py-6 max-w-7xl w-full mx-auto">
          {loading ? (
            <div className="bg-white border border-slate-200 rounded-lg p-8 space-y-4">
              <div className="h-5 w-64 bg-slate-200 rounded animate-pulse" />
              <div className="h-10 w-full bg-slate-100 rounded animate-pulse" />
              <div className="h-40 w-full bg-slate-100 rounded animate-pulse" />
            </div>
          ) : loadError ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-sm text-red-900">
              <div className="font-semibold">{t.loadingError}</div>
              <p className="mt-1">{loadError}</p>
            </div>
          ) : (
            <>
              {activeTab === 'search' && (
                <SearchAnalyzeView
                  buildingFilter={buildingFilter}
                  documents={documents}
                  lang={lang}
                  onOpenCitation={handleOpenCitation}
                  onJumpToReviews={() => setActiveTab('reviews')}
                />
              )}

              {activeTab === 'assets' && (
                <AssetsView
                  assets={assets}
                  buildingFilter={buildingFilter}
                  initialMode="all"
                  highlightedAssetId={highlightedAssetId}
                  lang={lang}
                  onOpenDocument={(docId) => handleOpenCitation(docId)}
                  onAssetUpdated={handleAssetUpdated}
                />
              )}

              {activeTab === 'reviews' && (
                <AssetsView
                  assets={assets}
                  buildingFilter={buildingFilter}
                  initialMode="reviews"
                  highlightedAssetId={highlightedAssetId}
                  lang={lang}
                  onOpenDocument={(docId) => handleOpenCitation(docId)}
                  onAssetUpdated={handleAssetUpdated}
                />
              )}

              {activeTab === 'documents' && (
                <DocumentsUploadView
                  documents={documents}
                  buildings={buildings}
                  buildingFilter={buildingFilter}
                  lang={lang}
                  onOpenDocument={(docId) => handleOpenCitation(docId)}
                  onIngested={handleIngested}
                  onDeleteDocument={handleDeleteDocument}
                  onResetSample={handleResetSample}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Original Document & Passage Citation Drawer */}
      <DocumentDrawer
        doc={activeDrawerDoc}
        highlightSection={drawerSection}
        highlightQuote={drawerQuote}
        assets={assets}
        lang={lang}
        onClose={() => setDrawerDocId(null)}
        onSelectAsset={(assetId) => {
          setDrawerDocId(null);
          setHighlightedAssetId(assetId);
          setActiveTab('assets');
        }}
      />
    </div>
  );
}
