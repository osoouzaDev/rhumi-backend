# API de Gestão de Desempenho

Todas as rotas usam o prefixo `/api/v1/evaluations` e exigem autenticação.

## Permissões

- `evaluations.manage`: gerencia ciclos, participantes, avaliações do gestor, metas e feedbacks. Administradores atuam em toda a empresa; supervisores ficam limitados ao próprio departamento.
- `evaluations.self.respond`: permite ao colaborador consultar suas avaliações, enviar a autoavaliação e atualizar o progresso das metas.

## Ciclos e competências

- `GET /api/v1/evaluations/cycles`
- `POST /api/v1/evaluations/cycles`
- `GET /api/v1/evaluations/cycles/:id`
- `PATCH /api/v1/evaluations/cycles/:id`
- `DELETE /api/v1/evaluations/cycles/:id`

A listagem aceita `page`, `pageSize`, `search`, `departmentId` e `status`.

Exemplo de criação:

```json
{
  "departmentId": "df14a8b5-8281-4e9d-b52a-646279a68f15",
  "code": "DESEMPENHO-2026",
  "name": "Avaliação anual 2026",
  "description": "Ciclo anual de avaliação de desempenho.",
  "status": "active",
  "startsOn": "2026-08-01",
  "selfReviewDeadline": "2026-08-31",
  "managerReviewDeadline": "2026-09-15",
  "feedbackDeadline": "2026-09-30",
  "selfWeight": 30,
  "managerWeight": 70,
  "competencies": [
    {
      "name": "Colaboração",
      "description": "Coopera com a equipe e compartilha conhecimento.",
      "category": "behavioral",
      "weight": 40
    },
    {
      "name": "Qualidade das entregas",
      "description": "Entrega resultados com qualidade e previsibilidade.",
      "category": "technical",
      "weight": 60
    }
  ]
}
```

Os pesos das competências precisam somar 100. Os pesos da autoavaliação e do gestor também precisam somar 100.

Estados do ciclo: `draft`, `scheduled`, `active`, `completed` e `cancelled`. As competências não podem ser substituídas depois que o ciclo recebe participantes.

## Participantes

`POST /api/v1/evaluations/cycles/:id/participants`

```json
{
  "participants": [
    {
      "employeeId": "f23219a8-9baf-44ae-a2d0-ad0261628d82",
      "evaluatorEmployeeId": "60cef2c5-54bb-415a-896d-41544c5899fd"
    }
  ]
}
```

O colaborador e o avaliador precisam estar ativos e pertencer ao mesmo departamento. Participantes repetidos no ciclo são ignorados com segurança.

## Gestão das avaliações

- `GET /api/v1/evaluations/assignments`
- `GET /api/v1/evaluations/assignments/:id`
- `DELETE /api/v1/evaluations/assignments/:id`
- `POST /api/v1/evaluations/assignments/:id/manager-review`
- `PUT /api/v1/evaluations/assignments/:id/feedback`
- `POST /api/v1/evaluations/assignments/:id/feedback/complete`

A avaliação do gestor recebe uma resposta para cada competência, além de forças, pontos de melhoria e ações de desenvolvimento. A nota final usa os pesos configurados no ciclo.

O agendamento do feedback cria ou atualiza um evento `evaluation` no calendário e inclui colaborador e avaliador como participantes.

## Metas de desempenho

- `POST /api/v1/evaluations/assignments/:id/goals`
- `PATCH /api/v1/evaluations/assignments/:id/goals/:goalId`
- `DELETE /api/v1/evaluations/assignments/:id/goals/:goalId`

As metas possuem título, descrição, critério de sucesso, peso, data-alvo, estado e percentual de progresso. A soma dos pesos ativos não pode ultrapassar 100.

## Área do colaborador

- `GET /api/v1/evaluations/me`
- `GET /api/v1/evaluations/me/:id`
- `POST /api/v1/evaluations/me/:id/self-review`
- `PATCH /api/v1/evaluations/me/:id/goals/:goalId`

A autoavaliação exige uma nota de 1 a 5 para todas as competências do ciclo. Antes da conclusão do feedback, notas e comentários do gestor não são expostos ao colaborador. Após a conclusão, o histórico completo e a nota final ficam disponíveis.

Estados da avaliação: `pending`, `self_review`, `manager_review`, `feedback_pending`, `completed` e `cancelled`.
