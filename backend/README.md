# Backend API - Employee Service

API para buscar informações de funcionários do banco de dados MySQL (dnpmix).

## Pré-requisitos

- Node.js (versão 14 ou superior)
- Acesso ao banco de dados MySQL em `192.168.200.136`

## Instalação

1. Entre na pasta backend:

```bash
cd backend
```

2. Instale as dependências:

```bash
npm install
```

## Configuração

O servidor está configurado para conectar ao banco de dados com as seguintes credenciais (em `server.js`):

- **Host:** 192.168.200.136
- **Port:** 3306
- **Database:** dnpmix
- **User:** root
- **Password:** pass
- **Table:** qrcod_2023

## Como executar

Para iniciar o servidor:

```bash
npm start
```

O servidor irá rodar na porta **3000**.

## Endpoints disponíveis

### 1. Health Check

```
GET /api/health
```

Verifica se a API está funcionando.

**Resposta:**

```json
{
  "status": "ok",
  "message": "API funcionando corretamente"
}
```

### 2. Buscar funcionário por matrícula (individual)

```
GET /api/employee/:matricula
```

**Exemplo:**

```
GET http://localhost:3000/api/employee/12345
```

**Resposta (sucesso):**

```json
{
  "success": true,
  "employee": {
    "id": 1,
    "matricula": "12345",
    "empresa": "DNP",
    "nome": "João Silva",
    "qrcod": "ABC123"
  }
}
```

**Resposta (não encontrado):**

```json
{
  "success": false,
  "employee": null,
  "message": "nome nao encontrado"
}
```

### 3. Buscar múltiplos funcionários (batch)

```
POST /api/employees/batch
Content-Type: application/json
```

**Body:**

```json
{
  "matriculas": ["12345", "67890", "11111"]
}
```

**Resposta:**

```json
{
  "success": true,
  "employees": [
    {
      "matricula": "12345",
      "nome": "João Silva"
    },
    {
      "matricula": "67890",
      "nome": "Maria Santos"
    },
    {
      "matricula": "11111",
      "nome": "nome nao encontrado"
    }
  ]
}
```

## Integração com Angular

O serviço Angular `EmployeeService` já está configurado para consumir esta API.

### Exemplo de uso:

```typescript
import { inject } from '@angular/core';
import { EmployeeService } from './core/services/employee/employee.service';

export class MyComponent {
  private employeeService = inject(EmployeeService);

  async buscarNome() {
    // Buscar nome individual
    const nome = await this.employeeService.getEmployeeNameByMatricula('12345');
    console.log(nome); // "João Silva" ou "nome nao encontrado"

    // Buscar funcionário completo
    const employee = await this.employeeService.getEmployeeByMatricula('12345');
    console.log(employee?.nome);

    // Buscar múltiplos nomes
    const nomes = await this.employeeService.getEmployeeNamesBatch(['12345', '67890']);
    console.log(nomes);

    // Preencher pendências com nomes
    const pendencias = [
      { matricula: '12345', nome: '' },
      { matricula: '67890', nome: '' },
    ];
    const pendenciasComNomes = await this.employeeService.fillPendenciasWithNames(pendencias);
    console.log(pendenciasComNomes);
  }
}
```

## Observações

- A API utiliza CORS habilitado para permitir requisições do frontend Angular
- Certifique-se de que o banco de dados está acessível antes de iniciar o servidor
- Para ambientes de produção, considere adicionar autenticação e variáveis de ambiente para as credenciais do banco
