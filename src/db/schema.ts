import { relations } from 'drizzle-orm';
import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// 0. Authenticated Portal Users (Linked to Firebase Auth UID)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// 1. Restricted Watchlist (DHS UFLPA Entity List & High-Risk Regions)
export const restrictedEntities = pgTable('restricted_entities', {
  entityId: uuid('entity_id').primaryKey().defaultRandom(),
  officialName: text('official_name').notNull(),
  aliases: text('aliases').array().default([]),
  countryCode: varchar('country_code', { length: 3 }).notNull(),
  sector: varchar('sector', { length: 100 }),
  listingDate: date('listing_date').notNull(),
  riskLevel: varchar('risk_level', { length: 20 }).default('CRITICAL_BLOCK').notNull(),
});

// 2. Supply Chain Entities (Importers, Tier 1 Manufacturers, Tier 2 Smelters, Tier 3/4 Mines)
export const supplyEntities = pgTable('supply_entities', {
  entityId: uuid('entity_id').primaryKey().defaultRandom(),
  legalName: text('legal_name').notNull(),
  localLanguageName: text('local_language_name'),
  taxOrRegistrationId: varchar('tax_or_registration_id', { length: 100 }),
  countryCode: varchar('country_code', { length: 3 }).notNull(),
  provinceOrState: varchar('province_or_state', { length: 100 }),
  tierLevel: integer('tier_level').default(1).notNull(),
  screeningStatus: varchar('screening_status', { length: 30 }).default('PENDING').notNull(),
  matchedWatchlistId: uuid('matched_watchlist_id').references(() => restrictedEntities.entityId),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// 3. Customs Detentions & Admissibility Cases ($400K Engagements)
export const admissibilityCases = pgTable('admissibility_cases', {
  caseId: uuid('case_id').primaryKey().defaultRandom(),
  ownerUid: text('owner_uid').references(() => users.uid),
  importerId: uuid('importer_id').references(() => supplyEntities.entityId),
  importerName: text('importer_name').notNull(),
  cbpDetentionNoticeNo: varchar('cbp_detention_notice_no', { length: 100 }).unique(),
  portOfEntry: varchar('port_of_entry', { length: 80 }),
  containerNumbers: text('container_numbers').array().default([]),
  cargoValueUsd: numeric('cargo_value_usd', { precision: 15, scale: 2 }).default('0.00'),
  commoditySector: varchar('commodity_sector', { length: 100 }),
  hsCode: varchar('hs_code', { length: 30 }),
  detentionDate: date('detention_date').notNull(),
  statutoryDeadline: date('statutory_deadline'),
  status: varchar('status', { length: 30 }).default('INGESTING_DOCS').notNull(),
  retainerStatus: varchar('retainer_status', { length: 30 }).default('UNPAID').notNull(),
  retainerAmountUsd: numeric('retainer_amount_usd', { precision: 12, scale: 2 }).default('400000.00'),
  retainerReference: varchar('retainer_reference', { length: 120 }),
  slidesPresentationId: text('slides_presentation_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// 4. Forensic Documents (Bills of Lading, Invoices, Mill Test Reports, Factory Logs)
export const tradeDocuments = pgTable('trade_documents', {
  docId: uuid('doc_id').primaryKey().defaultRandom(),
  caseId: uuid('case_id')
    .references(() => admissibilityCases.caseId, { onDelete: 'cascade' })
    .notNull(),
  docType: varchar('doc_type', { length: 50 }).notNull(),
  documentNumber: varchar('document_number', { length: 100 }),
  issueDate: date('issue_date'),
  issuerEntityId: uuid('issuer_entity_id').references(() => supplyEntities.entityId),
  recipientEntityId: uuid('recipient_entity_id').references(() => supplyEntities.entityId),
  sourceLanguage: varchar('source_language', { length: 40 }),
  storageUri: text('storage_uri').notNull(),
  rawExtractedJson: jsonb('raw_extracted_json').notNull(),
  sha256Hash: varchar('sha256_hash', { length: 64 }).notNull(),
  verifiedByAi: boolean('verified_by_ai').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// 5. Custody Graph Edges (Links Raw Material Batches -> Finished Container Lots)
export const custodyChainLinks = pgTable('custody_chain_links', {
  linkId: uuid('link_id').primaryKey().defaultRandom(),
  caseId: uuid('case_id')
    .references(() => admissibilityCases.caseId, { onDelete: 'cascade' })
    .notNull(),
  parentDocId: uuid('parent_doc_id').references(() => tradeDocuments.docId),
  childDocId: uuid('child_doc_id').references(() => tradeDocuments.docId),
  upstreamEntityName: text('upstream_entity_name'),
  downstreamEntityName: text('downstream_entity_name'),
  upstreamTier: integer('upstream_tier').default(4).notNull(),
  downstreamTier: integer('downstream_tier').default(1).notNull(),
  materialDescription: text('material_description').notNull(),
  batchOrLotNumber: varchar('batch_or_lot_number', { length: 100 }),
  inputWeightKg: numeric('input_weight_kg', { precision: 14, scale: 4 }).notNull(),
  outputWeightKg: numeric('output_weight_kg', { precision: 14, scale: 4 }).notNull(),
  yieldRatio: numeric('yield_ratio', { precision: 8, scale: 4 }),
  linkStatus: varchar('link_status', { length: 30 }).default('UNVERIFIED').notNull(),
});

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  cases: many(admissibilityCases),
}));

export const restrictedEntitiesRelations = relations(restrictedEntities, ({ many }) => ({
  matchedSupplyEntities: many(supplyEntities),
}));

export const supplyEntitiesRelations = relations(supplyEntities, ({ one, many }) => ({
  matchedWatchlist: one(restrictedEntities, {
    fields: [supplyEntities.matchedWatchlistId],
    references: [restrictedEntities.entityId],
  }),
  issuedDocuments: many(tradeDocuments),
}));

export const admissibilityCasesRelations = relations(admissibilityCases, ({ one, many }) => ({
  owner: one(users, {
    fields: [admissibilityCases.ownerUid],
    references: [users.uid],
  }),
  importer: one(supplyEntities, {
    fields: [admissibilityCases.importerId],
    references: [supplyEntities.entityId],
  }),
  documents: many(tradeDocuments),
  custodyLinks: many(custodyChainLinks),
}));

export const tradeDocumentsRelations = relations(tradeDocuments, ({ one }) => ({
  admissibilityCase: one(admissibilityCases, {
    fields: [tradeDocuments.caseId],
    references: [admissibilityCases.caseId],
  }),
  issuer: one(supplyEntities, {
    fields: [tradeDocuments.issuerEntityId],
    references: [supplyEntities.entityId],
  }),
}));

export const custodyChainLinksRelations = relations(custodyChainLinks, ({ one }) => ({
  admissibilityCase: one(admissibilityCases, {
    fields: [custodyChainLinks.caseId],
    references: [admissibilityCases.caseId],
  }),
}));
