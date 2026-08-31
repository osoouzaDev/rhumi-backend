# API de contas e permissões

Todas as rotas usam o prefixo `/api/v1/users`, exigem autenticação e a permissão RBAC indicada.

## Consultas

- `GET /` — lista contas (`users.list`)
- `GET /:id` — consulta uma conta (`users.list`)
- `GET /roles` — lista perfis disponíveis para a empresa (`users.list`)
- `GET /permissions` — lista permissões disponíveis (`users.list`)

A listagem aceita `page`, `pageSize`, `search`, `status` e `roleCode`.

## Criar conta

`POST /` exige `users.create`.

```json
{
  "employeeId": "9fe7f5b9-f108-4972-9368-e0fba9076b71",
  "password": "uma-senha-com-12-ou-mais-caracteres",
  "roleCodes": ["collaborator"],
  "permissionOverrides": [
    {
      "permissionCode": "employees.read",
      "effect": "allow"
    }
  ]
}
```

O colaborador deve pertencer à empresa autenticada, estar ativo e ainda não possuir uma conta ativa. Uma conta anteriormente excluída é restaurada com todas as sessões antigas revogadas.

## Atualizar acesso

`PATCH /:id` exige `users.update`.

```json
{
  "status": "active",
  "roleCodes": ["supervisor"],
  "permissionOverrides": [
    {
      "permissionCode": "employees.create",
      "effect": "deny"
    }
  ]
}
```

Campos aceitos: `status`, `password`, `roleCodes` e `permissionOverrides`. Quando enviados, `roleCodes` e `permissionOverrides` substituem integralmente as atribuições anteriores. Toda alteração de acesso revoga as sessões ativas da conta.

Não é permitido bloquear a própria conta, alterar os próprios perfis ou remover o último administrador ativo da empresa.

## Excluir conta

`DELETE /:id` exige `users.delete`. A exclusão é lógica, mantém o cadastro do colaborador e revoga todas as sessões da conta. Um administrador não pode excluir a própria conta nem o último administrador ativo.
