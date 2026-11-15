import { encodeAudio } from './capture.js';

/** Combine adjacent PCM chunks without losing words or changing the capture clock. */
export function joinAudio(packets) {
  if (packets.length === 1) return packets[0].audio;
  const files = packets.map(packet => Uint8Array.from(atob(packet.audio), character => character.charCodeAt(0)));
  for (const file of files) {
    const view = new DataView(file.buffer);
    if (file.length < 44 || view.getUint16(22, true) !== 1 || view.getUint32(24, true) !== 16000 || view.getUint16(34, true) !== 16) throw new Error('Unsupported microphone audio format.');
  }
  const size = files.reduce((sum, file) => sum + file.length - 44, 0);
  const joined = new Uint8Array(44 + size);
  joined.set(files[0].subarray(0, 44));
  let offset = 44;
  for (const file of files) { joined.set(file.subarray(44), offset); offset += file.length - 44; }
  const view = new DataView(joined.buffer);
  view.setUint32(4, joined.length - 8, true); view.setUint32(40, size, true);
  return encodeAudio(joined);
}

/** Keep recognition independent of chat. Batch waiting chunks to amortize local model work. */
export function createAudioQueue({ send, onChange = () => {}, onError, onSlow = () => {} }) {
  const pending = [];
  const waiters = [];
  const controller = new AbortController();
  let active = false, failed = false, seq = 0, warned = false;
  const announce = () => onChange(pending.length + Number(active));
  function settled() { if (!active && !pending.length) for (const resolve of waiters.splice(0)) resolve(); }
  async function pump() {
    if (active || failed || !pending.length) return;
    active = true;
    const batch = [pending.shift()];
    while (pending.length && pending[0].endTime - batch[0].time <= 28) batch.push(pending.shift());
    announce();
    try {
      await send({ seq: ++seq, time: batch[0].time, endTime: batch.at(-1).endTime, audio: joinAudio(batch) }, controller.signal);
    } catch (error) {
      failed = true; pending.length = 0;
      if (!controller.signal.aborted) onError(error);
    } finally {
      active = false; announce();
      if (pending.length) void pump(); else settled();
    }
  }
  return {
    push(packet) {
      if (failed) return;
      pending.push(packet); announce();
      if (!warned && pending.at(-1).endTime - pending[0].time > 90) { warned = true; onSlow(); }
      void pump();
    },
    drain() { return !active && !pending.length ? Promise.resolve() : new Promise(resolve => waiters.push(resolve)); },
    cancel() { failed = true; pending.length = 0; controller.abort(); settled(); },
  };
}
