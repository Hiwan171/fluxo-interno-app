#!/bin/sh
# Backup completo: banco + anexos, com retenção.
#
# O dump do PostgreSQL sozinho não restaura o sistema: os anexos moram num
# volume Docker e um card cujo arquivo sumiu fica quebrado para sempre. Os dois
# precisam ser capturados no mesmo ciclo.
#
# Agendamento (host, diário às 2h):
#   0 2 * * * /caminho/para/fluxo-interno/scripts/backup.sh >> /var/log/fluxo-backup.log 2>&1
#
# Verifique periodicamente que o backup restaura: scripts/verify-backup.sh
set -eu

umask 077

# O Git Bash no Windows reescreve argumentos que parecem caminho absoluto:
# `/app/uploads` virava `C:/Program Files/Git/app/uploads` dentro do container.
# A exclusao vale so para os caminhos internos do container — os caminhos do
# host precisam continuar sendo convertidos para o docker.exe entende-los.
# Sem efeito em Linux.
export MSYS2_ARG_CONV_EXCL="/app"

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
project_dir=$(dirname -- "$script_dir")
compose_file=${COMPOSE_FILE:-"$project_dir/docker-compose.yml"}
backup_dir=${BACKUP_DIR:-"$project_dir/backups"}
retention_days=${BACKUP_RETENTION_DAYS:-30}

dc() {
  docker compose --project-directory "$project_dir" --file "$compose_file" "$@"
}

if ! command -v docker >/dev/null 2>&1; then
  echo "Erro: Docker não está disponível no PATH." >&2
  exit 1
fi

mkdir -p -- "$backup_dir"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)

# --- Banco de dados ---------------------------------------------------------
echo "==> Banco de dados"
BACKUP_DIR="$backup_dir" COMPOSE_FILE="$compose_file" "$script_dir/backup-db.sh"

# --- Anexos -----------------------------------------------------------------
echo "==> Anexos"
uploads_file="$backup_dir/fluxo-interno-uploads-${timestamp}.tar.gz"
uploads_temporary=$(mktemp "$backup_dir/.uploads.XXXXXX")

cleanup() {
  rm -f -- "$uploads_temporary"
}
trap cleanup EXIT HUP INT TERM

# Lê o volume por dentro do próprio container da aplicação. `--no-deps` evita
# subir o banco só para isto, e `.pending` fica de fora: são uploads que nunca
# chegaram a ser confirmados por uma transação.
if dc ps --status running --services 2>/dev/null | grep -qx "app"; then
  dc exec -T app tar -czf - -C /app/uploads --exclude=.pending . > "$uploads_temporary"
else
  dc run --rm --no-deps -T --entrypoint sh app -c \
    'tar -czf - -C /app/uploads --exclude=.pending .' > "$uploads_temporary"
fi

if [ ! -s "$uploads_temporary" ]; then
  echo "Erro: o arquivo de anexos gerado está vazio." >&2
  exit 1
fi

mv -- "$uploads_temporary" "$uploads_file"
uploads_temporary=""

if command -v sha256sum >/dev/null 2>&1; then
  (
    cd -- "$backup_dir"
    sha256sum "$(basename -- "$uploads_file")" > "$(basename -- "$uploads_file").sha256"
  )
fi

echo "Anexos: $uploads_file"

# --- Retenção ---------------------------------------------------------------
# Roda por último, de propósito: se algo acima falhou, o `set -e` já abortou e
# os backups antigos continuam intactos. Apagar antes de gravar o novo deixaria
# uma janela sem cópia nenhuma.
echo "==> Retenção (${retention_days} dias)"
removed=0
for old in $(find "$backup_dir" -maxdepth 1 -type f \
  \( -name 'fluxo-interno-*.dump*' -o -name 'fluxo-interno-uploads-*.tar.gz*' \) \
  -mtime "+${retention_days}" 2>/dev/null); do
  rm -f -- "$old"
  removed=$((removed + 1))
done
echo "Removidos: $removed arquivo(s)"

echo
echo "Backup completo em $backup_dir"
echo "Lembre-se de copiar para fora deste host — um backup no mesmo disco não protege contra perda do disco."
