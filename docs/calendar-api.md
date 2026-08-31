# API de Calendário Corporativo

Todas as rotas usam o prefixo `/api/v1/calendar` e exigem autenticação.

## Permissões

- `calendar.read`: consulta eventos acessíveis ao usuário.
- `calendar.manage`: cria, altera e remove eventos. Administradores gerenciam toda a empresa; supervisores ficam limitados ao próprio departamento ou aos eventos que criaram.
- `calendar.respond`: permite ao colaborador aceitar, recusar ou marcar como talvez um convite recebido.

Eventos com visibilidade `company` são vistos por toda a empresa. Eventos `department` são vistos pelo departamento indicado. Eventos `participants` são vistos apenas pelo criador e pelos participantes convidados.

## Categorias

`meeting`, `training`, `interview`, `deadline`, `holiday`, `birthday`, `onboarding`, `evaluation` e `other`.

## Listar eventos

`GET /api/v1/calendar/events`

Parâmetros obrigatórios:

- `from`: início do período em ISO 8601 com fuso horário.
- `to`: fim do período em ISO 8601 com fuso horário. O intervalo máximo é de 366 dias.

Filtros opcionais: `search`, `departmentId`, `eventType`, `status`, `page` e `pageSize`.

Exemplo:

```http
GET /api/v1/calendar/events?from=2026-08-01T00:00:00-04:00&to=2026-09-01T00:00:00-04:00&eventType=meeting
```

## Próximos eventos

`GET /api/v1/calendar/events/upcoming?limit=10`

Aceita também o filtro opcional `eventType`.

## Consultar evento

`GET /api/v1/calendar/events/:id`

O retorno contém departamento, organizador e participantes com suas respostas.

## Criar evento

`POST /api/v1/calendar/events`

```json
{
  "departmentId": "uuid-do-departamento",
  "title": "Reunião semanal do RH",
  "description": "Acompanhamento das atividades da equipe.",
  "eventType": "meeting",
  "visibility": "department",
  "location": "Sala 2",
  "meetingUrl": null,
  "startsAt": "2026-09-01T09:00:00-04:00",
  "endsAt": "2026-09-01T10:00:00-04:00",
  "allDay": false,
  "timezone": "America/Cuiaba",
  "attendeeEmployeeIds": ["uuid-do-colaborador"]
}
```

O término deve ser posterior ao início. Participantes precisam pertencer à mesma empresa e não podem estar inativos.

## Atualizar ou cancelar

`PATCH /api/v1/calendar/events/:id`

Aceita os mesmos campos da criação. Para cancelar sem excluir o registro, envie:

```json
{
  "status": "cancelled"
}
```

Ao enviar `attendeeEmployeeIds`, a lista atual de convidados é substituída integralmente.

## Responder convite

`PATCH /api/v1/calendar/events/:id/response`

```json
{
  "response": "accepted"
}
```

Respostas válidas: `accepted`, `declined` e `tentative`. Somente um participante convidado pode responder, e o evento precisa estar agendado.

## Remover evento

`DELETE /api/v1/calendar/events/:id`

Retorna `204` e realiza exclusão lógica. Todas as criações, alterações, respostas e remoções são registradas na auditoria.
