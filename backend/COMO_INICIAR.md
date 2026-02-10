# Como Iniciar o Backend - Guia Rápido

## 1. Instalar Dependências

Abra o terminal na pasta do projeto e execute:

```bash
cd controleApontamento/backend
npm install
```

## 2. Iniciar o Servidor

Ainda na pasta `backend`, execute:

```bash
npm start
```

Você verá a mensagem:

```
Pool de conexões MySQL criado com sucesso
Servidor rodando na porta 3000
Health check: http://localhost:3000/api/health
```

## 3. Testar a API (Opcional)

Você pode testar se a API está funcionando abrindo no navegador:

```
http://localhost:3000/api/health
```

Ou testando com uma matrícula específica:

```
http://localhost:3000/api/employee/SUA_MATRICULA_AQUI
```

## 4. Iniciar o Angular

Em outro terminal, na pasta raiz do projeto:

```bash
npm start
```

## Pronto!

Agora quando você abrir a aplicação Angular:

- A tabela de funcionários mostrará os nomes reais vindos do banco de dados
- A coluna "Nome" estará visível e preenchida
- Se a matrícula não for encontrada, aparecerá "nome nao encontrado"

## Solução de Problemas

### Erro de conexão com MySQL

- Verifique se o servidor MySQL em `192.168.200.136` está acessível
- Confirme que as credenciais em `backend/server.js` estão corretas
- Teste a conectividade: `ping 192.168.200.136`

### Porta 3000 já em uso

- Feche outros servidores rodando na porta 3000
- Ou altere a porta em `backend/server.js` (linha 6) e em `employee.service.ts` (linha 24)

### CORS Error

- Certifique-se de que o backend está rodando antes do Angular
- O backend já está configurado com CORS habilitado
