from __future__ import annotations

import json
import os
import socket
import time
import uuid
from pathlib import Path


LOCK_MAX_AGE_SECONDS = 12 * 60 * 60


class RuntimeLockError(Exception):
    def __init__(self, info: dict[str, str]):
        super().__init__("Sistema ja esta em uso")
        self.info = info


class RuntimeLock:
    def __init__(self, data_dir: Path, name: str) -> None:
        self.data_dir = data_dir
        self.name = name
        self.lock_file = data_dir / f"{name}.lock"
        self.owner_token = str(uuid.uuid4())

    def acquire(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        if self.lock_file.exists():
            info = self._read_lock()
            if info and not self._is_stale(info):
                raise RuntimeLockError(info)
            self._safe_unlink()

        payload = {
            "token": self.owner_token,
            "machine": socket.gethostname(),
            "user": os.getenv("USERNAME") or os.getenv("USER") or "",
            "started_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "timestamp": str(int(time.time())),
        }

        flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY
        fd = os.open(str(self.lock_file), flags)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, ensure_ascii=True, indent=2)
        except Exception:
            self._safe_unlink()
            raise

    def release(self) -> None:
        info = self._read_lock()
        if info and info.get("token") != self.owner_token:
            return
        self._safe_unlink()

    def _read_lock(self) -> dict[str, str] | None:
        try:
            return json.loads(self.lock_file.read_text(encoding="utf-8"))
        except Exception:
            return None

    def _is_stale(self, info: dict[str, str]) -> bool:
        try:
            timestamp = int(info.get("timestamp", "0"))
        except ValueError:
            return True
        return time.time() - timestamp > LOCK_MAX_AGE_SECONDS

    def _safe_unlink(self) -> None:
        try:
            self.lock_file.unlink(missing_ok=True)
        except Exception:
            pass
