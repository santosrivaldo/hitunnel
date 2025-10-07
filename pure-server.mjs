import http from 'http';
import net from 'net';

function generateId() {
    const animals = ['lion','tiger','eagle','whale','otter','falcon','panda','wolf','koala','dolphin'];
    const moods = ['brave','calm','proud','swift','clever','happy','bright','mighty','gentle','bold'];
    const a = animals[Math.floor(Math.random() * animals.length)];
    const m = moods[Math.floor(Math.random() * moods.length)];
    const n = (Math.floor(Math.random() * 90) + 10).toString();
    return `${m}-${a}-${n}`;
}

function extractSubdomain(hostname) {
    if (!hostname) return null;
    const parts = hostname.split('.');
    if (parts.length < 2) return null;
    return parts[0];
}

export default function createServer(opt = {}) {
    const clients = new Map();
    const stats = { tunnels: 0 };

    const server = http.createServer(async (req, res) => {
        try {
            const hostname = req.headers.host;
            const subdomain = extractSubdomain(hostname);
            const url = new URL(req.url, `http://${hostname || 'localhost'}`);
            const path = url.pathname;
            
            // Debug logging
            console.log(`Request: ${req.method} ${path} from ${hostname} (subdomain: ${subdomain})`);

            // API endpoints (no subdomain routing)
            if (path === '/api/status') {
                const body = JSON.stringify({
                    tunnels: stats.tunnels,
                    mem: process.memoryUsage(),
                });
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(body);
                return;
            }

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

            // Handle root path
            if (path === '/') {
                // Check for ?new parameter first
                if (url.searchParams.has('new')) {
                    const id = generateId();
                    clients.set(id, { 
                        id, 
                        createdAt: Date.now(), 
                        connectedSockets: 0,
                        targetHost: null,
                        targetPort: null,
                        connections: new Set()
                    });
                    stats.tunnels = clients.size;
                    const host = req.headers.host || '';
                    const schema = opt.secure ? 'https' : 'http';
                    const info = { id, port: 0, max_conn_count: opt.max_tcp_sockets || 10, url: `${schema}://${id}.${host}` };
                    res.writeHead(200, { 'content-type': 'application/json' });
                    res.end(JSON.stringify(info));
                    return;
                }
                
                // Default landing page (no subdomain)
                res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
                res.end(`
<!DOCTYPE html>
<html>
<head>
    <title>Pure Tunnel Server</title>
    <meta charset="utf-8">
</head>
<body>
    <h1>Pure Tunnel Server</h1>
    <p>Server is running and ready to create tunnels.</p>
    <p>Create a new tunnel: <a href="/?new">/?new</a></p>
    <p>API Status: <a href="/api/status">/api/status</a></p>
</body>
</html>
                `);
                return;
            }

            // Subdomain routing - proxy to client
            if (subdomain && clients.has(subdomain)) {
                const client = clients.get(subdomain);
                
                // If client not connected, return 502
                if (!client.targetHost || !client.targetPort) {
                    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
                    res.end('Tunnel not connected');
                    return;
                }

                // Proxy request to client
                const proxyReq = http.request({
                    hostname: client.targetHost,
                    port: client.targetPort,
                    path: req.url,
                    method: req.method,
                    headers: {
                        ...req.headers,
                        host: `${client.targetHost}:${client.targetPort}`
                    }
                }, (proxyRes) => {
                    res.writeHead(proxyRes.statusCode, proxyRes.headers);
                    proxyRes.pipe(res);
                });

                proxyReq.on('error', (err) => {
                    console.error('Proxy error:', err);
                    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
                    res.end('Proxy error');
                });

                req.pipe(proxyReq);
                return;
            }

            // Back-compat: /:id creates tunnel
            const parts = path.split('/').filter(Boolean);
            if (parts.length === 1 && !subdomain) {
                const reqId = parts[0];
                if (!/^(?:[a-z0-9][a-z0-9\-]{4,63}[a-z0-9]|[a-z0-9]{4,63})$/.test(reqId)) {
                    const body = JSON.stringify({ message: 'Invalid subdomain. Must be lowercase 4-63 chars.' });
                    res.writeHead(403, { 'content-type': 'application/json' });
                    res.end(body);
                    return;
                }
                if (!clients.has(reqId)) {
                    clients.set(reqId, { 
                        id: reqId, 
                        createdAt: Date.now(), 
                        connectedSockets: 0,
                        targetHost: null,
                        targetPort: null,
                        connections: new Set()
                    });
                    stats.tunnels = clients.size;
                }
                const host = req.headers.host || '';
                const schema = opt.secure ? 'https' : 'http';
                const info = { id: reqId, port: 0, max_conn_count: opt.max_tcp_sockets || 10, url: `${schema}://${reqId}.${host}` };
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify(info));
                return;
            }

            // Fallback - always return something
            console.log(`Fallback: ${req.method} ${path} not handled`);
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(`
<!DOCTYPE html>
<html>
<head>
    <title>Pure Tunnel Server</title>
    <meta charset="utf-8">
</head>
<body>
    <h1>Pure Tunnel Server</h1>
    <p>Path: ${path}</p>
    <p>Host: ${hostname}</p>
    <p>Subdomain: ${subdomain}</p>
    <p>Create tunnel: <a href="/?new">/?new</a></p>
    <p>API Status: <a href="/api/status">/api/status</a></p>
</body>
</html>
            `);
        } catch (err) {
            console.error('Server error:', err);
            res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('Internal Server Error');
        }
    });

    // WebSocket upgrade handling
    server.on('upgrade', (req, socket, head) => {
        const hostname = req.headers.host;
        const subdomain = extractSubdomain(hostname);
        
        if (subdomain && clients.has(subdomain)) {
            const client = clients.get(subdomain);
            
            if (!client.targetHost || !client.targetPort) {
                socket.destroy();
                return;
            }

            // Proxy WebSocket to client
            const proxySocket = net.createConnection(client.targetPort, client.targetHost, () => {
                socket.write(head);
                proxySocket.pipe(socket);
                socket.pipe(proxySocket);
            });

            proxySocket.on('error', () => socket.destroy());
            socket.on('error', () => proxySocket.destroy());
        } else {
            socket.destroy();
        }
    });

    // Handle client connections (localtunnel protocol)
    server.on('connection', (socket) => {
        socket.on('data', (data) => {
            // Simple protocol: first message contains tunnel info
            try {
                const message = data.toString();
                if (message.startsWith('TUNNEL:')) {
                    const parts = message.split(':');
                    if (parts.length >= 3) {
                        const tunnelId = parts[1];
                        const targetHost = parts[2];
                        const targetPort = parseInt(parts[3]) || 80;
                        
                        if (clients.has(tunnelId)) {
                            const client = clients.get(tunnelId);
                            client.targetHost = targetHost;
                            client.targetPort = targetPort;
                            client.connections.add(socket);
                            client.connectedSockets = client.connections.size;
                            
                            socket.on('close', () => {
                                client.connections.delete(socket);
                                client.connectedSockets = client.connections.size;
                            });
                            
                            socket.write('OK\n');
                        } else {
                            socket.write('ERROR: Tunnel not found\n');
                            socket.destroy();
                        }
                    }
                }
            } catch (err) {
                socket.destroy();
            }
        });
    });

    return server;
}


