from __future__ import annotations

import os
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path
from tkinter import StringVar, Tk, messagebox
from tkinter import ttk

import uvicorn

from runtime_lock import RuntimeLock, RuntimeLockError


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
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            if sock.connect_ex(("127.0.0.1", port)) != 0:
                return port
    raise RuntimeError("Nenhuma porta livre encontrada entre 8000 e 8050")


def _local_ipv4_addresses() -> list[str]:
    addresses: set[str] = {"127.0.0.1"}
    hostname = socket.gethostname()
    for family, _, _, _, sockaddr in socket.getaddrinfo(hostname, None):
        if family != socket.AF_INET:
            continue
        ip = sockaddr[0]
        if ip.startswith("127."):
            continue
        addresses.add(ip)
    return sorted(addresses)


def _wait_server(port: int, attempts: int = 80) -> bool:
    for _ in range(attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            if sock.connect_ex(("127.0.0.1", port)) == 0:
                return True
        time.sleep(0.1)
    return False


class ServerWindow:
    def __init__(self, local_url: str, network_urls: list[str], stop_callback) -> None:
        self.local_url = local_url
        self.network_urls = network_urls
        self.stop_callback = stop_callback
        self.root = Tk()
        self.root.title("WEG - Servidor Web")
        self.root.geometry("680x430")
        self.root.minsize(640, 400)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
        self.status_var = StringVar(value="Servidor iniciado. Mantenha esta janela aberta.")
        self._build()

    def _build(self) -> None:
        container = ttk.Frame(self.root, padding=18)
        container.pack(fill="both", expand=True)

        ttk.Label(
            container,
            text="WEG Controle de Estoque - Servidor Web",
            font=("Segoe UI", 16, "bold"),
        ).pack(anchor="w")
        ttk.Label(
            container,
            text="As outras maquinas podem acessar pelo navegador usando um dos enderecos abaixo.",
            wraplength=620,
        ).pack(anchor="w", pady=(8, 14))

        self._url_block(
            container,
            title="Acesso nesta maquina",
            url=self.local_url,
            open_label="Abrir nesta maquina",
        )

        network_frame = ttk.LabelFrame(container, text="Acessos na rede", padding=12)
        network_frame.pack(fill="x", pady=(12, 0))
        for url in self.network_urls:
            self._url_row(network_frame, url, open_label="Abrir")

        info_frame = ttk.LabelFrame(container, text="Orientacao", padding=12)
        info_frame.pack(fill="x", pady=(12, 0))
        messages = [
            "1. Deixe esta janela aberta enquanto o sistema estiver em uso.",
            "2. Compartilhe com os usuarios um dos links da rede mostrados acima.",
            "3. Os outros computadores precisam apenas de navegador.",
        ]
        for message in messages:
            ttk.Label(info_frame, text=message, wraplength=610).pack(anchor="w", pady=2)

        actions = ttk.Frame(container)
        actions.pack(fill="x", pady=(16, 0))
        ttk.Button(actions, text="Copiar link local", command=lambda: self._copy(self.local_url)).pack(side="left")
        ttk.Button(actions, text="Encerrar servidor", command=self._on_close).pack(side="right")

        ttk.Label(container, textvariable=self.status_var, foreground="#475569").pack(anchor="w", pady=(12, 0))

    def _url_block(self, parent, title: str, url: str, open_label: str) -> None:
        frame = ttk.LabelFrame(parent, text=title, padding=12)
        frame.pack(fill="x")
        self._url_row(frame, url, open_label=open_label)

    def _url_row(self, parent, url: str, open_label: str) -> None:
        row = ttk.Frame(parent)
        row.pack(fill="x", pady=4)
        ttk.Label(row, text=url).pack(side="left", fill="x", expand=True)
        ttk.Button(row, text="Copiar", command=lambda value=url: self._copy(value)).pack(side="right", padx=(8, 0))
        ttk.Button(row, text=open_label, command=lambda value=url: self._open(value)).pack(side="right")

    def _copy(self, value: str) -> None:
        self.root.clipboard_clear()
        self.root.clipboard_append(value)
        self.root.update_idletasks()
        self.status_var.set(f"Link copiado: {value}")

    def _open(self, value: str) -> None:
        webbrowser.open(value)
        self.status_var.set(f"Navegador aberto: {value}")

    def _on_close(self) -> None:
        if messagebox.askokcancel("Encerrar servidor", "Deseja encerrar o servidor web?"):
            self.status_var.set("Encerrando servidor...")
            self.stop_callback()
            self.root.after(300, self.root.destroy)

    def run(self) -> None:
        self.root.mainloop()


def main() -> None:
    frontend_dist, data_dir = _runtime_paths()
    data_dir.mkdir(parents=True, exist_ok=True)
    runtime_lock = RuntimeLock(data_dir, "weg_controle_web")

    try:
        runtime_lock.acquire()
    except RuntimeLockError as exc:
        root = Tk()
        root.withdraw()
        info = exc.info
        machine = info.get("machine", "outra maquina")
        started_at = info.get("started_at", "horario desconhecido")
        user = info.get("user", "")
        owner_text = machine if not user else f"{machine} ({user})"
        messagebox.showwarning(
            "Servidor ja em uso",
            f"O servidor web ja esta aberto em {owner_text} desde {started_at}.\n\n"
            "Feche a outra instancia antes de abrir novamente.",
        )
        root.destroy()
        return

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
            host="0.0.0.0",
            port=port,
            log_level="warning",
            access_log=False,
            log_config=None,
        )
    )

    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()

    if not _wait_server(port):
        messagebox.showerror(
            "Falha ao iniciar",
            "Nao foi possivel iniciar o servidor web na maquina.",
        )
        server.should_exit = True
        return

    local_url = f"http://127.0.0.1:{port}"
    network_urls = [f"http://{ip}:{port}" for ip in _local_ipv4_addresses()]
    webbrowser.open(local_url)

    def stop_server() -> None:
        server.should_exit = True

    window = ServerWindow(local_url, network_urls, stop_server)
    try:
        window.run()
    finally:
        server.should_exit = True
        if thread.is_alive():
            thread.join(timeout=5)
        runtime_lock.release()


if __name__ == "__main__":
    main()
