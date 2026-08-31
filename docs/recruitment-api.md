# API de Recrutamento e Seleção

Todas as rotas usam o prefixo `/api/v1/recruitment` e exigem a permissão `recruitment.manage`.

## Vagas

- `GET /vacancies` — lista e filtra vagas
- `POST /vacancies` — cria uma vaga
- `GET /vacancies/:id` — consulta uma vaga e os totais por etapa
- `PATCH /vacancies/:id` — atualiza ou publica uma vaga
- `DELETE /vacancies/:id` — arquiva uma vaga sem candidaturas ativas
- `GET /vacancies/:id/board` — retorna o quadro Kanban

Filtros disponíveis: `search`, `departmentId`, `positionId`, `status`, `contractType`, `workModel`, `page` e `pageSize`.

## Candidatos

- `GET /candidates` — lista candidatos e ranking
- `POST /candidates` — cadastra candidato
- `GET /candidates/:id` — consulta candidato e suas candidaturas
- `PATCH /candidates/:id` — atualiza candidato
- `DELETE /candidates/:id` — arquiva candidato sem candidaturas ativas

A listagem aceita `vacancyId`, `stage`, `minScore`, `sortBy` e `sortOrder`, além de busca e paginação.

## Candidaturas e Kanban

- `POST /vacancies/:id/applications` — vincula candidato à vaga aberta
- `GET /applications` — lista candidaturas
- `GET /applications/:id` — consulta candidatura e histórico de etapas
- `PATCH /applications/:id` — altera etapa, pontuação, status ou observações
- `DELETE /applications/:id` — retira a candidatura

Etapas disponíveis:

1. `applied`
2. `screening`
3. `interview`
4. `assessment`
5. `offer`
6. `hired`
7. `rejected`

Cada mudança de etapa registra data, responsável e observação. Ao atingir a quantidade de contratações definida em `openings`, a vaga aberta é encerrada automaticamente.
