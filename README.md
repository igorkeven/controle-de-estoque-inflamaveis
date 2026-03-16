# Controle de Estoque de Inflamaveis

Sistema para controle de estoque, movimentacoes, compras, analise de tanque e operacao desktop/web.

## Estrutura

- `backend/`: API FastAPI e persistencia local em SQLite.
- `frontend/`: interface React/Vite.
- `desktop/`: inicializacao empacotada para uso local no Windows.
- `entrega-web/`: pacote pronto para publicar o servidor web no Windows.
- `WEGControleInflamaveis.spec`: especificacao do executavel desktop.

## Desenvolvimento

### Backend

1. Crie um ambiente virtual.
2. Instale `backend/requirements.txt`.
3. Execute a aplicacao FastAPI a partir de `backend/app/main.py`.

### Frontend

1. Entre em `frontend/`.
2. Instale as dependencias com `npm install`.
3. Rode `npm run dev`.

## Entrega web

A pasta `entrega-web/WEGControleInflamaveisWeb` contem a versao pronta para distribuicao no Windows:

- `WEGControleInflamaveisServidor.exe`
- `_internal/`
- `Iniciar_Servidor_Web.bat`
- `LEIA-ME.txt`

O banco local da entrega web nao e versionado. Se precisar iniciar com base vazia, mantenha a pasta `data/` sem `estoque.db`.

## Observacoes

- O repositório foi reorganizado para manter apenas codigo-fonte, configuracoes e artefatos finais realmente necessarios.
- Arquivos temporarios, ambientes virtuais, builds locais, banco SQLite local e pacotes `.zip` ficam fora do versionamento.
