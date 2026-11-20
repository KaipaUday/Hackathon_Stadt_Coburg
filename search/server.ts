import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { knowledgeStore } from './server/knowledgeStore.ts';
import { parseUploadedFile } from './server/parsers.ts';
import {
  askKnowledgeBaseLocally,
  extractDocumentLocally,
  translateDocumentLocally,
  type TranslatedDocumentView,
} from './server/localEngine.ts';
import type { AssetStatus } from './src/types/knowledge.ts';

const translationCache = new Map<string, TranslatedDocumentView>();

const PORT = 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB per file
  },
});

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: new Date().toISOString() });
  });

  app.get('/api/knowledge', (_req, res) => {
    res.json(knowledgeStore.getSnapshot());
  });

  app.get('/api/search', (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    const building = typeof req.query.building === 'string' ? req.query.building : 'all';
    const docType = typeof req.query.docType === 'string' ? req.query.docType : 'all';
    const hits = knowledgeStore.searchChunks({ query, building, docType, limit: 25 });
    res.json({ query, hits });
  });

  app.post('/api/ask', async (req, res) => {
    try {
      const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
      const building = typeof req.body?.building === 'string' ? req.body.building : 'all';
      const language = req.body?.language === 'en' ? 'en' : 'de';

      if (!query) {
        res.status(400).json({ error: 'Bitte eine Suchanfrage oder Frage eingeben.' });
        return;
      }

      const snapshot = knowledgeStore.getSnapshot();
      let hits = knowledgeStore.searchChunks({
        query,
        building,
        limit: 14,
      });

      // If keyword hits are sparse, include representative chunks for the building slice so Gemini can still synthesize cross-document answers
      if (hits.length < 4) {
        const fallbackHits = knowledgeStore.searchChunks({
          query: '',
          building,
          limit: 12,
        });
        const seen = new Set(hits.map((h) => h.chunk_id));
        for (const fh of fallbackHits) {
          if (!seen.has(fh.chunk_id)) {
            hits.push(fh);
            seen.add(fh.chunk_id);
          }
        }
        hits = hits.slice(0, 14);
      }

      const result = await askKnowledgeBaseLocally({
        query,
        buildingFilter: building,
        language,
        hits,
        assets: snapshot.assets,
        allDocsMeta: snapshot.documents.map((d) => ({
          doc_id: d.doc_id,
          filename: d.filename,
          doc_type: d.doc_type,
          doc_date: d.doc_date,
          building: d.building,
        })),
      });

      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler bei der KI-Analyse.';
      console.error('Error in /api/ask:', err);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/ingest', upload.single('file'), async (req, res) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'Keine Datei hochgeladen.' });
        return;
      }

      const buildingHint =
        typeof req.body?.building === 'string' ? req.body.building.trim() : undefined;

      const parsed = await parseUploadedFile(file.buffer, file.originalname);
      const snapshot = knowledgeStore.getSnapshot();

      const extracted = await extractDocumentLocally({
        parsed,
        buildingHint,
        existingAssets: snapshot.assets,
      });

      const saved = knowledgeStore.addDocumentAndAssets(
        extracted.document,
        extracted.candidateAssets
      );

      res.json({
        ...saved,
        parserNotes: parsed.parserNotes,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Dokument konnte nicht analysiert werden.';
      console.error('Error in /api/ingest:', err);
      res.status(500).json({ error: message });
    }
  });

  app.patch('/api/assets/:assetId/resolve', (req, res) => {
    const assetId = req.params.assetId;
    const body = req.body as {
      manufacturer?: string;
      floor_room?: string;
      model_or_spec?: string;
      status?: AssetStatus;
      status_note?: string;
      human_note?: string;
    };

    const updated = knowledgeStore.resolveAssetReview(assetId, body);
    if (!updated) {
      res.status(404).json({ error: `Anlage ${assetId} nicht gefunden.` });
      return;
    }
    res.json({ asset: updated });
  });

  app.post('/api/documents/:docId/translate', async (req, res) => {
    try {
      const targetLang = req.body?.target === 'de' ? 'de' : 'en';
      const doc = knowledgeStore
        .getSnapshot()
        .documents.find((d) => d.doc_id === req.params.docId);

      if (!doc) {
        res.status(404).json({ error: `Document ${req.params.docId} not found.` });
        return;
      }

      const cacheKey = `${doc.doc_id}:${targetLang}`;
      const cached = translationCache.get(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }

      const translated = await translateDocumentLocally(doc, targetLang);
      translationCache.set(cacheKey, translated);
      res.json(translated);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Document translation failed.';
      console.error('Error in /api/documents/:docId/translate:', err);
      res.status(500).json({ error: message });
    }
  });

  app.delete('/api/documents/:docId', (req, res) => {
    const removed = knowledgeStore.deleteDocument(req.params.docId);
    if (!removed) {
      res.status(404).json({ error: `Dokument ${req.params.docId} nicht gefunden.` });
      return;
    }
    res.json({ ok: true });
  });

  app.post('/api/reset', (_req, res) => {
    const reset = knowledgeStore.resetToSample();
    res.json(reset);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Coburg Liegenschafts-KI running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
