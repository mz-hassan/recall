import { MongoMemoryServer } from 'mongodb-memory-server';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Despite the package name this launches a native mongod with a durable dbPath.
// Explicit cleanup settings preserve it across normal shutdowns and restarts.
const dbPath = fileURLToPath(new URL('../.local/mongodb/', import.meta.url));
await mkdir(dbPath, { recursive: true });
const mongo = await MongoMemoryServer.create({
  binary: { version: '8.0.17' },
  instance: { port: 27017, dbPath, storageEngine: 'wiredTiger', ip: '127.0.0.1', dbName: 'recall' },
});
console.log(`Local MongoDB: ${mongo.getUri()} — data: ${dbPath}`);
console.log('Keep this terminal open. Ctrl+C stops MongoDB and preserves the graph.');
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await mongo.stop({ doCleanup: false, force: false });
};
process.once('SIGINT', () => { void stop(); });
process.once('SIGTERM', () => { void stop(); });
