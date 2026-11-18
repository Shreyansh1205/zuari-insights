import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth';
import * as api from '../api';

/*
  Connects a dashboard module to the files saved in MongoDB.

  const store = useStoredFiles('claims', applyFiles);
    applyFiles(File[]) -> parses the files into the module's dashboard (returns truthy on success)

  - On open, loads the module's saved files and feeds them to applyFiles,
    so admin sees exactly what the uploader saved.
  - store.save(files)   uploader only: saves files after they parsed correctly
  - store.remove(name)  uploader only: removes one saved file
  - store.clear()       uploader only: removes every saved file of the module
*/
export default function useStoredFiles(moduleId, applyFiles) {
  const { isUploader } = useAuth();
  const [stored, setStored] = useState([]);       // file details from the server
  const [booting, setBooting] = useState(true);   // loading saved files on open
  const [saving, setSaving] = useState('');       // progress text while uploading
  const [storeError, setStoreError] = useState('');
  const applyRef = useRef(applyFiles);
  applyRef.current = applyFiles;

  const refresh = useCallback(async () => {
    const list = await api.listFiles(moduleId);
    setStored(list);
    return list;
  }, [moduleId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await refresh();
        if (!alive || !list.length) return;
        const files = [];
        for (const meta of list) {
          if (!alive) return;
          files.push(await api.downloadFile(meta));
        }
        if (alive) await applyRef.current(files);
      } catch (e) {
        if (alive) setStoreError(e.message || 'Could not load saved data');
      } finally {
        if (alive) setBooting(false);
      }
    })();
    return () => { alive = false; };
  }, [refresh]);

  const save = async (files) => {
    if (!isUploader || !files?.length) return;
    setStoreError('');
    try {
      for (let i = 0; i < files.length; i += 1) {
        const f = files[i];
        await api.uploadFile(moduleId, f, (p) =>
          setSaving(`Saving ${f.name}${files.length > 1 ? ` (${i + 1}/${files.length})` : ''} · ${Math.round(p * 100)}%`));
      }
      await refresh();
    } catch (e) {
      setStoreError(`Shown on screen but NOT saved: ${e.message}`);
    } finally {
      setSaving('');
    }
  };

  const remove = async (name) => {
    if (!isUploader) return;
    const metas = stored.filter((m) => m.name === name);
    try {
      for (const m of metas) await api.deleteFile(m.id);
      await refresh();
    } catch (e) { setStoreError(e.message); }
  };

  const clear = async () => {
    if (!isUploader) return;
    try { await api.clearModule(moduleId); await refresh(); } catch (e) { setStoreError(e.message); }
  };

  const latest = stored.length
    ? stored.reduce((a, b) => (new Date(a.uploadedAt) > new Date(b.uploadedAt) ? a : b))
    : null;

  return { canUpload: isUploader, stored, latest, booting, saving, storeError, save, remove, clear, refresh };
}