# Tunnel Client - Cliente de Túnel Node.js

Um cliente de túnel escrito em Node.js puro que funciona como o `lt` (localtunnel), mas com mais controle e funcionalidades.

## 🚀 Instalação

```bash
# Clonar o repositório
git clone <seu-repo>
cd server

# Instalar dependências
npm install
```

## 📖 Como Usar

### 1. Iniciar o Servidor

```bash
# Servidor básico
npm run start:pure

# Com STORE_ID
STORE_ID="PB01" node bin/pure-server --port 3003 --secure
```

### 2. Conectar Cliente

```bash
# Usando npm script
npm run client -- --host tunnel.exemplo.com --port 3000 --local-port 8080

# Usando node diretamente
node bin/tunnel-client --host tunnel.exemplo.com --port 3000 --local-port 8080

# Com HTTPS
node bin/tunnel-client --host https://tunnel.exemplo.com --secure --local-port 8080
```

### 3. Exemplos Práticos

```bash
# Conectar ao seu servidor
node bin/tunnel-client --host https://tunnel.tudoparasualavanderia.com.br --secure --local-port 8080

# Expor aplicação local na porta 3000
node bin/tunnel-client --host localhost --port 3000 --local-port 3000

# Conectar com host específico
node bin/tunnel-client --host tunnel.exemplo.com --port 3000 --local-host 192.168.1.100 --local-port 8080
```

## ⚙️ Opções

| Opção | Descrição | Padrão |
|-------|-----------|--------|
| `--host` | Servidor de túnel | `localhost` |
| `--port` | Porta do servidor | `3000` |
| `--local-port` | Porta local a expor | `8080` |
| `--local-host` | Host local | `localhost` |
| `--secure` | Usar HTTPS | `false` |
| `--help` | Mostrar ajuda | - |

## 🔧 Funcionalidades

- ✅ **Conexão TCP persistente** com servidor
- ✅ **Heartbeat automático** para manter conexão
- ✅ **Reconexão automática** em caso de falha
- ✅ **Proxy bidirecional** completo
- ✅ **Logs detalhados** para debug
- ✅ **Cleanup automático** de conexões
- ✅ **Zero dependências** externas

## 🆚 Comparação com `lt`

| Funcionalidade | `lt` | `tunnel-client` |
|----------------|------|-----------------|
| Conexão TCP | ✅ | ✅ |
| Heartbeat | ✅ | ✅ |
| Reconexão | ✅ | ✅ |
| Logs detalhados | ❌ | ✅ |
| Controle de código | ❌ | ✅ |
| Customização | ❌ | ✅ |

## 🐛 Debug

```bash
# Ver logs detalhados
DEBUG=* node bin/tunnel-client --host localhost --port 3000

# Testar conexão
curl http://localhost:3000/api/status
```

## 📝 Exemplo Completo

```bash
# Terminal 1 - Servidor
cd C:\Projetos\server
$env:STORE_ID="PB01"
node bin/pure-server --port 3003 --secure

# Terminal 2 - Cliente
node bin/tunnel-client --host https://tunnel.tudoparasualavanderia.com.br --secure --local-port 8080

# Terminal 3 - Testar
curl https://tunnel.tudoparasualavanderia.com.br/tunnel/PB01/
```

## 🔄 Fluxo de Funcionamento

1. **Cliente conecta** ao servidor via TCP
2. **Registra túnel** obtendo ID do servidor
3. **Cria servidor local** para receber requisições
4. **Estabelece proxy** bidirecional
5. **Mantém heartbeat** para conexão persistente
6. **Reconecta automaticamente** se necessário

## 🛠️ Desenvolvimento

```bash
# Executar em modo desenvolvimento
node tunnel-client.js --host localhost --port 3000 --local-port 8080

# Testar com diferentes configurações
node bin/tunnel-client --host localhost --port 3000 --local-port 3000
node bin/tunnel-client --host localhost --port 3000 --local-port 5000
```
