# Homologação do backend

Este ambiente reproduz as proteções de produção sem enviar e-mails reais. O Mailpit captura todas as mensagens e expõe sua interface somente em `127.0.0.1:8025`.

## 1. Preparar arquivos protegidos

No host de homologação, crie `/etc/rhumi` com acesso somente para o administrador e para o serviço de deploy. Copie os modelos:

- `deploy/staging.env.example` para `/etc/rhumi/staging.env`;
- `deploy/staging.migration.env.example` para `/etc/rhumi/staging.migration.env`;
- `deploy/staging.dependencies.env.example` para `/etc/rhumi/staging.dependencies.env`;
- `deploy/backup.env.example` para `/etc/rhumi/backup.env`.

Instale o certificado da autoridade do PostgreSQL em `/etc/rhumi/certs/postgresql-ca.pem` e grave somente o token de métricas em `/etc/rhumi/metrics.token`. Use modo `0600` nos arquivos de ambiente/token e `0700` nos diretórios.

Substitua todo valor `CHANGE_ME`. Gere valores independentes para JWT, MFA, Redis e métricas. Nunca reutilize a senha do banco ou um segredo de produção.

## 2. Validar o serviço PostgreSQL

Copie o hostname e a porta diretamente da seção de conexão do provedor. Antes do deploy:

1. confirme que o hostname resolve no DNS do host;
2. confirme TLS usando o CA fornecido pelo provedor;
3. use uma credencial administrativa apenas no arquivo `.migration.env`;
4. use `rhumi_app` no arquivo permanente da API;
5. remova variáveis `SEED_*` depois do primeiro administrador.

Se o DNS retornar `NXDOMAIN`, não tente adivinhar outro endereço: confirme se o serviço foi renomeado, pausado, removido ou se o endpoint copiado é privado.

## 3. Preparar dependências

O arquivo `deploy/staging.compose.yml` acrescenta:

- Redis autenticado e persistente para rate limiting;
- Mailpit para captura segura de e-mails;
- ClamAV para varredura dos uploads;
- Prometheus com autenticação para coletar `/metrics`.

Antes de um ambiente compartilhado, substitua as tags de imagens em `staging.dependencies.env` por referências imutáveis com digest `@sha256`.

## 4. Aplicar banco e publicar

Use a mesma imagem imutável nos comandos:

```bash
docker run --rm \
  --env-file /etc/rhumi/staging.migration.env \
  --volume /etc/rhumi/certs/postgresql-ca.pem:/run/secrets/postgresql-ca.pem:ro \
  RHUMI_IMAGE npm run db:migrate:prod

docker run --rm \
  --env-file /etc/rhumi/staging.migration.env \
  --volume /etc/rhumi/certs/postgresql-ca.pem:/run/secrets/postgresql-ca.pem:ro \
  RHUMI_IMAGE npm run db:provision-app-role:prod

RHUMI_ENVIRONMENT=staging \
RHUMI_IMAGE=RHUMI_IMAGE \
docker compose \
  --env-file /etc/rhumi/staging.dependencies.env \
  -f deploy/compose.yml \
  -f deploy/staging.compose.yml \
  up -d
```

O provisionamento de privilégios deve sempre ocorrer depois das migrations, porque tabelas e funções novas não recebem acesso automaticamente.

## 5. Aceite operacional

Considere a homologação pronta somente quando:

- `/live` retorna 200;
- `/ready` retorna 200 com PostgreSQL e Redis disponíveis;
- login, refresh, logout e MFA funcionam;
- convite, recuperação de senha e notificação chegam ao Mailpit;
- upload limpo é aceito e arquivo de teste malicioso EICAR é rejeitado pelo ClamAV;
- `/metrics` é negado sem token e coletado pelo Prometheus;
- logs JSON contêm `requestId` e não contêm cookies, senhas ou tokens;
- backup diário é criado e a restauração semanal termina com sucesso;
- a pasta de arquivos privados está em volume persistente, criptografado e incluída no plano de cópias externas;
- o DAST autorizado termina sem achados impeditivos.

Para rollback, publique novamente o digest anterior sem executar migrations. Mudanças destrutivas de banco devem usar o padrão expand/contract em versões separadas.
