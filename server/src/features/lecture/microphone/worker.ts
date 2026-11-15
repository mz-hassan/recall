import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

export class SpeechError extends Error { constructor(message: string, public statusCode = 503) { super(message); } }
export interface SpeechDecoder {
  status(): { installed: boolean; ready: boolean; busy: boolean; model: string; device: string };
  warmup(): Promise<void>;
  transcribe(audio: string): Promise<string>;
  close(): void;
}
const root = new URL('../../../../../', import.meta.url);
const python = fileURLToPath(new URL(process.platform === 'win32' ? '.local/speech-venv/Scripts/python.exe' : '.local/speech-venv/bin/python', root));
const model = fileURLToPath(new URL('.local/speech-model/', root));
const script = fileURLToPath(new URL('scripts/speech-worker.py', root));

export function createSpeechDecoder(): SpeechDecoder {
  let child: ChildProcessWithoutNullStreams | undefined;
  let ready = false, busy = false, serial = 0;
  let boot: Promise<void> | undefined;
  const pending = new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void }>();
  const installed = () => existsSync(python) && existsSync(model + '/model.bin');
  function fail() {
    ready = false;
    child?.kill(); child = undefined; boot = undefined;
    for (const task of pending.values()) task.reject(new SpeechError('Local speech worker stopped. Restart listening.'));
    pending.clear();
  }
  function warmup() {
    if (ready) return Promise.resolve();
    if (boot) return boot;
    if (!installed()) return Promise.reject(new SpeechError('Install the local speech model with scripts/install-speech.ps1.'));
    boot = new Promise<void>((resolve, reject) => {
      // Do not pass API keys or cloud-provider configuration to the audio worker.
      child = spawn(python, ['-u', script, model], { windowsHide: true, env: {
        PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP,
        HF_HUB_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1', PYTHONIOENCODING: 'utf-8',
      } });
      const started = child;
      const timer = setTimeout(() => { reject(new SpeechError('Local speech model took too long to load.')); fail(); }, 180_000);
      const stopped = () => { clearTimeout(timer); reject(new SpeechError('Local speech worker could not load. Check the speech installation.')); if (child === started) fail(); };
      child.once('error', stopped);
      child.once('exit', stopped);
      child.stderr.resume(); // Native libraries write diagnostics here; never echo user audio.
      createInterface({ input: child.stdout }).on('line', line => {
        try {
          const result = JSON.parse(line);
          if (result.ready) { clearTimeout(timer); ready = true; resolve(); return; }
          const task = pending.get(result.id);
          if (!task) return;
          pending.delete(result.id);
          if (result.error) task.reject(new SpeechError('Local audio decoding failed. Use mono 16 kHz PCM WAV.', 400));
          else task.resolve(typeof result.text === 'string' ? result.text : '');
        } catch { /* Ignore non-protocol startup diagnostics. */ }
      });
    });
    return boot;
  }
  return {
    status: () => ({ installed: installed(), ready, busy, model: 'Whisper large-v3-turbo', device: 'CPU / int8' }),
    warmup,
    async transcribe(audio) {
      if (busy) throw new SpeechError('Speech recognition is busy. Retry this audio chunk.', 429);
      busy = true;
      try {
        await warmup();
        const id = ++serial;
        return await new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => { reject(new SpeechError('Local transcription timed out.')); fail(); }, 180_000);
          pending.set(id, { resolve: text => { clearTimeout(timer); resolve(text); }, reject: error => { clearTimeout(timer); reject(error); } });
          child!.stdin.write(JSON.stringify({ id, audio }) + '\n');
        });
      } finally { busy = false; }
    },
    close: fail,
  };
}
