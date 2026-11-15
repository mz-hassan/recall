"""Opt-in network smoke: download only a short public CS50 audio excerpt, then decode locally."""
from pathlib import Path
import json
import re
import time
import wave
import av
import numpy as np
from faster_whisper import WhisperModel

root = Path(__file__).resolve().parent.parent
start, end = 75.46, 95.15
url = 'https://cdn.cs50.net/2024/fall/lectures/0/lecture0-360p.mp4'
samples = []
with av.open(url, timeout=30) as video:
    audio = video.streams.audio[0]
    video.seek(int(start * av.time_base))
    resampler = av.AudioResampler(format='s16', layout='mono', rate=16000)
    for frame in video.decode(audio):
        if frame.time is None: continue
        if frame.time >= end: break
        if frame.time + frame.samples / frame.sample_rate <= start: continue
        for converted in resampler.resample(frame):
            values = converted.to_ndarray().reshape(-1)
            position = converted.time or frame.time
            lo = max(0, round((start - position) * 16000))
            hi = min(len(values), round((end - position) * 16000))
            if hi > lo: samples.append(values[lo:hi])
audio = np.concatenate(samples)
path = root / '.local' / 'cs50-public-smoke.wav'
with wave.open(str(path), 'wb') as wav:
    wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(16000); wav.writeframes(audio.astype('<i2').tobytes())
model = WhisperModel(str(root / '.local' / 'speech-model'), device='cpu', compute_type='int8', cpu_threads=6, local_files_only=True)
began = time.perf_counter()
segments, _ = model.transcribe(str(path), language='en', beam_size=5, temperature=0, condition_on_previous_text=False, vad_filter=True)
text = ' '.join(segment.text.strip() for segment in segments)
seconds = time.perf_counter() - began
reference = []
for block in (root / 'datasets/cs50/lecture0/transcript.srt').read_text(encoding='utf8').split('\n\n'):
    lines = block.strip().splitlines()
    if len(lines) < 3 or ' --> ' not in lines[1]: continue
    def timestamp(value):
        h, m, s = value.replace(',', '.').split(':'); return int(h)*3600 + int(m)*60 + float(s)
    lo, hi = map(timestamp, lines[1].split(' --> '))
    if lo >= start - .001 and hi <= end + .001: reference.append(' '.join(lines[2:]))
reference = re.sub(r'\[[^]]*\]|DAVID MALAN:', '', ' '.join(reference))
def words(value): return re.findall(r"[a-z0-9]+", value.lower().replace("'", ''))
expected, actual = words(reference), words(text)
row = list(range(len(actual) + 1))
for i, word in enumerate(expected, 1):
    new = [i]
    for j, other in enumerate(actual, 1): new.append(min(new[-1]+1, row[j]+1, row[j-1]+(word != other)))
    row = new
result = {'source': url, 'fromSeconds': start, 'toSeconds': end, 'model': 'Whisper large-v3-turbo',
    'audioSeconds': len(audio)/16000, 'decodeSeconds': round(seconds, 2), 'realTimeFactor': round(seconds/(len(audio)/16000), 3),
    'referenceWords': len(expected), 'wordErrors': row[-1], 'wordErrorRate': round(row[-1]/len(expected), 4),
    'scope': 'One clean public excerpt; not a room-microphone benchmark.', 'text': text, 'reference': reference}
(root / '.local/cs50-speech-smoke.json').write_text(json.dumps(result, indent=2), encoding='utf8')
print(json.dumps({key: value for key, value in result.items() if key not in ['text','reference']}, indent=2))
