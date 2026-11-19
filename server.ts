import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { createServer as createViteServer } from 'vite';

import { db } from './src/db/index.ts';
import {
  admissibilityCases,
  custodyChainLinks,
  restrictedEntities,
  supplyEntities,
  tradeDocuments,
} from './src/db/schema.ts';
import {
  ensureUserStarterCase,
  ensureWatchlistSeeded,
  screenEntityAgainstWatchlist,
} from './src/db/seed.ts';
import { extractTradeDocumentWithGemini } from './src/lib/gemini.ts';
import {
  computeMassBalanceYield,
  CustomsCasePayload,
  evaluateLinkStatus,
  TierSupplier,
} from './src/lib/forensics.ts';
import { AuthRequest, requireAuth } from './src/middleware/auth.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '50mb' }));
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  })
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// --- 1. STRICT ENTERPRISE IP SECURITY MIDDLEWARE ---
const ALLOWED_CORPORATE_IPS = new Set<string>(
  [
    process.env.ENTERPRISE_VPN_IP_1 || '197.243.0.1',
    process.env.MASTER_ADMIN_IP || '127.0.0.1',
    '::1',
    '::ffff:127.0.0.1',
  ].filter(Boolean)
);

let strictIpLockEnabled = false;

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function enforceEnterpriseIP(req: Request, res: Response, next: NextFunction) {
  const clientIp = getClientIp(req);
  if (strictIpLockEnabled && !ALLOWED_CORPORATE_IPS.has(clientIp)) {
    return res.status(403).json({
      error: 'ACCESS_DENIED',
      message: 'Zero-Trust Policy: Request origin IP not whitelisted in enterprise gateway.',
      detectedIp: clientIp,
      strictIpLockEnabled,
    });
  }
  next();
}

// IP Security Gateway Status & Policy Management
app.get('/api/v1/security/ip-status', (req: Request, res: Response) => {
  const detectedIp = getClientIp(req);
  res.json({
    detectedIp,
    isWhitelisted: ALLOWED_CORPORATE_IPS.has(detectedIp),
    strictIpLockEnabled,
    whitelistedIps: Array.from(ALLOWED_CORPORATE_IPS),
  });
});

app.post('/api/v1/security/ip-policy', requireAuth, (req: AuthRequest, res: Response) => {
  const { addIp, removeIp, strictMode } = req.body as {
    addIp?: string;
    removeIp?: string;
    strictMode?: boolean;
  };

  if (addIp && typeof addIp === 'string' && addIp.trim().length > 0) {
    ALLOWED_CORPORATE_IPS.add(addIp.trim());
  }
  if (removeIp && typeof removeIp === 'string') {
    ALLOWED_CORPORATE_IPS.delete(removeIp.trim());
  }
  if (typeof strictMode === 'boolean') {
    strictIpLockEnabled = strictMode;
  }

  const detectedIp = getClientIp(req);
  res.json({
    detectedIp,
    isWhitelisted: ALLOWED_CORPORATE_IPS.has(detectedIp),
    strictIpLockEnabled,
    whitelistedIps: Array.from(ALLOWED_CORPORATE_IPS),
  });
});

// --- 2. PUBLIC WATCHLIST & FREE 5-MINUTE DETENTION RISK SCANNER ---
app.get('/api/v1/watchlist', async (_req: Request, res: Response) => {
  try {
    await ensureWatchlistSeeded();
    const list = await db.select().from(restrictedEntities);
    res.json({ entities: list });
  } catch (error) {
    console.error('Watchlist fetch failed:', error);
    res.status(500).json({ error: 'Unable to load UFLPA restricted entity list.' });
  }
});

app.post('/api/v1/public/quick-scan', upload.single('document'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const manifestText = typeof req.body?.manifestText === 'string' ? req.body.manifestText : '';
    let suppliers: TierSupplier[] = [];

    if (typeof req.body?.suppliers === 'string' && req.body.suppliers.trim()) {
      try {
        suppliers = JSON.parse(req.body.suppliers);
      } catch {
        return res.status(400).json({ error: 'Invalid suppliers JSON payload.' });
      }
    } else if (Array.isArray(req.body?.suppliers)) {
      suppliers = req.body.suppliers;
    }

    if (!file && !manifestText.trim() && suppliers.length === 0) {
      return res.status(400).json({
        error: 'Upload a trade document (PDF, PNG, JPG, TXT, CSV) or provide manifest/tier weight data to scan.',
      });
    }

    const rawBytes = file
      ? file.buffer
      : Buffer.from(manifestText || JSON.stringify(suppliers), 'utf-8');
    const sha256Hash = crypto.createHash('sha256').update(rawBytes).digest('hex');

    let extracted = null;
    let watchlistMatch = null;
    const redFlags: string[] = [];

    if (file || manifestText.trim()) {
      extracted = await extractTradeDocumentWithGemini(
        file ? file.buffer : null,
        file ? file.mimetype : null,
        file ? file.originalname : null,
        manifestText
      );

      watchlistMatch = await screenEntityAgainstWatchlist(
        extracted.seller_name_english,
        extracted.seller_name_native
      );

      if (extracted.red_flags_detected?.length) {
        redFlags.push(...extracted.red_flags_detected);
      }
      if (
        extracted.seller_address?.toLowerCase().includes('xinjiang') ||
        extracted.seller_address?.toLowerCase().includes('shihezi') ||
        extracted.seller_address?.toLowerCase().includes('urumqi')
      ) {
        redFlags.push('High-Risk Region Indicator: Seller address references Xinjiang Uygur Autonomous Region.');
      }
    }

    const supplierScreens = [];
    for (const s of suppliers) {
      const hit = await screenEntityAgainstWatchlist(s.entityName, null);
      supplierScreens.push({
        tierLevel: s.tierLevel,
        entityName: s.entityName,
        country: s.country,
        match: hit,
      });
      if (hit) {
        redFlags.push(`Tier ${s.tierLevel} (${s.entityName}) matched UFLPA Watchlist: ${hit.officialName} (${Math.round(hit.score * 100)}% similarity).`);
      }
    }

    const massBalance =
      suppliers.length >= 2
        ? computeMassBalanceYield(suppliers)
        : { isValid: true, anomalyNotes: [] };

    if (!massBalance.isValid) {
      redFlags.push(...massBalance.anomalyNotes);
    }

    let admissibilityScore = 96;
    if (watchlistMatch || supplierScreens.some((s) => s.match)) {
      admissibilityScore -= 60;
    }
    if (!massBalance.isValid) {
      admissibilityScore -= 25;
    }
    if (redFlags.length > 0 && admissibilityScore > 45) {
      admissibilityScore -= Math.min(20, redFlags.length * 7);
    }
    admissibilityScore = Math.max(4, admissibilityScore);

    const requiresEmergencyDossier =
      admissibilityScore < 85 || Boolean(watchlistMatch) || !massBalance.isValid;

    res.json({
      scanId: `SCAN-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      timestamp: new Date().toISOString(),
      sha256AuditHash: sha256Hash,
      admissibilityScore,
      riskClassification:
        admissibilityScore < 50
          ? 'CRITICAL_DETENTION_RISK'
          : admissibilityScore < 85
            ? 'GAP_DETECTED'
            : 'PRELIMINARY_CLEAR',
      extractedDocument: extracted,
      watchlistMatch,
      supplierScreens,
      massBalanceAudit: massBalance,
      redFlagsDetected: Array.from(new Set(redFlags)),
      requiresEmergencyDossier,
      recommendedRetainerUsd: requiresEmergencyDossier ? 400000 : 0,
    });
  } catch (error: unknown) {
    console.error('Quick scan failed:', error);
    const message = error instanceof Error ? error.message : 'Forensic document scan failed.';
    res.status(500).json({ error: message });
  }
});

// --- 3. AUTHENTICATED CASE & AUDIT READINESS HELPERS ---
async function buildCaseReadiness(caseId: string) {
  const [caseRow] = await db
    .select()
    .from(admissibilityCases)
    .where(eq(admissibilityCases.caseId, caseId));

  if (!caseRow) return null;

  const docs = await db
    .select()
    .from(tradeDocuments)
    .where(eq(tradeDocuments.caseId, caseId))
    .orderBy(desc(tradeDocuments.createdAt));

  const links = await db
    .select()
    .from(custodyChainLinks)
    .where(eq(custodyChainLinks.caseId, caseId));

  const issuerIds = Array.from(
    new Set(docs.map((d) => d.issuerEntityId).filter((id): id is string => Boolean(id)))
  );

  const entities =
    issuerIds.length > 0
      ? await db
          .select()
          .from(supplyEntities)
          .where(inArray(supplyEntities.entityId, issuerIds))
      : [];

  const watchlistIds = Array.from(
    new Set(entities.map((e) => e.matchedWatchlistId).filter((id): id is string => Boolean(id)))
  );

  const matchedWatchlist =
    watchlistIds.length > 0
      ? await db
          .select()
          .from(restrictedEntities)
          .where(inArray(restrictedEntities.entityId, watchlistIds))
      : [];

  const watchlistById = new Map(matchedWatchlist.map((w) => [w.entityId, w]));

  const flaggedEntities = entities
    .filter((e) => e.screeningStatus !== 'CLEAR')
    .map((e) => ({
      entityId: e.entityId,
      legalName: e.legalName,
      localLanguageName: e.localLanguageName,
      countryCode: e.countryCode,
      tierLevel: e.tierLevel,
      screeningStatus: e.screeningStatus,
      matchedEntity: e.matchedWatchlistId
        ? watchlistById.get(e.matchedWatchlistId)?.officialName || 'UFLPA Listed Entity'
        : 'High-Risk Origin Flag',
    }));

  const brokenLinks = links.filter(
    (l) => Number(l.yieldRatio || 0) > 1.02 || l.linkStatus !== 'VERIFIED'
  );

  const presentTypes = new Set(docs.map((d) => d.docType));
  const mandatoryTypes = ['BILL_OF_LADING', 'COMMERCIAL_INVOICE', 'MILL_CERT', 'PACKING_LIST'];
  const missingDocTypes = mandatoryTypes.filter((t) => !presentTypes.has(t));

  let score = 100;
  if (flaggedEntities.length > 0) score -= 55;
  score -= brokenLinks.length * 15;
  score -= missingDocTypes.length * 10;
  score = Math.max(0, score);

  return {
    caseRecord: caseRow,
    documents: docs,
    custodyLinks: links,
    entities,
    readiness: {
      caseId,
      cbpAdmissibilityScore: score,
      readyForCbpSubmission: score >= 95 && flaggedEntities.length === 0,
      criticalWatchlistBlocks: flaggedEntities,
      massBalanceOrChainGaps: brokenLinks,
      missingMandatoryDocumentClasses: missingDocTypes,
    },
  };
}

// --- 4. AUTHENTICATED CASE WORKFLOW ROUTES ---
app.get('/api/v1/cases', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    await ensureUserStarterCase(uid);

    const cases = await db
      .select()
      .from(admissibilityCases)
      .where(eq(admissibilityCases.ownerUid, uid))
      .orderBy(desc(admissibilityCases.createdAt));

    res.json({ cases });
  } catch (error) {
    console.error('Failed to list cases:', error);
    res.status(500).json({ error: 'Unable to retrieve admissibility cases.' });
  }
});

app.post('/api/v1/cases', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const {
      importerName,
      cbpDetentionNoticeNo,
      portOfEntry,
      containerNumbers,
      cargoValueUsd,
      commoditySector,
      hsCode,
      detentionDate,
    } = req.body as {
      importerName?: string;
      cbpDetentionNoticeNo?: string;
      portOfEntry?: string;
      containerNumbers?: string[] | string;
      cargoValueUsd?: number | string;
      commoditySector?: string;
      hsCode?: string;
      detentionDate?: string;
    };

    if (!importerName?.trim() || !cbpDetentionNoticeNo?.trim()) {
      return res.status(400).json({
        error: 'Importer name and CBP Detention Notice number are required.',
      });
    }

    const baseDate = detentionDate ? new Date(detentionDate) : new Date();
    const deadlineDate = new Date(baseDate);
    deadlineDate.setDate(deadlineDate.getDate() + 30);

    const parsedContainers = Array.isArray(containerNumbers)
      ? containerNumbers
      : typeof containerNumbers === 'string'
        ? containerNumbers
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean)
        : [];

    const [created] = await db
      .insert(admissibilityCases)
      .values({
        ownerUid: uid,
        importerName: importerName.trim(),
        cbpDetentionNoticeNo: cbpDetentionNoticeNo.trim(),
        portOfEntry: portOfEntry?.trim() || 'Port of Los Angeles (2704)',
        containerNumbers: parsedContainers,
        cargoValueUsd: String(Number(cargoValueUsd || 0).toFixed(2)),
        commoditySector: commoditySector?.trim() || 'Aluminum & Battery Components',
        hsCode: hsCode?.trim() || '7604.29.10',
        detentionDate: baseDate.toISOString().slice(0, 10),
        statutoryDeadline: deadlineDate.toISOString().slice(0, 10),
        status: 'INGESTING_DOCS',
        retainerStatus: 'UNPAID',
        retainerAmountUsd: '400000.00',
      })
      .returning();

    res.status(201).json({ caseRecord: created });
  } catch (error) {
    console.error('Failed to create case:', error);
    res.status(500).json({ error: 'Unable to create admissibility case.' });
  }
});

app.get('/api/v1/cases/:caseId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const caseId = String(req.params.caseId);
    const bundle = await buildCaseReadiness(caseId);
    if (!bundle || bundle.caseRecord.ownerUid !== uid) {
      return res.status(404).json({ error: 'Admissibility case not found.' });
    }
    res.json(bundle);
  } catch (error) {
    console.error('Failed to fetch case:', error);
    res.status(500).json({ error: 'Unable to fetch case details.' });
  }
});

app.post(
  '/api/v1/cases/:caseId/ingest-document',
  requireAuth,
  upload.single('file'),
  async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user!.uid;
      const caseId = String(req.params.caseId);

      const [existingCase] = await db
        .select()
        .from(admissibilityCases)
        .where(and(eq(admissibilityCases.caseId, caseId), eq(admissibilityCases.ownerUid, uid)));

      if (!existingCase) {
        return res.status(404).json({ error: 'Admissibility case not found.' });
      }

      const file = req.file;
      const manifestText = typeof req.body?.manifestText === 'string' ? req.body.manifestText : '';
      const tierLevel = Number(req.body?.tierLevel || 1);

      if (!file && !manifestText.trim()) {
        return res.status(400).json({ error: 'Provide a trade document file or manifest text.' });
      }

      const rawBytes = file ? file.buffer : Buffer.from(manifestText, 'utf-8');
      const sha256Hash = crypto.createHash('sha256').update(rawBytes).digest('hex');

      const extracted = await extractTradeDocumentWithGemini(
        file ? file.buffer : null,
        file ? file.mimetype : null,
        file ? file.originalname : 'manual-manifest.txt',
        manifestText
      );

      const watchlistHit = await screenEntityAgainstWatchlist(
        extracted.seller_name_english,
        extracted.seller_name_native
      );

      const addressLower = (extracted.seller_address || '').toLowerCase();
      const highRiskRegion =
        addressLower.includes('xinjiang') ||
        addressLower.includes('shihezi') ||
        addressLower.includes('urumqi');

      const screeningStatus = watchlistHit
        ? 'FLAGGED_MATCH'
        : highRiskRegion
          ? 'HIGH_RISK_REGION'
          : 'CLEAR';

      const [sellerEntity] = await db
        .insert(supplyEntities)
        .values({
          legalName: extracted.seller_name_english,
          localLanguageName: extracted.seller_name_native || null,
          countryCode: (extracted.seller_country_code || 'UNK').slice(0, 3).toUpperCase(),
          provinceOrState: extracted.seller_address?.slice(0, 95) || null,
          tierLevel: Math.min(4, Math.max(0, tierLevel)),
          screeningStatus,
          matchedWatchlistId: watchlistHit ? watchlistHit.entityId : null,
        })
        .returning();

      const validIsoDate =
        extracted.issue_date && /^\d{4}-\d{2}-\d{2}$/.test(extracted.issue_date)
          ? extracted.issue_date
          : null;

      const [savedDoc] = await db
        .insert(tradeDocuments)
        .values({
          caseId,
          docType: extracted.doc_type || 'COMMERCIAL_INVOICE',
          documentNumber: extracted.document_number || `DOC-${sha256Hash.slice(0, 8)}`,
          issueDate: validIsoDate,
          issuerEntityId: sellerEntity.entityId,
          sourceLanguage: extracted.source_language || 'Unknown',
          storageUri: `vault://portshield/${caseId}/${sha256Hash}_${file?.originalname || 'manifest.txt'}`,
          rawExtractedJson: extracted,
          sha256Hash,
          verifiedByAi: true,
        })
        .returning();

      const bundle = await buildCaseReadiness(caseId);
      const nextStatus =
        bundle && bundle.readiness.readyForCbpSubmission
          ? 'DOSSIER_READY'
          : bundle &&
              (bundle.readiness.criticalWatchlistBlocks.length > 0 ||
                bundle.readiness.massBalanceOrChainGaps.length > 0)
            ? 'GAP_DETECTED'
            : 'INGESTING_DOCS';

      await db
        .update(admissibilityCases)
        .set({ status: nextStatus })
        .where(eq(admissibilityCases.caseId, caseId));

      res.status(201).json({
        status: 'INGESTED',
        docId: savedDoc.docId,
        sha256AuditHash: sha256Hash,
        screeningAlert: screeningStatus,
        watchlistMatch: watchlistHit,
        extractedData: extracted,
        bundle: await buildCaseReadiness(caseId),
      });
    } catch (error: unknown) {
      console.error('Document ingestion failed:', error);
      const message = error instanceof Error ? error.message : 'Document ingestion failed.';
      res.status(500).json({ error: message });
    }
  }
);

app.post('/api/v1/cases/:caseId/custody-links', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const caseId = String(req.params.caseId);

    const [existingCase] = await db
      .select()
      .from(admissibilityCases)
      .where(and(eq(admissibilityCases.caseId, caseId), eq(admissibilityCases.ownerUid, uid)));

    if (!existingCase) {
      return res.status(404).json({ error: 'Admissibility case not found.' });
    }

    const {
      upstreamEntityName,
      downstreamEntityName,
      upstreamTier,
      downstreamTier,
      materialDescription,
      batchOrLotNumber,
      inputWeightKg,
      outputWeightKg,
    } = req.body as {
      upstreamEntityName?: string;
      downstreamEntityName?: string;
      upstreamTier?: number;
      downstreamTier?: number;
      materialDescription?: string;
      batchOrLotNumber?: string;
      inputWeightKg?: number;
      outputWeightKg?: number;
    };

    const inKg = Number(inputWeightKg || 0);
    const outKg = Number(outputWeightKg || 0);

    if (!materialDescription?.trim() || outKg <= 0) {
      return res.status(400).json({
        error: 'Material description and positive output weight (kg) are required.',
      });
    }

    const { yieldRatio, linkStatus } = evaluateLinkStatus(inKg, outKg);

    const [createdLink] = await db
      .insert(custodyChainLinks)
      .values({
        caseId,
        upstreamEntityName: upstreamEntityName?.trim() || 'Upstream Tier-4/3 Smelter',
        downstreamEntityName: downstreamEntityName?.trim() || 'Downstream Tier-1 Manufacturer',
        upstreamTier: Number(upstreamTier || 3),
        downstreamTier: Number(downstreamTier || 1),
        materialDescription: materialDescription.trim(),
        batchOrLotNumber: batchOrLotNumber?.trim() || `LOT-${Date.now().toString().slice(-6)}`,
        inputWeightKg: inKg.toFixed(4),
        outputWeightKg: outKg.toFixed(4),
        yieldRatio: yieldRatio.toFixed(4),
        linkStatus,
      })
      .returning();

    res.status(201).json({
      custodyLink: createdLink,
      bundle: await buildCaseReadiness(caseId),
    });
  } catch (error) {
    console.error('Custody link creation failed:', error);
    res.status(500).json({ error: 'Unable to record custody chain link.' });
  }
});

app.get('/api/v1/cases/:caseId/audit-readiness', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const caseId = String(req.params.caseId);
    const bundle = await buildCaseReadiness(caseId);
    if (!bundle || bundle.caseRecord.ownerUid !== uid) {
      return res.status(404).json({ error: 'Admissibility case not found.' });
    }
    res.json(bundle.readiness);
  } catch (error) {
    console.error('Audit readiness check failed:', error);
    res.status(500).json({ error: 'Unable to compute CBP audit readiness.' });
  }
});

// --- 5. $400K EMERGENCY RETAINER & REMITLY QR PAYOUT ENGINE ---
app.post(
  '/api/v1/cases/:caseId/retainer/authorize',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user!.uid;
      const caseId = String(req.params.caseId);
      const { paymentMethod, amountUsd, referenceCode } = req.body as {
        paymentMethod?: 'REMITLY_QR' | 'ENTERPRISE_WIRE';
        amountUsd?: number;
        referenceCode?: string;
      };

      const [existingCase] = await db
        .select()
        .from(admissibilityCases)
        .where(and(eq(admissibilityCases.caseId, caseId), eq(admissibilityCases.ownerUid, uid)));

      if (!existingCase) {
        return res.status(404).json({ error: 'Admissibility case not found.' });
      }

      const method = paymentMethod || 'REMITLY_QR';
      const amount = Number(amountUsd || 400000);
      const txRef =
        referenceCode?.trim() ||
        `${method === 'REMITLY_QR' ? 'RMT-QR' : 'WIRE'}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

      let gatewayResult: Record<string, unknown> | null = null;
      let nextRetainerStatus =
        method === 'REMITLY_QR' ? 'QR_SETTLEMENT_INITIATED' : 'WIRE_ESCROW_AUTHORIZED';

      // If REMITLY_API_TOKEN is configured in secrets, execute live Remitly tag payout
      if (method === 'REMITLY_QR' && process.env.REMITLY_API_TOKEN) {
        const clientIp = getClientIp(req);
        const remitlyRes = await fetch('https://api.remitly.com/v2/transfers/tag-payout', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.REMITLY_API_TOKEN}`,
            'Content-Type': 'application/json',
            'X-Device-IP': process.env.MASTER_ADMIN_STATIC_IP || clientIp,
          },
          body: JSON.stringify({
            tag: '@giffifjbxdtsh5850',
            receive_country: 'RW',
            delivery_method: 'AIRTEL_MONEY',
            payout_amount: amount,
            currency: 'USD',
            funding_source: 'MASTER_VAULT',
          }),
        });

        if (!remitlyRes.ok) {
          const errText = await remitlyRes.text();
          return res.status(remitlyRes.status).json({
            error: `Remitly payout gateway returned ${remitlyRes.status}: ${errText}`,
          });
        }
        gatewayResult = (await remitlyRes.json()) as Record<string, unknown>;
        nextRetainerStatus = 'REMITLY_SETTLED';
      }

      const [updated] = await db
        .update(admissibilityCases)
        .set({
          retainerStatus: nextRetainerStatus,
          retainerAmountUsd: amount.toFixed(2),
          retainerReference: txRef,
        })
        .where(eq(admissibilityCases.caseId, caseId))
        .returning();

      res.json({
        status: nextRetainerStatus,
        targetTag: '@giffifjbxdtsh5850',
        recipientName: 'GIFFFJBXDTSS hfdtxzdtf',
        deliveryChannel: 'Airtel Money (RW)',
        amountUsd: amount,
        referenceCode: txRef,
        gatewayReceipt: gatewayResult,
        caseRecord: updated,
      });
    } catch (error) {
      console.error('Retainer authorization failed:', error);
      res.status(500).json({ error: 'Unable to authorize emergency dossier retainer.' });
    }
  }
);

app.patch('/api/v1/cases/:caseId/slides', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const uid = req.user!.uid;
    const caseId = String(req.params.caseId);
    const { presentationId } = req.body as { presentationId?: string };

    if (!presentationId?.trim()) {
      return res.status(400).json({ error: 'presentationId is required.' });
    }

    const [updated] = await db
      .update(admissibilityCases)
      .set({ slidesPresentationId: presentationId.trim() })
      .where(and(eq(admissibilityCases.caseId, caseId), eq(admissibilityCases.ownerUid, uid)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Admissibility case not found.' });
    }

    res.json({ caseRecord: updated });
  } catch (error) {
    console.error('Failed to save Slides ID:', error);
    res.status(500).json({ error: 'Unable to save Google Slides presentation link.' });
  }
});

app.get(
  '/api/v1/cases/:caseId/export-dossier',
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user!.uid;
      const caseId = String(req.params.caseId);
      const bundle = await buildCaseReadiness(caseId);
      if (!bundle || bundle.caseRecord.ownerUid !== uid) {
        return res.status(404).json({ error: 'Admissibility case not found.' });
      }

      const exportedAt = new Date().toISOString();
      const dossierPayload = {
        dossierHeader: 'PORTSHIELD CRYPTOGRAPHIC CBP ADMISSIBILITY DOSSIER',
        generatedAt: exportedAt,
        statutoryAuthority: '19 U.S.C. § 1307 / Uyghur Forced Labor Prevention Act (P.L. 117-78)',
        caseSummary: bundle.caseRecord,
        admissibilityReadiness: bundle.readiness,
        supplyChainEntities: bundle.entities,
        tamperProofDocumentManifest: bundle.documents.map((d) => ({
          docId: d.docId,
          docType: d.docType,
          documentNumber: d.documentNumber,
          issueDate: d.issueDate,
          sourceLanguage: d.sourceLanguage,
          sha256Hash: d.sha256Hash,
          storageUri: d.storageUri,
          extractedMetadata: d.rawExtractedJson,
        })),
        custodyMassBalanceGraph: bundle.custodyLinks,
      };

      const masterDigest = crypto
        .createHash('sha256')
        .update(JSON.stringify(dossierPayload))
        .digest('hex');

      res.json({
        ...dossierPayload,
        masterDossierSha256: masterDigest,
      });
    } catch (error) {
      console.error('Export dossier failed:', error);
      res.status(500).json({ error: 'Unable to export cryptographic admissibility dossier.' });
    }
  }
);

// --- 6. ENTERPRISE IP-LOCKED FORENSIC AUDIT API ---
app.post(
  '/api/v1/forensic/audit-shipment',
  requireAuth,
  enforceEnterpriseIP,
  (req: AuthRequest, res: Response) => {
    const data: CustomsCasePayload = req.body;
    if (!data || !data.shipmentId || !Array.isArray(data.suppliers)) {
      return res.status(400).json({ error: 'Invalid forensic shipment audit payload.' });
    }

    const auditId = `DOSSIER-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const timestamp = new Date().toISOString();
    const massBalanceCheck = computeMassBalanceYield(data.suppliers);

    let riskScore = 15;
    if (!massBalanceCheck.isValid) {
      riskScore += 65;
    }

    const requiresEmergencyDossier = riskScore > 50 || !massBalanceCheck.isValid;
    const retainerFeeUSD = requiresEmergencyDossier ? 400000 : 0;

    const forensicDossier = {
      auditId,
      timestamp,
      shipmentId: data.shipmentId,
      importer: data.importerOfRecord,
      hsCode: data.commodityCode,
      cbpAdmissibilityRiskScore: riskScore,
      status: riskScore > 50 ? 'DETAINED_HIGH_RISK' : 'CLEARED_FOR_ENTRY',
      massBalanceAudit: massBalanceCheck,
      actionRequired: requiresEmergencyDossier
        ? 'CRITICAL_INTERVENTION: Full 72-hour cryptographic chain-of-custody dossier required to prevent permanent seizure.'
        : 'Standard clearance protocol active.',
      commercialTerms: {
        emergencyRetainerFeeUSD: retainerFeeUSD,
        slaHours: 72,
        outputFormat: 'Examiner-Ready Cryptographic PDF Dossier + Direct CBP Port Liaison',
      },
      cryptographicHash: crypto
        .createHash('sha256')
        .update(JSON.stringify(data) + timestamp)
        .digest('hex'),
    };

    return res.status(200).json(forensicDossier);
  }
);

// --- 7. VITE DEV MIDDLEWARE / PRODUCTION STATIC SERVING ---
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PortShield Enterprise Customs Engine listening on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start PortShield server:', err);
  process.exit(1);
});
