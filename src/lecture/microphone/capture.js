export function wav16(samples, rate) {
  // Average source samples into 16 kHz bins when the device ignores the requested rate.
  const ratio = rate / 16000;
  const length = Math.floor(samples.length / ratio);
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  const text = (offset, value) => [...value].forEach((character, i) => view.setUint8(offset + i, character.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 16000, true); view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio), end = Math.max(start + 1, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += samples[j] ?? 0;
    const value = Math.max(-1, Math.min(1, sum / (end - start)));
    view.setInt16(44 + i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return new Uint8Array(buffer);
}
export function encodeAudio(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

export async function captureMicrophone(stream, { onPacket, onLevel }) {
  let context, source, worklet, mute, analyser, frame, flushed;
  let seq = 0, time = 0, stopping;
  function release() { cancelAnimationFrame(frame); stream.getTracks().forEach(track => track.stop()); return context?.close(); }
  try {
    context = new AudioContext({ sampleRate: 16000 });
    await context.resume();
    await context.audioWorklet.addModule(new URL('./pcm-worklet.js', import.meta.url));
    source = context.createMediaStreamSource(stream);
    worklet = new AudioWorkletNode(context, 'recall-capture');
    mute = context.createGain(); mute.gain.value = 0;
    analyser = context.createAnalyser(); analyser.fftSize = 256;
    source.connect(analyser); source.connect(worklet); worklet.connect(mute); mute.connect(context.destination);
    worklet.port.onmessage = ({ data }) => {
      if (data.flushed) { flushed?.(); return; }
      const endTime = time + data.samples.length / data.rate;
      onPacket({ seq: ++seq, time, endTime, audio: encodeAudio(wav16(data.samples, data.rate)) });
      time = endTime;
    };
    const values = new Float32Array(analyser.fftSize);
    function meter() {
      analyser.getFloatTimeDomainData(values);
      onLevel(Math.min(1, Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length) * 6));
      frame = requestAnimationFrame(meter);
    }
    meter();
    return { stop() {
      stopping ??= (async () => {
        source.disconnect();
        await new Promise(resolve => { flushed = resolve; worklet.port.postMessage('flush'); setTimeout(resolve, 1000); });
        await release(); onLevel(0);
      })();
      return stopping;
    } };
  } catch (error) { await release(); throw error; }
}
