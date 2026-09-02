UPDATE permissions
SET description = 'Consultar e organizar as próprias notificações'
WHERE code = 'notifications.read'
  AND description <> 'Consultar e organizar as próprias notificações';
