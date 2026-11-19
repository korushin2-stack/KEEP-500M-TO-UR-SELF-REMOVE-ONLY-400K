import React, { useState } from 'react';
import { CheckCircle2, Lock, Loader2, ShieldCheck, Unlock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { CaseBundle, IpGatewayStatus } from '../types/portshield';

interface SettlementAndSecuritySectionProps {
  activeBundle: CaseBundle | null;
  ipStatus: IpGatewayStatus | null;
  onRefreshCase: (caseId: string) => Promise<void>;
  onRefreshIpStatus: () => Promise<void>;
}

export const SettlementAndSecuritySection: React.FC<SettlementAndSecuritySectionProps> = ({
  activeBundle,
  ipStatus,
  onRefreshCase,
  onRefreshIpStatus,
}) => {
  const { user, getFirebaseIdToken } = useAuth();
  const [paymentMethod, setPaymentMethod] = useState<'REMITLY_QR' | 'ENTERPRISE_WIRE'>('REMITLY_QR');
  const [amountUsd, setAmountUsd] = useState('400000');
  const [referenceCode, setReferenceCode] = useState('');
  const [authorizing, setAuthorizing] = useState(false);
  const [retainerMessage, setRetainerMessage] = useState<string | null>(null);
  const [retainerError, setRetainerError] = useState<string | null>(null);

  // Enterprise IP Policy & Forensic Audit API Test
  const [newWhitelistIp, setNewWhitelistIp] = useState('');
  const [updatingIp, setUpdatingIp] = useState(false);
  const [auditResult, setAuditResult] = useState<string | null>(null);
  const [auditStatusCode, setAuditStatusCode] = useState<number | null>(null);
  const [runningAudit, setRunningAudit] = useState(false);
  const [vaultImgFailed, setVaultImgFailed] = useState(false);

  const handleAuthorizeRetainer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBundle) {
      setRetainerError('Sign in and select an active admissibility case first.');
      return;
    }
    setAuthorizing(true);
    setRetainerError(null);
    setRetainerMessage(null);

    try {
      const token = await getFirebaseIdToken();
      if (!token) throw new Error('Sign in required.');

      const res = await fetch(
        `/api/v1/cases/${activeBundle.caseRecord.caseId}/retainer/authorize`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            paymentMethod,
            amountUsd: Number(amountUsd || 400000),
            referenceCode,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Retainer authorization failed.');

      setRetainerMessage(
        `Retainer recorded (${data.status}) · Ref: ${data.referenceCode} · Channel: ${data.deliveryChannel}`
      );
      await onRefreshCase(activeBundle.caseRecord.caseId);
    } catch (err: unknown) {
      setRetainerError(err instanceof Error ? err.message : 'Unable to authorize retainer.');
    } finally {
      setAuthorizing(false);
    }
  };

  const handleIpPolicyUpdate = async (payload: {
    addIp?: string;
    removeIp?: string;
    strictMode?: boolean;
  }) => {
    setUpdatingIp(true);
    try {
      const token = await getFirebaseIdToken();
      if (!token) return;
      await fetch('/api/v1/security/ip-policy', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      await onRefreshIpStatus();
    } finally {
      setUpdatingIp(false);
    }
  };

  const handleTestForensicApi = async () => {
    setRunningAudit(true);
    setAuditResult(null);
    setAuditStatusCode(null);
    try {
      const token = await getFirebaseIdToken();
      if (!token) {
        setAuditStatusCode(401);
        setAuditResult('Sign in with Google first to invoke the authenticated IP-locked endpoint.');
        return;
      }

      const payload = {
        shipmentId: activeBundle?.caseRecord.cbpDetentionNoticeNo || 'CBP-DET-2026-TEST',
        importerOfRecord: activeBundle?.caseRecord.importerName || 'Vanguard Mobility Systems Inc.',
        commodityCode: activeBundle?.caseRecord.hsCode || '7604.29.10',
        declaredValueUSD: Number(activeBundle?.caseRecord.cargoValueUsd || 14850000),
        suppliers: [
          {
            tierLevel: 4,
            entityName: 'Xinjiang Tianshan Aluminum Co., Ltd.',
            country: 'CHN',
            declaredInputTons: 150,
            declaredOutputTons: 118,
          },
          {
            tierLevel: 1,
            entityName: 'Pacific Rim Precision Extrusions Ltd.',
            country: 'MYS',
            declaredInputTons: 142.5,
            declaredOutputTons: 138,
          },
        ],
      };

      const res = await fetch('/api/v1/forensic/audit-shipment', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      setAuditStatusCode(res.status);
      setAuditResult(JSON.stringify(data, null, 2));
    } catch (err: unknown) {
      setAuditResult(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setRunningAudit(false);
    }
  };

  return (
    <section id="settlement" className="py-16 border-b border-[#1E293B]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="mb-10">
          <p className="text-xs font-medium tracking-wider uppercase text-[#64748B] mb-2">
            04. Emergency Dossier Retainer &amp; Zero-Trust IP Gateway
          </p>
          <h2 className="text-2xl md:text-3xl font-semibold text-[#F1F5F9] tracking-tight text-balance">
            72-Hour Retainer Settlement &amp; Static IP Security Enforcement
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: $400K Emergency Dossier Retainer & Remitly QR Payout */}
          <div className="lg:col-span-6 bg-[#11161D] border border-[#1E293B] rounded-xl p-6 space-y-6">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#1E293B]">
              <div>
                <h3 className="text-lg font-semibold text-[#F1F5F9]">
                  $400,000 Emergency Dossier Engine
                </h3>
                <p className="text-xs text-[#94A3B8] mt-1">
                  72-hour examiner-ready cryptographic dossier assembly &amp; direct CBP port liaison.
                </p>
              </div>
              <div className="w-20 h-14 rounded-lg overflow-hidden border border-[#1E293B] shrink-0 bg-[#090C10]">
                {!vaultImgFailed ? (
                  <img
                    src="/src/assets/images/customs_dossier_vault_1795043651364.jpg"
                    alt="Archival legal dossier binders and embossed customs seal"
                    referrerPolicy="no-referrer"
                    onError={() => setVaultImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : null}
              </div>
            </div>

            <div className="inline-flex items-center p-1 bg-[#090C10] border border-[#1E293B] rounded-lg">
              <button
                type="button"
                onClick={() => setPaymentMethod('REMITLY_QR')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                  paymentMethod === 'REMITLY_QR'
                    ? 'bg-[#1E293B] text-[#F1F5F9]'
                    : 'text-[#94A3B8] hover:text-[#E5ECF4]'
                }`}
              >
                Remitly QR Payout
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('ENTERPRISE_WIRE')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap ${
                  paymentMethod === 'ENTERPRISE_WIRE'
                    ? 'bg-[#1E293B] text-[#F1F5F9]'
                    : 'text-[#94A3B8] hover:text-[#E5ECF4]'
                }`}
              >
                Enterprise Wire Escrow
              </button>
            </div>

            {paymentMethod === 'REMITLY_QR' ? (
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-center bg-[#090C10] border border-[#1E293B] rounded-lg p-4">
                <div className="sm:col-span-5 flex justify-center">
                  <img
                    src="/assets/aistudio/Screenshot_20261119-002646_5990888b.png"
                    alt="Remitly payment QR code for @giffifjbxdtsh5850 via Airtel Money"
                    referrerPolicy="no-referrer"
                    className="w-44 h-auto rounded-lg border border-[#334155]"
                  />
                </div>
                <div className="sm:col-span-7 space-y-2.5 text-xs">
                  <div className="text-[#64748B] font-medium">Scan to Pay via Remitly</div>
                  <div>
                    <div className="text-[#94A3B8]">Recipient Account</div>
                    <div className="text-sm font-semibold text-[#F1F5F9]">
                      GIFFFJBXDTSS hfdtxzdtf
                    </div>
                  </div>
                  <div>
                    <div className="text-[#94A3B8]">Remitly Tag</div>
                    <div className="font-mono text-[#60A5FA]">@giffifjbxdtsh5850</div>
                  </div>
                  <div>
                    <div className="text-[#94A3B8]">Delivery Channel</div>
                    <div className="text-[#E5ECF4] font-medium">Airtel Money (RW)</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[#090C10] border border-[#1E293B] rounded-lg p-4 space-y-2 text-xs">
                <div className="font-semibold text-[#F1F5F9]">
                  Institutional SWIFT / Fedwire Escrow Instructions
                </div>
                <div className="grid grid-cols-2 gap-2 text-[#94A3B8]">
                  <span>Escrow Retainer Fee:</span>
                  <span className="font-mono tabular-nums text-[#F1F5F9]">$400,000.00 USD</span>
                  <span>Contract SLA:</span>
                  <span className="text-[#F1F5F9]">72 Hours Examiner-Ready</span>
                  <span>Reference Required:</span>
                  <span className="font-mono text-[#E5ECF4]">
                    {activeBundle?.caseRecord.cbpDetentionNoticeNo || 'CBP-DETENTION-ID'}
                  </span>
                </div>
              </div>
            )}

            <form onSubmit={handleAuthorizeRetainer} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-[#64748B] mb-1">
                    Settlement Amount (USD)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={amountUsd}
                    onChange={(e) => setAmountUsd(e.target.value)}
                    className="w-full rounded-lg bg-[#090C10] border border-[#1E293B] px-3 py-2 text-xs font-mono tabular-nums text-[#E5ECF4]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#64748B] mb-1">
                    Remitly / Wire Confirmation Ref
                  </label>
                  <input
                    type="text"
                    value={referenceCode}
                    onChange={(e) => setReferenceCode(e.target.value)}
                    placeholder="Optional transaction receipt ID"
                    className="w-full rounded-lg bg-[#090C10] border border-[#1E293B] px-3 py-2 text-xs font-mono text-[#E5ECF4]"
                  />
                </div>
              </div>

              {retainerMessage && (
                <div className="p-3 rounded-lg bg-[#16A34A]/10 border border-[#16A34A]/40 text-xs text-[#86EFAC] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{retainerMessage}</span>
                </div>
              )}
              {retainerError && (
                <p className="text-xs text-[#FCA5A5]">{retainerError}</p>
              )}

              <button
                type="submit"
                disabled={authorizing || !user}
                className="w-full py-2.5 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap"
              >
                {authorizing && <Loader2 className="w-4 h-4 animate-spin" />}
                {user
                  ? paymentMethod === 'REMITLY_QR'
                    ? 'Record Remitly QR Retainer Settlement'
                    : 'Authorize Enterprise Wire Retainer'
                  : 'Sign in with Google to Authorize Retainer'}
              </button>
            </form>
          </div>

          {/* Right: Zero-Trust Enterprise IP Lock & Forensic API */}
          <div className="lg:col-span-6 bg-[#11161D] border border-[#1E293B] rounded-xl p-6 space-y-6">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#1E293B]">
              <div>
                <h3 className="text-lg font-semibold text-[#F1F5F9]">
                  Zero-Trust Enterprise IP Gateway
                </h3>
                <p className="text-xs text-[#94A3B8] mt-1">
                  Protects `/api/v1/forensic/*` behind corporate VPN static IP whitelisting and
                  Helmet security headers.
                </p>
              </div>
              {ipStatus?.strictIpLockEnabled ? (
                <Lock className="w-5 h-5 text-[#F59E0B] shrink-0" />
              ) : (
                <Unlock className="w-5 h-5 text-[#64748B] shrink-0" />
              )}
            </div>

            {ipStatus && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-[#090C10] border border-[#1E293B] text-xs">
                  <div>
                    <span className="text-[#64748B] block">Detected Client IP</span>
                    <span className="font-mono text-[#F1F5F9] mt-0.5 block">
                      {ipStatus.detectedIp}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#64748B] block">Gateway Authorization</span>
                    <span
                      className={`font-medium mt-0.5 block ${
                        ipStatus.isWhitelisted || !ipStatus.strictIpLockEnabled
                          ? 'text-[#22C55E]'
                          : 'text-[#EF4444]'
                      }`}
                    >
                      {ipStatus.isWhitelisted
                        ? 'Whitelisted IP'
                        : ipStatus.strictIpLockEnabled
                          ? 'Blocked (403 Enforced)'
                          : 'Permissive Preview Mode'}
                    </span>
                  </div>
                </div>

                {user && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-[#E5ECF4]">
                        Strict Static-IP Enforcement
                      </span>
                      <div className="flex items-center gap-2">
                        {!ipStatus.isWhitelisted && (
                          <button
                            type="button"
                            disabled={updatingIp}
                            onClick={() => handleIpPolicyUpdate({ addIp: ipStatus.detectedIp })}
                            className="px-3 py-1.5 rounded-md border border-[#334155] hover:bg-[#1E293B] text-xs text-[#E5ECF4] whitespace-nowrap"
                          >
                            Whitelist My IP
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={updatingIp}
                          onClick={() =>
                            handleIpPolicyUpdate({ strictMode: !ipStatus.strictIpLockEnabled })
                          }
                          className={`px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap ${
                            ipStatus.strictIpLockEnabled
                              ? 'bg-[#D97706] text-white'
                              : 'bg-[#1E293B] text-[#E5ECF4] hover:bg-[#334155]'
                          }`}
                        >
                          {ipStatus.strictIpLockEnabled ? 'Strict Lock: ON' : 'Enable Strict Lock'}
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newWhitelistIp}
                        onChange={(e) => setNewWhitelistIp(e.target.value)}
                        placeholder="Add corporate VPN IPv4/IPv6..."
                        className="flex-1 min-w-0 rounded-lg bg-[#090C10] border border-[#1E293B] px-3 py-1.5 text-xs font-mono text-[#E5ECF4]"
                      />
                      <button
                        type="button"
                        disabled={updatingIp || !newWhitelistIp.trim()}
                        onClick={() => {
                          handleIpPolicyUpdate({ addIp: newWhitelistIp.trim() });
                          setNewWhitelistIp('');
                        }}
                        className="px-3 py-1.5 rounded-lg border border-[#334155] hover:bg-[#1E293B] text-xs text-[#E5ECF4] whitespace-nowrap"
                      >
                        Add IP
                      </button>
                    </div>

                    <div className="text-[11px] font-mono text-[#64748B]">
                      Allowed Gateways: {ipStatus.whitelistedIps.join(' · ')}
                    </div>
                  </div>
                )}

                <div className="pt-3 border-t border-[#1E293B] space-y-3">
                  <button
                    type="button"
                    onClick={handleTestForensicApi}
                    disabled={runningAudit}
                    className="w-full py-2.5 px-4 rounded-lg border border-[#334155] hover:bg-[#1E293B] text-[#F1F5F9] text-xs font-semibold inline-flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <ShieldCheck className="w-4 h-4 text-[#60A5FA]" />
                    {runningAudit
                      ? 'Executing IP-Gated Forensic Audit...'
                      : 'Verify /api/v1/forensic/audit-shipment Gateway'}
                  </button>

                  {auditResult && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-mono text-[#94A3B8]">
                        HTTP Status: {auditStatusCode}{' '}
                        {auditStatusCode === 403 ? '(ACCESS_DENIED)' : '(VERIFIED)'}
                      </div>
                      <pre className="p-3 rounded-lg bg-[#090C10] border border-[#1E293B] text-[11px] font-mono text-[#CBD5E1] overflow-x-auto max-h-48">
                        {auditResult}
                      </pre>
                    </div>
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
