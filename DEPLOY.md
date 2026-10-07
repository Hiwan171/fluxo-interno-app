# Colocar o Fluxo Interno em produção

Passo a passo para um servidor Linux (Ubuntu Server LTS) na rede da empresa, com
o formulário público acessível pela internet e o resto do sistema só pela rede
interna.

## Como fica

```
Internet ──► roteador (portas 80/443) ──► servidor
                                            └─ Caddy (HTTPS)
                                                 ├─ /f/*  (formulário)  ◄── qualquer IP
                                                 └─ resto (login, quadros, admin)
                                                        ◄── só INTERNAL_NETS
                                            └─ app (Next.js) ─ worker (e-mail) ─ db (Postgres)
```

- De fora da empresa, só o formulário público (`/f/...`) responde. Qualquer outro
  endereço devolve 404.
- O Postgres, a porta 3000 e o Mailpit escutam apenas em `127.0.0.1` do
  servidor. Nunca abra essas portas no roteador.
- Quem trabalha de casa entra por VPN (Tailscale ou WireGuard), não pela
  internet aberta. Acrescente a faixa da VPN em `INTERNAL_NETS`.

## 1. Antes de começar

| Item | O que fazer |
|---|---|
| Domínio | Registre um (ex.: `empresa.com.br`) e crie um registro `A` para o IP fixo da empresa, por exemplo `fluxo.empresa.com.br`. |
| IP interno fixo | Reserve um IP para o servidor no roteador (reserva DHCP) ou configure IP estático. |
| Roteador | Encaminhe as portas **80/TCP**, **443/TCP** e **443/UDP** para o IP interno do servidor. Nada além disso. |
| DNS interno | Faça `fluxo.empresa.com.br` resolver para o **IP interno** do servidor dentro da empresa (DNS do roteador ou do AD). Muitos roteadores não alcançam o próprio IP público ("hairpin NAT"), e sem isso o sistema abre da rua mas não da sala. |

O Caddy obtém e renova o certificado HTTPS sozinho (Let's Encrypt). Para isso
as portas 80 e 443 precisam chegar ao servidor e o `A` do domínio precisa
apontar para o IP público.

**HTTPS é obrigatório.** O cookie de sessão é `secure` e o CSP força HTTPS: em
`http://IP:3000` o login não funciona.

### Se o servidor for uma VM no Hyper-V (Windows Server)

- Use rede por **switch virtual externo** (o servidor precisa ter IP próprio na
  LAN, não NAT).
- Em Geração 2, troque o modelo de Secure Boot para
  **"Microsoft UEFI Certificate Authority"**, senão o Ubuntu não inicia.
- Defina a ação de início automático como **"Sempre iniciar"**.
- Reserve memória fixa (4 GB é confortável).

## 2. Preparar o servidor

```bash
# Docker Engine (instruções oficiais: https://docs.docker.com/engine/install/ubuntu/)
sudo apt update && sudo apt install -y git ufw
# ...instale o Docker conforme o link acima...
sudo usermod -aG docker "$USER"   # saia e entre de novo na sessão

sudo timedatectl set-timezone America/Sao_Paulo

# Firewall do servidor
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
```

Ative as atualizações automáticas de segurança:
`sudo apt install -y unattended-upgrades`.

## 3. Baixar o código e configurar

```bash
sudo mkdir -p /opt/fluxo-interno && sudo chown "$USER" /opt/fluxo-interno
git clone <URL-DO-REPOSITÓRIO> /opt/fluxo-interno
cd /opt/fluxo-interno
cp .env.example .env
chmod 600 .env
```

Edite o `.env`:

| Variável | Valor |
|---|---|
| `APP_DOMAIN` | `fluxo.empresa.com.br` |
| `APP_URL` | `https://fluxo.empresa.com.br` (usada nos links de convite e de redefinição de senha por e-mail) |
| `INTERNAL_NETS` | Faixas da rede local e da VPN, separadas por espaço. Ex.: `192.168.0.0/24 100.64.0.0/10`. **Não inclua `172.16.0.0/12`**: é onde mora a rede do Docker. |
| `POSTGRES_PASSWORD` | Gere com `openssl rand -hex 24` (só caracteres seguros para URL). |
| `EMAIL_MODE` | `smtp` |
| `MAIL_FROM` | `Fluxo Interno <noreply@empresa.com.br>` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | Os do seu provedor de e-mail. Porta 587 com `SMTP_SECURE=false` e `SMTP_REQUIRE_TLS=true`. |

A linha `DATABASE_URL` do `.env` só serve para rodar o projeto fora do Docker; os
containers montam a própria a partir de `POSTGRES_*`.

> Nunca rode `npm run db:seed` em produção: ele cria um administrador com senha
> fixa que está no repositório, mais quadros e cards de exemplo.

## 4. Subir pela primeira vez

```bash
cd /opt/fluxo-interno

# 1. banco
docker compose up -d db

# 2. tabelas
docker compose --profile tools run --rm tooling node_modules/.bin/drizzle-kit migrate

# 3. primeiro administrador (a senha não fica em arquivo nenhum)
read -rsp "Senha do administrador: " ADMIN_PASSWORD; echo; export ADMIN_PASSWORD
docker compose --profile tools run --rm \
  -e ADMIN_EMAIL=voce@empresa.com.br -e ADMIN_NAME="Seu Nome" -e ADMIN_PASSWORD \
  tooling node_modules/.bin/tsx --conditions=react-server scripts/bootstrap-admin.ts
unset ADMIN_PASSWORD

# 4. aplicação, worker de e-mail e Caddy
docker compose --profile prod up -d --build
```

A senha precisa ter 12+ caracteres, com maiúscula, minúscula, número e símbolo.
O script é seguro de repetir: se o e-mail já existe, não altera nada.

Para **trocar a senha** de alguém (esquecida, ou se vazou), sem depender de e-mail:

```bash
read -rsp "Nova senha: " NEW_PASSWORD; echo; export NEW_PASSWORD
docker compose --profile tools run --rm \
  -e USER_EMAIL=voce@empresa.com.br -e NEW_PASSWORD \
  tooling node_modules/.bin/tsx --conditions=react-server scripts/set-password.ts
unset NEW_PASSWORD
```

Isso também encerra as sessões abertas dessa conta e invalida convites pendentes.

## 5. Conferir

```bash
docker compose --profile prod ps            # todos "running"; app "healthy"
curl -s http://127.0.0.1:3000/api/health    # {"status":"ok",...}
docker compose logs caddy | tail -n 20      # certificado obtido sem erro
```

Depois, três testes que mostram se o isolamento está certo:

1. **De um PC da empresa:** `https://fluxo.empresa.com.br/login` abre e o login
   funciona.
2. **Do celular, em 4G (fora do Wi-Fi):** `https://fluxo.empresa.com.br/login`
   deve dar **404**. Um formulário publicado (`/f/<chave>`) deve abrir e enviar.
3. Mande um envio de teste pelo formulário e confira o card no quadro.

## 6. E-mail

```bash
docker compose --profile tools run --rm tooling node_modules/.bin/tsx --conditions=react-server scripts/check-smtp.ts
```

Para o e-mail não cair no spam, o domínio precisa de **SPF**, **DKIM** e
**DMARC** configurados no DNS conforme o provedor SMTP escolhido.

Atenção: uma automação de e-mail com destinatário "solicitante" envia mensagem
para o endereço que a pessoa digitou no formulário público. Em formulário aberto
na internet isso permite que terceiros façam o seu domínio mandar e-mail para
qualquer endereço. Evite esse tipo de automação na fase de entrada de um quadro
com formulário público.

## 7. Rotina

### Atualizar para uma versão nova

```bash
cd /opt/fluxo-interno
git pull
docker compose --profile prod build
docker compose --profile tools run --rm tooling node_modules/.bin/drizzle-kit migrate
docker compose --profile prod up -d
```

### Dia a dia

```bash
docker compose --profile prod ps            # estado
docker compose logs -f app                  # logs da aplicação
docker compose logs -f worker               # fila de e-mail
docker compose --profile prod restart app
```

### Backup (diário) e verificação (semanal)

O backup cobre o banco **e** os anexos. Um sem o outro não restaura o sistema.

```bash
crontab -e
```

```cron
0 2 * * *  /opt/fluxo-interno/scripts/backup.sh         >> /opt/fluxo-interno/backups/cron.log 2>&1
0 4 * * 0  /opt/fluxo-interno/scripts/verify-backup.sh  >> /opt/fluxo-interno/backups/cron.log 2>&1
30 4 * * 0 cd /opt/fluxo-interno && docker compose --profile tools run --rm -T --user 1001:1001 tooling node_modules/.bin/tsx --conditions=react-server scripts/sweep-attachments.ts >> /opt/fluxo-interno/backups/cron.log 2>&1
```

- `backup.sh` guarda 30 dias (`BACKUP_RETENTION_DAYS`).
- `verify-backup.sh` restaura o dump mais recente numa base descartável e
  confere o conteúdo. **Um backup nunca restaurado é só um arquivo.**
- A terceira linha limpa anexos órfãos, depois do backup. O `--user 1001:1001`
  é obrigatório: sem ele o comando roda como root, não consegue apagar os
  arquivos (que pertencem ao usuário da aplicação) e ainda assim termina sem
  erro, apenas com "0 removidos".
- **Copie os backups para fora do servidor** (disco USB, NAS, nuvem). Backup no
  mesmo disco não protege contra a perda do disco. Exemplo com um NAS montado
  em `/mnt/nas`:

  ```cron
  30 2 * * *  rsync -a /opt/fluxo-interno/backups/ /mnt/nas/fluxo-interno/
  ```

### Restaurar

```bash
cd /opt/fluxo-interno
docker compose stop app worker
sh scripts/restore-db.sh backups/fluxo-interno-AAAAMMDDTHHMMSSZ.dump
docker compose --profile tools run --rm tooling node_modules/.bin/drizzle-kit migrate
docker compose --profile prod up -d
```

Os anexos estão no arquivo `fluxo-interno-uploads-*.tar.gz` do mesmo horário.
Restaure-os no volume `uploads_data` antes de subir a aplicação.

## Importar chamados de um pipe do Pipefy

Cria um quadro novo a partir de um relatório exportado do Pipefy: fases, campos
(cada um na fase onde é preenchido), formulário inicial, cards, histórico de
movimentação, comentários e anexos.

1. No Pipefy, exporte o relatório do pipe **com todas as colunas** (`.xlsx`).
   **Importe logo:** os links dos anexos no relatório expiram em cerca de 30 dias.
2. **Simule primeiro.** Sem `--apply` nada é gravado; o comando mostra as fases,
   os campos e o formulário que seriam criados, para você conferir.
3. Faça um **backup** (`scripts/backup.sh`) e rode com `--apply`.

```bash
cd /opt/fluxo-interno
docker compose --profile tools run --rm -T --user 1001:1001 \
  -v "$PWD/relatorio.xlsx:/import/relatorio.xlsx:ro" \
  tooling node_modules/.bin/tsx --conditions=react-server scripts/import-pipefy.ts \
  /import/relatorio.xlsx --mapping scripts/pipefy-mappings/chamados-ti.json   # simulação
# conferiu? repita o mesmo comando acrescentando --apply no final
```

O `--user 1001:1001` é obrigatório: é o dono dos arquivos de anexo.
Em desenvolvimento (sem Docker): `npm run import:pipefy -- relatorio.xlsx --mapping ... [--apply]`.

**O que acontece**

| No Pipefy | No sistema |
|---|---|
| Fases | Fases, na ordem em que os cards passam por elas; a que todos visitam primeiro é a inicial |
| Campos do formulário inicial | Campos gerais e formulário público (nasce como **rascunho**) |
| Campos de uma fase | Campos daquela fase (continuam visíveis nos cards que já passaram por ela) |
| Etiquetas de prioridade | Prioridade do card (crítica, alta, média, baixa); outras etiquetas não têm equivalente |
| Criador | Origem do card (formulário ou manual); o nome do criador manual fica num campo |
| Última movimentação por fase | Histórico do card, marcado como importado |
| Último comentário | Um comentário no card |
| Código | Campo "Código Pipefy", para localizar o chamado no sistema antigo |
| Responsáveis | **Não importados**: o sistema só atribui usuários cadastrados |

- Os cards são gravados direto no banco: **nenhum e-mail de automação é enviado**.
- Os anexos são baixados do Pipefy e passam pelas mesmas regras de segurança dos
  uploads: imagem, vídeo e PDF, e documentos do Office (Word, Excel e PowerPoint),
  até 10 MB cada. O tipo é decidido pelo **conteúdo** do arquivo, não pela
  extensão. Arquivos com macro ou objeto embutido (`.xlsm`, `.docm`), páginas
  `.html`, executáveis e `.zip` são recusados. O que for recusado é listado ao
  final, com o número do card, para você tratar à mão.
- Documentos do Office só podem ser baixados, nunca são abertos no navegador.
- Pipes com dados pessoais: coloque `"visibility": "private"` em `board` no
  mapeamento. O quadro só será visto por administradores e por quem for adicionado
  a ele.
- Um quadro com o mesmo endereço não é sobrescrito. `--replace` só substitui
  quadros que foram criados por uma importação (a descrição começa com "Importado
  do Pipefy"). Os arquivos de anexo do quadro substituído ficam no volume até a
  limpeza semanal de órfãos.

**Outros pipes.** Os campos são inferidos dos dados (tipo, opções de lista, fase em
que cada um é preenchido). Copie `scripts/pipefy-mappings/chamados-ti.json`, ajuste
os nomes das colunas e rode a simulação: o plano mostra o que foi inferido. Dá para
corrigir no mapeamento a ordem das fases (`phaseOrder`), o tipo de um campo
(`fieldTypes`), a fase de um campo (`fieldPhases`), colunas a ignorar
(`skipColumns`), o fuso das datas (`timezone`) e a tradução das etiquetas de
prioridade (`priorities`).

## 8. Se algo der errado

| Sintoma | Causa provável |
|---|---|
| Caddy não obtém certificado | Portas 80/443 não chegam ao servidor, ou o registro `A` não aponta para o IP público. Veja `docker compose logs caddy`. |
| De dentro da empresa tudo dá 404 | O IP do seu PC não está em `INTERNAL_NETS`. Confira a faixa real (`ip a` no servidor) e reinicie o Caddy: `docker compose --profile prod up -d caddy`. |
| Abre da rua, não abre da sala | Falta o DNS interno apontando o domínio para o IP interno do servidor. |
| Login não funciona | Está acessando por `http://` ou por IP. Use `https://` e o domínio. |
| Formulário recusa "muitos envios" para todo mundo | O servidor não está recebendo o IP real dos visitantes (um proxy ou CDN na frente do Caddy). O limite é por IP e usa o último valor de `X-Forwarded-For`. |
| `app` não fica `healthy` | `docker compose logs app`. O health falha se o banco não responde ou se o volume de anexos não aceita escrita. |

## 9. Checklist antes de liberar para a equipe

- [ ] `https://` abre do PC da empresa e do celular, sem aviso de certificado
- [ ] De fora, `/login` e `/admin` dão 404; o formulário público abre
- [ ] Administrador criado e senha guardada em local seguro
- [ ] E-mail de convite chegou a um endereço externo (não caiu no spam)
- [ ] Backup rodou e `verify-backup.sh` confirmou a restauração
- [ ] Backups sendo copiados para fora do servidor
- [ ] SSH só com chave; atualizações automáticas ativas
- [ ] Nobreak e alerta de disco/RAID configurados no servidor
