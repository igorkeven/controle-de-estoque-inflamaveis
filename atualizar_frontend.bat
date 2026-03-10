@echo off
setlocal
cd /d "%~dp0"

echo Atualizando frontend (apenas para manutencao/desenvolvimento)...
cd frontend
npm install
npm run build

if %errorlevel%==0 (
  echo Frontend atualizado com sucesso.
) else (
  echo Falha ao atualizar frontend.
)

pause
endlocal
