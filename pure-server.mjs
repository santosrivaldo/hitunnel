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

function extractTunnelId(path) {
    // Extract tunnel ID from /tunnel/ID pattern
    const match = path.match(/^\/tunnel\/([a-z0-9\-]+)$/);
    return match ? match[1] : null;
}

export default function createServer(opt = {}) {
    const clients = new Map();
    const stats = { tunnels: 0 };

    const server = http.createServer(async (req, res) => {
        try {
            const hostname = req.headers.host;
            const url = new URL(req.url, `http://${hostname || 'localhost'}`);
            const path = url.pathname;
            const tunnelId = extractTunnelId(path);
            
            // Debug logging
            console.log(`Request: ${req.method} ${path} from ${hostname} (tunnel: ${tunnelId})`);

            // API endpoints
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
                const body = JSON.stringify({ 
                    connected_sockets: client.connectedSockets || 0,
                    connected: !!(client.targetHost && client.targetPort),
                    target: client.targetHost ? `${client.targetHost}:${client.targetPort}` : null
                });
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(body);
                return;
            }

            // Tunnel info page
            if (tunnelId && clients.has(tunnelId) && path === `/tunnel/${tunnelId}`) {
                const client = clients.get(tunnelId);
                const isConnected = !!(client.targetHost && client.targetPort);
                
                res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
                res.end(`
<!DOCTYPE html>
<html>
<head>
    <title>Tunnel ${tunnelId}</title>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="10">
</head>
<body>
    <h1>Tunnel ${tunnelId}</h1>
    <p>Status: <span style="color: ${isConnected ? 'green' : 'orange'};">${isConnected ? 'Connected' : 'Waiting for Connection'}</span></p>
    ${isConnected ? `
        <p>Target: ${client.targetHost}:${client.targetPort}</p>
        <p>Active connections: ${client.connectedSockets}</p>
    ` : `
        <p>To connect this tunnel, run:</p>
        <pre>lt --host https://tunnel.tudoparasualavanderia.com.br --port 8080</pre>
        <p>Or use the localtunnel client with this server URL.</p>
    `}
    <p><a href="/api/tunnels/${tunnelId}/status">API Status</a></p>
    <script>
        setTimeout(() => location.reload(), 10000);
    </script>
</body>
</html>
                `);
                return;
            }

            // Create tunnel endpoint
            if (path === '/' && url.searchParams.has('new')) {
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
                const info = { 
                    id, 
                    port: 0, 
                    max_conn_count: opt.max_tcp_sockets || 10, 
                    url: `${schema}://${host}/tunnel/${id}` 
                };
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify(info));
                return;
            }

            // Tunnel endpoint routing - proxy to client
            if (tunnelId && clients.has(tunnelId)) {
                const client = clients.get(tunnelId);
                
                // If client not connected, show waiting page
                if (!client.targetHost || !client.targetPort) {
                    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
                    res.end(`
<!DOCTYPE html>
<html>
<head>
    <title>Tunnel ${tunnelId} - Waiting for Connection</title>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="5">
</head>
<body>
    <h1>Tunnel ${tunnelId}</h1>
    <p>Waiting for client connection...</p>
    <p>Status: <span style="color: orange;">Connecting</span></p>
    <p>This page will refresh automatically.</p>
    <script>
        setTimeout(() => location.reload(), 5000);
    </script>
</body>
</html>
                    `);
                    return;
                }

                // Remove /tunnel/ID from path for proxy
                const proxyPath = req.url.replace(`/tunnel/${tunnelId}`, '') || '/';

                // Proxy request to client
                const proxyReq = http.request({
                    hostname: client.targetHost,
                    port: client.targetPort,
                    path: proxyPath,
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

            // Landing page
            if (path === '/') {
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
    <p>Active tunnels: ${stats.tunnels}</p>
</body>
</html>
                `);
                return;
            }

            // 404 for unknown paths
            res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('Not Found');
        } catch (err) {
            console.error('Server error:', err);
            res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
            res.end('Internal Server Error');
        }
    });

    // WebSocket upgrade handling
    server.on('upgrade', (req, socket, head) => {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const path = url.pathname;
        const tunnelId = extractTunnelId(path);
        
        if (tunnelId && clients.has(tunnelId)) {
            const client = clients.get(tunnelId);
            
            if (!client.targetHost || !client.targetPort) {
                socket.destroy();
                return;
            }

            // Remove /tunnel/ID from path for proxy
            const proxyPath = req.url.replace(`/tunnel/${tunnelId}`, '') || '/';

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
        let buffer = '';
        
        socket.on('data', (data) => {
            buffer += data.toString();
            
            // Look for tunnel registration
            if (buffer.includes('\n')) {
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line
                
                for (const line of lines) {
                    if (line.startsWith('TUNNEL:')) {
                        const parts = line.split(':');
                        if (parts.length >= 3) {
                            const tunnelId = parts[1];
                            const targetHost = parts[2];
                            const targetPort = parseInt(parts[3]) || 80;
                            
                            console.log(`Client connecting to tunnel ${tunnelId} -> ${targetHost}:${targetPort}`);
                            
                            if (clients.has(tunnelId)) {
                                const client = clients.get(tunnelId);
                                client.targetHost = targetHost;
                                client.targetPort = targetPort;
                                client.connections.add(socket);
                                client.connectedSockets = client.connections.size;
                                
                                socket.on('close', () => {
                                    client.connections.delete(socket);
                                    client.connectedSockets = client.connections.size;
                                    console.log(`Client disconnected from tunnel ${tunnelId}`);
                                });
                                
                                socket.write('OK\n');
                                console.log(`Tunnel ${tunnelId} connected successfully`);
                            } else {
                                socket.write('ERROR: Tunnel not found\n');
                                socket.destroy();
                            }
                        }
                    }
                }
            }
        });
        
        socket.on('close', () => {
            console.log('Client socket closed');
        });
        
        socket.on('error', (err) => {
            console.log('Client socket error:', err.message);
        });
    });

    return server;
}