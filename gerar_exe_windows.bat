@echo off
setlocal
cd /d "%~dp0"

echo ===============================================
echo Geracao do EXE - Controle de Estoque
set VENV=.venv_exe

echo [1/4] Criando ambiente virtual...
if not exist %VENV%\Scripts\python.exe (
  py -3 -m venv %VENV%
)

echo [2/4] Instalando dependencias...
%VENV%\Scripts\python.exe -m pip install --upgrade pip
%VENV%\Scripts\python.exe -m pip install -r desktop\requirements.txt

echo [3/4] Gerando build do frontend...
cd frontend
call npm install
call npm run build
cd ..

echo [4/4] Gerando EXE...
%VENV%\Scripts\pyinstaller --noconfirm --clean --windowed --name ControleEstoqueInflamaveis ^
  --paths backend ^
  --add-data "frontend\dist;frontend\dist" ^
  --add-data "backend\app;app" ^
  desktop\launcher.py

echo.
echo EXE pronto em: dist\ControleEstoqueInflamaveis\ControleEstoqueInflamaveis.exe
pause
endlocal
