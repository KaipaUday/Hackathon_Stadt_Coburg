import fs from 'fs';
import path from 'path';
import type {
  AssetRecord,
  AssetStatus,
  ChunkSearchHit,
  DocumentRecord,
  KnowledgeBase,
} from '../src/types/knowledge.ts';
import { createInitialSeedData } from './seedData.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'knowledge.json');

export class KnowledgeStore {
  private data: KnowledgeBase;

  constructor() {
    this.data = this.loadOrInitialize();
  }

  private loadOrInitialize(): KnowledgeBase {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw) as KnowledgeBase;
        if (parsed && Array.isArray(parsed.documents) && Array.isArray(parsed.assets)) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn('Could not read existing knowledge.json, creating fresh seed:', err);
    }
    const seed = createInitialSeedData();
    this.persist(seed);
    return seed;
  }

  private persist(next?: KnowledgeBase): void {
    if (next) {
      this.data = next;
    }
    this.data.last_updated = new Date().toISOString();
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  public getSnapshot(): KnowledgeBase {
    return this.data;
  }

  public resetToSample(): KnowledgeBase {
    const seed = createInitialSeedData();
    this.persist(seed);
    return this.data;
  }

  public addDocumentAndAssets(doc: DocumentRecord, candidateAssets: AssetRecord[]): {
    document: DocumentRecord;
    assetsAffected: AssetRecord[];
  } {
    if (!this.data.buildings.includes(doc.building) && doc.building.trim()) {
      this.data.buildings.push(doc.building.trim());
    }

    const affected: AssetRecord[] = [];
    for (const candidate of candidateAssets) {
      const existing = this.data.assets.find(
        (a) =>
          a.asset_id.toLowerCase() === candidate.asset_id.toLowerCase() ||
          (a.building.toLowerCase() === candidate.building.toLowerCase() &&
            a.name.toLowerCase() === candidate.name.toLowerCase())
      );

      if (existing) {
        if (!existing.linked_doc_ids.includes(doc.doc_id)) {
          existing.linked_doc_ids.push(doc.doc_id);
        }
        if (!doc.linked_asset_ids.includes(existing.asset_id)) {
          doc.linked_asset_ids.push(existing.asset_id);
        }
        if (candidate.last_inspection && candidate.last_inspection !== 'Unbekannt') {
          existing.last_inspection = candidate.last_inspection;
        }
        if (candidate.next_inspection_due && candidate.next_inspection_due !== 'Unbekannt') {
          existing.next_inspection_due = candidate.next_inspection_due;
        }
        if (candidate.status && candidate.status !== 'missing_proof') {
          existing.status = candidate.status;
          existing.status_note = candidate.status_note || existing.status_note;
        }
        if (candidate.needs_review && !existing.human_verified) {
          existing.needs_review = true;
          existing.review_reason = candidate.review_reason || existing.review_reason;
          existing.confidence = Math.min(existing.confidence, candidate.confidence);
        }
        affected.push(existing);
      } else {
        if (!candidate.linked_doc_ids.includes(doc.doc_id)) {
          candidate.linked_doc_ids.push(doc.doc_id);
        }
        if (!doc.linked_asset_ids.includes(candidate.asset_id)) {
          doc.linked_asset_ids.push(candidate.asset_id);
        }
        this.data.assets.unshift(candidate);
        affected.push(candidate);
      }
    }

    this.data.documents.unshift(doc);
    this.persist();
    return { document: doc, assetsAffected: affected };
  }

  public resolveAssetReview(
    assetId: string,
    updates: {
      manufacturer?: string;
      floor_room?: string;
      model_or_spec?: string;
      status?: AssetStatus;
      status_note?: string;
      human_note?: string;
      confirm_link?: boolean;
    }
  ): AssetRecord | null {
    const asset = this.data.assets.find((a) => a.asset_id === assetId);
    if (!asset) return null;

    if (updates.manufacturer !== undefined) asset.manufacturer = updates.manufacturer;
    if (updates.floor_room !== undefined) asset.floor_room = updates.floor_room;
    if (updates.model_or_spec !== undefined) asset.model_or_spec = updates.model_or_spec;
    if (updates.status !== undefined) asset.status = updates.status;
    if (updates.status_note !== undefined) asset.status_note = updates.status_note;
    if (updates.human_note !== undefined) asset.human_note = updates.human_note;

    asset.needs_review = false;
    asset.human_verified = true;
    asset.confidence = 1.0;
    asset.review_reason = '';

    this.persist();
    return asset;
  }

  public deleteDocument(docId: string): boolean {
    const idx = this.data.documents.findIndex((d) => d.doc_id === docId);
    if (idx === -1) return false;
    this.data.documents.splice(idx, 1);
    for (const asset of this.data.assets) {
      asset.linked_doc_ids = asset.linked_doc_ids.filter((id) => id !== docId);
    }
    this.persist();
    return true;
  }

  public searchChunks(params: {
    query: string;
    building?: string;
    docType?: string;
    limit?: number;
  }): ChunkSearchHit[] {
    const q = params.query.trim().toLowerCase();
    const tokens = q
      .split(/[\s,.;:!?/()-]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2);

    const hits: ChunkSearchHit[] = [];

    for (const doc of this.data.documents) {
      if (params.building && params.building !== 'all' && doc.building !== params.building) {
        continue;
      }
      if (params.docType && params.docType !== 'all' && doc.doc_type !== params.docType) {
        continue;
      }

      const metaHaystack = `${doc.filename} ${doc.doc_type} ${doc.building} ${doc.summary}`.toLowerCase();

      for (const chunk of doc.chunks) {
        const textLower = chunk.text.toLowerCase();
        let score = 0;

        if (q.length === 0) {
          score = 1;
        } else {
          if (textLower.includes(q)) score += 12;
          if (metaHaystack.includes(q)) score += 8;

          for (const token of tokens) {
            if (textLower.includes(token)) score += 3;
            if (metaHaystack.includes(token)) score += 2;
          }
        }

        if (score > 0 || tokens.length === 0) {
          hits.push({
            doc_id: doc.doc_id,
            filename: doc.filename,
            doc_type: doc.doc_type,
            doc_date: doc.doc_date,
            building: doc.building,
            chunk_id: chunk.chunk_id,
            page_or_section: chunk.page_or_section,
            snippet: chunk.text,
            score,
            linked_asset_ids: doc.linked_asset_ids,
          });
        }
      }
    }

    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, params.limit ?? 20);
  }
}

export const knowledgeStore = new KnowledgeStore();
