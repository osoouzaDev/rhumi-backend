# Programa de teste de invasão

O CI executa auditoria de dependências e CodeQL. O workflow dast.yml executa OWASP ZAP somente contra STAGING_BASE_URL; essa URL deve apontar para um ambiente isolado e formalmente autorizado.

Antes de cada release relevante:

- confirmar isolamento entre empresas e tentativa de troca de identificadores;
- testar autenticação, recuperação, ativação, MFA, rotação e revogação de sessão;
- testar RBAC, elevação horizontal/vertical e endpoints administrativos;
- tentar upload poliglota, MIME falso, arquivo excessivo, malware de teste EICAR em homologação e path traversal;
- verificar expiração, revogação, concorrência e limite dos links de arquivo;
- verificar CSRF, CORS, SSRF, injeção SQL, XSS refletido, mass assignment e rate limits;
- revisar vazamento de PII em logs, erros, métricas, exports e backups;
- validar TLS, cabeçalhos, cookies e ausência de segredos na imagem;
- testar indisponibilidade de banco, Redis, SMTP, ClamAV e encerramento gracioso.

Ao menos anualmente e antes de mudanças críticas, contrate teste independente com escopo, janela, contatos e autorização assinada. Achados devem ter severidade, evidência reproduzível, responsável, prazo, correção e reteste. Nunca execute DAST ativo contra produção sem autorização específica.
