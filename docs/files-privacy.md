# Arquivos privados e LGPD

## Arquivos

POST /api/v1/files recebe multipart/form-data com o arquivo no campo file e os campos purpose, ownerEmployeeId opcional e retentionUntil opcional.

O conteúdo fica fora da árvore pública, com nome interno aleatório, permissão de arquivo restrita, hash SHA-256, limite de tamanho, lista explícita de tipos e validação de assinatura. Em produção, FILE_ANTIVIRUS_ENABLED=true é obrigatório e o ClamAV precisa estar acessível.

Downloads autenticados usam GET /api/v1/files/:id/download. Links compartilháveis são criados por POST /api/v1/files/:id/links; o token é armazenado somente como hash, expira e tem limite de downloads. O link público não permite listagem nem revela o caminho interno.

O worker de retenção remove o conteúdo físico, revoga links e mantém um evento de auditoria. O volume de arquivos precisa estar incluído na estratégia de backup ou ser substituído por um driver de armazenamento privado equivalente antes de escalar horizontalmente.

## Consentimentos

Consentimentos são eventos imutáveis. Conceder ou retirar consentimento cria uma nova linha com finalidade, versão da política, base legal, horário e metadados mínimos. O estado atual de uma finalidade é o evento mais recente.

Rotas próprias:

- GET/POST /api/v1/privacy/me/consents
- GET/POST /api/v1/privacy/me/requests

## Direitos do titular

Solicitações podem ser de exportação, anonimização ou exclusão. Administradores autorizados consultam GET /api/v1/privacy/requests e processam PATCH /api/v1/privacy/requests/:id.

A exportação gera JSON privado, com retenção de sete dias, vinculado ao titular. Anonimização e exclusão exigem vínculo inativo e confirmação explícita; identificadores pessoais são substituídos, sessões e MFA são revogados, notificações são removidas e arquivos físicos são apagados. Auditoria, consentimentos e a própria solicitação são preservados conforme a obrigação legal.

O sistema aplica exclusão lógica e anonimização porque registros trabalhistas e de auditoria podem possuir retenção legal. A definição dos prazos e bases legais deve ser revisada pelo encarregado de dados da empresa.
