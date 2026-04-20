#!/usr/bin/env python3
"""
Пушит изменённые файлы в GitHub репозиторий через GitHub API.
Не использует git команды — работает напрямую через REST API.
"""

import json
import os
import sys
import base64
import urllib.request
import urllib.error
from pathlib import Path

TOKEN = os.environ.get("GITHUB_PERSONAL_ACCESS_TOKEN", "")
OWNER = "mrxgyt"
REPO = "openii"
BRANCH = "main"
API_BASE = "https://api.github.com"

# Файлы для пуша (относительно корня проекта)
FILES_TO_PUSH = [
    "Dockerfile",
    "scripts/download-model.mjs",
    "scripts/entrypoint.sh",
    "scripts/start-backend.sh",
    "scripts/start-frontend.sh",
    "scripts/github-push.py",
    "artifacts/api-server/package.json",
    "artifacts/api-server/tsconfig.json",
    "artifacts/api-server/build.mjs",
    "frontend/vite.config.ts",
    "frontend/package.json",
    "replit.md",
]

def api_request(path, method="GET", data=None):
    url = f"{API_BASE}{path}"
    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
    }
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"HTTP Error {e.code}: {e.read().decode()}")
        sys.exit(1)


def create_blob(content_bytes):
    encoded = base64.b64encode(content_bytes).decode()
    result = api_request(f"/repos/{OWNER}/{REPO}/git/blobs", "POST", {
        "content": encoded,
        "encoding": "base64"
    })
    return result["sha"]


def main():
    if not TOKEN:
        print("❌ GITHUB_PERSONAL_ACCESS_TOKEN не найден!")
        sys.exit(1)

    project_root = Path(__file__).parent.parent

    print(f"📤 Пушим в {OWNER}/{REPO} ветка {BRANCH}")
    print()

    # 1. Получить HEAD commit SHA
    ref_data = api_request(f"/repos/{OWNER}/{REPO}/git/refs/heads/{BRANCH}")
    head_sha = ref_data["object"]["sha"]
    print(f"✓ HEAD commit: {head_sha[:12]}")

    # 2. Получить SHA дерева базового коммита
    commit_data = api_request(f"/repos/{OWNER}/{REPO}/git/commits/{head_sha}")
    base_tree_sha = commit_data["tree"]["sha"]
    print(f"✓ Base tree: {base_tree_sha[:12]}")

    # 3. Создать blobs для каждого файла
    tree_items = []
    for rel_path in FILES_TO_PUSH:
        file_path = project_root / rel_path
        if not file_path.exists():
            print(f"  ⚠️  Пропускаю (не найден): {rel_path}")
            continue

        content = file_path.read_bytes()
        blob_sha = create_blob(content)
        tree_items.append({
            "path": rel_path,
            "mode": "100644",
            "type": "blob",
            "sha": blob_sha,
        })
        print(f"  ✓ Создан blob: {rel_path}")

    print()

    # 4. Создать новое дерево
    tree_data = api_request(f"/repos/{OWNER}/{REPO}/git/trees", "POST", {
        "base_tree": base_tree_sha,
        "tree": tree_items,
    })
    new_tree_sha = tree_data["sha"]
    print(f"✓ Новое дерево: {new_tree_sha[:12]}")

    # 5. Создать новый коммит
    commit_data = api_request(f"/repos/{OWNER}/{REPO}/git/commits", "POST", {
        "message": "fix: перенёс скачивание модели на runtime (entrypoint.sh)\n\n- Dockerfile: скачивание модели перенесено из сборки образа в entrypoint\n- scripts/entrypoint.sh: скачивает модель через curl при первом старте контейнера\n- Это исправляет ошибку сборки на Northflank (node недоступен в CUDA образе)\n- Образ собирается быстро, модель скачивается при деплое",
        "tree": new_tree_sha,
        "parents": [head_sha],
    })
    new_commit_sha = commit_data["sha"]
    print(f"✓ Новый коммит: {new_commit_sha[:12]}")

    # 6. Обновить ветку на новый коммит
    api_request(f"/repos/{OWNER}/{REPO}/git/refs/heads/{BRANCH}", "PATCH", {
        "sha": new_commit_sha,
        "force": False,
    })

    print()
    print(f"✅ Успешно запушено в https://github.com/{OWNER}/{REPO}")
    print(f"   Коммит: {new_commit_sha}")


if __name__ == "__main__":
    main()
