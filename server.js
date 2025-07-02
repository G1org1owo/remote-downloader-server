import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { spawn } from 'child_process';
import consoleStamp from 'console-stamp';

consoleStamp(console, 'yyyy-mm-dd HH:MM:ss');

// Parse command-line options
const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 [--port <number>]')
  .option('port', {
    alias: 'p',
    type: 'number',
    description: 'Port to listen on',
    default: 8080
  })
  .help()
  .argv;

const PORT = argv.port;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const downloads = {};

wss.on('connection', (ws, req) => {
  console.log('WS connection from', req.socket.remoteAddress);

  ws.on('message', data => {
    console.log('Received:', data.toString());
    try {
      const d = JSON.parse(data);
      if (d.type === 'download') {
        const id = Date.now().toString();
        downloads[id] = { url: d.url, status: 'queued', progress: 0 };
        broadcast();
        startDownload(id, d.url);
      }
    } catch (err) {
      console.error('Invalid message format', err);
    }
  });

  ws.on('close', (code, reason) => console.log(`WS closed: ${code}`, reason));
  ws.on('error', err => console.error('WS error', err));
});

function startDownload(id, url) {
  console.log(`Start download [${id}]:`, url);
  const proc = spawn('wget', ['--progress=dot', url]);

  proc.stderr.on('data', chunk => {
    const text = chunk.toString();
    const m = text.match(/(\d+)%/);
    if (m) downloads[id].progress = +m[1];
    downloads[id].status = 'downloading';
    broadcast();
  });

  proc.on('close', code => {
    downloads[id].status = (code === 0 ? 'done' : 'error');
    downloads[id].progress = 100;
    console.log(`[${id}] download ${downloads[id].status}`);
    broadcast();
  });

  proc.on('error', err => {
    downloads[id].status = 'error';
    console.error(`[${id}] download error`, err);
    broadcast();
  });
}

function broadcast() {
  const list = Object.values(downloads);
  wss.clients.forEach(client => {
    if (client.readyState === client.OPEN) {
      client.send(JSON.stringify({ list }));
    }
  });
}

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
