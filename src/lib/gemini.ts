import { GoogleGenAI, Type } from '@google/genai';

export interface ExtractedLineItem {
  material_name: string;
  hs_code?: string;
  batch_or_lot_number?: string;
  net_weight_kg: number;
  country_of_origin?: string;
}

export interface ExtractedTradeDoc {
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
  line_items: ExtractedLineItem[];
  red_flags_detected: string[];
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in server environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const extractionSchema = {
  type: Type.OBJECT,
  properties: {
    doc_type: {
      type: Type.STRING,
      description: 'One of BILL_OF_LADING, COMMERCIAL_INVOICE, MILL_CERT, PACKING_LIST, or ORIGIN_CERT',
    },
    document_number: { type: Type.STRING },
    issue_date: { type: Type.STRING, description: 'ISO date YYYY-MM-DD if present' },
    source_language: { type: Type.STRING },
    seller_name_english: { type: Type.STRING },
    seller_name_native: { type: Type.STRING },
    seller_address: { type: Type.STRING },
    seller_country_code: { type: Type.STRING, description: 'ISO 3166-1 alpha-3 code such as CHN, MYS, VNM, USA' },
    buyer_name_english: { type: Type.STRING },
    buyer_country_code: { type: Type.STRING },
    line_items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          material_name: { type: Type.STRING },
          hs_code: { type: Type.STRING },
          batch_or_lot_number: { type: Type.STRING },
          net_weight_kg: { type: Type.NUMBER },
          country_of_origin: { type: Type.STRING },
        },
        required: ['material_name', 'net_weight_kg'],
      },
    },
    red_flags_detected: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Flag altered dates, mismatched stamps, Xinjiang/XPCC mentions, or missing origin proofs',
    },
  },
  required: [
    'doc_type',
    'document_number',
    'source_language',
    'seller_name_english',
    'seller_address',
    'seller_country_code',
    'buyer_name_english',
    'buyer_country_code',
    'line_items',
    'red_flags_detected',
  ],
};

export async function extractTradeDocumentWithGemini(
  fileBuffer: Buffer | null,
  mimeType: string | null,
  filename: string | null,
  rawTextInput?: string
): Promise<ExtractedTradeDoc> {
  const ai = getGeminiClient();

  const forensicInstruction =
    'You are a U.S. Customs (CBP) Forced Labor Forensic Auditor specializing in UFLPA admissibility reviews. ' +
    'Extract all supply-chain custody metadata from this trade document or manifest. ' +
    'Translate all non-English company names and addresses into English while preserving the native script in seller_name_native. ' +
    'Inspect closely for altered dates, missing origin certificates, mass-balance discrepancies, or references to high-risk regions such as Xinjiang, Shihezi, Korla, Urumqi, Hotan, or XPCC. ' +
    'Normalize doc_type to one of: BILL_OF_LADING, COMMERCIAL_INVOICE, MILL_CERT, PACKING_LIST, ORIGIN_CERT.';

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  if (fileBuffer && mimeType) {
    const isTextLike =
      mimeType.startsWith('text/') ||
      mimeType === 'application/json' ||
      mimeType === 'application/csv' ||
      (filename && /\.(txt|csv|json|md)$/i.test(filename));

    if (isTextLike) {
      parts.push({
        text: `${forensicInstruction}\n\nFilename: ${filename || 'manifest.txt'}\nDocument Content:\n${fileBuffer.toString('utf-8')}`,
      });
    } else {
      parts.push({
        inlineData: {
          mimeType,
          data: fileBuffer.toString('base64'),
        },
      });
      parts.push({
        text: `${forensicInstruction}\n\nFilename: ${filename || 'uploaded_document'}`,
      });
    }
  } else if (rawTextInput) {
    parts.push({
      text: `${forensicInstruction}\n\nSubmitted Manifest Text:\n${rawTextInput}`,
    });
  } else {
    throw new Error('Either a document file or manifest text is required for forensic extraction.');
  }

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: { parts },
    config: {
      responseMimeType: 'application/json',
      responseSchema: extractionSchema,
    },
  });

  const text = (response.text ?? '').trim();
  if (!text) {
    throw new Error('Gemini returned an empty extraction payload.');
  }

  return JSON.parse(text) as ExtractedTradeDoc;
}
