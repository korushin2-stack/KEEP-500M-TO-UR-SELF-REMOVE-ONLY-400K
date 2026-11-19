import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { db } from './index.ts';
import {
  admissibilityCases,
  custodyChainLinks,
  restrictedEntities,
  supplyEntities,
  tradeDocuments,
} from './schema.ts';

export const DEFAULT_WATCHLIST = [
  {
    officialName: 'Hoshine Silicon Industry (Shanshan) Co., Ltd.',
    aliases: ['合盛硅业(鄯善)有限公司', 'Hoshine Silicon', 'Shanshan Hoshine'],
    countryCode: 'CHN',
    sector: 'Polysilicon & Metallurgical Silicon',
    listingDate: '2022-06-21',
    riskLevel: 'CRITICAL_BLOCK',
  },
  {
    officialName: 'Xinjiang Daqo New Energy Co., Ltd.',
    aliases: ['新疆大全新能源股份有限公司', 'Daqo New Energy', 'Xinjiang Daqo'],
    countryCode: 'CHN',
    sector: 'Polysilicon',
    listingDate: '2022-06-21',
    riskLevel: 'CRITICAL_BLOCK',
  },
  {
    officialName: 'Xinjiang East Hope Nonferrous Metals Co., Ltd.',
    aliases: ['新疆东方希望有色金属有限公司', 'East Hope Nonferrous', 'East Hope Aluminum'],
    countryCode: 'CHN',
    sector: 'Aluminum & Polysilicon',
    listingDate: '2022-06-21',
    riskLevel: 'CRITICAL_BLOCK',
  },
  {
    officialName: 'Xinjiang Joinworld Co., Ltd.',
    aliases: ['新疆众和股份有限公司', 'Joinworld', 'Urumqi Joinworld'],
    countryCode: 'CHN',
    sector: 'High-Purity Aluminum',
    listingDate: '2023-06-12',
    riskLevel: 'CRITICAL_BLOCK',
  },
  {
    officialName: 'Xinjiang Zhonghe Co., Ltd.',
    aliases: ['新疆众和', 'Zhonghe Aluminum'],
    countryCode: 'CHN',
    sector: 'Aluminum',
    listingDate: '2023-06-12',
    riskLevel: 'CRITICAL_BLOCK',
  },
  {
    officialName: 'Xinjiang Tianshan Aluminum Co., Ltd.',
    aliases: ['新疆天山铝业有限公司', 'Tianshan Aluminum', 'Shihezi Aluminum'],
    countryCode: 'CHN',
    sector: 'Primary Aluminum',
    listingDate: '2023-08-02',
    riskLevel: 'CRITICAL_BLOCK',
  },
  {
    officialName: 'Baowu Group Xinjiang Bayi Iron and Steel Co., Ltd.',
    aliases: ['宝武集团新疆八一钢铁有限公司', 'Bayi Iron and Steel', 'Xinjiang Bayi'],
    countryCode: 'CHN',
    sector: 'Steel & Alloys',
    listingDate: '2023-09-27',
    riskLevel: 'CRITICAL_BLOCK',
  },
  {
    officialName: 'Xinjiang Production and Construction Corps (XPCC)',
    aliases: ['新疆生产建设兵团', 'XPCC', 'Bingtuan'],
    countryCode: 'CHN',
    sector: 'Multi-Sector Conglomerate',
    listingDate: '2022-06-21',
    riskLevel: 'CRITICAL_BLOCK',
  },
  {
    officialName: 'Changji Esquel Textile Co., Ltd.',
    aliases: ['昌吉溢达纺织有限公司', 'Esquel Textile', 'Changji Esquel'],
    countryCode: 'CHN',
    sector: 'Cotton & Apparel',
    listingDate: '2022-06-21',
    riskLevel: 'CRITICAL_BLOCK',
  },
  {
    officialName: 'Xinjiang Nonferrous Metal Industry (Group) Lithium Co., Ltd.',
    aliases: ['新疆有色金属工业(集团)锂业', 'Xinjiang Lithium', 'Koktokay Lithium'],
    countryCode: 'CHN',
    sector: 'Lithium & Battery Cathode',
    listingDate: '2024-05-17',
    riskLevel: 'CRITICAL_BLOCK',
  },
];

function getTrigrams(text: string): Set<string> {
  const normalized = `  ${text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ').trim()}  `;
  const trigrams = new Set<string>();
  for (let i = 0; i <= normalized.length - 3; i++) {
    trigrams.add(normalized.slice(i, i + 3));
  }
  return trigrams;
}

export function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const setA = getTrigrams(a);
  const setB = getTrigrams(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export async function ensureWatchlistSeeded() {
  const existing = await db.select().from(restrictedEntities).limit(1);
  if (existing.length > 0) return;

  await db.insert(restrictedEntities).values(DEFAULT_WATCHLIST);
}

export async function screenEntityAgainstWatchlist(
  englishName: string,
  nativeName?: string | null
) {
  await ensureWatchlistSeeded();
  const rows = await db.select().from(restrictedEntities);

  let bestMatch: {
    entityId: string;
    officialName: string;
    sector: string | null;
    riskLevel: string;
    score: number;
  } | null = null;

  const cleanEng = (englishName || '').trim().toLowerCase();
  const cleanNat = (nativeName || '').trim().toLowerCase();

  for (const row of rows) {
    const score = trigramSimilarity(cleanEng, row.officialName);
    let aliasHit = false;
    const aliases = row.aliases || [];
    for (const alias of aliases) {
      const aLower = alias.toLowerCase();
      if (
        (cleanNat && (aLower === cleanNat || cleanNat.includes(aLower) || aLower.includes(cleanNat))) ||
        (cleanEng && (cleanEng.includes(aLower) || aLower.includes(cleanEng)))
      ) {
        aliasHit = true;
        break;
      }
    }

    const effectiveScore = aliasHit ? Math.max(score, 0.92) : score;
    if (effectiveScore >= 0.35 && (!bestMatch || effectiveScore > bestMatch.score)) {
      bestMatch = {
        entityId: row.entityId,
        officialName: row.officialName,
        sector: row.sector,
        riskLevel: row.riskLevel,
        score: Number(effectiveScore.toFixed(4)),
      };
    }
  }

  return bestMatch;
}

export async function ensureUserStarterCase(ownerUid: string) {
  await ensureWatchlistSeeded();

  const existingCases = await db
    .select()
    .from(admissibilityCases)
    .where(eq(admissibilityCases.ownerUid, ownerUid))
    .limit(1);

  if (existingCases.length > 0) return;

  const watchlist = await db.select().from(restrictedEntities).limit(1);
  const flaggedWatchlistId = watchlist[0]?.entityId || null;

  const [tier1Entity] = await db
    .insert(supplyEntities)
    .values({
      legalName: 'Pacific Rim Precision Extrusions Ltd.',
      localLanguageName: '太环精密铝业有限公司',
      taxOrRegistrationId: '91320500MA1X88291P',
      countryCode: 'MYS',
      provinceOrState: 'Johor',
      tierLevel: 1,
      screeningStatus: 'CLEAR',
    })
    .returning();

  const [tier3Entity] = await db
    .insert(supplyEntities)
    .values({
      legalName: 'Tianshan Upstream Smelting & Ingot Co.',
      localLanguageName: '新疆天山上游冶炼',
      taxOrRegistrationId: '91650000MA7719204K',
      countryCode: 'CHN',
      provinceOrState: 'Xinjiang Uygur Autonomous Region',
      tierLevel: 3,
      screeningStatus: flaggedWatchlistId ? 'FLAGGED_MATCH' : 'HIGH_RISK_REGION',
      matchedWatchlistId: flaggedWatchlistId,
    })
    .returning();

  const detentionDate = new Date();
  detentionDate.setDate(detentionDate.getDate() - 12);
  const deadlineDate = new Date(detentionDate);
  deadlineDate.setDate(deadlineDate.getDate() + 30);

  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

  const [starterCase] = await db
    .insert(admissibilityCases)
    .values({
      ownerUid,
      importerId: tier1Entity.entityId,
      importerName: 'Vanguard Mobility Systems Inc.',
      cbpDetentionNoticeNo: `CBP-DET-2026-${ownerUid.slice(0, 5).toUpperCase()}`,
      portOfEntry: 'Port of Los Angeles / Long Beach (2704)',
      containerNumbers: ['MSCU4829104', 'MAEU7739201', 'COSU9941820'],
      cargoValueUsd: '14850000.00',
      commoditySector: 'Automotive Aluminum Extrusions & Battery Trays',
      hsCode: '7604.29.10',
      detentionDate: fmtDate(detentionDate),
      statutoryDeadline: fmtDate(deadlineDate),
      status: 'GAP_DETECTED',
      retainerStatus: 'UNPAID',
      retainerAmountUsd: '400000.00',
    })
    .returning();

  const doc1Json = {
    doc_type: 'BILL_OF_LADING',
    document_number: 'MOLU-2026-884120',
    issue_date: fmtDate(detentionDate),
    source_language: 'English / Mandarin',
    seller_name_english: 'Pacific Rim Precision Extrusions Ltd.',
    seller_name_native: '太环精密铝业有限公司',
    seller_address: 'Plot 42, Pasir Gudang Industrial Estate, Johor, Malaysia',
    seller_country_code: 'MYS',
    buyer_name_english: 'Vanguard Mobility Systems Inc.',
    buyer_country_code: 'USA',
    line_items: [
      {
        material_name: '6061-T6 Structural Battery Enclosure Extrusions',
        hs_code: '7604.29.10',
        batch_or_lot_number: 'LOT-PR-2026-991',
        net_weight_kg: 142500,
        country_of_origin: 'MYS',
      },
    ],
    red_flags_detected: ['Intermediate billet lot trace missing Tier-3 smelter origin certificate'],
  };

  const doc2Json = {
    doc_type: 'COMMERCIAL_INVOICE',
    document_number: 'CI-2026-44109',
    issue_date: fmtDate(detentionDate),
    source_language: 'Mandarin Chinese',
    seller_name_english: 'Tianshan Upstream Smelting & Ingot Co.',
    seller_name_native: '新疆天山上游冶炼',
    seller_address: 'Shihezi Economic Development Zone, Xinjiang, China',
    seller_country_code: 'CHN',
    buyer_name_english: 'Pacific Rim Precision Extrusions Ltd.',
    buyer_country_code: 'MYS',
    line_items: [
      {
        material_name: 'Primary Unalloyed Aluminum Billet 99.7%',
        hs_code: '7601.10.00',
        batch_or_lot_number: 'BILLET-XJ-402',
        net_weight_kg: 118000,
        country_of_origin: 'CHN',
      },
    ],
    red_flags_detected: [
      'Entity located in Xinjiang Uygur Autonomous Region (UFLPA rebuttable presumption)',
      'Mass-balance output 142,500 kg exceeds 118,000 kg upstream billet input',
    ],
  };

  const [doc1] = await db
    .insert(tradeDocuments)
    .values({
      caseId: starterCase.caseId,
      docType: 'BILL_OF_LADING',
      documentNumber: 'MOLU-2026-884120',
      issueDate: fmtDate(detentionDate),
      issuerEntityId: tier1Entity.entityId,
      sourceLanguage: 'English',
      storageUri: `vault://portshield/${starterCase.caseId}/MOLU-2026-884120.pdf`,
      rawExtractedJson: doc1Json,
      sha256Hash: crypto.createHash('sha256').update(JSON.stringify(doc1Json)).digest('hex'),
      verifiedByAi: true,
    })
    .returning();

  const [doc2] = await db
    .insert(tradeDocuments)
    .values({
      caseId: starterCase.caseId,
      docType: 'COMMERCIAL_INVOICE',
      documentNumber: 'CI-2026-44109',
      issueDate: fmtDate(detentionDate),
      issuerEntityId: tier3Entity.entityId,
      recipientEntityId: tier1Entity.entityId,
      sourceLanguage: 'Mandarin Chinese',
      storageUri: `vault://portshield/${starterCase.caseId}/CI-2026-44109.pdf`,
      rawExtractedJson: doc2Json,
      sha256Hash: crypto.createHash('sha256').update(JSON.stringify(doc2Json)).digest('hex'),
      verifiedByAi: true,
    })
    .returning();

  await db.insert(custodyChainLinks).values([
    {
      caseId: starterCase.caseId,
      parentDocId: doc2.docId,
      childDocId: doc1.docId,
      upstreamEntityName: 'Tianshan Upstream Smelting & Ingot Co.',
      downstreamEntityName: 'Pacific Rim Precision Extrusions Ltd.',
      upstreamTier: 3,
      downstreamTier: 1,
      materialDescription: 'Primary Aluminum Billet 99.7% -> 6061-T6 Battery Extrusions',
      batchOrLotNumber: 'BILLET-XJ-402 / LOT-PR-2026-991',
      inputWeightKg: '118000.0000',
      outputWeightKg: '142500.0000',
      yieldRatio: '1.2076',
      linkStatus: 'WEIGHT_DISCREPANCY',
    },
  ]);
}
