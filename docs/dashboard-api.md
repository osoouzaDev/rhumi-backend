# API do dashboard

`GET /api/v1/dashboard` exige autenticação e a permissão `dashboard.read`.

Administradores recebem indicadores de toda a empresa. Supervisores e outros perfis autorizados recebem apenas os dados do próprio departamento.

## Núcleo organizacional

O dashboard retorna:

- `employees`: total, ativos, afastados, inativos e admissões dos últimos 30 dias;
- `organization`: departamentos e cargos ativos;
- `accounts`: contas ativas, bloqueadas, inativas e colaboradores sem conta;
- `headcountByDepartment`: quadro por departamento;
- `contractDistribution`: distribuição entre contratos `clt` e `pj`;
- `recentHires`: até cinco admissões recentes.

## Recrutamento

O campo `recruitment` informa vagas abertas, candidaturas ativas, candidatos, contratações dos últimos 30 dias e a distribuição do Kanban por etapa.

## Calendário

O campo `calendar` informa eventos de hoje, eventos dos próximos sete dias e convites aguardando resposta.

## Treinamentos e provas

O campo `trainings` informa treinamentos publicados, turmas ativas, treinamentos pendentes do usuário e taxa de conclusão.

## Jornadas e onboarding

O campo `journeys` informa jornadas ativas ou atrasadas, jornadas do usuário e tarefas sob sua responsabilidade.

## Gestão de desempenho

O campo `evaluations` informa ciclos ativos, autoavaliações pendentes, avaliações aguardando o gestor e taxa de conclusão.

## PDI e carreira

O campo `development` informa trilhas publicadas, PDIs ativos ou atrasados e ações pendentes do usuário.

## Notificações e pendências

O campo `notifications` informa:

- `unreadNotifications`: notificações ativas ainda não lidas;
- `urgentNotifications`: pendências urgentes;
- `overdueNotifications`: pendências com prazo ultrapassado;
- `dueTodayNotifications`: pendências previstas para o dia atual.

A consulta ao dashboard também sincroniza a central do usuário sem criar duplicatas.

## Escopo

`scope.type` é `company` para administrador e `department` para os demais perfis. `generatedAt` informa o instante de geração dos indicadores.
