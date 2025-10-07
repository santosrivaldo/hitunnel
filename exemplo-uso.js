#!/usr/bin/env node

/**
 * Exemplo de uso do Tunnel Client
 * 
 * Este arquivo demonstra como usar o cliente de túnel
 * programaticamente em Node.js
 */

const TunnelClient = require('./tunnel-client.js');

// Configuração do cliente
const client = new TunnelClient({
    host: 'localhost',           // Servidor de túnel
    port: 3000,                 // Porta do servidor
    localPort: 8080,            // Porta local a expor
    localHost: 'localhost',      // Host local
    secure: false               // Usar HTTPS
});

// Eventos do cliente
client.on('connected', () => {
    console.log('✅ Cliente conectado ao servidor');
});

client.on('tunnel-created', (tunnelInfo) => {
    console.log('🔗 Túnel criado:', tunnelInfo);
});

client.on('error', (err) => {
    console.error('❌ Erro no cliente:', err);
});

client.on('disconnected', () => {
    console.log('❌ Cliente desconectado');
});

// Iniciar cliente
async function startClient() {
    try {
        console.log('🚀 Iniciando cliente de túnel...');
        await client.start();
        console.log('✅ Cliente iniciado com sucesso!');
    } catch (err) {
        console.error('❌ Erro ao iniciar cliente:', err);
        process.exit(1);
    }
}

// Tratar sinais para cleanup
process.on('SIGINT', () => {
    console.log('\n🛑 Encerrando cliente...');
    if (client.serverSocket) {
        client.serverSocket.destroy();
    }
    process.exit(0);
});

// Executar se chamado diretamente
if (require.main === module) {
    startClient();
}

module.exports = { client, startClient };
