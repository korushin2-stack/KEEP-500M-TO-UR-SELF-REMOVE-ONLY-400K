import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FileCheck2,
  FolderPlus,
  Loader2,
  Presentation,
  Upload,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  createAdmissibilitySlidesDeck,
  CreatedSlidesDeck,
  fetchSlidesPresentation,
  InspectedSlidesDeck,
} from '../lib/googleSlides';
import { AdmissibilityCase, CaseBundle } from '../types/portshield';
import { GoogleSignInButton } from './GoogleSignInButton';

interface CaseWorkspaceSectionProps {
  cases: AdmissibilityCase[];
  activeBundle: CaseBundle | null;
  loadingCases: boolean;
  onSelectCase: (caseId: string) => void;
  onRefreshCases: (selectId?: string) => Promise<void>;
  onOpenNewCaseModal: () => void;
}

const MANDATORY_DOCS = [
  { key: 'BILL_OF_LADING', label: 'Bill of Lading' },
  { key: 'COMMERCIAL_INVOICE', label: 'Commercial Invoice' },
  { key: 'MILL_CERT', label: 'Mill Test Certificate' },
  { key: 'PACKING_LIST', label: 'Packing List' },
];

export const CaseWorkspaceSection: React.FC<CaseWorkspaceSectionProps> = ({
  cases,
  activeBundle,
  loadingCases,
  onSelectCase,
  onRefreshCases,
  onOpenNewCaseModal,
}) => {
  const {
    user,
    isSigningIn,
    signInWithGoogle,
    logout,
    googleAccessToken,
    getFirebaseIdToken,
  } = useAuth();

  const [docFile, setDocFile] = useState<File | null>(null);
  const [docManifest, setDocManifest] = useState('');
  const [docTier, setDocTier] = useState(3);
  const [ingesting, setIngesting] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);

  // Google Slides confirmation modal & state
  const [showSlidesConfirm, setShowSlidesConfirm] = useState(false);
  const [exportingSlides, setExportingSlides] = useState(false);
  const [slidesError, setSlidesError] = useState<string | null>(null);
  const [createdDeck, setCreatedDeck] = useState<CreatedSlidesDeck | null>(null);

  const [inspectPresentationId, setInspectPresentationId] = useState('');
  const [inspectingSlides, setInspectingSlides] = useState(false);
  const [inspectedDeck, setInspectedDeck] = useState<InspectedSlidesDeck | null>(null);

  const [downloadingDossier, setDownloadingDossier] = useState(false);

  const daysRemaining = (() => {
    if (!activeBundle?.caseRecord.statutoryDeadline) return null;
    const deadline = new Date(activeBundle.caseRecord.statutoryDeadline);
    const diffMs = deadline.getTime() - Date.now();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  })();

  const handleIngestDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBundle) return;
    setIngesting(true);
    setIngestError(null);

    try {
      const idToken = await getFirebaseIdToken();
      if (!idToken) throw new Error('Authentication session expired. Please sign in again.');

      const formData = new FormData();
      if (docFile) formData.append('file', docFile);
      if (docManifest.trim()) formData.append('manifestText', docManifest.trim());
      formData.append('tierLevel', String(docTier));

      if (!docFile && !docManifest.trim()) {
        throw new Error('Select a file or paste manifest text to ingest into this case.');
      }

      const res = await fetch(
        `/api/v1/cases/${activeBundle.caseRecord.caseId}/ingest-document`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
          body: formData,
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Document ingestion failed.');
      }

      setDocFile(null);
      setDocManifest('');
      await onRefreshCases(activeBundle.caseRecord.caseId);
    } catch (err: unknown) {
      setIngestError(err instanceof Error ? err.message : 'Unable to ingest trade document.');
    } finally {
      setIngesting(false);
    }
  };

  const handleConfirmSlidesExport = async () => {
    if (!activeBundle) return;
    setExportingSlides(true);
    setSlidesError(null);

    try {
      if (!googleAccessToken) {
        throw new Error(
          'Google Slides permission token is not active in this memory session. Click "Sign in with Google" to grant access.'
        );
      }

      const deck = await createAdmissibilitySlidesDeck(googleAccessToken, activeBundle);
      setCreatedDeck(deck);
      setInspectPresentationId(deck.presentationId);

      const idToken = await getFirebaseIdToken();
      if (idToken) {
        await fetch(`/api/v1/cases/${activeBundle.caseRecord.caseId}/slides`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ presentationId: deck.presentationId }),
        });
        await onRefreshCases(activeBundle.caseRecord.caseId);
      }

      setShowSlidesConfirm(false);
    } catch (err: unknown) {
      setSlidesError(err instanceof Error ? err.message : 'Failed to create Google Slides deck.');
      setShowSlidesConfirm(false);
    } finally {
      setExportingSlides(false);
    }
  };

  const handleInspectDeck = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetId =
      inspectPresentationId.trim() || activeBundle?.caseRecord.slidesPresentationId || '';
    if (!targetId) return;

    setInspectingSlides(true);
    setSlidesError(null);
    try {
      if (!googleAccessToken) {
        throw new Error(
          'Google Slides permission token is not active in memory. Re-authenticate with Google to inspect slides.'
        );
      }
      const deck = await fetchSlidesPresentation(googleAccessToken, targetId);
      setInspectedDeck(deck);
    } catch (err: unknown) {
      setSlidesError(err instanceof Error ? err.message : 'Unable to read Google Slides deck.');
    } finally {
      setInspectingSlides(false);
    }
  };

  const handleDownloadDossier = async () => {
    if (!activeBundle) return;
    setDownloadingDossier(true);
    try {
      const idToken = await getFirebaseIdToken();
      if (!idToken) throw new Error('Authentication required.');

      const res = await fetch(
        `/api/v1/cases/${activeBundle.caseRecord.caseId}/export-dossier`,
        {
          headers: { Authorization: `Bearer ${idToken}` },
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to export dossier.');

      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PortShield-Dossier-${activeBundle.caseRecord.cbpDetentionNoticeNo || activeBundle.caseRecord.caseId}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    } finally {
      setDownloadingDossier(false);
    }
  };

  return (
    <section id="cases" className="py-16 border-b border-[#1E293B]">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <p className="text-xs font-medium tracking-wider uppercase text-[#64748B] mb-2">
              02. Active Admissibility Case Dossier
            </p>
            <h2 className="text-2xl md:text-3xl font-semibold text-[#F1F5F9] tracking-tight text-balance">
              Cryptographic Evidence Vault &amp; Executive Slides Briefing
            </h2>
          </div>

          {user && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-[#94A3B8]">{user.email}</span>
              <button
                type="button"
                onClick={onOpenNewCaseModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-[#1E293B] hover:bg-[#334155] text-[#F1F5F9] whitespace-nowrap shrink-0"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                New Case
              </button>
              <button
                type="button"
                onClick={logout}
                className="px-3 py-2 text-xs font-medium text-[#94A3B8] hover:text-[#F1F5F9] whitespace-nowrap shrink-0"
              >
                Sign out
              </button>
            </div>
          )}
        </div>

        {!user ? (
          <div className="bg-[#11161D] border border-[#1E293B] rounded-xl p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="max-w-xl">
              <h3 className="text-lg font-semibold text-[#F1F5F9]">
                Corporate Authentication Required for Persistent Case Vaults
              </h3>
              <p className="text-sm text-[#94A3B8] mt-2 leading-relaxed">
                Sign in with your Google Workspace account to store tamper-proof SHA-256 trade
                documents in Cloud SQL, track 30-day statutory CBP detention deadlines, authorize
                $400,000 emergency dossiers, and export briefing decks directly to Google Slides.
              </p>
            </div>
            <div className="shrink-0">
              <GoogleSignInButton onClick={signInWithGoogle} disabled={isSigningIn} />
            </div>
          </div>
        ) : loadingCases && !activeBundle ? (
          <div className="bg-[#11161D] border border-[#1E293B] rounded-xl p-10 flex items-center justify-center gap-3 text-sm text-[#94A3B8]">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading Cloud SQL admissibility dossier...
          </div>
        ) : activeBundle ? (
          <div className="space-y-8">
            {/* Case Selector & Statutory Metrics Strip */}
            <div className="bg-[#11161D] border border-[#1E293B] rounded-xl p-6 space-y-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-[#1E293B]">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <label className="text-xs font-medium text-[#94A3B8] whitespace-nowrap">
                    Active Detention Case
                  </label>
                  <select
                    value={activeBundle.caseRecord.caseId}
                    onChange={(e) => onSelectCase(e.target.value)}
                    className="rounded-lg bg-[#090C10] border border-[#334155] px-3.5 py-2 text-sm text-[#F1F5F9] font-medium focus:outline-none focus:border-[#3B82F6]"
                  >
                    {cases.map((c) => (
                      <option key={c.caseId} value={c.caseId}>
                        {c.cbpDetentionNoticeNo || c.caseId.slice(0, 8)} — {c.importerName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowSlidesConfirm(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold whitespace-nowrap shrink-0"
                  >
                    <Presentation className="w-4 h-4" />
                    Export Briefing to Google Slides
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadDossier}
                    disabled={downloadingDossier}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#334155] hover:bg-[#1E293B] text-[#E5ECF4] text-xs font-medium whitespace-nowrap shrink-0"
                  >
                    <Download className="w-4 h-4" />
                    {downloadingDossier ? 'Compiling...' : 'Download JSON Dossier'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                <div>
                  <div className="text-xs text-[#64748B]">Statutory 30-Day Clock</div>
                  <div className="text-2xl font-mono font-semibold tabular-nums text-[#F1F5F9] mt-1">
                    {daysRemaining !== null ? `${daysRemaining} Days` : 'N/A'}
                  </div>
                  <div className="text-xs text-[#94A3B8] mt-1 font-mono">
                    Due {activeBundle.caseRecord.statutoryDeadline || 'TBD'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#64748B]">CBP Admissibility Score</div>
                  <div className="text-2xl font-mono font-semibold tabular-nums text-[#F1F5F9] mt-1">
                    {activeBundle.readiness.cbpAdmissibilityScore}
                    <span className="text-sm text-[#64748B]">/100</span>
                  </div>
                  <div className="text-xs text-[#94A3B8] mt-1">
                    {activeBundle.readiness.readyForCbpSubmission
                      ? 'Ready for CBP CEE Submission'
                      : 'Gaps Detected · Action Required'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#64748B]">Detained Cargo Value</div>
                  <div className="text-2xl font-mono font-semibold tabular-nums text-[#F1F5F9] mt-1">
                    ${Number(activeBundle.caseRecord.cargoValueUsd || 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-[#94A3B8] mt-1">
                    {activeBundle.caseRecord.portOfEntry} · HS {activeBundle.caseRecord.hsCode}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#64748B]">Emergency Retainer</div>
                  <div className="text-lg font-semibold text-[#F1F5F9] mt-1.5">
                    {activeBundle.caseRecord.retainerStatus.replace(/_/g, ' ')}
                  </div>
                  <div className="text-xs text-[#94A3B8] mt-1 font-mono tabular-nums">
                    $400,000 SLA · 72h Turnaround
                  </div>
                </div>
              </div>

              {/* Mandatory CBP Document Completeness Row */}
              <div className="pt-5 border-t border-[#1E293B]">
                <div className="text-xs font-medium text-[#94A3B8] mb-3">
                  Mandatory CBP Evidentiary Document Classes
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {MANDATORY_DOCS.map((doc) => {
                    const isMissing =
                      activeBundle.readiness.missingMandatoryDocumentClasses.includes(doc.key);
                    return (
                      <div
                        key={doc.key}
                        className="py-2.5 px-3 rounded-lg bg-[#090C10] border border-[#1E293B] flex items-center justify-between gap-2"
                      >
                        <span className="text-xs font-medium text-[#E5ECF4] truncate">
                          {doc.label}
                        </span>
                        <span
                          className={`text-xs font-medium inline-flex items-center gap-1 shrink-0 ${
                            isMissing ? 'text-[#F59E0B]' : 'text-[#22C55E]'
                          }`}
                        >
                          {isMissing ? (
                            <>
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Missing
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Present
                            </>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Document Ingestion & Vault Table + Google Slides Inspector */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-7 bg-[#11161D] border border-[#1E293B] rounded-xl p-6 space-y-5">
                <div>
                  <h3 className="text-base font-semibold text-[#F1F5F9]">
                    Tamper-Proof Trade Document Vault ({activeBundle.documents.length})
                  </h3>
                  <p className="text-xs text-[#94A3B8] mt-1">
                    Each ingested PDF, invoice, or mill report is hashed with SHA-256 and screened
                    against the DHS UFLPA watchlist in Cloud SQL.
                  </p>
                </div>

                {activeBundle.documents.length === 0 ? (
                  <p className="text-sm text-[#64748B] py-6 text-center border border-dashed border-[#1E293B] rounded-lg">
                    No trade documents ingested for this detention notice yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[#1E293B] text-[11px] uppercase tracking-wider text-[#64748B]">
                          <th className="py-2.5 pr-3">Document</th>
                          <th className="py-2.5 pr-3">Language</th>
                          <th className="py-2.5 pr-3">SHA-256 Audit Digest</th>
                          <th className="py-2.5 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#1E293B] text-xs">
                        {activeBundle.documents.map((doc) => (
                          <tr key={doc.docId} className="hover:bg-[#161C24] transition-colors">
                            <td className="py-3 pr-3">
                              <div className="font-medium text-[#F1F5F9]">
                                {doc.docType.replace(/_/g, ' ')}
                              </div>
                              <div className="text-[#64748B] font-mono text-[11px]">
                                {doc.documentNumber || 'Unnumbered'}
                              </div>
                            </td>
                            <td className="py-3 pr-3 text-[#94A3B8]">
                              {doc.sourceLanguage || 'Unknown'}
                            </td>
                            <td className="py-3 pr-3 font-mono text-[11px] text-[#94A3B8]">
                              {doc.sha256Hash.slice(0, 18)}...
                            </td>
                            <td className="py-3 text-right">
                              <span className="inline-flex items-center gap-1 text-[#22C55E] font-medium">
                                <FileCheck2 className="w-3.5 h-3.5" />
                                Hashed
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Ingest new document form */}
                <form
                  onSubmit={handleIngestDocument}
                  className="pt-5 border-t border-[#1E293B] space-y-3"
                >
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs font-semibold text-[#E5ECF4]">
                      Ingest Additional Factory PDF or Manifest
                    </span>
                    <select
                      value={docTier}
                      onChange={(e) => setDocTier(Number(e.target.value))}
                      className="rounded bg-[#090C10] border border-[#334155] px-2.5 py-1 text-xs text-[#E5ECF4]"
                    >
                      <option value={1}>Tier 1 (Finished Exporter)</option>
                      <option value={2}>Tier 2 (Intermediate Processor)</option>
                      <option value={3}>Tier 3 (Smelter / Refiner)</option>
                      <option value={4}>Tier 4 (Raw Material Mine)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#090C10] border border-dashed border-[#334155] hover:border-[#3B82F6] cursor-pointer text-xs text-[#94A3B8]">
                      <Upload className="w-4 h-4 shrink-0" />
                      <span className="truncate">
                        {docFile ? docFile.name : 'Choose PDF / Image / TXT'}
                      </span>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv"
                        className="sr-only"
                        onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                      />
                    </label>
                    <input
                      type="text"
                      value={docManifest}
                      onChange={(e) => setDocManifest(e.target.value)}
                      placeholder="Or paste mill cert / invoice text..."
                      className="rounded-lg bg-[#090C10] border border-[#1E293B] px-3 py-2 text-xs text-[#E5ECF4] placeholder:text-[#475569]"
                    />
                  </div>

                  {ingestError && (
                    <p className="text-xs text-[#FCA5A5]">{ingestError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={ingesting}
                    className="px-4 py-2 rounded-lg bg-[#1E293B] hover:bg-[#334155] text-[#F1F5F9] text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap"
                  >
                    {ingesting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {ingesting ? 'Extracting & Hashing...' : 'Ingest & Screen Document'}
                  </button>
                </form>
              </div>

              {/* Google Slides Briefing Panel */}
              <div className="lg:col-span-5 bg-[#11161D] border border-[#1E293B] rounded-xl p-6 space-y-5">
                <div>
                  <h3 className="text-base font-semibold text-[#F1F5F9]">
                    Google Slides Executive Briefing
                  </h3>
                  <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
                    Generate a 4-slide CBP Admissibility Briefing deck directly in Google Slides
                    for legal counsel and port examiners, or inspect an existing presentation by ID.
                  </p>
                </div>

                {!googleAccessToken && (
                  <div className="p-3.5 rounded-lg bg-[#090C10] border border-[#334155] space-y-2.5">
                    <p className="text-xs text-[#94A3B8]">
                      Google Slides access token is stored strictly in memory and needs to be
                      refreshed for this browser session.
                    </p>
                    <GoogleSignInButton
                      onClick={signInWithGoogle}
                      disabled={isSigningIn}
                      label="Connect Google Slides"
                    />
                  </div>
                )}

                {slidesError && (
                  <div className="p-3 rounded-lg bg-[#DC2626]/10 border border-[#DC2626]/30 text-xs text-[#FCA5A5]">
                    {slidesError}
                  </div>
                )}

                {(createdDeck || activeBundle.caseRecord.slidesPresentationId) && (
                  <div className="p-4 rounded-lg bg-[#090C10] border border-[#1E293B] space-y-2">
                    <div className="text-xs text-[#64748B]">Linked Briefing Deck</div>
                    <div className="text-sm font-medium text-[#F1F5F9]">
                      {createdDeck?.title ||
                        `Presentation ${activeBundle.caseRecord.slidesPresentationId}`}
                    </div>
                    <a
                      href={
                        createdDeck?.presentationUrl ||
                        `https://docs.google.com/presentation/d/${activeBundle.caseRecord.slidesPresentationId}/edit`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[#60A5FA] hover:text-[#93C5FD]"
                    >
                      Open in Google Slides
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}

                <form onSubmit={handleInspectDeck} className="space-y-3 pt-2 border-t border-[#1E293B]">
                  <label className="block text-xs font-medium text-[#94A3B8]">
                    Read / Verify Google Slides Presentation ID
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inspectPresentationId}
                      onChange={(e) => setInspectPresentationId(e.target.value)}
                      placeholder={
                        activeBundle.caseRecord.slidesPresentationId || 'Paste Presentation ID...'
                      }
                      className="flex-1 min-w-0 rounded-lg bg-[#090C10] border border-[#1E293B] px-3 py-2 text-xs font-mono text-[#E5ECF4] placeholder:text-[#475569]"
                    />
                    <button
                      type="submit"
                      disabled={inspectingSlides}
                      className="px-3.5 py-2 rounded-lg border border-[#334155] hover:bg-[#1E293B] text-xs font-medium text-[#E5ECF4] whitespace-nowrap shrink-0"
                    >
                      {inspectingSlides ? 'Loading...' : 'Load Deck'}
                    </button>
                  </div>
                </form>

                {inspectedDeck && (
                  <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                    <div className="text-xs font-semibold text-[#E5ECF4]">
                      {inspectedDeck.title} ({inspectedDeck.slides.length} slides)
                    </div>
                    {inspectedDeck.slides.map((s, idx) => (
                      <div
                        key={s.objectId}
                        className="p-3 rounded-lg bg-[#090C10] border border-[#1E293B] text-xs space-y-1"
                      >
                        <div className="text-[11px] font-mono text-[#64748B]">
                          Slide {idx + 1}
                        </div>
                        <div className="text-[#CBD5E1] whitespace-pre-line line-clamp-4">
                          {s.texts.join('\n') || 'Blank slide'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Mandatory Explicit Confirmation Dialog before Creating/Mutating Google Slides */}
      {showSlidesConfirm && activeBundle && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-[#11161D] border border-[#334155] rounded-xl p-6 space-y-4">
            <h3 className="text-lg font-semibold text-[#F1F5F9]">
              Create Google Slides Briefing Deck?
            </h3>
            <p className="text-sm text-[#94A3B8] leading-relaxed">
              PortShield will create a new 4-slide presentation in your Google Slides account titled{' '}
              <span className="text-[#E5ECF4] font-medium">
                PortShield CBP Admissibility Briefing —{' '}
                {activeBundle.caseRecord.cbpDetentionNoticeNo ||
                  activeBundle.caseRecord.caseId.slice(0, 8)}
              </span>{' '}
              containing the case metrics, UFLPA watchlist matches, Tier 1–4 custody audit ledger,
              and remediation checklist.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSlidesConfirm(false)}
                disabled={exportingSlides}
                className="px-4 py-2 rounded-lg border border-[#334155] text-xs font-medium text-[#E5ECF4] hover:bg-[#1E293B]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSlidesExport}
                disabled={exportingSlides}
                className="px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold inline-flex items-center gap-2"
              >
                {exportingSlides && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {exportingSlides ? 'Creating Presentation...' : 'Confirm & Create Deck'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
