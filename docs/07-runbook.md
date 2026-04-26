# 07 · Runbook · errores comunes

Guía de troubleshooting de los problemas más típicos.

## Setup local

### `Can't reach database server at localhost:5432`

Postgres todavía no está listo o no levantó.

```bash
docker ps                      # tiene que aparecer chui-postgres con status "Up"
docker compose up -d           # si no aparece, levantarlo
docker logs chui-postgres      # ver qué dice
```

Si Docker Desktop no está corriendo, abrilo desde Aplicaciones primero.

### `port 5432 already in use`

Tenés otro Postgres en tu Mac. Dos opciones:

```bash
# Opción A: apagar el otro postgres (Homebrew)
brew services stop postgresql

# Opción B: cambiar el puerto del docker
# Editar docker-compose.yml -> "5433:5432"
# Editar .env -> DATABASE_URL=postgresql://chui:chui@localhost:5433/chui_loyalty?schema=public
```

### `npm install` falla

```bash
rm -rf node_modules package-lock.json
npm install --no-audit --no-fund
```

Si sigue fallando, verificá `node --version` (tiene que ser v20+).

### Migraciones fallan al primer run

```bash
docker compose down -v      # borra el volumen
docker compose up -d
sleep 5
npm run prisma:migrate      # init
npm run seed
```

## Pases de wallet

### "Apple Wallet certs are not configured"

Falta cargar los certificados o las variables del `.env`. Mirá [`05-external-services.md`](05-external-services.md).

### El `.pkpass` no abre en iPhone

- Verificá que el HTTPS sea de CA pública (no self-signed).
- Confirmá que `passTypeIdentifier` y `teamIdentifier` en el código matcheen a tu Pass Type ID real.
- Mirá los logs: a veces falta el WWDR cert o tiene formato incorrecto.

### El botón "Add to Google Wallet" tira 401

- `GOOGLE_WALLET_ISSUER_ID` mal configurado.
- El service account no tiene rol `Wallet Object Issuer`.
- El JSON del service account no es el correcto (verificá `client_email` y `private_key`).

## POS web

### La cámara no se abre al escanear QR

- En localhost funciona. **En producción exige HTTPS**: el browser bloquea `getUserMedia` en HTTP.
- En Safari iOS: revisá Settings → Safari → Camera → Allow.

### El QR del pase no se detecta

- El QR del pase es chico. Acercar el iPad a 10–15 cm.
- jsQR funciona mejor con buena iluminación. Si está oscuro, encender la lámpara del local.

## Push de campañas

### `[apns] session error`

- El Pass Type ID Certificate venció o está mal cargado.
- Revisá fechas: `openssl x509 -in certs/pass.pem -noout -dates`.

### Push se manda pero el iPhone no lo recibe

- El device tiene que estar **registrado** primero (la primera vez que el cliente abre el pase).
- En desarrollo, Apple usa `api.development.push.apple.com`. En producción, `api.push.apple.com`. El código hace switch automático por `NODE_ENV`.

## Operacional

### Quiero cambiar la contraseña de un staff user

```bash
npm run prisma:studio
# tabla StaffUser → editar passwordHash
# pero el hash es argon2, no podés escribirlo a mano.
# Mejor: scripts ad-hoc en Node.
```

Idealmente: agregar un endpoint admin de "reset password". TODO.

### Quiero crear un nuevo tenant

Por ahora editar el seed. Próximamente: endpoint `POST /v1/admin/tenants`.

### Quiero exportar todos los clientes de un tenant

```bash
npm run prisma:studio
# filtrar Customer por tenantId
# o: query SQL directo
```

Endpoint de export TODO.

## Cuándo escalar / pedir ayuda

- Si Apple rechaza VAS varias veces, hablar con un consultor que haya pasado por eso (hay agencias especializadas).
- Si Google Wallet pasa más de 14 días "pending", abrir ticket en pay.google.com/business/console.
- Si hosting empieza a caer en horas pico, mover a Fly.io con multi-región o subir el plan de Render.
