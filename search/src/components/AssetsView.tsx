import { useState } from 'react';
import { Check, AlertTriangle, FileText } from 'lucide-react';
import type { AssetRecord, AssetStatus } from '../types/knowledge.ts';
import { StatusLabel, formatEur } from './StatusLabel.tsx';
import { STATUS_LABELS, UI_COPY, type AppLang } from '../i18n.ts';

interface AssetsViewProps {
  assets: AssetRecord[];
  buildingFilter: string;
  initialMode: 'all' | 'reviews';
  highlightedAssetId?: string | null;
  lang: AppLang;
  onOpenDocument: (docId: string) => void;
  onAssetUpdated: (updated: AssetRecord) => void;
}

export function AssetsView({
  assets,
  buildingFilter,
  initialMode,
  highlightedAssetId,
  lang,
  onOpenDocument,
  onAssetUpdated,
}: AssetsViewProps) {
  const t = UI_COPY[lang].assetsView;
  const statusLabels = STATUS_LABELS[lang];

  const [statusFilter, setStatusFilter] = useState<'all' | 'action' | 'missing' | 'ok'>(
    'all'
  );
  const [editingId, setEditingId] = useState<string | null>(highlightedAssetId ?? null);
  const [draftManufacturer, setDraftManufacturer] = useState('');
  const [draftRoom, setDraftRoom] = useState('');
  const [draftStatus, setDraftStatus] = useState<AssetStatus>('compliant');
  const [draftNote, setDraftNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const scopedAssets = assets.filter((a) => {
    if (buildingFilter !== 'all' && a.building !== buildingFilter) return false;
    if (initialMode === 'reviews') return a.needs_review;
    if (statusFilter === 'action')
      return a.status === 'overdue' || a.status === 'defect_reported' || a.status === 'due_soon';
    if (statusFilter === 'missing') return a.status === 'missing_proof';
    if (statusFilter === 'ok') return a.status === 'compliant';
    return true;
  });

  function startEdit(asset: AssetRecord) {
    setEditingId(asset.asset_id);
    setDraftManufacturer(asset.manufacturer);
    setDraftRoom(asset.floor_room);
    setDraftStatus(asset.status);
    setDraftNote(asset.human_note || '');
    setErrorMsg(null);
  }

  async function saveResolution(assetId: string) {
    setSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/assets/${encodeURIComponent(assetId)}/resolve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manufacturer: draftManufacturer,
          floor_room: draftRoom,
          status: draftStatus,
          human_note: draftNote,
        }),
      });
      const json = (await res.json()) as { asset?: AssetRecord; error?: string };
      if (!res.ok || !json.asset) {
        throw new Error(json.error || 'Save failed');
      }
      onAssetUpdated(json.asset);
      setEditingId(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
            {initialMode === 'reviews' ? t.reviewsTitle : t.allTitle}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {initialMode === 'reviews' ? t.reviewsSubtitle : t.allSubtitle}
          </p>
        </div>

        {initialMode === 'all' && (
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-md self-start">
            {(
              [
                ['all', t.filters.all],
                ['action', t.filters.action],
                ['missing', t.filters.missing],
                ['ok', t.filters.ok],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === key
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {scopedAssets.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center">
          <Check className="w-8 h-8 text-emerald-700 mx-auto" />
          <h2 className="mt-3 text-sm font-semibold text-slate-900">
            {initialMode === 'reviews' ? t.emptyReviewsTitle : t.emptyAllTitle}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {initialMode === 'reviews' ? t.emptyReviewsBody : t.emptyAllBody}
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">{t.cols.asset}</th>
                  <th className="py-3 px-4">{t.cols.buildingRoom}</th>
                  <th className="py-3 px-4">{t.cols.manufacturer}</th>
                  <th className="py-3 px-4">{t.cols.inspections}</th>
                  <th className="py-3 px-4">{t.cols.status}</th>
                  <th className="py-3 px-4 text-right">{t.cols.estimate}</th>
                  <th className="py-3 px-4 text-right">{t.cols.confidenceAction}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scopedAssets.map((asset) => {
                  const isEditing = editingId === asset.asset_id;
                  return (
                    <tr
                      key={asset.asset_id}
                      className={`align-top transition-colors ${
                        isEditing ? 'bg-blue-50/30' : 'hover:bg-slate-50/70'
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="font-mono text-xs text-slate-500">{asset.asset_id}</div>
                        <div className="font-medium text-slate-900 mt-0.5">{asset.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{asset.category}</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {asset.linked_doc_ids.map((docId) => (
                            <button
                              key={docId}
                              type="button"
                              onClick={() => onOpenDocument(docId)}
                              className="inline-flex items-center gap-1 text-xs font-mono text-blue-700 hover:underline cursor-pointer"
                            >
                              <FileText className="w-3 h-3" />
                              {docId}
                            </button>
                          ))}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="text-slate-900 font-medium">{asset.building}</div>
                        <div className="text-xs text-slate-600 mt-0.5">{asset.floor_room}</div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="text-slate-900">{asset.manufacturer}</div>
                        {asset.model_or_spec && (
                          <div className="text-xs text-slate-500 mt-0.5">{asset.model_or_spec}</div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-xs tabular-nums">
                        <div className="text-slate-700">
                          {t.lastPrefix} {asset.last_inspection}
                        </div>
                        <div className="text-slate-500 mt-0.5">
                          {t.duePrefix} {asset.next_inspection_due}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 max-w-xs">
                        <StatusLabel status={asset.status} lang={lang} />
                        <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                          {asset.status_note}
                        </p>
                        {asset.needs_review && asset.review_reason && (
                          <div className="mt-2 p-2 rounded border border-amber-200 bg-amber-50/60 text-xs text-amber-900 flex items-start gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                            <span>{asset.review_reason}</span>
                          </div>
                        )}
                        {asset.human_verified && asset.human_note && (
                          <div className="mt-1 text-xs text-emerald-800">
                            {t.verifiedPrefix} {asset.human_note}
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums text-slate-700 whitespace-nowrap">
                        {formatEur(asset.estimated_cost_eur)}
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="font-mono text-xs tabular-nums text-slate-700">
                          {Math.round(asset.confidence * 100)} %
                          {asset.human_verified ? ` · ${t.confirmedTag}` : ''}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            isEditing ? setEditingId(null) : startEdit(asset)
                          }
                          className="mt-2 px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-md hover:border-blue-700 hover:text-blue-700 bg-white transition-colors cursor-pointer"
                        >
                          {isEditing
                            ? t.cancel
                            : asset.needs_review
                              ? t.resolveConflict
                              : t.edit}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {editingId && (
            <div className="border-t border-slate-200 bg-slate-50 p-6">
              <h3 className="text-sm font-semibold text-slate-900">
                {t.editHeading} ({editingId})
              </h3>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <label className="block text-xs">
                  <span className="font-medium text-slate-700">{t.fieldManufacturer}</span>
                  <input
                    type="text"
                    value={draftManufacturer}
                    onChange={(e) => setDraftManufacturer(e.target.value)}
                    className="mt-1 w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
                  />
                </label>

                <label className="block text-xs">
                  <span className="font-medium text-slate-700">{t.fieldRoom}</span>
                  <input
                    type="text"
                    value={draftRoom}
                    onChange={(e) => setDraftRoom(e.target.value)}
                    className="mt-1 w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
                  />
                </label>

                <label className="block text-xs">
                  <span className="font-medium text-slate-700">{t.fieldStatus}</span>
                  <select
                    value={draftStatus}
                    onChange={(e) => setDraftStatus(e.target.value as AssetStatus)}
                    className="mt-1 w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
                  >
                    <option value="compliant">{statusLabels.compliant}</option>
                    <option value="due_soon">{statusLabels.due_soon}</option>
                    <option value="overdue">{statusLabels.overdue}</option>
                    <option value="missing_proof">{statusLabels.missing_proof}</option>
                    <option value="defect_reported">{statusLabels.defect_reported}</option>
                  </select>
                </label>

                <label className="block text-xs">
                  <span className="font-medium text-slate-700">{t.fieldNote}</span>
                  <input
                    type="text"
                    value={draftNote}
                    onChange={(e) => setDraftNote(e.target.value)}
                    placeholder={t.fieldNotePlaceholder}
                    className="mt-1 w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-md"
                  />
                </label>
              </div>

              {errorMsg && <p className="mt-3 text-xs text-red-700">{errorMsg}</p>}

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveResolution(editingId)}
                  className="px-4 py-2 bg-blue-700 text-white text-xs font-medium rounded-md hover:bg-blue-800 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {saving ? t.saving : t.confirmSave}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="px-4 py-2 border border-slate-300 bg-white text-slate-700 text-xs font-medium rounded-md hover:bg-slate-50 cursor-pointer"
                >
                  {t.cancel}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
