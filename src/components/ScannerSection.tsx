import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import { QuickScanResult } from '../types/portshield';

interface SupplierInputRow {
  tierLevel: number;
  entityName: string;
  country: string;
  declaredInputTons: number;
  declaredOutputTons: number;
}

interface ScannerSectionProps {
  onEscalateToDossier: (scan: QuickScanResult) => void;
}

const SAMPLE_INVOICE_TEXT = `COMMERCIAL INVOICE NO: XJ-ALU-2026-0942
DATE: 2026-10-28
SELLER: 新疆天山铝业有限公司 (Xinjiang Tianshan Aluminum Co., Ltd.)
ADDRESS: Shihezi Economic & Technological Development Zone, Xinjiang, China
BUYER: Pacific Rim Precision Extrusions Ltd., Johor, Malaysia
MATERIAL: Primary Aluminum Alloy Billet 6061 (HS 7601.10.00)
BATCH / LOT: SHZ-BILLET-2026-881
NET WEIGHT: 124,500 kg
COUNTRY OF ORIGIN: CHN`;

const DEFAULT_SUPPLIERS: SupplierInputRow[] = [
  {
    tierLevel: 4,
    entityName: 'Xinjiang Tianshan Aluminum Co., Ltd.',
    country: 'CHN',
    declaredInputTons: 160,
    declaredOutputTons: 120,
  },
  {
    tierLevel: 1,
    entityName: 'Pacific Rim Precision Extrusions Ltd.',
    country: 'MYS',
    declaredInputTons: 142,
    declaredOutputTons: 138,
  },
];

export const ScannerSection: React.FC<ScannerSectionProps> = ({ onEscalateToDossier }) => {
  const [mode, setMode] = useState<'document' | 'mass_balance'>('document');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [manifestText, setManifestText] = useState('');
  const [suppliers, setSuppliers] = useState<SupplierInputRow[]>(DEFAULT_SUPPLIERS);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QuickScanResult | null>(null);

  const handleLoadSample = () => {
    setMode('document');
    setSelectedFile(null);
    setManifestText(SAMPLE_INVOICE_TEXT);
    setError(null);
  };

  const handleAddTier = () => {
    setSuppliers((prev) => [
      ...prev,
      {
        tierLevel: 2,
        entityName: '',
        country: 'MYS',
        declaredInputTons: 100,
        declaredOutputTons: 92,
      },
    ]);
  };

  const handleUpdateTier = (
    idx: number,
    field: keyof SupplierInputRow,
    value: string | number
  ) => {
    setSuppliers((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row))
    );
  };

  const handleRemoveTier = (idx: number) => {
    setSuppliers((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleRunScan = async (e: React.FormEvent) => {
    e.preventDefault();
    setScanning(true);
    setError(null);

    try {
      const formData = new FormData();
      if (mode === 'document') {
        if (selectedFile) {
          formData.append('document', selectedFile);
        }
        if (manifestText.trim()) {
          formData.append('manifestText', manifestText.trim());
        }
        if (!selectedFile && !manifestText.trim()) {
          throw new Error('Upload a Bill of Lading / Invoice or paste manifest text to scan.');
        }
      } else {
        const validSuppliers = suppliers.filter((s) => s.entityName.trim().length > 0);
        if (validSuppliers.length < 2) {
          throw new Error('Provide at least two supply-chain tiers to evaluate mass-balance yield.');
        }
        formData.append('suppliers', JSON.stringify(validSuppliers));
      }

      const res = await fetch('/api/v1/public/quick-scan', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Scan failed with status ${res.status}`);
      }
      setResult(data as QuickScanResult);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to execute forensic scan.');
    } finally {
      setScanning(false);
    }
  };

  return (
    <section id="scanner" className="py-16 border-b border-[#1E293B]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <p className="text-xs font-medium tracking-wider uppercase text-[#64748B] mb-2">
              01. Detention Risk &amp; Gap Scanner
            </p>
            <h2 className="text-2xl md:text-3xl font-semibold text-[#F1F5F9] tracking-tight text-balance">
              Pre-Seizure Forensic Screening in Five Minutes
            </h2>
          </div>

          <div
            className="inline-flex items-center p-1 bg-[#11161D] border border-[#1E293B] rounded-lg self-start"
            role="tablist"
          >
            <button
              type="button"
              onClick={() => setMode('document')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                mode === 'document'
                  ? 'bg-[#1E293B] text-[#F1F5F9]'
                  : 'text-[#94A3B8] hover:text-[#E5ECF4]'
              }`}
            >
              Upload Trade Document
            </button>
            <button
              type="button"
              onClick={() => setMode('mass_balance')}
              className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                mode === 'mass_balance'
                  ? 'bg-[#1E293B] text-[#F1F5F9]'
                  : 'text-[#94A3B8] hover:text-[#E5ECF4]'
              }`}
            >
              Tier 1–4 Mass-Balance Check
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Input Workbench */}
          <form
            onSubmit={handleRunScan}
            className="lg:col-span-6 bg-[#11161D] border border-[#1E293B] rounded-xl p-6 space-y-5"
          >
            {mode === 'document' ? (
              <>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-[#F1F5F9]">
                      Trade Document or Foreign Manifest
                    </h3>
                    <p className="text-xs text-[#94A3B8] mt-1">
                      Supports PDF, PNG, JPG, TXT, or CSV in Mandarin, Spanish, or English.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleLoadSample}
                    className="text-xs font-medium text-[#60A5FA] hover:text-[#93C5FD] underline underline-offset-4 whitespace-nowrap shrink-0"
                  >
                    Load Sample Invoice
                  </button>
                </div>

                <label className="block border border-dashed border-[#334155] hover:border-[#3B82F6] rounded-lg p-5 text-center cursor-pointer transition-colors bg-[#0B0F14]">
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.json"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null;
                      setSelectedFile(f);
                    }}
                  />
                  <Upload className="w-5 h-5 text-[#64748B] mx-auto mb-2" />
                  <p className="text-sm font-medium text-[#E5ECF4]">
                    {selectedFile ? selectedFile.name : 'Select Bill of Lading, Invoice, or Mill Cert'}
                  </p>
                  <p className="text-xs text-[#64748B] mt-1 font-mono tabular-nums">
                    {selectedFile
                      ? `${(selectedFile.size / 1024).toFixed(1)} KB · Ready for SHA-256 hashing`
                      : 'Max 25 MB · Cryptographic digest computed on upload'}
                  </p>
                </label>

                <div>
                  <label className="block text-xs font-medium text-[#94A3B8] mb-2">
                    Or Paste Raw Invoice / Packing List Text
                  </label>
                  <textarea
                    rows={6}
                    value={manifestText}
                    onChange={(e) => setManifestText(e.target.value)}
                    placeholder="Paste supplier name, native script address, HS code, batch number, and net weight..."
                    className="w-full rounded-lg bg-[#090C10] border border-[#1E293B] px-3.5 py-2.5 text-sm text-[#E5ECF4] placeholder:text-[#475569] font-mono focus:outline-none focus:border-[#3B82F6]"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-semibold text-[#F1F5F9]">
                      Multi-Tier Metallurgical Weight Reconciliation
                    </h3>
                    <p className="text-xs text-[#94A3B8] mt-1">
                      Detects unverified raw material injection where output exceeds 95% physical yield.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddTier}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-[#334155] text-[#E5ECF4] hover:bg-[#1E293B] whitespace-nowrap shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Tier
                  </button>
                </div>

                <div className="space-y-3">
                  {suppliers.map((row, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-lg bg-[#090C10] border border-[#1E293B] space-y-3"
                    >
                      <div className="grid grid-cols-12 gap-2.5 items-center">
                        <div className="col-span-3">
                          <label className="block text-[11px] text-[#64748B] mb-1">Tier</label>
                          <select
                            value={row.tierLevel}
                            onChange={(e) =>
                              handleUpdateTier(idx, 'tierLevel', Number(e.target.value))
                            }
                            className="w-full rounded bg-[#11161D] border border-[#1E293B] px-2 py-1.5 text-xs text-[#E5ECF4]"
                          >
                            <option value={4}>Tier 4 (Mine)</option>
                            <option value={3}>Tier 3 (Smelter)</option>
                            <option value={2}>Tier 2 (Refiner)</option>
                            <option value={1}>Tier 1 (Export)</option>
                          </select>
                        </div>
                        <div className="col-span-6">
                          <label className="block text-[11px] text-[#64748B] mb-1">
                            Entity Legal Name
                          </label>
                          <input
                            type="text"
                            value={row.entityName}
                            onChange={(e) =>
                              handleUpdateTier(idx, 'entityName', e.target.value)
                            }
                            placeholder="Supplier name"
                            className="w-full rounded bg-[#11161D] border border-[#1E293B] px-2.5 py-1.5 text-xs text-[#E5ECF4]"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[11px] text-[#64748B] mb-1">Country</label>
                          <input
                            type="text"
                            maxLength={3}
                            value={row.country}
                            onChange={(e) =>
                              handleUpdateTier(idx, 'country', e.target.value.toUpperCase())
                            }
                            className="w-full rounded bg-[#11161D] border border-[#1E293B] px-2 py-1.5 text-xs font-mono text-[#E5ECF4]"
                          />
                        </div>
                        <div className="col-span-1 flex justify-end pt-4">
                          <button
                            type="button"
                            onClick={() => handleRemoveTier(idx)}
                            aria-label="Remove tier"
                            className="p-1 text-[#64748B] hover:text-[#EF4444]"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] text-[#64748B] mb-1">
                            Declared Input (Metric Tons)
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            value={row.declaredInputTons}
                            onChange={(e) =>
                              handleUpdateTier(idx, 'declaredInputTons', Number(e.target.value))
                            }
                            className="w-full rounded bg-[#11161D] border border-[#1E293B] px-2.5 py-1.5 text-xs font-mono tabular-nums text-[#E5ECF4]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[#64748B] mb-1">
                            Declared Output (Metric Tons)
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            value={row.declaredOutputTons}
                            onChange={(e) =>
                              handleUpdateTier(idx, 'declaredOutputTons', Number(e.target.value))
                            }
                            className="w-full rounded bg-[#11161D] border border-[#1E293B] px-2.5 py-1.5 text-xs font-mono tabular-nums text-[#E5ECF4]"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {error && (
              <div className="p-3 rounded-lg bg-[#DC2626]/10 border border-[#DC2626]/30 text-xs text-[#FCA5A5] flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-[#EF4444]" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={scanning}
              className="w-full py-2.5 px-5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap"
            >
              {scanning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Running Forensic Extraction &amp; Watchlist Screening...
                </>
              ) : (
                'Run Forensic Scan'
              )}
            </button>
          </form>

          {/* Right Forensic Diagnostic Output */}
          <div className="lg:col-span-6 bg-[#11161D] border border-[#1E293B] rounded-xl p-6 min-h-[400px] flex flex-col justify-between">
            {!result ? (
              <div className="flex-1 flex flex-col justify-center py-8">
                <FileText className="w-7 h-7 text-[#475569] mb-4" />
                <h3 className="text-base font-semibold text-[#F1F5F9]">
                  Awaiting Manifest or Trade Document
                </h3>
                <p className="text-sm text-[#94A3B8] mt-2 max-w-md leading-relaxed">
                  PortShield extracts multilingual supplier entities, computes a tamper-proof
                  SHA-256 audit hash, and screens every tier against DHS UFLPA entity watchlists.
                </p>
                <div className="mt-6 pt-5 border-t border-[#1E293B] grid grid-cols-3 gap-4 text-xs">
                  <div>
                    <div className="text-[#64748B]">Screening Model</div>
                    <div className="text-[#E5ECF4] font-medium mt-1">Forensic OCR + Trigram</div>
                  </div>
                  <div>
                    <div className="text-[#64748B]">Yield Threshold</div>
                    <div className="text-[#E5ECF4] font-mono tabular-nums mt-1">&le; 0.95 Output</div>
                  </div>
                  <div>
                    <div className="text-[#64748B]">Audit Digest</div>
                    <div className="text-[#E5ECF4] font-mono mt-1">SHA-256</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#1E293B]">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-[#94A3B8] font-mono">
                      <span>{result.scanId}</span>
                      <span aria-hidden="true">·</span>
                      <span>{new Date(result.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="flex items-center gap-2.5 mt-2">
                      {result.riskClassification === 'CRITICAL_DETENTION_RISK' ? (
                        <ShieldAlert className="w-5 h-5 text-[#EF4444]" />
                      ) : result.riskClassification === 'GAP_DETECTED' ? (
                        <AlertTriangle className="w-5 h-5 text-[#F59E0B]" />
                      ) : (
                        <CheckCircle2 className="w-5 h-5 text-[#22C55E]" />
                      )}
                      <span className="text-lg font-semibold text-[#F1F5F9]">
                        {result.riskClassification.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-[#64748B]">Admissibility Score</div>
                    <div className="text-2xl font-mono font-semibold tabular-nums text-[#F1F5F9]">
                      {result.admissibilityScore}
                      <span className="text-sm text-[#64748B]">/100</span>
                    </div>
                  </div>
                </div>

                {result.extractedDocument && (
                  <div className="space-y-2 text-xs">
                    <div className="text-[#64748B] font-medium">Extracted Document Metadata</div>
                    <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm py-2 border-y border-[#1E293B]">
                      <div>
                        <span className="text-xs text-[#64748B] block">Document Type / No.</span>
                        <span className="text-[#E5ECF4] font-mono text-xs">
                          {result.extractedDocument.doc_type} ·{' '}
                          {result.extractedDocument.document_number}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-[#64748B] block">Source Language</span>
                        <span className="text-[#E5ECF4] text-xs">
                          {result.extractedDocument.source_language}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-xs text-[#64748B] block">
                          Translated Seller Entity
                        </span>
                        <span className="text-[#F1F5F9] font-medium text-sm">
                          {result.extractedDocument.seller_name_english}
                          {result.extractedDocument.seller_name_native
                            ? ` (${result.extractedDocument.seller_name_native})`
                            : ''}
                        </span>
                        <span className="text-xs text-[#94A3B8] block mt-0.5">
                          {result.extractedDocument.seller_address} ·{' '}
                          {result.extractedDocument.seller_country_code}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {result.watchlistMatch && (
                  <div className="p-3.5 rounded-lg bg-[#DC2626]/10 border border-[#DC2626]/40 text-xs space-y-1">
                    <div className="font-semibold text-[#FCA5A5]">
                      CRITICAL UFLPA WATCHLIST MATCH ({Math.round(result.watchlistMatch.score * 100)}% Similarity)
                    </div>
                    <div className="text-[#E5ECF4]">
                      Matched Official Entity: {result.watchlistMatch.officialName}
                    </div>
                    <div className="text-[#94A3B8]">
                      Sector: {result.watchlistMatch.sector || 'High-Scrutiny Commodity'} · Risk:{' '}
                      {result.watchlistMatch.riskLevel}
                    </div>
                  </div>
                )}

                {result.redFlagsDetected.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-[#94A3B8]">
                      Forensic Findings &amp; Discrepancies
                    </div>
                    <ul className="space-y-1.5 text-xs text-[#FCD34D]">
                      {result.redFlagsDetected.map((flag, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span aria-hidden="true">•</span>
                          <span>{flag}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="pt-3 border-t border-[#1E293B] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="text-[11px] font-mono text-[#64748B] truncate max-w-xs">
                    SHA-256: {result.sha256AuditHash}
                  </div>
                  {result.requiresEmergencyDossier && (
                    <button
                      type="button"
                      onClick={() => onEscalateToDossier(result)}
                      className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold whitespace-nowrap shrink-0"
                    >
                      Open $400K Emergency Dossier
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
