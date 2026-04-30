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
  const csvData = fs.readFileSync(csvPath, 'utf8');
  const linhas = csvData.split(/\r?\n/);
  
  const matriculasParaTestar = [];
  
  // Pegar os primeiros 5 válidos do arquivo
  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i].trim();
    if (linha) {
      const partes = linha.split(';');
      if (partes.length >= 2) {
        const matricula = partes[0].trim().replace(/['"]/g, '').replace(/^\uFEFF/, '');
        const nome = partes[1].trim();
        if (matricula) {
          matriculasParaTestar.push({ matricula, nomeCSV: nome });
          if (matriculasParaTestar.length === 5) break;
        }
      }
    }
  }

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    console.log('--- TESTE: Verificando status atual dos 5 primeiros da lista ---\n');

    for (const item of matriculasParaTestar) {
      const [rows] = await connection.query('SELECT nome, ativo FROM qrcod_2023 WHERE matricula = ?', [item.matricula]);
      
      if (rows.length > 0) {
        console.log(`Matrícula: ${item.matricula}`);
        console.log(`Nome (CSV): ${item.nomeCSV}`);
        console.log(`Nome (Banco): ${rows[0].nome}`);
        console.log(`Status atual (Ativo = 1 / Inativo = 0): ${rows[0].ativo}`);
        console.log('----------------------------------------------------');
      } else {
        console.log(`Matrícula: ${item.matricula}`);
        console.log(`Nome (CSV): ${item.nomeCSV}`);
        console.log('⚠️ NÃO ENCONTRADO NO BANCO DE DADOS');
        console.log('----------------------------------------------------');
      }
    }

  } catch (error) {
    console.error('Erro na operação:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

run();
