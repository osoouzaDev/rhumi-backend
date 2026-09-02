# Operação em produção

## Saúde, prontidão e métricas

- GET /live confirma somente que o processo HTTP está vivo. Não consulta serviços externos.
- GET /ready retorna 200 quando PostgreSQL e o Redis configurado estão prontos; retorna 503 quando a instância deve ser retirada do balanceador.
- GET /health é um alias temporário de /ready, mantido por compatibilidade.
- GET /metrics expõe métricas Prometheus somente com Authorization: Bearer METRICS_TOKEN ou X-Metrics-Token.

Configure o coletor para raspar /metrics e carregue ops/prometheus-alerts.yml no Prometheus/Alertmanager. Os alertas incluídos cobrem indisponibilidade, taxa de 5xx, latência p95 e memória residente.

## Logs centralizados

A API escreve um objeto JSON por linha em stdout/stderr, incluindo horário, nível, ambiente, evento, requestId, rota, status e duração. Campos com nomes de credenciais, cookies, senhas, segredos ou tokens são removidos pelo logger.

O runtime não grava arquivos locais de log. O orquestrador deve encaminhar stdout e stderr para o serviço central escolhido (Loki, OpenSearch, CloudWatch ou equivalente), com:

- retenção compatível com a política da empresa;
- acesso restrito ao time operacional;
- alerta para eventos de nível error;
- pesquisa pelo requestId;
- bloqueio de ingestão de corpos HTTP e tokens.

## Backup e restauração

Os scripts `scripts/backup.mjs` e `scripts/restore-verify.mjs` geram um dump PostgreSQL em formato custom, checksum SHA-256 e restauram o arquivo em um banco temporário. Os scripts `scripts/backup-private-files.mjs` e `scripts/verify-latest-file-backup.mjs` protegem separadamente o volume de arquivos privados, conferem seu checksum e extraem a cópia em um diretório temporário. Uma restauração só é considerada válida depois dessas verificações.

Os units em `deploy/systemd` executam backups diários e restaurações semanais do banco e dos arquivos privados. No servidor:

1. crie o usuário sem login rhumi-backup;
2. monte um volume criptografado e restrito em /var/backups/rhumi;
3. crie /etc/rhumi/backup.env, modo 0600, com BACKUP_DATABASE_URL e RESTORE_TEST_ADMIN_URL;
4. conceda ao usuário `rhumi-backup` leitura por ACL no volume privado, sem permissão de escrita;
5. instale os oito units e habilite os quatro timers;
6. monitore falhas dos units e espaço livre;
7. replique os dumps, arquivos compactados e manifestos SHA-256 para um cofre externo imutável;
8. configure retenção e bloqueio contra exclusão no cofre externo.

Uma cópia não conta como backup validado até o timer de restauração concluir com sucesso. Nunca restaure por cima de produção para testar.

## Segredos e rotação

Nenhum segredo deve entrar no repositório, imagem ou arquivo Compose. Os arquivos em /etc/rhumi devem ser fornecidos pelo gerenciador de segredos da plataforma e ter acesso mínimo.

Rotação recomendada:

- JWT: defina o segredo novo como JWT_SECRET, mantenha o anterior em JWT_PREVIOUS_SECRET, publique, aguarde o maior TTL de token e remova o anterior;
- banco: crie uma credencial nova, atualize o secret, valide /ready, revogue a antiga;
- SMTP, Redis, métricas e backup: gere o valor novo, atualize o ambiente, reinicie de forma gradual, valide e revogue o anterior;
- certificados: instale o novo CA/certificado antes da troca no provedor, valide TLS e só então retire o antigo.

Registre responsável, data, evidência de validação e próxima rotação. Trate qualquer segredo exibido em log ou commit como comprometido.

## Homologação, deploy e rollback

O workflow container.yml publica imagens no GHCR com SBOM, proveniência e tag do commit. O workflow manual deploy.yml aceita apenas uma referência imutável @sha256, usa ambientes protegidos do GitHub e um runner de deploy controlado.

Fluxo:

1. CI, integração e segurança aprovadas;
2. deploy do digest em staging;
3. smoke test em /live, /ready, login, leitura e escrita básica;
4. DAST contra homologação;
5. aprovação do ambiente production;
6. migrations aditivas/compatíveis;
7. deploy gradual e observação de erros/latência.

Rollback da aplicação é feito executando deploy.yml com o digest anterior e run_migrations=false. Migrations devem ser compatíveis com a versão anterior. Para mudança destrutiva, use expand/contract em releases separados; restauração do banco é procedimento de desastre, não rollback normal.

Os arquivos /etc/rhumi/staging.env, /etc/rhumi/production.env e os equivalentes .migration.env ficam apenas no host. A credencial de migration não deve estar no ambiente permanente da API.

## Resposta a incidentes

Em alerta crítico:

1. identifique a primeira falha pelo requestId, métrica e versão da imagem;
2. contenha o impacto sem apagar evidências;
3. revogue sessões/segredos afetados;
4. execute rollback se a regressão estiver na aplicação;
5. preserve logs e auditoria;
6. registre linha do tempo, causa raiz e ações corretivas.
