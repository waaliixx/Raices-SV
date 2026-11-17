export interface PendingBooking {
  experience_id: string;
  date: string;
  people: number;
  name: string;
  email: string;
  idempotency_key: string;
}

const DATABASE = 'raices_offline_v1';
const STORE = 'reservas';

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DATABASE, 1);

    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE)) {
        r.result.createObjectStore(STORE, { keyPath: 'idempotency_key' });
      }
    };

    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function transaction<T>(
  mode: IDBTransactionMode,
  action: (
    s: IDBObjectStore,
    done: (v: T) => void,
    fail: (e: unknown) => void,
  ) => void,
): Promise<T> {
  const db = await database();

  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);

    action(tx.objectStore(STORE), resolve, reject);

    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export function putPending(item: PendingBooking) {
  return transaction<void>('readwrite', (store, done, fail) => {
    const req = store.put(item);

    req.onsuccess = () => done();
    req.onerror = () => fail(req.error);
  });
}

export function allPending() {
  return transaction<PendingBooking[]>('readonly', (store, done, fail) => {
    const req = store.getAll();

    req.onsuccess = () => done(req.result);
    req.onerror = () => fail(req.error);
  });
}

export function removePending(id: string) {
  return transaction<void>('readwrite', (store, done, fail) => {
    const req = store.delete(id);

    req.onsuccess = () => done();
    req.onerror = () => fail(req.error);
  });
}
