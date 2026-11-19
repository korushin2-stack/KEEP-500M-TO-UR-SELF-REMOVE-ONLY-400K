import React, { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface NewCaseModalProps {
  open: boolean;
  defaultImporterName?: string;
  defaultSector?: string;
  defaultHsCode?: string;
  onClose: () => void;
  onCreated: (caseId: string) => Promise<void>;
}

export const NewCaseModal: React.FC<NewCaseModalProps> = ({
  open,
  defaultImporterName = '',
  defaultSector = '',
  defaultHsCode = '',
  onClose,
  onCreated,
}) => {
  const { getFirebaseIdToken } = useAuth();
  const [importerName, setImporterName] = useState(defaultImporterName);
  const [cbpDetentionNoticeNo, setCbpDetentionNoticeNo] = useState(
    `CBP-DET-2026-${Math.floor(100000 + Math.random() * 900000)}`
  );
  const [portOfEntry, setPortOfEntry] = useState('Port of Los Angeles / Long Beach (2704)');
  const [containerNumbers, setContainerNumbers] = useState('MSCU9102482, MAEU5529104');
  const [cargoValueUsd, setCargoValueUsd] = useState('15000000');
  const [commoditySector, setCommoditySector] = useState(
    defaultSector || 'Aluminum Extrusions & EV Components'
  );
  const [hsCode, setHsCode] = useState(defaultHsCode || '7604.29.10');
  const [detentionDate, setDetentionDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const token = await getFirebaseIdToken();
      if (!token) throw new Error('Sign in required.');

      const res = await fetch('/api/v1/cases', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          importerName,
          cbpDetentionNoticeNo,
          portOfEntry,
          containerNumbers,
          cargoValueUsd: Number(cargoValueUsd),
          commoditySector,
          hsCode,
          detentionDate,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create detention case.');

      await onCreated(data.caseRecord.caseId);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to create detention case.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg bg-[#11161D] border border-[#334155] rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between pb-3 border-b border-[#1E293B]">
          <h3 className="text-lg font-semibold text-[#F1F5F9]">Open Customs Admissibility Case</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1 text-[#94A3B8] hover:text-[#F1F5F9]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label className="block text-xs text-[#94A3B8] mb-1">Importer of Record</label>
              <input
                type="text"
                required
                value={importerName}
                onChange={(e) => setImporterName(e.target.value)}
                placeholder="e.g., Pacific Rim Precision Manufacturing Inc."
                className="w-full rounded-lg bg-[#090C10] border border-[#1E293B] px-3 py-2 text-xs text-[#E5ECF4]"
              />
            </div>

            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">
                CBP Detention Notice No.
              </label>
              <input
                type="text"
                required
                value={cbpDetentionNoticeNo}
                onChange={(e) => setCbpDetentionNoticeNo(e.target.value)}
                className="w-full rounded-lg bg-[#090C10] border border-[#1E293B] px-3 py-2 text-xs font-mono text-[#E5ECF4]"
              />
            </div>

            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">Detention Date</label>
              <input
                type="date"
                required
                value={detentionDate}
                onChange={(e) => setDetentionDate(e.target.value)}
                className="w-full rounded-lg bg-[#090C10] border border-[#1E293B] px-3 py-2 text-xs font-mono text-[#E5ECF4]"
              />
            </div>

            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">Port of Entry</label>
              <input
                type="text"
                value={portOfEntry}
                onChange={(e) => setPortOfEntry(e.target.value)}
                className="w-full rounded-lg bg-[#090C10] border border-[#1E293B] px-3 py-2 text-xs text-[#E5ECF4]"
              />
            </div>

            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">Cargo Value (USD)</label>
              <input
                type="number"
                required
                value={cargoValueUsd}
                onChange={(e) => setCargoValueUsd(e.target.value)}
                className="w-full rounded-lg bg-[#090C10] border border-[#1E293B] px-3 py-2 text-xs font-mono tabular-nums text-[#E5ECF4]"
              />
            </div>

            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">Commodity Sector</label>
              <input
                type="text"
                value={commoditySector}
                onChange={(e) => setCommoditySector(e.target.value)}
                className="w-full rounded-lg bg-[#090C10] border border-[#1E293B] px-3 py-2 text-xs text-[#E5ECF4]"
              />
            </div>

            <div>
              <label className="block text-xs text-[#94A3B8] mb-1">HS Tariff Code</label>
              <input
                type="text"
                value={hsCode}
                onChange={(e) => setHsCode(e.target.value)}
                className="w-full rounded-lg bg-[#090C10] border border-[#1E293B] px-3 py-2 text-xs font-mono text-[#E5ECF4]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs text-[#94A3B8] mb-1">
                Container Numbers (comma separated)
              </label>
              <input
                type="text"
                value={containerNumbers}
                onChange={(e) => setContainerNumbers(e.target.value)}
                className="w-full rounded-lg bg-[#090C10] border border-[#1E293B] px-3 py-2 text-xs font-mono text-[#E5ECF4]"
              />
            </div>
          </div>

          {error && <p className="text-xs text-[#FCA5A5]">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[#334155] text-xs font-medium text-[#E5ECF4] hover:bg-[#1E293B]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold inline-flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create Detention Case
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
