import React, { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { ScannerSection } from './components/ScannerSection';
import { CaseWorkspaceSection } from './components/CaseWorkspaceSection';
import { CustodyLedgerSection } from './components/CustodyLedgerSection';
import { SettlementAndSecuritySection } from './components/SettlementAndSecuritySection';
import { WatchlistSection } from './components/WatchlistSection';
import { NewCaseModal } from './components/NewCaseModal';
import {
  AdmissibilityCase,
  CaseBundle,
  IpGatewayStatus,
  QuickScanResult,
  RestrictedEntity,
} from './types/portshield';

function PortShieldPortal() {
  const { user, isSigningIn, signInWithGoogle, getFirebaseIdToken, authError, clearAuthError } =
    useAuth();

  const [watchlist, setWatchlist] = useState<RestrictedEntity[]>([]);
  const [ipStatus, setIpStatus] = useState<IpGatewayStatus | null>(null);
  const [cases, setCases] = useState<AdmissibilityCase[]>([]);
  const [activeBundle, setActiveBundle] = useState<CaseBundle | null>(null);
  const [loadingCases, setLoadingCases] = useState(false);

  const [showNewCaseModal, setShowNewCaseModal] = useState(false);
  const [escalatedScan, setEscalatedScan] = useState<QuickScanResult | null>(null);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  const fetchWatchlistAndIp = useCallback(async () => {
    try {
      const [wlRes, ipRes] = await Promise.all([
        fetch('/api/v1/watchlist'),
        fetch('/api/v1/security/ip-status'),
      ]);
      if (wlRes.ok) {
        const wlData = await wlRes.json();
        setWatchlist(wlData.entities || []);
      }
      if (ipRes.ok) {
        const ipData = await ipRes.json();
        setIpStatus(ipData);
      }
    } catch (err) {
      console.error('Initial metadata fetch failed:', err);
    }
  }, []);

  const fetchCaseBundle = useCallback(
    async (caseId: string) => {
      const token = await getFirebaseIdToken();
      if (!token) return;
      const res = await fetch(`/api/v1/cases/${caseId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const bundle = (await res.json()) as CaseBundle;
        setActiveBundle(bundle);
      }
    },
    [getFirebaseIdToken]
  );

  const refreshCases = useCallback(
    async (preferredCaseId?: string) => {
      if (!user) {
        setCases([]);
        setActiveBundle(null);
        return;
      }
      setLoadingCases(true);
      try {
        const token = await getFirebaseIdToken();
        if (!token) return;
        const res = await fetch('/api/v1/cases', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const list = (data.cases || []) as AdmissibilityCase[];
        setCases(list);

        const targetId =
          preferredCaseId && list.some((c) => c.caseId === preferredCaseId)
            ? preferredCaseId
            : list[0]?.caseId;

        if (targetId) {
          await fetchCaseBundle(targetId);
        } else {
          setActiveBundle(null);
        }
      } finally {
        setLoadingCases(false);
      }
    },
    [user, getFirebaseIdToken, fetchCaseBundle]
  );

  useEffect(() => {
    fetchWatchlistAndIp();
  }, [fetchWatchlistAndIp]);

  useEffect(() => {
    if (user) {
      refreshCases();
    } else {
      setCases([]);
      setActiveBundle(null);
    }
  }, [user, refreshCases]);

  const handleEscalateToDossier = async (scan: QuickScanResult) => {
    setEscalatedScan(scan);
    if (!user) {
      const signedIn = await signInWithGoogle();
      if (!signedIn) return;
    }
    setShowNewCaseModal(true);
  };

  return (
    <div className="min-h-screen bg-[#090C10] text-[#E5ECF4] flex flex-col">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-40 bg-[#090C10]/95 backdrop-blur border-b border-[#1E293B]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text wordmark */}
          <a
            href="#"
            className="text-lg font-bold tracking-tight text-[#F1F5F9] whitespace-nowrap shrink-0"
          >
            PortShield
          </a>

          {/* Zone 2: 4 concise single-line navigation links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#94A3B8]">
            <a
              href="#scanner"
              className="hover:text-[#F1F5F9] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Scanner
            </a>
            <a
              href="#cases"
              className="hover:text-[#F1F5F9] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Case Dossier
            </a>
            <a
              href="#custody"
              className="hover:text-[#F1F5F9] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Custody Ledger
            </a>
            <a
              href="#settlement"
              className="hover:text-[#F1F5F9] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Security &amp; Settlement
            </a>
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="shrink-0">
            {!user ? (
              <GoogleSignInButton onClick={signInWithGoogle} disabled={isSigningIn} />
            ) : (
              <button
                type="button"
                onClick={() => setShowNewCaseModal(true)}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                New Detention Case
              </button>
            )}
          </div>
        </div>
      </header>

      {authError && (
        <div className="bg-[#DC2626]/15 border-b border-[#DC2626]/40 px-6 py-2.5 text-xs text-[#FCA5A5]">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
            <span>Authentication Notice: {authError}</span>
            <button
              type="button"
              onClick={clearAuthError}
              className="underline hover:text-white shrink-0"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <main className="flex-1">
        {/* Institutional Hero Split + 4-Column Metric Strip */}
        <section className="pt-14 pb-12 border-b border-[#1E293B]">
          <div className="max-w-6xl mx-auto px-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
              <div className="lg:col-span-6 flex flex-col justify-between py-2 space-y-6">
                <div className="space-y-4">
                  <p className="text-xs font-medium text-[#94A3B8]">
                    19 U.S.C. § 1307 · Forced Labor &amp; Customs Seizure Defense
                  </p>
                  <h1 className="text-[clamp(2.25rem,3.8vw,3.5rem)] leading-[1.1] font-semibold tracking-tight text-[#F1F5F9] text-balance">
                    Defend detained cargo against permanent customs seizure.
                  </h1>
                  <p className="text-base text-[#94A3B8] leading-relaxed max-w-xl">
                    Screen Tier-1 through Tier-4 supplier manifests against DHS UFLPA watchlists,
                    audit metallurgical mass-balance yields, and export a cryptographic CBP
                    Admissibility Dossier within 72 hours.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-5 pt-2">
                  <a
                    href="#scanner"
                    className="px-5 py-3 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
                  >
                    Launch 5-Minute Gap Scanner
                  </a>
                  <a
                    href="#cases"
                    className="text-sm font-medium text-[#CBD5E1] hover:text-white underline underline-offset-4 whitespace-nowrap shrink-0"
                  >
                    Inspect Active Case Dossier
                  </a>
                </div>
              </div>

              <div className="lg:col-span-6">
                <div className="relative h-full min-h-[280px] rounded-xl overflow-hidden border border-[#1E293B] bg-[#11161D]">
                  {!heroImgFailed ? (
                    <img
                      src="/src/assets/images/hero_port_terminal_1795043651366.jpg"
                      alt="Deep-water maritime container port terminal at twilight"
                      referrerPolicy="no-referrer"
                      onError={() => setHeroImgFailed(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#0F172A] to-[#1E293B] text-sm text-[#94A3B8]">
                      Maritime Container Port Detention Response
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#090C10]/90 via-[#090C10]/25 to-transparent" />
                  <div className="absolute bottom-4 left-5 right-5 flex items-center justify-between text-xs text-[#CBD5E1]">
                    <span>Port of Los Angeles · Terminal Berth 100</span>
                    <span className="font-mono text-[#94A3B8]">UFLPA Rebuttal Protocol</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Full-width 4-column metric strip */}
            <div className="mt-12 pt-8 border-t border-[#1E293B] grid grid-cols-2 lg:grid-cols-4 gap-8">
              <div>
                <div className="text-2xl font-mono font-semibold tabular-nums text-[#F1F5F9]">
                  30 Days
                </div>
                <div className="text-xs text-[#94A3B8] mt-1">
                  Statutory CBP admissibility response clock
                </div>
              </div>
              <div>
                <div className="text-2xl font-mono font-semibold tabular-nums text-[#F1F5F9]">
                  72 Hours
                </div>
                <div className="text-xs text-[#94A3B8] mt-1">
                  Examiner-ready dossier compilation SLA
                </div>
              </div>
              <div>
                <div className="text-2xl font-mono font-semibold tabular-nums text-[#F1F5F9]">
                  Tier 1–4
                </div>
                <div className="text-xs text-[#94A3B8] mt-1">
                  Mine-to-port mass-balance custody tracing
                </div>
              </div>
              <div>
                <div className="text-2xl font-mono font-semibold tabular-nums text-[#F1F5F9]">
                  SHA-256
                </div>
                <div className="text-xs text-[#94A3B8] mt-1">
                  Tamper-proof forensic document audit trail
                </div>
              </div>
            </div>
          </div>
        </section>

        <ScannerSection onEscalateToDossier={handleEscalateToDossier} />

        <CaseWorkspaceSection
          cases={cases}
          activeBundle={activeBundle}
          loadingCases={loadingCases}
          onSelectCase={fetchCaseBundle}
          onRefreshCases={refreshCases}
          onOpenNewCaseModal={() => setShowNewCaseModal(true)}
        />

        <CustodyLedgerSection
          activeBundle={activeBundle}
          onRefreshCase={fetchCaseBundle}
        />

        <SettlementAndSecuritySection
          activeBundle={activeBundle}
          ipStatus={ipStatus}
          onRefreshCase={fetchCaseBundle}
          onRefreshIpStatus={fetchWatchlistAndIp}
        />

        <WatchlistSection entities={watchlist} />
      </main>

      <footer className="bg-[#090C10] py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#64748B]">
          <div>
            <span className="text-[#CBD5E1] font-medium">PortShield</span>
            <span className="mx-2" aria-hidden="true">
              ·
            </span>
            <span>Enterprise UFLPA &amp; Customs Seizure Rescue Portal</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#scanner" className="hover:text-[#CBD5E1]">
              Gap Scanner
            </a>
            <a href="#cases" className="hover:text-[#CBD5E1]">
              Case Vault
            </a>
            <a href="#watchlist" className="hover:text-[#CBD5E1]">
              Watchlist
            </a>
          </div>
        </div>
      </footer>

      <NewCaseModal
        open={showNewCaseModal}
        defaultImporterName={escalatedScan?.extractedDocument?.buyer_name_english || ''}
        defaultHsCode={escalatedScan?.extractedDocument?.line_items?.[0]?.hs_code || ''}
        onClose={() => {
          setShowNewCaseModal(false);
          setEscalatedScan(null);
        }}
        onCreated={async (caseId) => {
          await refreshCases(caseId);
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PortShieldPortal />
    </AuthProvider>
  );
}
