#!/usr/bin/env bash
# Una captura completa: X -> modelo -> commit de data/posts.json -> publicación en Pages.
# La usan los workflows "Captura de publicaciones de X" (manual) y "Captura continua".
# Necesita: X_BEARER_TOKEN, GH_TOKEN, GITHUB_REF_NAME y GITHUB_REPOSITORY.
set -uo pipefail
rama="${GITHUB_REF_NAME:?Falta GITHUB_REF_NAME}"

# Trae lo último (código y datos) antes de capturar.
git pull --quiet --rebase origin "$rama" || echo "::warning::No se pudo actualizar la rama antes de capturar"

node collector/x-collector.mjs || echo "::warning::La captura en X terminó con errores"
python -m modelo.clasificar || echo "::warning::La clasificación terminó con errores"

if git diff --quiet -- data/posts.json; then
  echo "Sin cambios en los datos."
  exit 0
fi

git add data/posts.json
git commit --quiet -m "Datos: captura de X $(date -u +'%Y-%m-%d %H:%M') UTC"
for intento in 1 2 3; do
  if git pull --quiet --rebase origin "$rama" && git push --quiet origin "HEAD:$rama"; then
    echo "Datos guardados."
    break
  fi
  sleep $((intento * 5))
done

# Los push hechos con GITHUB_TOKEN no siempre disparan la publicación de Pages: se pide explícitamente.
gh api -X POST "repos/${GITHUB_REPOSITORY}/pages/builds" >/dev/null 2>&1 \
  || echo "::warning::No se pudo pedir la publicación de GitHub Pages"
