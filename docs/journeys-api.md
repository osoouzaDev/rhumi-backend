# API de jornadas e onboarding

Todas as rotas usam o prefixo `/api/v1/journeys` e exigem autenticação.

## Permissões e escopo

- `journeys.manage`: administra modelos, atribuições e tarefas. Administradores atuam em toda a empresa; supervisores ficam limitados ao próprio departamento.
- `journeys.self.read`: permite ao colaborador consultar as próprias jornadas e atualizar as tarefas sob sua responsabilidade.

Modelos corporativos, sem `departmentId`, podem ser atribuídos a qualquer departamento. Modelos departamentais só podem ser usados com colaboradores do mesmo departamento.

## Modelos reutilizáveis

- `GET /api/v1/journeys/templates`
- `POST /api/v1/journeys/templates`
- `GET /api/v1/journeys/templates/:id`
- `PATCH /api/v1/journeys/templates/:id`
- `DELETE /api/v1/journeys/templates/:id`

A listagem aceita `page`, `pageSize`, `search`, `departmentId`, `kind` e `status`.

Exemplo de criação:

```json
{
  "departmentId": "df14a8b5-8281-4e9d-b52a-646279a68f15",
  "code": "ONBOARDING-30",
  "name": "Onboarding de 30 dias",
  "description": "Integração estruturada para novos colaboradores.",
  "kind": "onboarding",
  "durationDays": 30,
  "status": "published",
  "stages": [
    {
      "name": "Boas-vindas",
      "startsAfterDays": 0,
      "tasks": [
        {
          "title": "Ler o guia do colaborador",
          "taskType": "document",
          "responsible": "collaborator",
          "required": true,
          "dueAfterDays": 0,
          "resourceUrl": "https://example.com/guia"
        },
        {
          "title": "Alinhamento com a liderança",
          "taskType": "meeting",
          "responsible": "owner",
          "dueAfterDays": 1,
          "meetingTime": "09:00",
          "meetingDurationMinutes": 30
        },
        {
          "title": "Concluir treinamento institucional",
          "taskType": "training",
          "responsible": "collaborator",
          "dueAfterDays": 5,
          "trainingId": "2a379dd2-8a9c-4788-9060-46ed0cb75f0b"
        }
      ]
    }
  ]
}
```

Tipos de modelo: `onboarding`, `offboarding`, `development` e `custom`. Estados: `draft`, `published` e `archived`.

As etapas de um modelo já atribuído não podem ser substituídas, preservando o histórico das jornadas existentes.

## Atribuições e acompanhamento

- `GET /api/v1/journeys/assignments`
- `POST /api/v1/journeys/assignments`
- `GET /api/v1/journeys/assignments/:id`
- `PATCH /api/v1/journeys/assignments/:id`
- `DELETE /api/v1/journeys/assignments/:id`
- `PATCH /api/v1/journeys/assignments/:id/tasks/:taskId`

Exemplo de atribuição:

```json
{
  "templateId": "9fe7f5b9-f108-4972-9368-e0fba9076b71",
  "employeeId": "f23219a8-9baf-44ae-a2d0-ad0261628d82",
  "ownerEmployeeId": "60cef2c5-54bb-415a-896d-41544c5899fd",
  "startsOn": "2026-08-28",
  "notes": "Acompanhamento da nova contratação."
}
```

`startsOn` usa a data atual quando omitida. `ownerEmployeeId` usa o colaborador autenticado quando omitido. A data-alvo é calculada pela duração do modelo.

Estados da jornada: `planned`, `in_progress`, `completed`, `overdue` e `cancelled`. O progresso e os estados `completed` e `overdue` são sincronizados automaticamente.

## Área do colaborador

- `GET /api/v1/journeys/me`
- `GET /api/v1/journeys/me/:id`
- `PATCH /api/v1/journeys/me/:id/tasks/:taskId`

O colaborador pode iniciar, concluir ou bloquear apenas tarefas atribuídas a ele. Tarefas obrigatórias não podem ser ignoradas e tarefas de treinamento são concluídas automaticamente pelo módulo de treinamentos.

## Automações

- Tarefas `meeting` criam um evento de onboarding no calendário, com colaborador e responsável como participantes.
- Tarefas `training` procuram a próxima turma aberta, com vaga e compatível com o departamento. Quando encontrada, a inscrição é criada e vinculada à jornada.
- Ao concluir a inscrição no treinamento, a tarefa correspondente e o progresso da jornada são atualizados automaticamente na próxima consulta.
- O cancelamento da jornada também cancela seus eventos de reunião.
