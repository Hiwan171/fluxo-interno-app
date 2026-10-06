#!/bin/sh
# Ensaia a restauração do backup mais recente num banco descartável.
#
# Um backup que nunca foi restaurado não é um backup — é um arquivo. Este script
# restaura o dump mais novo numa base temporária, confere que as tabelas
# essenciais existem e têm conteúdo, e apaga a base ao final. Não encosta na
# base de produção em momento nenhum.
#
# Agendamento sugerido (semanal, depois do backup diário):
#   0 4 * * 0 /caminho/para/fluxo-interno/scripts/verify-backup.sh >> /var/log/fluxo-verify.log 2>&1
set -eu

# Ver a nota em backup.sh: exclui apenas caminhos internos do container.
export MSYS2_ARG_CONV_EXCL="/app"

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
project_dir=$(dirname -- "$script_dir")
compose_file=${COMPOSE_FILE:-"$project_dir/docker-compose.yml"}
backup_dir=${BACKUP_DIR:-"$project_dir/backups"}
scratch_db=${VERIFY_DB_NAME:-fluxo_verify_restore}

dc() {
  docker compose --project-directory "$project_dir" --file "$compose_file" "$@"
}

# Executa uma consulta na base descartavel e devolve so o valor.
scratch_psql() {
  dc exec -T db sh -ec "
    : \"\${POSTGRES_USER:?}\"
    psql --username=\"\$POSTGRES_USER\" --dbname='$scratch_db' \
      --no-align --tuples-only --set ON_ERROR_STOP=1 -c \"$1\"
  "
}

if ! dc ps --status running --services | grep -qx "db"; then
  echo "Erro: o serviço db não está em execução." >&2
  exit 1
fi

dump_file=$(find "$backup_dir" -maxdepth 1 -type f -name 'fluxo-interno-*.dump' \
  | sort | tail -n 1)

if [ -z "${dump_file:-}" ]; then
  echo "Erro: nenhum backup encontrado em $backup_dir." >&2
  exit 1
fi

echo "Backup a verificar: $dump_file"

# Confere a integridade do arquivo antes de tentar restaurar: um dump truncado
# falharia no meio da restauração e o motivo ficaria obscuro.
if [ -f "$dump_file.sha256" ] && command -v sha256sum >/dev/null 2>&1; then
  echo "==> Checksum"
  ( cd -- "$backup_dir" && sha256sum -c "$(basename -- "$dump_file").sha256" )
fi

drop_scratch() {
  dc exec -T db sh -ec "
    : \"\${POSTGRES_USER:?}\"
    dropdb --if-exists --username=\"\$POSTGRES_USER\" '$scratch_db'
  " >/dev/null 2>&1 || true
}
trap drop_scratch EXIT HUP INT TERM

echo "==> Criando base descartável '$scratch_db'"
drop_scratch
dc exec -T db sh -ec "
  : \"\${POSTGRES_USER:?}\"
  createdb --username=\"\$POSTGRES_USER\" '$scratch_db'
"

echo "==> Restaurando"
dc exec -T db sh -ec "
  : \"\${POSTGRES_USER:?}\"
  pg_restore --no-owner --no-acl --exit-on-error \
    --username=\"\$POSTGRES_USER\" --dbname='$scratch_db'
" < "$dump_file"

echo "==> Conferindo conteúdo"
usuarios=0

# A checagem de sanidade fica no shell, nao num bloco PL/pgSQL: o `$$` de um
# bloco DO atravessa shell, docker exec e psql, e cada camada consome uma
# escapada — o bloco chegava quebrado do outro lado.
for tabela in users workspaces boards phases cards card_field_values attachments auth_tokens; do
  linhas=$(scratch_psql "select count(*) from $tabela" | tr -d '[:space:]')
  printf '  %-20s %s\n' "$tabela" "$linhas"

  if [ "$tabela" = "users" ]; then
    usuarios=${linhas:-0}
  fi
done

# Um backup sem nenhum usuario significa que o dump saiu da base errada.
if [ "$usuarios" -eq 0 ]; then
  echo "Erro: o backup restaurado nao contem nenhum usuario." >&2
  exit 1
fi

echo
echo "OK: o backup restaura e contém dados."
echo "Base descartável '$scratch_db' será removida agora."
