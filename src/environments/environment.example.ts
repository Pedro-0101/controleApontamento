export const environment = {
  production: true,

  // Credenciais da API Ponto Certificado
  // Solicite estas informações ao administrador do sistema
  chaveEmpresa: 'SUA_CHAVE_EMPRESA_AQUI',
  usuarioEmpresa: 'seu.email@empresa.com.br',
  senhaEmpresa: 'SUA_SENHA_AQUI',

  // Configurações do banco de dados
  ipDatabase: '192.168.200.136',
  database: 'dnpmix',
  userDatabase: 'root',
  passDatabase: 'pass',

  // Código de acesso DNP
  dnpAccessCode: 'SEUS_CODIGOS_SEPARADOS_POR_VIRGULA',
  dnpUserNames: 'SEUS_NOMES_SEPARADOS_POR_VIRGULA',

  // URLs da API (usando proxy para evitar CORS)
  apiUrlStartSession: '/api/StartSession',
};
