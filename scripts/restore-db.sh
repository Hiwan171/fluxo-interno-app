#!/bin/sh
set -eu

usage() {
  echo "Uso: sh scripts/restore-db.sh [--yes] CAMINHO_DO_BACKUP.dump" >&2
}

assume_yes=false
case "${1:-}" in
  --yes)
    assume_yes=true
    shift
    ;;
esac

if [ "$#" -ne 1 ]; then
  usage
  exit 2
fi

archive=$1
if [ ! -f "$archive" ] || [ ! -s "$archive" ]; then
  echo "Erro: backup inexistente, inválido ou vazio: $archive" >&2
  exit 1
fi

archive_dir=$(CDPATH= cd -- "$(dirname -- "$archive")" && pwd -P)
archive_name=$(basename -- "$archive")
archive="$archive_dir/$archive_name"

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
project_dir=$(dirname -- "$script_dir")
compose_file=${COMPOSE_FILE:-"$project_dir/docker-compose.yml"}

dc() {
  docker compose --project-directory "$project_dir" --file "$compose_file" "$@"
}

if ! command -v docker >/dev/null 2>&1; then
  echo "Erro: Docker não está disponível no PATH." >&2
  exit 1
fi

if ! dc ps --status running --services | grep -qx "db"; then
  echo "Erro: o serviço db não está em execução." >&2
  exit 1
fi

if dc ps --status running --services | grep -qx "app"; then
  echo "Erro: pare a aplicação antes de restaurar para impedir novas escritas." >&2
  echo "Execute: docker compose stop app" >&2
  exit 1
fi

checksum_file="$archive.sha256"
if [ -f "$checksum_file" ]; then
  if ! command -v sha256sum >/dev/null 2>&1; then
    echo "Erro: sha256sum é necessário para validar $checksum_file." >&2
    exit 1
  fi
  echo "Validando checksum..."
  (
    cd -- "$archive_dir"
    sha256sum -c "$(basename -- "$checksum_file")"
  )
fi

echo "Validando formato do arquivo..."
dc exec -T db pg_restore --list < "$archive" >/dev/null

database_name=$(dc exec -T db sh -ec 'printf "%s" "$POSTGRES_DB"' | tr -d '\r\n')
case "$database_name" in
  ""|postgres|template0|template1)
    echo "Erro: restauração recusada para o banco protegido '$database_name'." >&2
    exit 1
    ;;
esac

echo "ATENÇÃO: todos os dados atuais de '$database_name' serão substituídos."
if [ "$assume_yes" != true ]; then
  printf "Digite exatamente o nome do banco para continuar: "
  IFS= read -r confirmation
  if [ "$confirmation" != "$database_name" ]; then
    echo "Restauração cancelada." >&2
    exit 1
  fi
fi

echo "Recriando o banco de destino..."
dc exec -T db sh -ec '
  : "${POSTGRES_USER:?POSTGRES_USER ausente}"
  : "${POSTGRES_DB:?POSTGRES_DB ausente}"
  dropdb \
    --if-exists \
    --force \
    --maintenance-db=postgres \
    --username="$POSTGRES_USER" \
    "$POSTGRES_DB"
  createdb \
    --maintenance-db=postgres \
    --username="$POSTGRES_USER" \
    --owner="$POSTGRES_USER" \
    "$POSTGRES_DB"
'

echo "Restaurando dados..."
if ! dc exec -T db sh -ec '
  exec pg_restore \
    --exit-on-error \
    --single-transaction \
    --no-owner \
    --no-acl \
    --username="$POSTGRES_USER" \
    --dbname="$POSTGRES_DB"
' < "$archive"; then
  echo "Erro: a restauração falhou. O banco foi recriado, mas pode estar vazio." >&2
  echo "Corrija a causa e execute este mesmo backup novamente." >&2
  exit 1
fi

echo "Restauração concluída em '$database_name'."
echo "Aplique as migrations pendentes antes de reiniciar a aplicação."
