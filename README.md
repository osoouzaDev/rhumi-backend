# RHumi Backend

API modular de GestÃ£o de Pessoas da plataforma RHumi. O projeto reÃºne autenticaÃ§Ã£o e controle de acesso, estrutura organizacional, colaboradores, recrutamento, calendÃ¡rio, treinamentos, jornadas, desempenho, PDI, carreira e uma central integrada de notificaÃ§Ãµes e pendÃªncias.

## Tecnologias

- Node.js, Express e TypeScript
- PostgreSQL com `pg`
- Argon2 para senhas
- JWT para access tokens
- Refresh tokens opacos com rotaÃ§Ã£o, detecÃ§Ã£o de reutilizaÃ§Ã£o e revogaÃ§Ã£o
- Zod para validaÃ§Ã£o
- Helmet e limites de requisiÃ§Ã£o para proteÃ§Ã£o HTTP

## ConfiguraÃ§Ã£o local

1. Copie `.env.example` para `.env` e informe a conexÃ£o PostgreSQL e um `JWT_SECRET` seguro.
2. Instale as dependÃªncias com `npm install`.
3. Execute `npm run db:migrate` para criar ou atualizar o esquema.
4. Execute `npm run db:provision-app-role` para criar/restringir o usuÃ¡rio usado pela API.
5. Configure as variÃ¡veis `SEED_*` e execute `npm run db:seed` para criar o primeiro administrador.
6. Inicie com `npm run dev`.

O banco da Aiven pode ser configurado por `DATABASE_URL`. Alternativamente, use `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` e `DB_NAME`. Em conexÃµes gerenciadas, habilite `DB_SSL=true`, mantenha `DB_SSL_REJECT_UNAUTHORIZED=true` e indique o certificado em `DB_SSL_CA_PATH`.

Use credenciais separadas para a API e para migrations. `DB_USER` deve ser o usuÃ¡rio restrito da aplicaÃ§Ã£o; `DB_MIGRATION_USER` e `DB_MIGRATION_PASSWORD` devem existir somente no ambiente do job de migration, seed ou provisionamento. Confira o resultado com `npm run db:permissions`.

## Bootstrap do administrador

As variÃ¡veis abaixo sÃ£o usadas somente pelo seed:

```env
SEED_COMPANY_LEGAL_NAME=Empresa Exemplo LTDA
SEED_COMPANY_TAX_ID=00.000.000/0001-00
SEED_ADMIN_NAME=Administrador RH
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=replace-with-a-strong-password
SEED_ADMIN_EMPLOYEE_CODE=ADMIN001
```

Substitua os valores de exemplo e remova as variÃ¡veis `SEED_*` do ambiente apÃ³s o bootstrap.

## MÃ³dulos da API

- AutenticaÃ§Ã£o: `/api/v1/auth`
- Dashboard: `/api/v1/dashboard`
- Empresas: `/api/v1/companies`
- Departamentos: `/api/v1/departments`
- Cargos: `/api/v1/positions`
- Colaboradores: `/api/v1/employees`
- Contas e acesso: `/api/v1/users`
- Recrutamento e seleÃ§Ã£o: `/api/v1/recruitment`
- CalendÃ¡rio corporativo: `/api/v1/calendar`
- Treinamentos e provas: `/api/v1/trainings`
- Jornadas e onboarding: `/api/v1/journeys`
- GestÃ£o de desempenho: `/api/v1/evaluations`
- PDI e plano de carreira: `/api/v1/development`
- NotificaÃ§Ãµes e pendÃªncias: `/api/v1/notifications`

As listagens aceitam paginaÃ§Ã£o e filtros pela query string. As rotas exigem autenticaÃ§Ã£o e a permissÃ£o RBAC correspondente. Supervisores ficam limitados ao prÃ³prio departamento.

O login recebe `identifier` â€” cÃ³digo do colaborador ou e-mail â€” e `password`. Em desenvolvimento, tokens podem ser retornados no JSON conforme `AUTH_EXPOSE_TOKENS_IN_BODY`. Em produÃ§Ã£o essa opÃ§Ã£o deve ser `false`, usando cookies HTTP-only ou um cliente de API que gerencie o bearer token fora do navegador.

## Segurança

O backend aplica cabeçalhos seguros, CORS e origem explícitos, cookies seguros, limites distribuíveis via Redis, sessões rotativas, MFA TOTP e PostgreSQL RLS. O isolamento por empresa é aplicado tanto no código quanto no banco.

Consulte [SeguranÃ§a e operaÃ§Ã£o](docs/security.md) antes de preparar o ambiente de produÃ§Ã£o.

## DocumentaÃ§Ã£o dos mÃ³dulos

- [SeguranÃ§a e operaÃ§Ã£o](docs/security.md)
- [Dashboard](docs/dashboard-api.md)
- [Recrutamento](docs/recruitment-api.md)
- [CalendÃ¡rio](docs/calendar-api.md)
- [Treinamentos e provas](docs/trainings-api.md)
- [Jornadas e onboarding](docs/journeys-api.md)
- [GestÃ£o de desempenho](docs/evaluations-api.md)
- [PDI e carreira](docs/development-api.md)
- [NotificaÃ§Ãµes e pendÃªncias](docs/notifications-api.md)
- [UsuÃ¡rios e acessos](docs/users-api.md)

## Comandos

- `npm run dev`: desenvolvimento com recarregamento automÃ¡tico
- `npm run build`: compila o TypeScript
- `npm test`: compila e executa os testes automatizados
- `npm run test:integration:security`: valida sessÃµes, RBAC, empresas e privilÃ©gios PostgreSQL
- `npm run test:integration:mfa`: valida TOTP, recuperação e proteção contra replay
- `npm run test:integration:recruitment`: valida recrutamento no PostgreSQL
- `npm run test:integration:calendar`: valida calendÃ¡rio no PostgreSQL
- `npm run test:integration:trainings`: valida treinamentos no PostgreSQL
- `npm run test:integration:journeys`: valida jornadas e suas integraÃ§Ãµes
- `npm run test:integration:evaluations`: valida desempenho e feedback
- `npm run test:integration:development`: valida PDI e carreira
- `npm run test:integration:notifications`: valida notificaÃ§Ãµes e pendÃªncias
- `npm run db:status`: mostra tabelas e migrations sem alterar o banco
- `npm run db:permissions`: mostra os privilÃ©gios do usuÃ¡rio conectado
- `npm run db:migrate`: compila e aplica migrations pendentes
- `npm run db:provision-app-role`: cria ou restringe o usuÃ¡rio PostgreSQL da API
- `npm run db:seed`: compila e cria ou atualiza o administrador inicial
- `npm start`: executa a versÃ£o compilada
