from __future__ import annotations

import os
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path

import uvicorn


def _project_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _runtime_paths() -> tuple[Path, Path]:
    if getattr(sys, "frozen", False):
        meipass = Path(getattr(sys, "_MEIPASS"))
        base = Path(sys.executable).resolve().parent
        frontend_dist = meipass / "frontend" / "dist"
        data_dir = base / "data"
        return frontend_dist, data_dir

    root = _project_root()
    return root / "frontend" / "dist", root / "backend" / "data"


def _find_port(start: int = 8000, end: int = 8050) -> int:
    for port in range(start, end + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
    raise RuntimeError("Nenhuma porta livre encontrada entre 8000 e 8050")


def main() -> None:
    frontend_dist, data_dir = _runtime_paths()
    data_dir.mkdir(parents=True, exist_ok=True)

    os.environ["ESTOQUE_FRONTEND_DIST"] = str(frontend_dist)
    os.environ["ESTOQUE_DATA_DIR"] = str(data_dir)

    root = _project_root()
    backend_path = root / "backend"
    if str(backend_path) not in sys.path:
        sys.path.insert(0, str(backend_path))

    from app.main import app  # noqa: WPS433

    port = _find_port()
    server = uvicorn.Server(
        uvicorn.Config(
            app,
            host="127.0.0.1",
            port=port,
            log_level="warning",
            access_log=False,
        )
    )

    t = threading.Thread(target=server.run, daemon=True)
    t.start()

    url = f"http://127.0.0.1:{port}"

    # Espera a API subir
    for _ in range(60):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            if sock.connect_ex(("127.0.0.1", port)) == 0:
                break
        time.sleep(0.1)

    try:
        import webview  # pywebview

        webview.create_window(
            "WEG - Controle de Estoque de Inflamaveis",
            url=url,
            min_size=(1100, 700),
            text_select=True,
        )
        webview.start()
    except Exception:
        # Fallback para navegador padrão se webview indisponível
        webbrowser.open(url)
        while t.is_alive():
            time.sleep(0.5)

    server.should_exit = True


if __name__ == "__main__":
    main()
