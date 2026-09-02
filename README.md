# RHumi Backend

API modular de Gestão de Pessoas da plataforma RHumi. O projeto reúne autenticação e controle de acesso, estrutura organizacional, colaboradores, recrutamento, calendário, treinamentos, jornadas, desempenho, PDI, carreira e uma central integrada de notificações e pendências.

## Tecnologias

- Node.js, Express e TypeScript
- PostgreSQL com `pg`
- Argon2 para senhas
- JWT para access tokens
- Refresh tokens opacos com rotação, detecção de reutilização e revogação
- Zod para validação
- Helmet e limites de requisição para proteção HTTP

## Configuração local

1. Copie `.env.example` para `.env` e informe a conexão PostgreSQL e um `JWT_SECRET` seguro.
2. Instale as dependências com `npm install`.
3. Execute `npm run db:migrate` para criar ou atualizar o esquema.
4. Execute `npm run db:provision-app-role` para criar/restringir o usuário usado pela API.
5. Configure as variáveis `SEED_*` e execute `npm run db:seed` para criar o primeiro administrador.
6. Inicie com `npm run dev`.

O banco da Aiven pode ser configurado por `DATABASE_URL`. Alternativamente, use `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` e `DB_NAME`. Em conexões gerenciadas, habilite `DB_SSL=true`, mantenha `DB_SSL_REJECT_UNAUTHORIZED=true` e indique o certificado em `DB_SSL_CA_PATH`.

Use credenciais separadas para a API e para migrations. `DB_USER` deve ser o usuário restrito da aplicação; `DB_MIGRATION_USER` e `DB_MIGRATION_PASSWORD` devem existir somente no ambiente do job de migration, seed ou provisionamento. Confira o resultado com `npm run db:permissions`.

## Bootstrap do administrador

As variáveis abaixo são usadas somente pelo seed:

```env
SEED_COMPANY_LEGAL_NAME=Empresa Exemplo LTDA
SEED_COMPANY_TAX_ID=00.000.000/0001-00
SEED_ADMIN_NAME=Administrador RH
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=replace-with-a-strong-password
SEED_ADMIN_EMPLOYEE_CODE=ADMIN001
```

Substitua os valores de exemplo e remova as variáveis `SEED_*` do ambiente após o bootstrap.

## Módulos da API

- Autenticação: `/api/v1/auth`
- Dashboard: `/api/v1/dashboard`
- Empresas: `/api/v1/companies`
- Departamentos: `/api/v1/departments`
- Cargos: `/api/v1/positions`
- Colaboradores: `/api/v1/employees`
- Contas e acesso: `/api/v1/users`
- Recrutamento e seleção: `/api/v1/recruitment`
- Calendário corporativo: `/api/v1/calendar`
- Treinamentos e provas: `/api/v1/trainings`
- Jornadas e onboarding: `/api/v1/journeys`
- Gestão de desempenho: `/api/v1/evaluations`
- PDI e plano de carreira: `/api/v1/development`
- Notificações e pendências: `/api/v1/notifications`

As listagens aceitam paginação e filtros pela query string. As rotas exigem autenticação e a permissão RBAC correspondente. Supervisores ficam limitados ao próprio departamento.

O login recebe `identifier` — código do colaborador ou e-mail — e `password`. Em desenvolvimento, tokens podem ser retornados no JSON conforme `AUTH_EXPOSE_TOKENS_IN_BODY`. Em produção essa opção deve ser `false`, usando cookies HTTP-only ou um cliente de API que gerencie o bearer token fora do navegador.

## Segurança

O backend aplica cabeçalhos seguros, CORS e origem explícitos, cookies seguros, limites distribuíveis via Redis, sessões rotativas, MFA TOTP e PostgreSQL RLS. O isolamento por empresa é aplicado tanto no código quanto no banco.

Consulte [Segurança e operação](docs/security.md) antes de preparar o ambiente de produção.

## Documentação dos módulos

- [Segurança e operação](docs/security.md)
- [Preparação da homologação](docs/staging.md)
- [Operação em produção](docs/operations.md)
- [Dashboard](docs/dashboard-api.md)
- [Recrutamento](docs/recruitment-api.md)
- [Calendário](docs/calendar-api.md)
- [Treinamentos e provas](docs/trainings-api.md)
- [Jornadas e onboarding](docs/journeys-api.md)
- [Gestão de desempenho](docs/evaluations-api.md)
- [PDI e carreira](docs/development-api.md)
- [Notificações e pendências](docs/notifications-api.md)
- [Usuários e acessos](docs/users-api.md)

## Comandos

- `npm run dev`: desenvolvimento com recarregamento automático
- `npm run build`: compila o TypeScript
- `npm run config:validate -- /caminho/ambiente.env`: valida um arquivo de ambiente sem exibir segredos
- `npm test`: compila e executa os testes automatizados
- `npm run test:integration:security`: valida sessões, RBAC, empresas e privilégios PostgreSQL
- `npm run test:integration:mfa`: valida TOTP, recuperação e proteção contra replay
- `npm run test:integration:recruitment`: valida recrutamento no PostgreSQL
- `npm run test:integration:calendar`: valida calendário no PostgreSQL
- `npm run test:integration:trainings`: valida treinamentos no PostgreSQL
- `npm run test:integration:journeys`: valida jornadas e suas integrações
- `npm run test:integration:evaluations`: valida desempenho e feedback
- `npm run test:integration:development`: valida PDI e carreira
- `npm run test:integration:notifications`: valida notificações e pendências
- `npm run db:status`: mostra tabelas e migrations sem alterar o banco
- `npm run db:permissions`: mostra os privilégios do usuário conectado
- `npm run db:migrate`: compila e aplica migrations pendentes
- `npm run db:provision-app-role`: cria ou restringe o usuário PostgreSQL da API
- `npm run db:seed`: compila e cria ou atualiza o administrador inicial
- `npm start`: executa a versão compilada
