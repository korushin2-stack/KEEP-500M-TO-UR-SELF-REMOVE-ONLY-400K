export interface TierSupplier {
  tierLevel: number; // Tier 1 (Assembly) down to Tier 4 (Raw Smelting/Mining)
  entityName: string;
  country: string;
  declaredInputTons: number;
  declaredOutputTons: number;
}

export interface CustomsCasePayload {
  shipmentId: string;
  importerOfRecord: string;
  commodityCode: string;
  declaredValueUSD: number;
  suppliers: TierSupplier[];
}

export function computeMassBalanceYield(suppliers: TierSupplier[]): {
  isValid: boolean;
  anomalyNotes: string[];
} {
  const anomalies: string[] = [];
  const sorted = [...suppliers].sort((a, b) => b.tierLevel - a.tierLevel);

  for (let i = 0; i < sorted.length - 1; i++) {
    const rawMaterial = sorted[i];
    const processor = sorted[i + 1];
    const maximumPossibleOutput = rawMaterial.declaredOutputTons * 0.95;

    if (processor.declaredInputTons > maximumPossibleOutput) {
      anomalies.push(
        `MASS_BALANCE_FAILURE: Tier ${processor.tierLevel} (${processor.entityName}) claims input of ${processor.declaredInputTons}T, but Tier ${rawMaterial.tierLevel} (${rawMaterial.entityName}) only yielded a maximum allowable output of ${maximumPossibleOutput.toFixed(2)}T.`
      );
    }
  }

  return {
    isValid: anomalies.length === 0,
    anomalyNotes: anomalies,
  };
}

export function evaluateLinkStatus(inputWeightKg: number, outputWeightKg: number) {
  if (inputWeightKg <= 0) {
    return { yieldRatio: 0, linkStatus: 'MISSING_UPSTREAM' };
  }
  const yieldRatio = outputWeightKg / inputWeightKg;
  if (yieldRatio > 1.02) {
    return { yieldRatio, linkStatus: 'WEIGHT_DISCREPANCY' };
  }
  return { yieldRatio, linkStatus: 'VERIFIED' };
}
