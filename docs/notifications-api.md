# API de notificações e pendências

Base: `/api/v1/notifications`. Todas as rotas exigem autenticação.

## Central do usuário

### Listar notificações

`GET /api/v1/notifications`

Permissão: `notifications.read`.

Filtros disponíveis:

- `page` e `pageSize`;
- `search`;
- `type`: `journey`, `training`, `calendar`, `evaluation`, `development`, `recruitment`, `announcement` ou `system`;
- `priority`: `low`, `normal`, `high` ou `urgent`;
- `status`: `all`, `unread` ou `read`;
- `includeResolved`: inclui o histórico de pendências concluídas quando `true`;
- `dueBefore`: limita pelo prazo em ISO 8601.

Antes da listagem, o backend sincroniza as obrigações atuais do usuário. A operação é idempotente: abrir a central novamente não duplica notificações nem apaga o estado de leitura.

Cada item informa `readAt`, `resolvedAt`, `isOverdue`, `dueAt`, `actionUrl`, a origem e os metadados necessários para o frontend direcionar o usuário.

### Resumo

`GET /api/v1/notifications/summary`

Retorna `total`, `unread`, `read`, `urgent`, `overdue`, `dueToday` e `byType`.

### Organizar a caixa de entrada

- `PATCH /api/v1/notifications/:id/read`: marcar como lida;
- `PATCH /api/v1/notifications/:id/unread`: marcar como não lida;
- `POST /api/v1/notifications/read-all`: marcar todas as notificações ativas como lidas;
- `DELETE /api/v1/notifications/:id`: remover da caixa de entrada do usuário.

Uma pendência concluída recebe `resolvedAt` automaticamente e deixa a caixa ativa, mas permanece acessível com `includeResolved=true`. Uma notificação removida manualmente não volta a aparecer durante a sincronização da mesma origem.

## Origens automáticas

A central consolida:

- tarefas de jornada e onboarding sob responsabilidade do usuário;
- treinamentos atribuídos e ainda não concluídos;
- convites do calendário aguardando resposta;
- autoavaliações, avaliações do gestor e feedbacks pendentes;
- ações de PDI sob responsabilidade do usuário;
- candidaturas ativas criadas pelo recrutador autenticado.

Prazos vencidos recebem prioridade `urgent`. Itens bloqueados ou próximos do vencimento recebem prioridade `high`.

## Preferências

- `GET /api/v1/notifications/preferences`;
- `PUT /api/v1/notifications/preferences`.

Exemplo de atualização:

```json
{
  "inAppEnabled": true,
  "emailEnabled": false,
  "digestFrequency": "daily",
  "reminderDays": [0, 1, 3, 7],
  "notifyLowPriority": true,
  "quietHoursStart": "22:00",
  "quietHoursEnd": "07:00",
  "timezone": "America/Cuiaba"
}
```

O canal em aplicativo está funcional. As opções de e-mail e resumo deixam o contrato e o banco preparados para a futura integração com um provedor de mensagens.

## Comunicados internos

`POST /api/v1/notifications/announcements`

Permissão: `notifications.manage`.

O público pode ser:

- `company`: toda a empresa, exclusivo para administrador;
- `department`: um setor; supervisor só pode selecionar o próprio;
- `employees`: uma lista de `employeeIds`; supervisor permanece limitado ao próprio setor.

Exemplo:

```json
{
  "audienceType": "department",
  "departmentId": "00000000-0000-0000-0000-000000000000",
  "title": "Manutenção programada",
  "description": "O portal ficará indisponível durante a janela informada.",
  "priority": "high",
  "actionUrl": "https://intranet.example.com/status",
  "expiresAt": "2026-09-01T12:00:00-04:00"
}
```

A resposta informa `deliveredCount`. Somente contas e colaboradores ativos recebem o comunicado, e a publicação é registrada na auditoria.

## Painel principal

`GET /api/v1/dashboard` inclui `notifications` com:

- `unreadNotifications`;
- `urgentNotifications`;
- `overdueNotifications`;
- `dueTodayNotifications`.
