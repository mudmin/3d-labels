// Saved projects and the user's own fonts and graphics, in IndexedDB. Falls back to
// memory (nothing kept) when the browser blocks storage.

const DB_NAME = '3d-labels';
let dbp = null;
const mem = { projects: new Map(), assets: new Map() };
export let persistent = true;

function db() {
  if (!dbp) {
    dbp = new Promise((resolve) => {
      let r;
      try { r = indexedDB.open(DB_NAME, 1); } catch (e) { persistent = false; resolve(null); return; }
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('assets')) d.createObjectStore('assets', { keyPath: 'id' });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => { persistent = false; resolve(null); };
      r.onblocked = () => { persistent = false; resolve(null); };
    });
  }
  return dbp;
}

async function tx(store, mode, fn) {
  const d = await db();
  if (!d) return fn(null, mem[store]);
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    const req = fn(s);
    if (req) req.onsuccess = () => { out = req.result; };
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const memOp = {
  all: (m) => [...m.values()],
  get: (m, id) => m.get(id),
  put: (m, v) => { m.set(v.id, structuredClone(v)); },
  del: (m, id) => { m.delete(id); },
};

export const listProjects = () => tx('projects', 'readonly', (s, m) => (s ? s.getAll() : memOp.all(m)))
  .then((l) => (l || []).sort((a, b) => (b.updated || 0) - (a.updated || 0)));
export const getProject = (id) => tx('projects', 'readonly', (s, m) => (s ? s.get(id) : memOp.get(m, id)));
export const putProject = (p) => tx('projects', 'readwrite', (s, m) => (s ? s.put(p) : memOp.put(m, p)));
export const deleteProject = (id) => tx('projects', 'readwrite', (s, m) => (s ? s.delete(id) : memOp.del(m, id)));

export const listAssets = () => tx('assets', 'readonly', (s, m) => (s ? s.getAll() : memOp.all(m))).then((l) => l || []);
export const putAsset = (a) => tx('assets', 'readwrite', (s, m) => (s ? s.put(a) : memOp.put(m, a)));
export const deleteAsset = (id) => tx('assets', 'readwrite', (s, m) => (s ? s.delete(id) : memOp.del(m, id)));

// Ask the browser not to evict our data under storage pressure.
export async function askPersist() {
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch (e) { /* ignore */ }
}
