@echo off
setlocal
cd /d "%~dp0"

echo ===============================================
echo Geracao do EXE - WEG Controle de Estoque
echo ===============================================
set VENV=.venv_exe
set APP_NAME=WEGControleInflamaveis

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

echo [4/4] Gerando EXE WEG...
%VENV%\Scripts\pyinstaller --noconfirm --clean --windowed --name %APP_NAME% ^
  --icon "desktop\assets\weg.ico" ^
  --version-file "desktop\version_info_weg.txt" ^
  --paths backend ^
  --add-data "frontend\dist;frontend\dist" ^
  --add-data "backend\app;app" ^
  desktop\launcher.py

echo.
echo EXE pronto em: dist\%APP_NAME%\%APP_NAME%.exe
pause
endlocal
