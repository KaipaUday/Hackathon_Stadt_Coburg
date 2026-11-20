import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileQuestion,
  Wrench,
} from 'lucide-react';
import type { AssetStatus } from '../types/knowledge.ts';
import { STATUS_LABELS, type AppLang } from '../i18n.ts';

interface StatusLabelProps {
  status: AssetStatus;
  lang?: AppLang;
}

const STATUS_STYLE: Record<
  AssetStatus,
  {
    colorClass: string;
    Icon: typeof CheckCircle2;
  }
> = {
  compliant: {
    colorClass: 'text-emerald-700',
    Icon: CheckCircle2,
  },
  due_soon: {
    colorClass: 'text-amber-700',
    Icon: Clock,
  },
  overdue: {
    colorClass: 'text-red-700',
    Icon: AlertTriangle,
  },
  missing_proof: {
    colorClass: 'text-amber-800',
    Icon: FileQuestion,
  },
  defect_reported: {
    colorClass: 'text-red-700',
    Icon: Wrench,
  },
};

export function StatusLabel({ status, lang = 'de' }: StatusLabelProps) {
  const cfg = STATUS_STYLE[status] ?? STATUS_STYLE.missing_proof;
  const label = STATUS_LABELS[lang][status] ?? STATUS_LABELS[lang].missing_proof;
  const Icon = cfg.Icon;

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${cfg.colorClass}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function formatEur(amount: number | null): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount);
}
