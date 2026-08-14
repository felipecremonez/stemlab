const DB_NAME = 'stemlab-history';
const DB_VERSION = 1;
const STORE = 'sessions';
const MAX_SESSIONS = 5;

function openDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB indisponível.'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error('Falha ao abrir histórico local.'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

export async function saveSession(session) {
  const db = await openDb();
  try {
    await txPromise(db, 'readwrite', (store) => store.put(session));
    const sessions = await listSessions();
    for (const old of sessions.slice(MAX_SESSIONS)) await deleteSession(old.id);
  } finally {
    db.close();
  }
}

export async function listSessions() {
  const db = await openDb();
  try {
    const items = await txPromise(db, 'readonly', (store) => store.getAll());
    return (items || []).sort((a, b) => b.createdAt - a.createdAt);
  } finally {
    db.close();
  }
}

export async function getSession(id) {
  const db = await openDb();
  try {
    return await txPromise(db, 'readonly', (store) => store.get(id));
  } finally {
    db.close();
  }
}

export async function deleteSession(id) {
  const db = await openDb();
  try {
    await txPromise(db, 'readwrite', (store) => store.delete(id));
  } finally {
    db.close();
  }
}

export async function clearSessions() {
  const db = await openDb();
  try {
    await txPromise(db, 'readwrite', (store) => store.clear());
  } finally {
    db.close();
  }
}

function txPromise(db, mode, requestFactory) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    let request;
    try {
      request = requestFactory(store);
    } catch (error) {
      reject(error);
      return;
    }
    if (request) {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Falha no histórico local.'));
    } else {
      transaction.oncomplete = () => resolve();
    }
    transaction.onerror = () => reject(transaction.error || new Error('Falha no histórico local.'));
  });
}
