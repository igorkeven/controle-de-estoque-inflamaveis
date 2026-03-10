@echo off
setlocal
cd /d "%~dp0"

echo ===============================================
echo Controle de Estoque - Inicio rapido (Windows)
echo ===============================================

echo [1/4] Verificando Python...
where py >nul 2>&1
if %errorlevel%==0 (
  set PY_CMD=py -3
) else (
  set PY_CMD=python
)

%PY_CMD% --version >nul 2>&1
if not %errorlevel%==0 (
  echo Python nao encontrado. Instale Python 3.11+ e tente novamente.
  pause
  exit /b 1
)

echo [2/4] Preparando ambiente virtual...
if not exist backend\.venv\Scripts\python.exe (
  %PY_CMD% -m venv backend\.venv
)

echo [3/4] Instalando/atualizando dependencias...
backend\.venv\Scripts\python.exe -m pip install --upgrade pip >nul
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
if not %errorlevel%==0 (
  echo Erro ao instalar dependencias.
  pause
  exit /b 1
)

echo [4/4] Iniciando sistema em http://localhost:8000
start "" http://localhost:8000
backend\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir backend

endlocal
