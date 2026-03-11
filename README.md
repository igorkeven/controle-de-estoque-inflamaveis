# Controle de Estoque - Tintas e Inflamaveis

Sistema offline para rede local, sem login, com:
- cadastro de produtos
- cadastro de lotes e validade
- movimentacoes (entrada, saida para uso, saida para descarte)
- alertas de vencimento e estoque minimo
- painel com indicadores

## Uso facil no Windows (recomendado)

### 1) Requisito unico
- Python 3.11+ instalado no Windows

### 2) Iniciar (1 clique)
- Execute o arquivo: `iniciar_windows.bat`
- O navegador abre automaticamente em: `http://localhost:8000`

Pronto. O sistema ja fica operacional.

## Acesso pela rede local (outras maquinas Windows)
Na maquina servidor, descubra o IP local (ex.: `192.168.0.50`) e acesse nas outras maquinas:
- `http://192.168.0.50:8000`

## Banco de dados
O banco SQLite fica em:
- `backend/data/estoque.db`

## Estrutura
- `backend/`: API FastAPI + SQLite
- `frontend/`: React + Tailwind (ja compilado e servido pelo backend)
- `iniciar_windows.bat`: inicializacao automatica no Windows

## Fluxo de uso
1. Cadastre os produtos.
2. Cadastre os lotes com validade.
3. Lance movimentacoes de entrada/saida.
4. Acompanhe alertas no Painel e na aba Estoque/Validades.

## Regras de alerta
- `VENCIDO`: validade menor que hoje.
- `VENCE EM <= 30 DIAS`: prioridade alta.
- `ATENCAO (31-60 DIAS)`: acompanhamento.
- `ABAIXO DO MINIMO`: saldo do lote menor ou igual ao estoque minimo do produto.

## Manutencao (somente se alterar frontend)
Se voce editar o React/Tailwind, rode:
- `atualizar_frontend.bat`

## Executavel .exe (interface igual web)
Se quiser rodar como aplicativo desktop no Windows, sem instalacao formal:

1. Rode `gerar_exe_windows.bat`
2. O executavel sera gerado em:
   - `dist\\ControleEstoqueInflamaveis\\ControleEstoqueInflamaveis.exe`

Observacoes:
- O banco local SQLite fica na pasta `data` ao lado do `.exe`.
- A interface do `.exe` e a mesma do sistema web.
- Nao precisa instalar servidor/Docker na maquina final.
