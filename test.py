import http.server
import socketserver

# Porta onde o servidor vai rodar
PORT = 8080

# Handler básico que serve arquivos do diretório atual
Handler = http.server.SimpleHTTPRequestHandler

# Cria o servidor
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"🚀 Servidor rodando em http://localhost:{PORT}")
    print("Pressione Ctrl+C para parar.")
    httpd.serve_forever()
