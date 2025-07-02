import { WebSocketServer } from 'ws';
import { spawn } from 'child_process';

const wss = new WebSocketServer({ port: 8080 });
const downloads = {};

wss.on('connection', ws => {
  ws.on('message', msg => {
    const d = JSON.parse(msg);
    if (d.type === 'download') {
      const id = Date.now().toString();
      downloads[id] = { url: d.url, status: 'queued', progress: 0 };
      ws.send(JSON.stringify({ list: Object.values(downloads) }));
      startDownload(id, d.url, ws);
    } else if (d.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong' }));
    }
  });
});

function startDownload(id, url, ws) {
  const proc = spawn('wget', ['--progress=dot', url]);
  downloads[id].status = 'downloading';

  proc.stderr.on('data', data => {
    const m = data.toString();
    const pct = parseProgress(m);
    if (pct !== null) downloads[id].progress = pct;
    broadcast(ws);
  });

  proc.on('close', code => {
    downloads[id].status = code === 0 ? 'done' : 'error';
    downloads[id].progress = 100;
    broadcast(ws);
  });
}

function parseProgress(text) {
  const m = text.match(/(\d+)%/);
  return m ? +m[1] : null;
}

function broadcast(ws) {
  ws.send(JSON.stringify({ list: Object.values(downloads) }));
}

