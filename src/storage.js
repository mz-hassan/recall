export function readStored(key) {
  try { return JSON.parse(localStorage.getItem(key)) ?? []; }
  catch { return []; }
}

let database;
function openDatabase() {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('recall-files', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('pdfs');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(request.error); };
  });
}

export async function storePdf(id, file) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('pdfs', 'readwrite');
    transaction.objectStore('pdfs').put(file, id);
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function readPdf(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('pdfs').objectStore('pdfs').get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
