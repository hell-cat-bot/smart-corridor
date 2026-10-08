'use strict';

/**
 * A stand-in for ml_backend, used by the integration test.
 *
 * It serves `/api/world/snapshot` and a `/ws` WebSocket that pushes whatever
 * the test tells it to, which lets the collector be tested end to end without
 * Python, a GPU or the model weights.
 *
 * The WebSocket side is written against the raw protocol (RFC 6455) rather than
 * a library, so the test suite needs no dependency of its own. It only
 * implements what this test uses: the handshake and server-to-client text
 * frames.
 */

const http = require('http');
const crypto = require('crypto');

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** Wraps a payload in a single unmasked text frame. */
function encodeTextFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const length = payload.length;

  let header;
  if (length < 126) {
    header = Buffer.from([0x81, length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, payload]);
}

function createFakeSimBackend(snapshot = {}) {
  const sockets = new Set();

  const server = http.createServer((req, res) => {
    if (req.url === '/') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ status: 'ok', simTime: 42, running: true }));
      return;
    }
    if (req.url === '/api/world/snapshot') {
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          simTime: 42,
          tick: 420,
          running: true,
          speed: 1,
          nodes: snapshot.nodes || [],
          units: snapshot.units || [],
          missions: snapshot.missions || [],
          disasters: snapshot.disasters || [],
          lights: {},
          metrics: {},
        }),
      );
      return;
    }
    res.statusCode = 404;
    res.end();
  });

  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );

    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => sockets.delete(socket));
    // Incoming frames are not needed: this stream is server-to-client only.
    socket.on('data', () => {});
  });

  return {
    server,
    /** Resolves with the chosen port once the server is accepting connections. */
    listen() {
      return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve(server.address().port));
      });
    },
    /** Pushes one message to every connected client. */
    send(message) {
      const frame = encodeTextFrame(JSON.stringify(message));
      for (const socket of sockets) socket.write(frame);
    },
    clientCount() {
      return sockets.size;
    },
    close() {
      for (const socket of sockets) socket.destroy();
      sockets.clear();
      server.close();
    },
  };
}

module.exports = { createFakeSimBackend };
