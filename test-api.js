
const http = require('http');

const CONFIG = {
  host: 'localhost',
  port: 3000,
  credentials: {
    chaveEmpresa: '987c2db7-2311-4380-9770-babe1b4c4dcc',
    usuario: 'daniele.almeida@grupodnp.com.br',
    senha: '2508468'
  }
};

function post(path, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const options = {
      hostname: CONFIG.host,
      port: CONFIG.port,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseData));
        } catch (e) {
          resolve(responseData);
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(body);
    req.end();
  });
}

function formatDate(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

async function runTest() {
  console.log('🚀 Iniciando teste de API...\n');

  try {
    // 1. Login / StartSession
    console.log('🔑 Solicitando Token de Sessão via Proxy...');
    const authRes = await post('/api/StartSession', CONFIG.credentials);
    const token = authRes.d;

    if (!token) {
      console.error('❌ Erro: Não foi possível obter o token. Verifique as credenciais ou se o backend está rodando.');
      console.log('Resposta Recebida:', authRes);
      return;
    }
    console.log('✅ Token obtido:', token.substring(0, 15) + '...');

    // 2. Buscar Marcacoes de Hoje
    const hoje = formatDate(new Date());
    const ontem = formatDate(new Date(new Date().setDate(new Date().getDate() - 1)));
    console.log(`\n📅 Buscando marcações para o dia: ${hoje}`);

    const params = {
      dataInicio: `${ontem} 00:00:00`,
      dataFim: `${hoje} 23:59:59`,
      tokenAcesso: token
    };

    console.log('Enviando Params:', JSON.stringify(params, null, 2));

    const marcacoesRes = await post('/api/SelecionaMarcacoes', params);

    // Extrair dados seguindo a lógica do MarcacaoApiService
    const data = marcacoesRes?.d?.results || marcacoesRes?.d || marcacoesRes;

    console.log('\n--- Resultado Final ---');
    if (!data || (typeof data !== 'object' && !Array.isArray(data))) {
      console.log('⚠️  ALERTA: A API retornou algo estranho.');
      console.log('Resposta Bruta:', JSON.stringify(marcacoesRes, null, 2));
    } else if (Array.isArray(data) && data.length === 0) {
      console.log('ℹ️  A API retornou um array VAZIO []. Isso significa que a conexão está OK mas não há registros para hoje.');
    } else if (Array.isArray(data)) {
      console.log(`✅ SUCESSO! Encontradas ${data.length} marcações.`);
      console.log('Primeira marcação (resumo):', {
        matricula: data[0].MatriculaFuncionario,
        data: data[0].DataMarcacao,
        local: data[0].NomeLocal
      });
    } else {
      console.log('❓ Formato de resposta não identificado como array:', data);
    }

  } catch (error) {
    console.error('\n❌ Erro durante a requisição:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('DICA: O backend (node server.js) NÃO está rodando na porta 3000.');
    }
  }
}

runTest();
