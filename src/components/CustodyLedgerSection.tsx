import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { CaseBundle } from '../types/portshield';

interface CustodyLedgerSectionProps {
  activeBundle: CaseBundle | null;
  onRefreshCase: (caseId: string) => Promise<void>;
}

export const CustodyLedgerSection: React.FC<CustodyLedgerSectionProps> = ({
  activeBundle,
  onRefreshCase,
}) => {
  const { user, getFirebaseIdToken } = useAuth();
  const [upstreamEntityName, setUpstreamEntityName] = useState('');
  const [downstreamEntityName, setDownstreamEntityName] = useState('');
  const [upstreamTier, setUpstreamTier] = useState(3);
  const [downstreamTier, setDownstreamTier] = useState(1);
  const [materialDescription, setMaterialDescription] = useState('');
  const [batchOrLotNumber, setBatchOrLotNumber] = useState('');
  const [inputWeightKg, setInputWeightKg] = useState('50000');
  const [outputWeightKg, setOutputWeightKg] = useState('46500');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const previewYield =
    Number(inputWeightKg) > 0 ? Number(outputWeightKg) / Number(inputWeightKg) : 0;

  const handleAddLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBundle) return;
    setSubmitting(true);
    setError(null);

    try {
      const token = await getFirebaseIdToken();
      if (!token) throw new Error('Sign in to record custody links.');

      const res = await fetch(
        `/api/v1/cases/${activeBundle.caseRecord.caseId}/custody-links`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            upstreamEntityName,
            downstreamEntityName,
            upstreamTier,
            downstreamTier,
            materialDescription,
            batchOrLotNumber,
            inputWeightKg: Number(inputWeightKg),
            outputWeightKg: Number(outputWeightKg),
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record custody link.');

      setUpstreamEntityName('');
      setDownstreamEntityName('');
      setMaterialDescription('');
      setBatchOrLotNumber('');
      await onRefreshCase(activeBundle.caseRecord.caseId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to save custody link.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="custody" className="py-16 border-b border-[#1E293B]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="mb-10">
          <p className="text-xs font-medium tracking-wider uppercase text-[#64748B] mb-2">
            03. Tier 1–4 Mass-Balance &amp; Custody Chain Ledger
          </p>
          <h2 className="text-2xl md:text-3xl font-semibold text-[#F1F5F9] tracking-tight text-balance">
            Physical Recovery Yield &amp; Lot-Level Traceability
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Custody Table + Form */}
          <div className="lg:col-span-8 bg-[#11161D] border border-[#1E293B] rounded-xl p-6 space-y-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#1E293B] text-[11px] uppercase tracking-wider text-[#64748B]">
                    <th className="py-2.5 pr-3">Upstream -&gt; Downstream</th>
                    <th className="py-2.5 pr-3">Material &amp; Batch</th>
                    <th className="py-2.5 pr-3 text-right">Input (kg)</th>
                    <th className="py-2.5 pr-3 text-right">Output (kg)</th>
                    <th className="py-2.5 pr-3 text-right">Yield</th>
                    <th className="py-2.5 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1E293B] text-xs">
                  {!activeBundle || activeBundle.custodyLinks.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[#64748B]">
                        {user
                          ? 'No custody edges recorded for this case yet.'
                          : 'Sign in above to inspect and record Tier 1–4 custody chain edges.'}
                      </td>
                    </tr>
                  ) : (
                    activeBundle.custodyLinks.map((link) => {
                      const isDiscrepancy = link.linkStatus !== 'VERIFIED';
                      return (
                        <tr key={link.linkId} className="hover:bg-[#161C24] transition-colors">
                          <td className="py-3 pr-3">
                            <div className="text-[#F1F5F9] font-medium">
                              T{link.upstreamTier} {link.upstreamEntityName}
                            </div>
                            <div className="text-[#94A3B8] text-[11px]">
                              -&gt; T{link.downstreamTier} {link.downstreamEntityName}
                            </div>
                          </td>
                          <td className="py-3 pr-3">
                            <div className="text-[#E5ECF4]">{link.materialDescription}</div>
                            <div className="font-mono text-[11px] text-[#64748B]">
                              {link.batchOrLotNumber || 'No lot ref'}
                            </div>
                          </td>
                          <td className="py-3 pr-3 text-right font-mono tabular-nums text-[#E5ECF4]">
                            {Number(link.inputWeightKg).toLocaleString()}
                          </td>
                          <td className="py-3 pr-3 text-right font-mono tabular-nums text-[#E5ECF4]">
                            {Number(link.outputWeightKg).toLocaleString()}
                          </td>
                          <td className="py-3 pr-3 text-right font-mono tabular-nums text-[#F1F5F9]">
                            {Number(link.yieldRatio || 0).toFixed(3)}
                          </td>
                          <td className="py-3 text-right">
                            <span
                              className={`inline-flex items-center gap-1 font-medium whitespace-nowrap ${
                                isDiscrepancy ? 'text-[#EF4444]' : 'text-[#22C55E]'
                              }`}
                            >
                              {isDiscrepancy ? (
                                <>
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  {link.linkStatus.replace(/_/g, ' ')}
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  VERIFIED
                                </>
                              )}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {user && activeBundle && (
              <form
                onSubmit={handleAddLink}
                className="pt-5 border-t border-[#1E293B] space-y-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#F1F5F9]">
                    Append Custody Chain Link
                  </span>
                  <span className="text-xs font-mono tabular-nums text-[#94A3B8]">
                    Computed Yield Ratio: {previewYield.toFixed(4)}{' '}
                    {previewYield > 1.02 ? '(WEIGHT DISCREPANCY)' : '(WITHIN BOUND)'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    value={upstreamEntityName}
                    onChange={(e) => setUpstreamEntityName(e.target.value)}
                    placeholder="Upstream Smelter / Mine Name"
                    className="rounded-lg bg-[#090C10] border border-[#1E293B] px-3 py-2 text-xs text-[#E5ECF4]"
                  />
                  <input
                    type="text"
                    required
                    value={downstreamEntityName}
                    onChange={(e) => setDownstreamEntityName(e.target.value)}
                    placeholder="Downstream Processor / Exporter"
                    className="rounded-lg bg-[#090C10] border border-[#1E293B] px-3 py-2 text-xs text-[#E5ECF4]"
                  />
                  <input
                    type="text"
                    required
                    value={materialDescription}
                    onChange={(e) => setMaterialDescription(e.target.value)}
                    placeholder="Material Conversion (e.g., Billet -> Extrusions)"
                    className="rounded-lg bg-[#090C10] border border-[#1E293B] px-3 py-2 text-xs text-[#E5ECF4]"
                  />
                  <input
                    type="text"
                    value={batchOrLotNumber}
                    onChange={(e) => setBatchOrLotNumber(e.target.value)}
                    placeholder="Batch / Heat Lot Number"
                    className="rounded-lg bg-[#090C10] border border-[#1E293B] px-3 py-2 text-xs font-mono text-[#E5ECF4]"
                  />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] text-[#64748B] mb-1">Upstream Tier</label>
                    <select
                      value={upstreamTier}
                      onChange={(e) => setUpstreamTier(Number(e.target.value))}
                      className="w-full rounded-lg bg-[#090C10] border border-[#1E293B] px-2.5 py-2 text-xs text-[#E5ECF4]"
                    >
                      <option value={4}>Tier 4</option>
                      <option value={3}>Tier 3</option>
                      <option value={2}>Tier 2</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#64748B] mb-1">Downstream Tier</label>
                    <select
                      value={downstreamTier}
                      onChange={(e) => setDownstreamTier(Number(e.target.value))}
                      className="w-full rounded-lg bg-[#090C10] border border-[#1E293B] px-2.5 py-2 text-xs text-[#E5ECF4]"
                    >
                      <option value={2}>Tier 2</option>
                      <option value={1}>Tier 1</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#64748B] mb-1">Input Weight (kg)</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={inputWeightKg}
                      onChange={(e) => setInputWeightKg(e.target.value)}
                      className="w-full rounded-lg bg-[#090C10] border border-[#1E293B] px-2.5 py-2 text-xs font-mono tabular-nums text-[#E5ECF4]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-[#64748B] mb-1">
                      Output Weight (kg)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={outputWeightKg}
                      onChange={(e) => setOutputWeightKg(e.target.value)}
                      className="w-full rounded-lg bg-[#090C10] border border-[#1E293B] px-2.5 py-2 text-xs font-mono tabular-nums text-[#E5ECF4]"
                    />
                  </div>
                </div>

                {error && <p className="text-xs text-[#FCA5A5]">{error}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1E293B] hover:bg-[#334155] text-xs font-semibold text-[#F1F5F9] whitespace-nowrap"
                >
                  {submitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  Record Custody Edge
                </button>
              </form>
            )}
          </div>

          {/* Right Documentary Visual Proof */}
          <div className="lg:col-span-4 bg-[#11161D] border border-[#1E293B] rounded-xl overflow-hidden">
            <div className="aspect-[4/3] bg-[#0B0F14] relative">
              {!imgFailed ? (
                <img
                  src="/src/assets/images/forensic_metallurgy_coil_1795043651666.jpg"
                  alt="Bonded customs inspection bay showing aluminum billets and battery enclosures"
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#0F172A] to-[#1E293B] text-xs text-[#94A3B8]">
                  Bonded Customs Metallurgy Inspection
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#11161D] via-transparent to-transparent" />
            </div>
            <div className="p-6 space-y-3">
              <h3 className="text-base font-semibold text-[#F1F5F9]">
                Mass-Balance Conservation Law
              </h3>
              <p className="text-xs text-[#94A3B8] leading-relaxed">
                CBP UFLPA examiners reject admissibility packages whenever downstream finished goods
                weight exceeds upstream smelter billet output adjusted for physical scrap loss.
              </p>
              <div className="pt-3 border-t border-[#1E293B] flex items-center justify-between text-xs">
                <span className="text-[#64748B]">Max Allowable Recovery</span>
                <span className="font-mono tabular-nums text-[#E5ECF4]">95.0% (0.9500)</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#64748B]">Discrepancy Trigger</span>
                <span className="font-mono tabular-nums text-[#EF4444]">Yield &gt; 1.0200</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
