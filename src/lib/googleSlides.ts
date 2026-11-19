import { CaseBundle } from '../types/portshield';

export interface CreatedSlidesDeck {
  presentationId: string;
  title: string;
  slideCount: number;
  presentationUrl: string;
}

export interface InspectedSlidesDeck {
  presentationId: string;
  title: string;
  slides: Array<{
    objectId: string;
    texts: string[];
  }>;
}

export async function createAdmissibilitySlidesDeck(
  accessToken: string,
  bundle: CaseBundle
): Promise<CreatedSlidesDeck> {
  const { caseRecord, readiness, documents, custodyLinks } = bundle;
  const deckTitle = `PortShield CBP Admissibility Briefing — ${caseRecord.cbpDetentionNoticeNo || caseRecord.caseId.slice(0, 8)}`;

  // 1. Create empty presentation
  const createRes = await fetch('https://slides.googleapis.com/v1/presentations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: deckTitle }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Google Slides API (${createRes.status}): ${errText}`);
  }

  const created = (await createRes.json()) as {
    presentationId: string;
    title: string;
    slides?: Array<{ objectId: string }>;
  };

  const presentationId = created.presentationId;
  const firstSlideId = created.slides?.[0]?.objectId;

  const slide2Id = 'portshield_slide_watchlist';
  const slide3Id = 'portshield_slide_custody';
  const slide4Id = 'portshield_slide_remediation';

  const requests: Record<string, unknown>[] = [];

  if (firstSlideId) {
    requests.push({
      createShape: {
        objectId: 'ps_cover_title',
        shapeType: 'TEXT_BOX',
        elementProperties: {
          pageObjectId: firstSlideId,
          size: { width: { magnitude: 640, unit: 'PT' }, height: { magnitude: 90, unit: 'PT' } },
          transform: {
            scaleX: 1,
            scaleY: 1,
            translateX: 40,
            translateY: 45,
            unit: 'PT',
          },
        },
      },
    });
    requests.push({
      insertText: {
        objectId: 'ps_cover_title',
        text: `PORTSHIELD CBP ADMISSIBILITY BRIEFING\n${caseRecord.importerName} · Notice ${caseRecord.cbpDetentionNoticeNo || 'PENDING'}`,
      },
    });
    requests.push({
      createShape: {
        objectId: 'ps_cover_meta',
        shapeType: 'TEXT_BOX',
        elementProperties: {
          pageObjectId: firstSlideId,
          size: { width: { magnitude: 640, unit: 'PT' }, height: { magnitude: 220, unit: 'PT' } },
          transform: {
            scaleX: 1,
            scaleY: 1,
            translateX: 40,
            translateY: 150,
            unit: 'PT',
          },
        },
      },
    });
    requests.push({
      insertText: {
        objectId: 'ps_cover_meta',
        text: [
          `Port of Entry: ${caseRecord.portOfEntry || 'N/A'}`,
          `Commodity Sector / HS Code: ${caseRecord.commoditySector || 'N/A'} (${caseRecord.hsCode || 'N/A'})`,
          `Detained Cargo Value: $${Number(caseRecord.cargoValueUsd || 0).toLocaleString()} USD`,
          `Detention Date: ${caseRecord.detentionDate} | Statutory 30-Day Deadline: ${caseRecord.statutoryDeadline || 'N/A'}`,
          `CBP Admissibility Score: ${readiness.cbpAdmissibilityScore}/100 (${readiness.readyForCbpSubmission ? 'READY FOR SUBMISSION' : 'INTERVENTION REQUIRED'})`,
          `Retainer Status: ${caseRecord.retainerStatus} ($${Number(caseRecord.retainerAmountUsd || 400000).toLocaleString()})`,
        ].join('\n'),
      },
    });
  }

  // Slide 2: UFLPA Entity Screening
  requests.push(
    {
      createSlide: {
        objectId: slide2Id,
        insertionIndex: 1,
        slideLayoutReference: { predefinedLayout: 'BLANK' },
      },
    },
    {
      createShape: {
        objectId: 'ps_s2_box',
        shapeType: 'TEXT_BOX',
        elementProperties: {
          pageObjectId: slide2Id,
          size: { width: { magnitude: 640, unit: 'PT' }, height: { magnitude: 330, unit: 'PT' } },
          transform: { scaleX: 1, scaleY: 1, translateX: 40, translateY: 36, unit: 'PT' },
        },
      },
    },
    {
      insertText: {
        objectId: 'ps_s2_box',
        text: [
          '01. UFLPA RESTRICTED WATCHLIST & ORIGIN SCREENING',
          '',
          readiness.criticalWatchlistBlocks.length === 0
            ? 'No DHS UFLPA Entity List hits detected across ingested Tier 1-4 entities.'
            : readiness.criticalWatchlistBlocks
                .map(
                  (f, idx) =>
                    `${idx + 1}. [Tier ${f.tierLevel}] ${f.legalName} (${f.localLanguageName || 'N/A'}) — ${f.screeningStatus} -> Matched: ${f.matchedEntity}`
                )
                .join('\n'),
          '',
          `Total Forensic Documents Audited: ${documents.length}`,
          ...documents
            .slice(0, 4)
            .map(
              (d) =>
                `- ${d.docType} #${d.documentNumber || 'N/A'} (${d.sourceLanguage || 'Unknown'}) · SHA-256: ${d.sha256Hash.slice(0, 16)}...`
            ),
        ].join('\n'),
      },
    }
  );

  // Slide 3: Mass-Balance & Custody Chain
  requests.push(
    {
      createSlide: {
        objectId: slide3Id,
        insertionIndex: 2,
        slideLayoutReference: { predefinedLayout: 'BLANK' },
      },
    },
    {
      createShape: {
        objectId: 'ps_s3_box',
        shapeType: 'TEXT_BOX',
        elementProperties: {
          pageObjectId: slide3Id,
          size: { width: { magnitude: 640, unit: 'PT' }, height: { magnitude: 330, unit: 'PT' } },
          transform: { scaleX: 1, scaleY: 1, translateX: 40, translateY: 36, unit: 'PT' },
        },
      },
    },
    {
      insertText: {
        objectId: 'ps_s3_box',
        text: [
          '02. MASS-BALANCE & CHAIN-OF-CUSTODY GRAPH AUDIT',
          '',
          custodyLinks.length === 0
            ? 'No Tier 1-4 custody chain edges recorded yet.'
            : custodyLinks
                .slice(0, 6)
                .map(
                  (l, idx) =>
                    `${idx + 1}. Tier ${l.upstreamTier} (${l.upstreamEntityName || 'Upstream'}) -> Tier ${l.downstreamTier} (${l.downstreamEntityName || 'Downstream'})\n   Material: ${l.materialDescription} | Batch: ${l.batchOrLotNumber || 'N/A'}\n   Input: ${Number(l.inputWeightKg).toLocaleString()} kg -> Output: ${Number(l.outputWeightKg).toLocaleString()} kg | Yield: ${l.yieldRatio || 'N/A'} | Status: ${l.linkStatus}`
                )
                .join('\n\n'),
        ].join('\n'),
      },
    }
  );

  // Slide 4: 72-Hour Remediation Plan
  requests.push(
    {
      createSlide: {
        objectId: slide4Id,
        insertionIndex: 3,
        slideLayoutReference: { predefinedLayout: 'BLANK' },
      },
    },
    {
      createShape: {
        objectId: 'ps_s4_box',
        shapeType: 'TEXT_BOX',
        elementProperties: {
          pageObjectId: slide4Id,
          size: { width: { magnitude: 640, unit: 'PT' }, height: { magnitude: 330, unit: 'PT' } },
          transform: { scaleX: 1, scaleY: 1, translateX: 40, translateY: 36, unit: 'PT' },
        },
      },
    },
    {
      insertText: {
        objectId: 'ps_s4_box',
        text: [
          '03. 72-HOUR CBP ADMISSIBILITY REMEDIATION CHECKLIST',
          '',
          `Missing Mandatory Document Classes: ${
            readiness.missingMandatoryDocumentClasses.length > 0
              ? readiness.missingMandatoryDocumentClasses.join(', ')
              : 'None (All 4 mandatory document classes present)'
          }`,
          `Mass-Balance Discrepancies Requiring Correction: ${readiness.massBalanceOrChainGaps.length}`,
          `Watchlist Blocks Requiring Supplier Replacement / Rebuttal: ${readiness.criticalWatchlistBlocks.length}`,
          '',
          'Next Port Liaison Actions:',
          '1. Complete upstream Mill Test Certificate and Smelter Affidavits for all missing tiers.',
          '2. Reconcile physical recovery yield ratios (<= 0.95) across batch transfers.',
          '3. Package tamper-proof SHA-256 evidentiary bundle for CBP CEE submission.',
        ].join('\n'),
      },
    }
  );

  const updateRes = await fetch(
    `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    }
  );

  if (!updateRes.ok) {
    const errText = await updateRes.text();
    throw new Error(`Google Slides batchUpdate (${updateRes.status}): ${errText}`);
  }

  return {
    presentationId,
    title: deckTitle,
    slideCount: 4,
    presentationUrl: `https://docs.google.com/presentation/d/${presentationId}/edit`,
  };
}

export async function fetchSlidesPresentation(
  accessToken: string,
  presentationId: string
): Promise<InspectedSlidesDeck> {
  const res = await fetch(`https://slides.googleapis.com/v1/presentations/${encodeURIComponent(presentationId)}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Unable to fetch Google Slides presentation (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as {
    presentationId: string;
    title: string;
    slides?: Array<{
      objectId: string;
      pageElements?: Array<{
        shape?: {
          text?: {
            textElements?: Array<{ textRun?: { content?: string } }>;
          };
        };
      }>;
    }>;
  };

  const slides = (data.slides || []).map((slide) => {
    const texts: string[] = [];
    for (const el of slide.pageElements || []) {
      const runs = el.shape?.text?.textElements || [];
      const combined = runs
        .map((r) => r.textRun?.content || '')
        .join('')
        .trim();
      if (combined) texts.push(combined);
    }
    return {
      objectId: slide.objectId,
      texts,
    };
  });

  return {
    presentationId: data.presentationId,
    title: data.title,
    slides,
  };
}
