import http from 'node:http';

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const BRIDGE_PORT = Number(process.env.OLLAMA_BRIDGE_PORT || '11435');

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(404).end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'POST' && req.url === '/translate') {
    try {
      const body = await readJson(req);
      const model = body.model || 'qwen3.5:9b';
      const text = body.text || '';

      const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          prompt: `Translate to Simplified Chinese only:\n${text}`,
          think: false,
          options: {
            temperature: 0,
            top_p: 0.8,
            num_ctx: 4096,
            num_predict: 1024
          }
        })
      });

      if (!response.ok) {
        res.writeHead(response.status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Ollama bridge upstream failed: ${response.status}` }));
        return;
      }

      const data = await response.json();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ translation: (data.response || '').trim() }));
      return;
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'bridge error' }));
      return;
    }
  }

  res.writeHead(404).end();
});

server.listen(BRIDGE_PORT, '127.0.0.1', () => {
  console.log(`ollama-bridge listening on http://127.0.0.1:${BRIDGE_PORT}`);
});

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}
