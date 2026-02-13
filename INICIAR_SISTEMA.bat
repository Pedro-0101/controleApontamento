@echo off
setlocal
cd /d %~dp0

echo ===================================================
echo   SERVIDOR DE CONTROLE DE APONTAMENTO - LOCAL
echo ===================================================
echo.
echo 1. Certifique-se de que o banco de dados esteja rodando.
echo 2. Para fechar o servidor, apenas feche esta janela.
echo.
echo Iniciando...
node backend/server.js
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERRO] Falha ao iniciar o servidor. Verifique se o Node.js esta instalado.
    pause
)
pause
