# API reference (resumen)

Auth:
- Staff (panel admin / web): `Authorization: Bearer <jwt>` obtenido en `POST /v1/auth/staff/login`.
- Terminales (lector NFC en el local): `Authorization: Terminal <api-key>` + `X-Tenant-Id: <tenantId>`.

## Auth
- `POST /v1/auth/staff/login` — body `{ tenantSlug, email, password }` → `{ token, role, tenantId }`.

## Customers
- `POST /v1/customers` — body `{ email?, phone?, firstName?, lastName?, birthDate?, issueCard? }` → crea cliente (y opcional tarjeta).
- `GET /v1/customers/:id` — devuelve cliente con tarjetas y gift cards.
- `GET /v1/customers?q=foo` — búsqueda básica.

## Loyalty cards
- `GET /v1/cards/:id` — datos de la tarjeta (tier, balance, etc).
- `POST /v1/cards/:id/earn` — body `{ amountCents, idempotencyKey?, locationId?, note? }`. Acredita puntos según el tier y reevalúa si sube.
- `POST /v1/cards/:id/redeem` — body `{ rewardId, idempotencyKey? }`. Canjea premio del catálogo.
- `GET /v1/cards/:id/transactions` — historial.

## Tiers
- `GET /v1/tiers` — lista los niveles del tenant.
- `POST /v1/tiers` (manager) — upsert por `rank` (`{ name, rank, qualifyPoints, qualifySpend, discountPct, pointsMultiplier, color }`).

## Rewards
- `GET /v1/rewards`
- `POST /v1/rewards` (manager)

## Gift cards (solo wallet virtual)
- `POST /v1/gift-cards` — body `{ initialAmountCents, customerId?, expiresAt?, pin? }`. Devuelve el record; la entrega se hace mandando el link a `/v1/wallet/gift/:id/apple` o `.../google`.
- `GET /v1/gift-cards/:id`
- `POST /v1/gift-cards/:id/redeem` — `{ amountCents, idempotencyKey? }` (uso programático; el camino normal es por `/v1/terminal/tap`).

## Campañas push (por tier)
- `POST /v1/campaigns` — `{ title, message, targetTierRanks?, scheduledFor? }`. `targetTierRanks` vacío = todos los activos.
- `POST /v1/campaigns/:id/send` — dispara la entrega: actualiza el pase de cada cliente target y cada wallet muestra la notificación en lock screen.
- `GET /v1/campaigns/:id/deliveries` — auditar quién recibió y errores.

## Terminal (NFC)
- `POST /v1/terminal/tap` — `{ nfcToken, saleTotalCents, idempotencyKey }`.
  - Si el token es de loyalty: aplica el descuento del tier, acredita puntos, devuelve los detalles de la venta.
  - Si es gift: descuenta del saldo, devuelve `remainingDueCents` para que el cajero cobre el resto con otro medio.

## Wallet
- `GET /v1/wallet/loyalty/:cardId/apple` — `.pkpass` listo para instalar.
- `GET /v1/wallet/loyalty/:cardId/google` — 302 a `pay.google.com/gp/v/save/<jwt>`.
- `GET /v1/wallet/gift/:giftCardId/apple` y `.../google` — equivalente para gift cards.
- Apple PassKit web service (consumido por iOS, no por humanos):
  - `POST /v1/wallet/apple/v1/devices/.../registrations/...`
  - `DELETE` el mismo path
  - `GET /v1/wallet/apple/v1/devices/:dev/registrations/:passType?passesUpdatedSince=...`
  - `GET /v1/wallet/apple/v1/passes/:passType/:serial`
  - `POST /v1/wallet/apple/v1/log`

## Admin
- `POST /v1/admin/terminals` (manager) — crea un terminal y devuelve `apiKey` UNA sola vez.
- `GET /v1/admin/terminals`
