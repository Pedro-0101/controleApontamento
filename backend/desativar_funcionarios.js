const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const dbConfig = {
  host: '192.168.200.136',
  port: 3306,
  database: 'dnpmix',
  user: 'root',
  password: 'pass'
};

async function run() {
  const csvPath = path.join(__dirname, '../trabalhadores inativos.csv');
  console.log('Lendo arquivo:', csvPath);
  
  if (!fs.existsSync(csvPath)) {
    console.error('Arquivo CSV não encontrado em:', csvPath);
    return;
  }
  
  const csvData = fs.readFileSync(csvPath, 'utf8');
  
  // Trata quebras de linha Windows (\r\n) ou Linux (\n)
  const linhas = csvData.split(/\r?\n/);
  
  const matriculas = [];
  
  // Pula a primeira linha (cabeçalho)
  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i].trim();
    if (linha) {
      const partes = linha.split(';');
      if (partes.length >= 1) {
        const matricula = partes[0].trim();
        // Remove possíveis aspas duplas e o BOM invisível se tiver
        const matriculaLimpa = matricula.replace(/['"]/g, '').replace(/^\uFEFF/, '');
        if (matriculaLimpa) {
          matriculas.push(matriculaLimpa);
        }
      }
    }
  }

  console.log(`Foram encontradas ${matriculas.length} matrículas no arquivo CSV.`);
  
  if (matriculas.length === 0) {
    console.log('Nenhuma matrícula para processar. Encerrando.');
    return;
  }

  console.log('Conectando ao banco de dados...');
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('Conectado com sucesso!');

    let atualizados = 0;
    let ignorados = 0;

    for (const matricula of matriculas) {
      // Verifica se o funcionário existe
      const [rows] = await connection.query('SELECT id, ativo FROM qrcod_2023 WHERE matricula = ?', [matricula]);
      
      if (rows.length > 0) {
        if (rows[0].ativo === 1) {
          // Atualiza para inativo
          await connection.query('UPDATE qrcod_2023 SET ativo = 0 WHERE matricula = ?', [matricula]);
          atualizados++;
          // console.log(`Funcionário ${matricula} desativado.`); // Descomente para ver detalhado
        } else {
          // console.log(`Funcionário ${matricula} já estava inativo.`);
          ignorados++;
        }
      } else {
        // console.log(`Funcionário ${matricula} não encontrado. Ignorado.`);
        ignorados++;
      }
    }

    console.log('\n--- Resumo da Execução ---');
    console.log(`Total de matrículas processadas: ${matriculas.length}`);
    console.log(`Funcionários alterados para INATIVO: ${atualizados}`);
    console.log(`Matrículas ignoradas (já inativos ou não encontrados): ${ignorados}`);

  } catch (error) {
    console.error('Erro na operação:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Conexão encerrada.');
    }
  }
}

run();
