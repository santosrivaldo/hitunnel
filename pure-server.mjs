import http from 'http';
import net from 'net';

function generateId(storeId) {
    // Use STORE_ID directly as endpoint ID
    return storeId;
}

function extractTunnelId(path, storeId) {
    // Extract tunnel ID from /tunnel/ID pattern
    const tunnelMatch = path.match(/^\/tunnel\/([a-z0-9\-]+)$/);
    if (tunnelMatch) return tunnelMatch[1];
    
    // Also check for direct /ID pattern (for localtunnel compatibility)
    const directMatch = path.match(/^\/([a-z0-9\-]+)$/);
    if (directMatch) return directMatch[1];
    
    // Check if path starts with /ID/ (for sub-paths)
    const subPathMatch = path.match(/^\/([a-z0-9\-]+)\//);
    if (subPathMatch) return subPathMatch[1];
    
    return null;
}

export default function createServer(opt = {}) {
    const clients = new Map();
    const stats = { tunnels: 0 };
    let storeId = process.env.STORE_ID || 'default-store';

    const server = http.createServer(async (req, res) => {
        try {
            const hostname = req.headers.host;
            const url = new URL(req.url, `http://${hostname || 'localhost'}`);
            const path = url.pathname;
            const tunnelId = extractTunnelId(path, storeId);
            
            // Debug logging
            console.log(`Request: ${req.method} ${path} from ${hostname} (tunnel: ${tunnelId})`);

            // API endpoints
            if (path === '/api/status') {
                const body = JSON.stringify({
                    tunnels: stats.tunnels,
                    mem: process.memoryUsage(),
                    store_id: storeId,
                });
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(body);
                return;
            }

            // Set STORE_ID endpoint
            if (path === '/api/store-id' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk.toString());
                req.on('end', () => {
                    try {
                        const data = JSON.parse(body);
                        if (data.store_id && typeof data.store_id === 'string') {
                            storeId = data.store_id;
                            console.log(`STORE_ID updated to: ${storeId}`);
                            res.writeHead(200, { 'content-type': 'application/json' });
                            res.end(JSON.stringify({ success: true, store_id: storeId }));
                        } else {
                            res.writeHead(400, { 'content-type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Invalid store_id' }));
                        }
                    } catch (err) {
                        res.writeHead(400, { 'content-type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Invalid JSON' }));
                    }
                });
                return;
            }

            // Get STORE_ID endpoint
            if (path === '/api/store-id' && req.method === 'GET') {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ store_id: storeId }));
                return;
            }

            // Get tunnel info for current STORE_ID
            if (path === '/api/tunnel-info' && req.method === 'GET') {
                const client = clients.get(storeId);
                const isConnected = !!(client && client.targetHost && client.targetPort);
                const host = req.headers.host || '';
                const schema = opt.secure ? 'https' : 'http';
                
                const info = {
                    store_id: storeId,
                    tunnel_id: storeId,
                    url: `${schema}://${host}/tunnel/${storeId}`,
                    connected: isConnected,
                    target: client ? `${client.targetHost}:${client.targetPort}` : null,
                    created_at: client ? new Date(client.createdAt).toISOString() : null,
                    active_connections: client ? client.connectedSockets : 0
                };
                
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify(info));
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
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .status { padding: 10px; border-radius: 5px; margin: 10px 0; }
        .connected { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .waiting { background: #fff3cd; color: #856404; border: 1px solid #ffeaa7; }
        pre { background: #f8f9fa; padding: 10px; border-radius: 3px; }
        .auto-refresh { color: #666; font-size: 0.9em; }
    </style>
</head>
<body>
    <h1>🔗 Tunnel ${tunnelId}</h1>
    
    <div class="status ${isConnected ? 'connected' : 'waiting'}">
        <strong>Status:</strong> ${isConnected ? '✅ Connected' : '⏳ Waiting for Connection'}
    </div>
    
    ${isConnected ? `
        <p><strong>Target:</strong> ${client.targetHost}:${client.targetPort}</p>
        <p><strong>Active connections:</strong> ${client.connectedSockets}</p>
        <p><strong>Created:</strong> ${new Date(client.createdAt).toLocaleString()}</p>
        <p><strong>URL:</strong> <a href="/tunnel/${tunnelId}/">https://tunnel.tudoparasualavanderia.com.br/tunnel/${tunnelId}/</a></p>
    ` : `
        <h3>📋 Connection Instructions:</h3>
        <p>To connect this tunnel, run one of these commands:</p>
        <pre># Using localtunnel CLI
lt --host https://tunnel.tudoparasualavanderia.com.br --port 8080

# Or specify the tunnel ID
lt --host https://tunnel.tudoparasualavanderia.com.br --port 8080 --subdomain ${tunnelId}</pre>
        
        <p><strong>Note:</strong> The tunnel will stay active and wait for connections.</p>
    `}
    
    <hr>
    <p><a href="/api/tunnels/${tunnelId}/status">📊 API Status (JSON)</a> | <a href="/">🏠 Home</a></p>
    <p class="auto-refresh">🔄 Auto-refresh every 10 seconds</p>
    
    <script>
        // Auto-refresh with visual feedback
        let countdown = 10;
        const refreshElement = document.querySelector('.auto-refresh');
        
        setInterval(() => {
            countdown--;
            refreshElement.textContent = '🔄 Auto-refresh in ' + countdown + ' seconds';
            if (countdown <= 0) {
                location.reload();
            }
        }, 1000);
    </script>
</body>
</html>
                `);
                return;
            }

            // Create tunnel endpoint
            if (path === '/' && url.searchParams.has('new')) {
                // Use STORE_ID directly as tunnel ID
                const id = storeId;
                
                // Check if tunnel already exists
                if (clients.has(id)) {
                    const existingClient = clients.get(id);
                    const host = req.headers.host || '';
                    const schema = opt.secure ? 'https' : 'http';
                    const info = { 
                        id, 
                        port: 0, 
                        max_conn_count: opt.max_tcp_sockets || 10, 
                        url: `${schema}://${host}/tunnel/${id}`,
                        store_id: storeId,
                        connected: !!(existingClient.targetHost && existingClient.targetPort)
                    };
                    res.writeHead(200, { 'content-type': 'application/json' });
                    res.end(JSON.stringify(info));
                    return;
                }
                
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
                    url: `${schema}://${host}/tunnel/${id}`,
                    store_id: storeId
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

                // Remove tunnel ID from path for proxy
                let proxyPath = req.url;
                if (proxyPath.startsWith(`/tunnel/${tunnelId}`)) {
                    proxyPath = proxyPath.replace(`/tunnel/${tunnelId}`, '') || '/';
                } else if (proxyPath.startsWith(`/${tunnelId}`)) {
                    proxyPath = proxyPath.replace(`/${tunnelId}`, '') || '/';
                }

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

            // Remove tunnel ID from path for proxy
            let proxyPath = req.url;
            if (proxyPath.startsWith(`/tunnel/${tunnelId}`)) {
                proxyPath = proxyPath.replace(`/tunnel/${tunnelId}`, '') || '/';
            } else if (proxyPath.startsWith(`/${tunnelId}`)) {
                proxyPath = proxyPath.replace(`/${tunnelId}`, '') || '/';
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
        let buffer = '';
        let tunnelId = null;
        let heartbeatInterval = null;
        
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
                            tunnelId = parts[1];
                            const targetHost = parts[2];
                            const targetPort = parseInt(parts[3]) || 80;
                            
                            console.log(`Client connecting to tunnel ${tunnelId} -> ${targetHost}:${targetPort}`);
                            
                            if (clients.has(tunnelId)) {
                                const client = clients.get(tunnelId);
                                client.targetHost = targetHost;
                                client.targetPort = targetPort;
                                client.connections.add(socket);
                                client.connectedSockets = client.connections.size;
                                
                                // Start heartbeat to keep connection alive
                                heartbeatInterval = setInterval(() => {
                                    if (!socket.destroyed) {
                                        socket.write('PING\n');
                                    }
                                }, 30000); // Ping every 30 seconds
                                
                                socket.on('close', () => {
                                    if (heartbeatInterval) {
                                        clearInterval(heartbeatInterval);
                                    }
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
                    } else if (line.trim() === 'PONG') {
                        // Client responded to heartbeat
                        console.log(`Heartbeat received from tunnel ${tunnelId}`);
                    }
                }
            }
        });
        
        socket.on('close', () => {
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
            }
            console.log(`Client socket closed for tunnel ${tunnelId}`);
        });
        
        socket.on('error', (err) => {
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
            }
            console.log(`Client socket error for tunnel ${tunnelId}:`, err.message);
        });
        
        // Set keep-alive options
        socket.setKeepAlive(true, 60000); // Enable keep-alive, 60 seconds
        socket.setTimeout(120000); // 2 minutes timeout
    });

    return server;
}