"""Local-only ASR. JSON lines over stdio; audio is decoded in memory, never saved."""
import os
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
import base64
import io
import json
import sys
import wave
import numpy as np
from faster_whisper import WhisperModel

model = WhisperModel(sys.argv[1], device='cpu', compute_type='int8', cpu_threads=6, local_files_only=True)
print(json.dumps({'ready': True}), flush=True)
for line in sys.stdin:
    request = {}
    try:
        request = json.loads(line)
        with wave.open(io.BytesIO(base64.b64decode(request['audio'], validate=True)), 'rb') as wav:
            if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (1, 2, 16000):
                raise ValueError('Expected mono 16-bit PCM WAV at 16000 Hz')
            if not 0 < wav.getnframes() <= 16000 * 30:
                raise ValueError('Audio must be between 0 and 30 seconds')
            audio = np.frombuffer(wav.readframes(wav.getnframes()), dtype=np.int16).astype(np.float32) / 32768
        text = ''
        # Silence is not evidence. VAD also reduces Whisper's silence hallucinations.
        if np.sqrt(np.mean(audio ** 2)) > 0.002:
            segments, _ = model.transcribe(audio, language='en', beam_size=5, temperature=0,
                condition_on_previous_text=False, vad_filter=True,
                vad_parameters={'min_silence_duration_ms': 400}, word_timestamps=False)
            text = ' '.join(segment.text.strip() for segment in segments if segment.no_speech_prob < 0.6).strip()
        print(json.dumps({'id': request['id'], 'text': text}), flush=True)
    except Exception as error:
        print(json.dumps({'id': request.get('id'), 'error': str(error)}), flush=True)
