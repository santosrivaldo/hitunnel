#!/usr/bin/env node

const net = require('net');
const http = require('http');
const https = require('https');
const { URL } = require('url');

class TunnelClient {
    constructor(options = {}) {
        this.host = options.host || 'localhost';
        this.port = options.port || 3000;
        this.localPort = options.localPort || 8080;
        this.localHost = options.localHost || 'localhost';
        this.secure = options.secure || false;
        this.tunnelId = null;
        this.serverSocket = null;
        this.connections = new Set();
    }

    async connect() {
        try {
            console.log(`🚀 Conectando ao servidor ${this.host}:${this.port}...`);
            
            // Criar conexão TCP com o servidor
            this.serverSocket = net.createConnection(this.port, this.host, () => {
                console.log('✅ Conectado ao servidor de túnel');
                this.startHeartbeat();
            });

            this.serverSocket.on('data', (data) => {
                this.handleServerData(data);
            });

            this.serverSocket.on('close', () => {
                console.log('❌ Conexão com servidor perdida');
                this.reconnect();
            });

            this.serverSocket.on('error', (err) => {
                console.error('❌ Erro na conexão:', err.message);
                this.reconnect();
            });

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
            this.serverSocket.write('PONG\n');
            console.log('💓 Heartbeat respondido');
        }
    }

    startLocalServer() {
        // Criar servidor local para receber requisições
        const localServer = net.createServer((localSocket) => {
            console.log('🔗 Nova conexão local recebida');
            
            // Conectar ao servidor de túnel
            const tunnelSocket = net.createConnection(this.port, this.host, () => {
                console.log('🔗 Túnel estabelecido');
                
                // Pipe bidirecional
                localSocket.pipe(tunnelSocket);
                tunnelSocket.pipe(localSocket);
                
                this.connections.add({ localSocket, tunnelSocket });
            });

            tunnelSocket.on('error', (err) => {
                console.error('❌ Erro no túnel:', err.message);
                localSocket.destroy();
            });

            localSocket.on('error', (err) => {
                console.error('❌ Erro local:', err.message);
                tunnelSocket.destroy();
            });

            localSocket.on('close', () => {
                tunnelSocket.destroy();
                this.connections.delete({ localSocket, tunnelSocket });
            });

            tunnelSocket.on('close', () => {
                localSocket.destroy();
                this.connections.delete({ localSocket, tunnelSocket });
            });
        });

        localServer.listen(this.localPort, this.localHost, () => {
            console.log(`🌐 Servidor local rodando em ${this.localHost}:${this.localPort}`);
            console.log(`🔗 Túnel ativo: ${this.host}/tunnel/${this.tunnelId}`);
        });

        localServer.on('error', (err) => {
            console.error('❌ Erro no servidor local:', err.message);
        });
    }

    async registerTunnel() {
        try {
            // Obter informações do túnel do servidor
            const protocol = this.secure ? 'https' : 'http';
            const tunnelUrl = `${protocol}://${this.host}/?new`;
            
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
            if (this.serverSocket && !this.serverSocket.destroyed) {
                this.serverSocket.write('PING\n');
            }
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
