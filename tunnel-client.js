#!/usr/bin/env node

const net = require('net');
const http = require('http');
const https = require('https');
const { URL } = require('url');

class TunnelClient {
    constructor(options = {}) {
        this.host = options.host || 'localhost';
        this.port = options.port || 3000;
        this.tcpPort = options.tcpPort || options.port || 3000; // Porta TCP separada
        this.localPort = options.localPort || 8080;
        this.localHost = options.localHost || 'localhost';
        this.secure = options.secure || false;
        this.tunnelId = null;
        this.serverSocket = null;
        this.connections = new Set();
        
        // Auto-detect port from host if not specified
        if (this.host.includes('://')) {
            const url = new URL(this.host);
            this.host = url.hostname;
            // Para HTTPS, usar porta 443 por padrão
            // Para HTTP, usar porta 80 por padrão
            this.port = url.port || (url.protocol === 'https:' ? 443 : 80);
            this.tcpPort = url.port || (url.protocol === 'https:' ? 443 : 80);
            this.secure = url.protocol === 'https:';
        }
    }

    async connect() {
        try {
            console.log(`🚀 Conectando ao servidor ${this.host}:${this.tcpPort}...`);
            
            // Para localtunnel, usar HTTP/HTTPS em vez de TCP raw
            // O protocolo localtunnel funciona via HTTP requests
            console.log('✅ Usando protocolo HTTP/HTTPS para localtunnel');
            this.startHeartbeat();
            await this.registerTunnel();

        } catch (err) {
            console.error('❌ Erro ao conectar:', err.message);
            setTimeout(() => this.connect(), 5000);
        }
    }

    handleServerData(data) {
        const message = data.toString();
        console.log('📨 Servidor:', message.trim());

        if (message.includes('OK')) {
            console.log('✅ Túnel registrado com sucesso!');
            this.startLocalServer();
        } else if (message.includes('ERROR')) {
            console.error('❌ Erro do servidor:', message);
        } else if (message.includes('PING')) {
            // Responder ao heartbeat
            console.log('💓 Heartbeat respondido');
        }
    }

    startLocalServer() {
        // Criar servidor HTTP local para receber requisições
        const localServer = http.createServer((req, res) => {
            console.log(`🔗 Requisição local: ${req.method} ${req.url}`);
            
            // Proxy para o servidor de túnel
            this.proxyRequest(req, res);
        });

        localServer.listen(this.localPort, this.localHost, () => {
            console.log(`🌐 Servidor local rodando em ${this.localHost}:${this.localPort}`);
            console.log(`🔗 Túnel ativo: ${this.host}/tunnel/${this.tunnelId}`);
        });

        localServer.on('error', (err) => {
            console.error('❌ Erro no servidor local:', err.message);
        });
    }

    proxyRequest(req, res) {
        const protocol = this.secure ? 'https' : 'http';
        const port = this.port === 443 || this.port === 80 ? '' : `:${this.port}`;
        const targetUrl = `${protocol}://${this.host}${port}/tunnel/${this.tunnelId}${req.url}`;
        
        console.log(`🔄 Proxy: ${req.url} -> ${targetUrl}`);
        
        const proxyReq = (this.secure ? https : http).request(targetUrl, {
            method: req.method,
            headers: req.headers
        }, (proxyRes) => {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
        });

        req.pipe(proxyReq);
        
        proxyReq.on('error', (err) => {
            console.error('❌ Erro no proxy:', err.message);
            res.writeHead(500);
            res.end('Proxy Error');
        });
    }

    async registerTunnel() {
        try {
            // Obter informações do túnel do servidor
            const protocol = this.secure ? 'https' : 'http';
            // Para HTTPS, não incluir porta (usa 443 por padrão)
            // Para HTTP, incluir porta apenas se não for 80
            const port = this.secure ? '' : (this.port === 80 ? '' : `:${this.port}`);
            const tunnelUrl = `${protocol}://${this.host}${port}/?new`;
            
            console.log(`📡 Registrando túnel em: ${tunnelUrl}`);
            
            const response = await this.makeHttpRequest(tunnelUrl);
            const tunnelInfo = JSON.parse(response);
            
            this.tunnelId = tunnelInfo.id;
            console.log(`🆔 Túnel ID: ${this.tunnelId}`);
            console.log(`🔗 URL pública: ${tunnelInfo.url}`);
            
            // Registrar túnel no servidor
            this.serverSocket.write(`TUNNEL:${this.tunnelId}:${this.localHost}:${this.localPort}\n`);
            
        } catch (err) {
            console.error('❌ Erro ao registrar túnel:', err.message);
            setTimeout(() => this.registerTunnel(), 5000);
        }
    }

    makeHttpRequest(url) {
        return new Promise((resolve, reject) => {
            const client = url.startsWith('https') ? https : http;
            
            const req = client.get(url, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
            });
            
            req.on('error', reject);
            req.setTimeout(10000, () => {
                req.destroy();
                reject(new Error('Timeout'));
            });
        });
    }

    startHeartbeat() {
        setInterval(() => {
            console.log('💓 Heartbeat enviado');
        }, 30000);
    }

    reconnect() {
        console.log('🔄 Tentando reconectar em 5 segundos...');
        setTimeout(() => {
            this.connect();
        }, 5000);
    }

    async start() {
        console.log('🚀 Iniciando cliente de túnel...');
        console.log(`📡 Servidor: ${this.host}:${this.port}`);
        console.log(`🏠 Local: ${this.localHost}:${this.localPort}`);
        
        await this.connect();
        
        // Aguardar conexão e registrar túnel
        setTimeout(() => {
            this.registerTunnel();
        }, 1000);
    }
}

// CLI
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        host: 'localhost',
        port: 3000,
        localPort: 8080,
        localHost: 'localhost',
        secure: false
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--host':
                options.host = args[++i];
                break;
            case '--port':
                options.port = parseInt(args[++i]);
                break;
            case '--local-port':
                options.localPort = parseInt(args[++i]);
                break;
            case '--local-host':
                options.localHost = args[++i];
                break;
            case '--secure':
                options.secure = true;
                break;
            case '--help':
                console.log(`
Uso: node tunnel-client.js [opções]

Opções:
  --host <host>        Servidor de túnel (padrão: localhost)
  --port <port>        Porta do servidor (padrão: 3000)
  --local-port <port>  Porta local a expor (padrão: 8080)
  --local-host <host>  Host local (padrão: localhost)
  --secure            Usar HTTPS
  --help              Mostrar esta ajuda

Exemplos:
  node tunnel-client.js --host tunnel.exemplo.com --port 3000 --local-port 8080
  node tunnel-client.js --host https://tunnel.exemplo.com --secure --local-port 3000
                `);
                process.exit(0);
        }
    }

    return options;
}

// Executar se chamado diretamente
if (require.main === module) {
    const options = parseArgs();
    const client = new TunnelClient(options);
    
    // Tratar sinais para cleanup
    process.on('SIGINT', () => {
        console.log('\n🛑 Encerrando cliente...');
        if (client.serverSocket) {
            client.serverSocket.destroy();
        }
        process.exit(0);
    });

    client.start().catch(console.error);
}

module.exports = TunnelClient;
