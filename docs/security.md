# Segurança e operação

Este documento descreve os controles aplicados no backend RHumi e o preparo mínimo para produção.

## Controles implementados

- Senhas protegidas com Argon2 e resposta uniforme de login para reduzir enumeração de contas.
- Bloqueio temporário após tentativas inválidas e limites específicos para login, MFA e renovação de sessão.
- Access token JWT de curta duração com empresa e sessão assinadas.
- Refresh token opaco armazenado somente como hash, com rotação, detecção de reutilização e revogação da cadeia.
- Limite configurável de sessões e rota `POST /api/v1/auth/logout-all`.
- MFA TOTP opcional, segredo criptografado com AES-256-GCM, códigos de recuperação de uso único e proteção contra replay do contador TOTP.
- Cookies `HttpOnly`, `Secure` em produção e `SameSite` configurável.
- Em produção, a API se recusa a iniciar se tokens estiverem habilitados no corpo das respostas.
- CORS explícito, validação de origem em mutações, Helmet, HSTS, bloqueio de cache e limite de 1 MB para JSON.
- Rate limiting em memória para uma instância ou compartilhado via Redis para múltiplas instâncias.
- RBAC, escopo de departamento e isolamento por empresa na aplicação.
- PostgreSQL Row-Level Security (RLS) nas tabelas de negócio, autenticação e relacionamentos indiretos.
- Respostas de erro genéricas, logs sanitizados e identificadores de requisição validados como UUID.
- PostgreSQL com TLS validado e certificado CA.
- Usuário da aplicação sem privilégios administrativos, sem `CREATE`, sem acesso à tabela legada e sem permissão para adulterar auditoria ou migrations.

## Isolamento PostgreSQL por empresa

A API executa consultas autenticadas dentro de um contexto assíncrono de empresa. Cada consulta isolada abre uma transação curta com `rhumi.company_id`; transações dos repositórios recebem o mesmo contexto com `SET LOCAL`.

Consultas feitas pelo usuário `rhumi_app` sem contexto não enxergam linhas protegidas. Políticas `WITH CHECK` também impedem a gravação de uma linha para outra empresa, mesmo que um filtro seja esquecido no código.

Login, refresh e desafio MFA precisam localizar a empresa antes do contexto existir. Para isso, a migration cria três funções `SECURITY DEFINER` de escopo mínimo. A execução pública é revogada e somente o usuário provisionado da aplicação recebe acesso.

Após aplicar migrations, execute:

```bash
npm run db:provision-app-role
npm run db:permissions
```

O processo web de produção não deve receber `DATABASE_MIGRATION_URL`, `DB_MIGRATION_USER` ou `DB_MIGRATION_PASSWORD`. Essas credenciais pertencem somente ao job de migration, seed e provisionamento.

## MFA

Rotas:

- `GET /api/v1/auth/mfa`: consulta o estado do usuário autenticado.
- `POST /api/v1/auth/mfa/setup`: gera uma chave pendente e uma URI `otpauth://`.
- `POST /api/v1/auth/mfa/confirm`: confirma o primeiro TOTP e devolve os códigos de recuperação uma única vez.
- `POST /api/v1/auth/mfa/verify`: conclui um login que retornou HTTP 202 com `mfaRequired=true`.
- `DELETE /api/v1/auth/mfa`: exige senha e TOTP/código de recuperação; também revoga as demais sessões.

O frontend deve exibir a URI como QR Code, solicitar a confirmação e obrigar o usuário a salvar os códigos de recuperação. Nunca registre `manualKey`, `otpauthUri`, códigos TOTP ou códigos de recuperação em logs.

Defina uma chave Base64 de 32 bytes exclusiva para MFA:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Armazene `MFA_ENCRYPTION_KEY` em um gerenciador de segredos. A rotação dessa chave exige recriptografar os segredos existentes; simplesmente substituí-la invalida os cadastros MFA.

## Rate limiting com Redis

Para uma única instância local:

```env
RATE_LIMIT_STORE=memory
```

Para múltiplas instâncias:

```env
RATE_LIMIT_STORE=redis
REDIS_URL=rediss://usuario:senha@redis.exemplo:6379
REDIS_KEY_PREFIX=rhumi:rate-limit:
```

A API conecta ao Redis antes de abrir a porta HTTP. Quando Redis está habilitado, o health check executa `PING` e informa `redis: up`; em memória informa `redis: disabled`.

## Configuração de produção

```env
NODE_ENV=production
CORS_ORIGINS=https://app.seudominio.com
TRUST_PROXY_HOPS=1
FORCE_HTTPS=true

DB_USER=rhumi_app
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
DB_SSL_CA_PATH=certs/ca.pem

AUTH_COOKIES_ENABLED=true
AUTH_COOKIE_SAME_SITE=lax
AUTH_EXPOSE_TOKENS_IN_BODY=false

MFA_ENABLED=true
MFA_ENCRYPTION_KEY=<32-bytes-em-base64>

RATE_LIMIT_STORE=redis
REDIS_URL=rediss://...
```

- Ajuste `TRUST_PROXY_HOPS` à quantidade real de proxies confiáveis.
- Use somente origens HTTPS exatas em `CORS_ORIGINS`.
- Gere `JWT_SECRET` aleatório com pelo menos 48 caracteres.
- Remova as variáveis `SEED_*` após o bootstrap.
- Rotacione credenciais de banco, JWT e administrador quando houver suspeita de exposição.

## Verificações

```bash
npm test
npm run test:integration:security
npm run test:integration:mfa
npm run db:permissions
npm audit
```

A integração de segurança valida o RLS diretamente, incluindo leitura sem contexto, leitura entre empresas e tentativa de gravação com empresa divergente. A integração MFA valida cadastro, desafio, recuperação, uso único e proteção contra replay.

## Controles externos ainda necessários

- Definir uma política organizacional que obrigue administradores a cadastrar MFA; a API fornece o mecanismo, mas não força o cadastro de contas existentes.
- Centralizar logs e auditoria em armazenamento externo com retenção, alertas e acesso restrito.
- Executar SAST/DAST no pipeline e teste de invasão independente antes de usar dados reais.
- Configurar backup, restauração testada, rotação de segredos e resposta a incidentes na infraestrutura.
