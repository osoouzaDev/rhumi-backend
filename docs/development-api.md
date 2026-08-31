# API de PDI e Plano de Carreira

Todas as rotas usam o prefixo `/api/v1/development` e exigem autenticação.

## Permissões

- `development.manage`: gerencia trilhas, perfis de carreira e PDIs. Administradores atuam em toda a empresa; supervisores ficam limitados ao próprio departamento.
- `development.self.read`: permite ao colaborador consultar a própria carreira, acompanhar o PDI e atualizar ações sob sua responsabilidade.

## Trilhas de carreira

- `GET /api/v1/development/career-tracks`
- `POST /api/v1/development/career-tracks`
- `GET /api/v1/development/career-tracks/:id`
- `PATCH /api/v1/development/career-tracks/:id`
- `DELETE /api/v1/development/career-tracks/:id`

Uma trilha contém níveis ordenados. Cada nível é associado a um cargo e informa competências, experiência mínima, requisitos e treinamentos recomendados ou obrigatórios.

```json
{
  "departmentId": "df14a8b5-8281-4e9d-b52a-646279a68f15",
  "code": "TRILHA-TECH",
  "name": "Carreira em Tecnologia",
  "description": "Trilha de evolução da equipe de tecnologia.",
  "status": "published",
  "levels": [
    {
      "positionId": "f92bef0e-1304-4c39-a5ae-55d5896d8d72",
      "name": "Desenvolvedor Júnior",
      "description": "Nível inicial da carreira de desenvolvimento.",
      "minimumMonthsExperience": 0,
      "competencies": [
        {
          "name": "Qualidade de código",
          "description": "Produz código legível, testado e sustentável.",
          "category": "technical",
          "requiredLevel": 3
        }
      ],
      "trainings": []
    }
  ]
}
```

Estados: `draft`, `published` e `archived`. Os níveis de uma trilha já atribuída não podem ser substituídos.

## Perfil de carreira

- `GET /api/v1/development/career-profiles/:employeeId`
- `PUT /api/v1/development/career-profiles/:employeeId`
- `GET /api/v1/development/me/career`

O perfil relaciona o colaborador à trilha, ao nível atual e ao nível desejado. O nível atual deve corresponder ao cargo do colaborador e o nível desejado precisa ser posterior.

`readinessPercent` representa a prontidão para o nível desejado. Quando o PDI está vinculado ao mesmo nível, a prontidão é sincronizada automaticamente com seu progresso.

## Planos de desenvolvimento

- `GET /api/v1/development/plans`
- `POST /api/v1/development/plans`
- `GET /api/v1/development/plans/:id`
- `PATCH /api/v1/development/plans/:id`
- `DELETE /api/v1/development/plans/:id`
- `PATCH /api/v1/development/plans/:id/actions/:actionId`

Um PDI pode ser vinculado a uma avaliação de desempenho concluída e a um nível desejado da trilha de carreira.

```json
{
  "employeeId": "f23219a8-9baf-44ae-a2d0-ad0261628d82",
  "managerEmployeeId": "60cef2c5-54bb-415a-896d-41544c5899fd",
  "evaluationAssignmentId": "16451cfe-83d9-46ee-aad2-63bed5414828",
  "targetCareerLevelId": "f12e55c6-6685-4ed5-88e9-8ceca9704039",
  "title": "PDI para evolução técnica",
  "description": "Plano focado nas competências identificadas na avaliação.",
  "focusAreas": "Qualidade técnica, mentoria e comunicação.",
  "status": "active",
  "startsOn": "2026-08-28",
  "targetEndOn": "2026-12-31",
  "objectives": [
    {
      "title": "Preparação para especialista",
      "description": "Desenvolver competências do próximo nível.",
      "successCriteria": "Concluir todas as ações e aplicar os aprendizados.",
      "weight": 100,
      "targetDate": "2026-12-15",
      "actions": [
        {
          "actionType": "training",
          "title": "Treinamento obrigatório",
          "description": "Concluir o treinamento da trilha.",
          "dueAt": "2026-10-01T12:00:00-04:00",
          "trainingId": "2a379dd2-8a9c-4788-9060-46ed0cb75f0b"
        },
        {
          "actionType": "mentoring",
          "title": "Mentoria de carreira",
          "description": "Alinhar competências e próximos passos.",
          "dueAt": "2026-09-10T09:00:00-04:00",
          "meetingEndsAt": "2026-09-10T09:30:00-04:00"
        }
      ]
    }
  ]
}
```

Os pesos dos objetivos precisam somar 100. Objetivos e ações devem ficar dentro do período do plano.

Estados do PDI: `draft`, `active`, `completed`, `overdue` e `cancelled`. Planos em rascunho não são exibidos na área do colaborador.

## Área do colaborador

- `GET /api/v1/development/me/plans`
- `GET /api/v1/development/me/plans/:id`
- `PATCH /api/v1/development/me/plans/:id/actions/:actionId`

O colaborador pode atualizar o progresso e as observações apenas das ações sob sua responsabilidade. Ações de treinamento são atualizadas automaticamente pelo módulo de treinamentos.

## Automações

- Ações `training` procuram a próxima turma aberta e compatível com o departamento, criando a inscrição e o convite no calendário.
- Ações `mentoring` criam uma reunião no calendário com colaborador, responsável pelo PDI e mentor.
- A conclusão do treinamento atualiza a ação, o objetivo, o progresso do PDI e a prontidão na trilha.
- O cancelamento do PDI cancela as reuniões de mentoria vinculadas.
