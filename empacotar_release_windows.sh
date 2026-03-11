#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
PKG_DIR="$ROOT_DIR/release/windows/WEGControleInflamaveis"
OUT_ZIP="$ROOT_DIR/release/WEGControleInflamaveis_Pacote_Windows.zip"

rm -f "$OUT_ZIP"
rm -rf "$PKG_DIR/codigo-fonte"
mkdir -p "$PKG_DIR/codigo-fonte"

cp "$ROOT_DIR/gerar_exe_windows.bat" "$PKG_DIR/"
cp "$ROOT_DIR/iniciar_windows.bat" "$PKG_DIR/"
cp "$ROOT_DIR/Sistema_Estoque_Inflamaveis_SEM_INSTALACAO.xlsx" "$PKG_DIR/"
cp "$ROOT_DIR/README.md" "$PKG_DIR/README_PROJETO.md"

cp -r "$ROOT_DIR/backend" "$PKG_DIR/codigo-fonte/"
cp -r "$ROOT_DIR/frontend" "$PKG_DIR/codigo-fonte/"
cp -r "$ROOT_DIR/desktop" "$PKG_DIR/codigo-fonte/"
cp "$ROOT_DIR/docker-compose.yml" "$PKG_DIR/codigo-fonte/"
cp "$ROOT_DIR/.gitignore" "$PKG_DIR/codigo-fonte/"

rm -rf "$PKG_DIR/codigo-fonte/backend/.venv" \
       "$PKG_DIR/codigo-fonte/backend/data" \
       "$PKG_DIR/codigo-fonte/backend/app/__pycache__" \
       "$PKG_DIR/codigo-fonte/frontend/node_modules" \
       "$PKG_DIR/codigo-fonte/frontend/dist" \
       "$PKG_DIR/codigo-fonte/desktop/__pycache__"

mkdir -p "$PKG_DIR/codigo-fonte/backend/data"

(
  cd "$ROOT_DIR/release"
  zip -r "WEGControleInflamaveis_Pacote_Windows.zip" "windows/WEGControleInflamaveis"
)

echo "Pacote gerado: $OUT_ZIP"
