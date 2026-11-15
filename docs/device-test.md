# Run Recall from another device

Use Node 22.18+ and MongoDB. Build once, then serve React and the API from the
same Fastify process.

```sh
npm ci
npm run build
npm start
```

The default address is http://127.0.0.1:3001. If you configured a different
`API_PORT`, use that port. MongoDB must be reachable when the production
server starts. Keep MongoDB private and backed up. `MONGODB_DB` selects the
database for accounts, study notes, personal runs, generated artifacts, and
the course graph. Reuse that database across restarts. `npm run db:start`
runs MongoDB locally with a persistent data directory, or set `MONGODB_URI`
to an existing instance. Cloning the repo does not copy the database.

For an offline device test, set `LLM_PROVIDER=fixture` and leave model keys
unset. Sign up with a test `.edu` address, add AI Alignment or CS50, and
reopen the same account on a second device. Prepared notes appear only if
the database contains them. To load the curated sample graph without an API
key, run this against the selected database once:

```sh
node --import tsx --env-file-if-exists=.env scripts/seed-curated-graph.mjs
```

## HTTPS

For an invited test on a trusted network, bind `HOST` to the host's LAN IP,
set `APP_ORIGIN` to the exact HTTPS address the other device will open
(including a nondefault port), and set `TLS_CERT_FILE` and `TLS_KEY_FILE`.
The certificate must cover that host or IP and be trusted by the other
device. A private test certificate requires installing its public CA
certificate on each test device. Keep certificate signing keys private.

For a normal HTTPS reverse proxy on the same host, bind `HOST=127.0.0.1`,
set `APP_ORIGIN` to the external HTTPS origin, and set
`TRUST_LOOPBACK_PROXY=1` instead of specifying TLS files. Forward the
original Host and trusted HTTPS protocol, disable response buffering for
the lecture event stream, and allow requests of at least 1.35 MB. A
WebSocket proxy is unnecessary.

Set `STAFF_INVITE_CODE` if you want an invitation required for new
instructor and TA accounts. Student `.edu` signup still does not verify
email ownership. Use an access gate such as a VPN or private reverse proxy
before offering this prototype outside the test group.

## Microphone

On the server host, install Python 3.11+ and the pinned Whisper model. On
macOS or Linux:

```sh
python3 -m venv .local/speech-venv
.local/speech-venv/bin/python -m pip install -r scripts/speech-requirements.txt
.local/speech-venv/bin/python scripts/download-speech.py
```

On Windows, use `scripts/install-speech.ps1`. On the client device, use the
configured HTTPS address, sign in, add CS50, open Lecture 0, and choose
**Start listening**. The browser streams audio chunks to this Recall server.
Whisper runs there and the raw audio is not archived. With fixture mode,
speech recognition still uses the real local Whisper model. The downstream
topic and summary outputs are deterministic preview output. To enable hosted generation, set `LLM_PROVIDER=gemini` with `GEMINI_API_KEY` or `LLM_PROVIDER=deepseek` with `DEEPSEEK_API_KEY`. Leave `LLM_MODEL` blank to use Gemini 4 Hydrogen or DeepSeek Flash, respectively. Restart the server after changing providers. See the [provider setup table](../README.md#run-locally). The speech model is unchanged. On a deployed origin, live lecture and paper generation require an enrolled account, and graph indexing requires course staff.
