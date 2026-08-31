# API de Treinamentos e Provas

Todas as rotas usam o prefixo `/api/v1/trainings` e exigem autenticação.

## Permissões e escopo

- `trainings.manage`: catálogo, turmas, inscrições, provas e resultados. Administradores atuam na empresa inteira; supervisores ficam limitados ao próprio departamento.
- `trainings.self.read`: área do colaborador, materiais, progresso e realização de provas.

Treinamentos sem `departmentId` são corporativos. Para supervisores, novos treinamentos e turmas são automaticamente associados ao próprio departamento.

## Catálogo de treinamentos

### Listar

`GET /api/v1/trainings`

Filtros: `search`, `departmentId`, `modality`, `status`, `page` e `pageSize`.

Modalidades: `online`, `in_person` e `hybrid`.

Situações: `draft`, `published` e `archived`.

### Criar

`POST /api/v1/trainings`

```json
{
  "departmentId": "uuid-do-departamento",
  "code": "LGPD-001",
  "title": "Fundamentos da LGPD",
  "description": "Treinamento corporativo sobre proteção de dados pessoais.",
  "objectives": "Apresentar os conceitos e responsabilidades da LGPD.",
  "instructor": "Equipe Jurídica",
  "modality": "online",
  "workloadMinutes": 120,
  "coverUrl": null,
  "materials": [
    {
      "title": "Apostila",
      "type": "document",
      "url": "https://example.com/lgpd.pdf"
    }
  ],
  "status": "published"
}
```

Tipos de material: `video`, `document`, `link` e `text`.

### Consultar, atualizar e remover

- `GET /api/v1/trainings/:id`
- `PATCH /api/v1/trainings/:id`
- `DELETE /api/v1/trainings/:id`

Um treinamento com turmas ativas não pode ser removido.

## Turmas

### Listar turmas

`GET /api/v1/trainings/classes`

Filtros: `trainingId`, `departmentId`, `status`, `from`, `to`, `page` e `pageSize`.

### Criar turma

`POST /api/v1/trainings/:id/classes`

```json
{
  "departmentId": "uuid-do-departamento",
  "name": "Turma Setembro",
  "status": "open",
  "startsAt": "2026-09-10T09:00:00-04:00",
  "endsAt": "2026-09-10T11:00:00-04:00",
  "enrollmentDeadline": "2026-09-09T18:00:00-04:00",
  "capacity": 30,
  "location": null,
  "meetingUrl": "https://example.com/reuniao"
}
```

A criação da turma gera automaticamente um evento do tipo `training` no calendário. Alterações de data, local ou situação são sincronizadas com esse evento.

Situações: `draft`, `open`, `in_progress`, `completed` e `cancelled`.

### Consultar, atualizar e remover turma

- `GET /api/v1/trainings/classes/:id`
- `PATCH /api/v1/trainings/classes/:id`
- `DELETE /api/v1/trainings/classes/:id`

Uma turma com inscrições precisa ter essas inscrições canceladas antes da remoção.

## Inscrições

### Atribuir colaboradores

`POST /api/v1/trainings/classes/:id/enrollments`

```json
{
  "employeeIds": ["uuid-do-colaborador"]
}
```

O limite da turma, o prazo de inscrição, a empresa, o departamento e a situação dos colaboradores são validados. Os inscritos também são adicionados ao evento da turma no calendário.

### Listar e cancelar

- `GET /api/v1/trainings/classes/:id/enrollments`
- `DELETE /api/v1/trainings/enrollments/:id`

A listagem informa progresso, melhor nota, tentativas realizadas e situação final.

## Prova do treinamento

### Criar ou substituir

`PUT /api/v1/trainings/:id/exam`

```json
{
  "title": "Avaliação final",
  "instructions": "Selecione as alternativas corretas.",
  "passingScore": 70,
  "maxAttempts": 3,
  "timeLimitMinutes": 30,
  "published": true,
  "questions": [
    {
      "prompt": "A LGPD protege dados pessoais?",
      "questionType": "true_false",
      "points": 1,
      "options": [
        { "text": "Verdadeiro", "isCorrect": true },
        { "text": "Falso", "isCorrect": false }
      ]
    }
  ]
}
```

Tipos de questão: `single_choice`, `multiple_choice` e `true_false`.

`GET /api/v1/trainings/:id/exam` retorna a prova completa para gestão. As alternativas corretas nunca são retornadas pela área do colaborador.

## Área do colaborador

- `GET /api/v1/trainings/me/enrollments`
- `GET /api/v1/trainings/me/enrollments/:id`
- `PATCH /api/v1/trainings/me/enrollments/:id/progress`
- `GET /api/v1/trainings/me/enrollments/:id/exam`
- `POST /api/v1/trainings/me/enrollments/:id/attempts`

Atualização de progresso:

```json
{
  "progressPercent": 80
}
```

Envio da prova:

```json
{
  "answers": [
    {
      "questionId": "uuid-da-questao",
      "selectedOptionIds": ["uuid-da-alternativa"]
    }
  ]
}
```

A correção é automática e considera o peso de cada questão. O retorno informa nota, aprovação, quantidade de acertos e tentativas restantes. Em caso de aprovação, a inscrição é concluída automaticamente.

Todas as operações administrativas, atualizações de progresso e tentativas são registradas na auditoria.
