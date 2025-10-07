import http from 'http';
import crypto from 'crypto';

function generateId() {
    // human-friendly-ish id: two words + number, but without external deps
    const animals = ['lion','tiger','eagle','whale','otter','falcon','panda','wolf','koala','dolphin'];
    const moods = ['brave','calm','proud','swift','clever','happy','bright','mighty','gentle','bold'];
    const a = animals[Math.floor(Math.random() * animals.length)];
    const m = moods[Math.floor(Math.random() * moods.length)];
    const n = (Math.floor(Math.random() * 90) + 10).toString();
    return `${m}-${a}-${n}`;
}

export default function createServer(opt = {}) {
    const clients = new Map();
    const stats = { tunnels: 0 };

    const server = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
            const path = url.pathname;

            // Status endpoint
            if (path === '/api/status') {
                const body = JSON.stringify({
                    tunnels: stats.tunnels,
                    mem: process.memoryUsage(),
                });
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(body);
                return;
            }

            // Per-tunnel status
            if (path.startsWith('/api/tunnels/') && path.endsWith('/status')) {
                const id = decodeURIComponent(path.split('/')[3] || '');
                if (!clients.has(id)) {
                    res.writeHead(404);
                    res.end('Not Found');
                    return;
                }
                const client = clients.get(id);
                const body = JSON.stringify({ connected_sockets: client.connectedSockets || 0 });
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(body);
                return;
            }

            // Create new tunnel on root or /?new
            if (path === '/') {
                if (url.searchParams.has('new')) {
                    const id = generateId();
                    clients.set(id, { id, createdAt: Date.now(), connectedSockets: 0 });
                    stats.tunnels = clients.size;
                    const host = req.headers.host || '';
                    const schema = opt.secure ? 'https' : 'http';
                    const info = { id, port: 0, max_conn_count: opt.max_tcp_sockets || 10, url: `${schema}://${id}.${host}` };
                    res.writeHead(200, { 'content-type': 'application/json' });
                    res.end(JSON.stringify(info));
                    return;
                }
                // simple landing message
                res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
                res.end('pure-server is running');
                return;
            }

            // Back-compat: /:id creates with validation
            const parts = path.split('/').filter(Boolean);
            if (parts.length === 1) {
                const reqId = parts[0];
                if (!/^(?:[a-z0-9][a-z0-9\-]{4,63}[a-z0-9]|[a-z0-9]{4,63})$/.test(reqId)) {
                    const body = JSON.stringify({ message: 'Invalid subdomain. Must be lowercase 4-63 chars.' });
                    res.writeHead(403, { 'content-type': 'application/json' });
                    res.end(body);
                    return;
                }
                if (!clients.has(reqId)) {
                    clients.set(reqId, { id: reqId, createdAt: Date.now(), connectedSockets: 0 });
                    stats.tunnels = clients.size;
                }
                const host = req.headers.host || '';
                const schema = opt.secure ? 'https' : 'http';
                const info = { id: reqId, port: 0, max_conn_count: opt.max_tcp_sockets || 10, url: `${schema}://${reqId}.${host}` };
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify(info));
                return;
            }

            // Default 404
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('Not Found');
        } catch (err) {
            res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('Internal Server Error');
        }
    });

    // basic upgrade handler stub (no proxying without deps)
    server.on('upgrade', (req, socket, head) => {
        socket.destroy();
    });

    return server;
}


