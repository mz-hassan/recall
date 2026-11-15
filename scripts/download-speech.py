from pathlib import Path
from huggingface_hub import snapshot_download

root = Path(__file__).resolve().parent.parent / '.local' / 'speech-model'
snapshot_download('mobiuslabsgmbh/faster-whisper-large-v3-turbo', revision='0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf', local_dir=str(root),
    allow_patterns=['config.json', 'model.bin', 'tokenizer.json', 'preprocessor_config.json', 'vocabulary.json', 'vocabulary.txt'])
print(f'Local Whisper large-v3-turbo installed in {root}')
