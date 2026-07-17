#!/bin/sh
set -eu

umask 077

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
project_dir=$(dirname -- "$script_dir")
compose_file=${COMPOSE_FILE:-"$project_dir/docker-compose.yml"}
backup_dir=${BACKUP_DIR:-"$project_dir/backups"}

dc() {
  docker compose --project-directory "$project_dir" --file "$compose_file" "$@"
}

if ! command -v docker >/dev/null 2>&1; then
  echo "Erro: Docker não está disponível no PATH." >&2
  exit 1
fi

if ! dc ps --status running --services | grep -qx "db"; then
  echo "Erro: o serviço db não está em execução." >&2
  echo "Inicie-o com: docker compose up -d db" >&2
  exit 1
fi

mkdir -p -- "$backup_dir"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
filename="fluxo-interno-${timestamp}.dump"
final_file="$backup_dir/$filename"
temporary_file=$(mktemp "$backup_dir/.backup.XXXXXX")

cleanup() {
  rm -f -- "$temporary_file"
}
trap cleanup EXIT HUP INT TERM

echo "Criando backup consistente do PostgreSQL..."
dc exec -T db sh -ec '
  : "${POSTGRES_USER:?POSTGRES_USER ausente}"
  : "${POSTGRES_DB:?POSTGRES_DB ausente}"
  exec pg_dump \
    --format=custom \
    --compress=6 \
    --no-owner \
    --no-acl \
    --username="$POSTGRES_USER" \
    --dbname="$POSTGRES_DB"
' > "$temporary_file"

if [ ! -s "$temporary_file" ]; then
  echo "Erro: o backup gerado está vazio." >&2
  exit 1
fi

mv -- "$temporary_file" "$final_file"
temporary_file=""

if command -v sha256sum >/dev/null 2>&1; then
  (
    cd -- "$backup_dir"
    sha256sum "$filename" > "$filename.sha256"
  )
  echo "Checksum: $final_file.sha256"
fi

echo "Backup concluído: $final_file"
