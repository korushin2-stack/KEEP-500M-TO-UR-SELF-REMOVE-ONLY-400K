export interface RestrictedEntity {
  entityId: string;
  officialName: string;
  aliases: string[];
  countryCode: string;
  sector: string | null;
  listingDate: string;
  riskLevel: string;
}

export interface AdmissibilityCase {
  caseId: string;
  ownerUid: string | null;
  importerName: string;
  cbpDetentionNoticeNo: string | null;
  portOfEntry: string | null;
  containerNumbers: string[] | null;
  cargoValueUsd: string | null;
  commoditySector: string | null;
  hsCode: string | null;
  detentionDate: string;
  statutoryDeadline: string | null;
  status: string;
  retainerStatus: string;
  retainerAmountUsd: string | null;
  retainerReference: string | null;
  slidesPresentationId: string | null;
  createdAt: string | null;
}

export interface TradeDocument {
  docId: string;
  caseId: string;
  docType: string;
  documentNumber: string | null;
  issueDate: string | null;
  issuerEntityId: string | null;
  sourceLanguage: string | null;
  storageUri: string;
  rawExtractedJson: Record<string, unknown>;
  sha256Hash: string;
  verifiedByAi: boolean;
  createdAt: string | null;
}

export interface CustodyChainLink {
  linkId: string;
  caseId: string;
  upstreamEntityName: string | null;
  downstreamEntityName: string | null;
  upstreamTier: number;
  downstreamTier: number;
  materialDescription: string;
  batchOrLotNumber: string | null;
  inputWeightKg: string;
  outputWeightKg: string;
  yieldRatio: string | null;
  linkStatus: string;
}

export interface SupplyEntity {
  entityId: string;
  legalName: string;
  localLanguageName: string | null;
  countryCode: string;
  provinceOrState: string | null;
  tierLevel: number;
  screeningStatus: string;
  matchedWatchlistId: string | null;
}

export interface FlaggedEntityReadiness {
  entityId: string;
  legalName: string;
  localLanguageName: string | null;
  countryCode: string;
  tierLevel: number;
  screeningStatus: string;
  matchedEntity: string;
}

export interface ReadinessReport {
  caseId: string;
  cbpAdmissibilityScore: number;
  readyForCbpSubmission: boolean;
  criticalWatchlistBlocks: FlaggedEntityReadiness[];
  massBalanceOrChainGaps: CustodyChainLink[];
  missingMandatoryDocumentClasses: string[];
}

export interface CaseBundle {
  caseRecord: AdmissibilityCase;
  documents: TradeDocument[];
  custodyLinks: CustodyChainLink[];
  entities: SupplyEntity[];
  readiness: ReadinessReport;
}

export interface QuickScanResult {
  scanId: string;
  timestamp: string;
  sha256AuditHash: string;
  admissibilityScore: number;
  riskClassification: string;
  extractedDocument: {
    doc_type: string;
    document_number: string;
    issue_date?: string;
    source_language: string;
    seller_name_english: string;
    seller_name_native?: string;
    seller_address: string;
    seller_country_code: string;
    buyer_name_english: string;
    buyer_country_code: string;
    line_items: Array<{
      material_name: string;
      hs_code?: string;
      batch_or_lot_number?: string;
      net_weight_kg: number;
      country_of_origin?: string;
    }>;
    red_flags_detected: string[];
  } | null;
  watchlistMatch: {
    entityId: string;
    officialName: string;
    sector: string | null;
    riskLevel: string;
    score: number;
  } | null;
  supplierScreens: Array<{
    tierLevel: number;
    entityName: string;
    country: string;
    match: {
      officialName: string;
      score: number;
      riskLevel: string;
    } | null;
  }>;
  massBalanceAudit: {
    isValid: boolean;
    anomalyNotes: string[];
  };
  redFlagsDetected: string[];
  requiresEmergencyDossier: boolean;
  recommendedRetainerUsd: number;
}

export interface IpGatewayStatus {
  detectedIp: string;
  isWhitelisted: boolean;
  strictIpLockEnabled: boolean;
  whitelistedIps: string[];
}
