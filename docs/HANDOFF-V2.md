# HANDOFF · Chuí Loyalty v1 (snapshot 2026-04-26)

Para retomar el proyecto en una sesión nueva. Cubre todo lo que está en producción, accesos, decisiones de diseño y pendientes pensados para v2.

---

## TL;DR (90 segundos)

Plataforma multi-tenant de tarjetas de fidelidad en Apple/Google Wallet. Construida primero para Chuí (restaurante en Buenos Aires) y diseñada para sumar otros tenants sin refactor.

**Producción**:
- App pública: `https://card.chui.com.ar` (redirige al enroll). También `https://chui-loyalty.vercel.app`.
- Admin: `https://card.chui.com.ar/app/admin.html`
- POS cajero: `https://card.chui.com.ar/app/pos.html`
- API: `https://card.chui.com.ar/v1/...`
- Salud: `https://card.chui.com.ar/health`

**Credenciales del owner inicial**: `owner@chui.com` / `chui-change-me-please` (cambiar en producción ya que está documentado acá).

**Estado funcional**:
- Enrollment público funciona end-to-end con país internacional.
- `.pkpass` se firma con cert real (Apple Pass Type ID `pass.com.chui.loyalty`).
- Push de campañas llega al lock screen del iPhone (verificado en iPhone 17 Pro real).
- Geofence en el pase configurable desde admin (lat/lng/mensaje).
- Edición de cliente, duplicado de campaña, eliminado de tiers/rewards/campañas.
- Google Wallet code está implementado pero desactivado (no hay Issuer ID todavía).

---

## Stack y servicios

| Capa | Servicio | Plan | Ownership |
|---|---|---|---|
| Compute | Vercel (Pro) | Existing | Nico |
| DB | Supabase (Pro) | Existing | Nico |
| Repo | GitHub `nicolaskasaks-ui/claude` | Free | Nico |
| Dominio | Hostinger (chui.com.ar) | Existing | Nico |
| Apple Wallet | Apple Developer | $99/año | Nico |

Vercel project: `chui-loyalty` (slug en URL: `chui-loyalty.vercel.app`).
Vercel team/org: `nicolaskasaks-uis-projects`.
Supabase project: `MISC` (id `xespohzcyofyzsiksqrm`, region `us-west-2`). Postgres 17.

Branch git: `claude/loyalty-wallet-nfc-EIywB`. Todo lo nuevo va ahí. Eventualmente merge a `main`.

---

## Arquitectura

```
                     +--------------------+
  Cliente iPhone --> | https://card.chui  |   (Vercel edge)
                     |    .com.ar         |
                     +---------+----------+
                               |
            +------------------+-------------------+
            |                                       |
            v                                       v
     [Static files                           [Catch-all serverless function]
      public/admin.html                       api/index.ts (wraps Fastify)
      public/pos.html                         |
      public/enroll.html                      |  routes/*.ts → services/*.ts
      public/assets/*]                        |
                                              |  prisma client → Supabase pooler
                                              |  (transaction mode, port 6543)
                                              |  schema=chui_loyalty
                                              v
                                        Supabase Postgres
                                        (project MISC, schema chui_loyalty)
```

- Fastify se monta dentro de Vercel via `api/index.ts` que recibe TODO request bajo `/api/*`. `vercel.json` `routes` (legacy) reescribe `/v1/*` → `/api/v1/*` y `/health` → `/api/health`. Adentro, el handler emite el evento `request` directo al `app.server` de Fastify.
- Static files se sirven desde `public/` por el CDN de Vercel sin pasar por la función.
- Apple Wallet web service para registrations/updates está bajo `/v1/wallet/apple/v1/...` (mismo handler).
- BullMQ + Redis fue diseñado para v0 pero en producción NO se usa (Vercel no soporta long-running). Wallet push ahora va por fire-and-forget con `waitUntil` de `@vercel/functions`. El código de BullMQ está intacto y se activa solo si `REDIS_URL` está definida (útil si en v2 se mueve a un host con worker, ej. Fly).

---

## Base de datos

Todo vive en el schema dedicado `chui_loyalty` dentro del proyecto Supabase MISC. **Importante**: no contaminar el schema `public` (tiene tablas de otras apps).

Modelos (resumido). Definición completa: `prisma/schema.prisma`.

- `Tenant` (multi-tenant root)
  - `slug`, `name`, `brandColor`, `logoUrl`, `currency`, `tierPeriodDays`
  - `latitude`, `longitude`, `relevantText` (geofence, agregado en v1.1)
- `Location`, `StaffUser`, `Customer`
- `Tier` (Silver/Gold/Platinum por tenant)
- `Reward` (catálogo)
- `LoyaltyCard` (la tarjeta del cliente)
- `WalletDevice` (un row por iPhone que tiene el pase instalado, con `pushToken`)
- `Campaign`, `CampaignDelivery`
- `GiftCard` (no usado todavía pero el schema y los services están)
- `Transaction` (ledger append-only de earn/redeem/etc.)
- `Terminal` (registro POS, no usado todavía)

DB connection en producción: pooler de Supabase en `aws-0-us-west-2.pooler.supabase.com:6543`, mode `transaction`, con `pgbouncer=true&connection_limit=1` para serverless. Configurado vía `DATABASE_URL` env var con `?schema=chui_loyalty` al final.

Migraciones: la inicial está aplicada manualmente al schema `chui_loyalty` via Supabase MCP (`apply_migration`). No usar `prisma migrate deploy` apuntando a Supabase; va a tratar de crear las tablas en `public` y va a chocar con tablas existentes. Para futuras migraciones: aplicarlas via Supabase MCP con prefijo de schema explícito, O setear `?search_path=chui_loyalty` y correr migrate.

---

## Apple Wallet

**Pass Type ID**: `pass.com.chui.loyalty`
**Team Identifier**: `A3C449P963`
**Cert válido hasta**: 2027-05-26
**Identidad**: certificado descargado a `/Users/nk/Desktop/chui-loyalty/certs/pass.cer` (convertido a `pass.pem`), key local en `pass.key`, WWDR en `wwdr.pem`. Los archivos están en disk pero **gitignored**. Para deploy vamos por base64 en env vars.

En Vercel, los secretos seteados:
- `APPLE_PASS_TYPE_IDENTIFIER`
- `APPLE_TEAM_IDENTIFIER`
- `APPLE_PASS_CERT_B64` (base64 de `pass.pem`)
- `APPLE_PASS_KEY_B64` (base64 de `pass.key`)
- `APPLE_WWDR_CERT_B64` (base64 de `wwdr.pem`)

`src/lib/secret-loader.ts` lee `_B64` primero; si no, cae al `_PATH` para dev local.

**Visual del pase** (matchea 1:1 al pase Juicy original):
- Background: `rgb(16,40,26)` (verde profundo)
- Foreground/label: `rgb(237,235,226)` (cream)
- Header field: Points
- Secondary fields: Member Name + Last Update
- Strip image: el "Amigo/Friend/Amico... DE CHUÍ" (PNGs en `assets/passes/chui/`)
- Logo: monograma "CH"
- Back fields: announcement (último mensaje de campaña, con `changeMessage="%@"` para que iOS lo muestre en lock screen), Web (chui.com.ar), WhatsApp (+1 415 969 2279), Instagram, OpenTable, ID, Terms.

**Push update**:
1. iPhone instala el pase. Al hacerlo, llama POST `/v1/wallet/apple/v1/devices/{deviceId}/registrations/{passType}/{cardId}` con su `pushToken`. Lo guardamos en `WalletDevice`.
2. Cuando se envía una campaña, `sendCampaign`:
   - Bumpea `LoyaltyCard.updatedAt` para cada card del audience.
   - Llama `enqueuePassUpdate(cardId, ...)` que en Vercel usa `waitUntil` para hacer fire-and-forget con `pushApplePassUpdate(cardId)` (HTTP/2 a `api.push.apple.com` con TLS client cert).
3. iPhone recibe el push, llama GET `/v1/wallet/apple/v1/devices/{deviceId}/registrations/{passType}?passesUpdatedSince=...`. Filtramos por `LoyaltyCard.updatedAt > since` y devolvemos serials.
4. iPhone llama GET `/v1/wallet/apple/v1/passes/{passType}/{serial}` para bajar el `.pkpass` actualizado.
5. iPhone diff-ea los fields y muestra el `changeMessage` del `announcement` field como notificación.

**Geofence**:
- Si `Tenant.latitude` y `Tenant.longitude` están seteados, `buildLoyaltyPass` agrega un `locations` entry al `pass.json`. iOS evalúa proximidad localmente (~100m) y muestra el pase en lock screen. **No requiere APNs**.
- Limitación: solo aplica a pases descargados DESPUÉS de que se configuró la ubicación. Para retrofitear, habría que bumpear `card.updatedAt` masivamente cuando el tenant cambia (no implementado todavía).

---

## Estructura del repo

```
chui-loyalty/
├── api/
│   └── index.ts                 # Vercel serverless adapter para Fastify
├── assets/passes/chui/          # PNGs del pase Apple Wallet (logo, icon, strip)
├── certs/                       # Certs Apple (gitignored)
├── docs/                        # Documentación (incluye este HANDOFF)
├── prisma/
│   ├── schema.prisma            # Modelo de datos
│   ├── migrations/              # Migración inicial (aplicada al schema chui_loyalty)
│   └── seed.ts                  # Tenant Chui + tiers + rewards iniciales
├── public/                      # Estáticos servidos por CDN de Vercel
│   ├── admin.html               # Panel del owner / staff
│   ├── enroll.html              # Landing para clientes
│   ├── pos.html                 # POS para cajeros
│   └── assets/                  # Logos, monograma, QR
├── src/
│   ├── lib/                     # env, prisma, redis, errors, secret-loader, ids, nfc-token
│   ├── middleware/auth.ts       # JWT staff + Terminal API key
│   ├── routes/                  # Routes de Fastify (auth, customers, cards, ...)
│   ├── services/                # Lógica: loyalty, tier-engine, wallet-apple, wallet-google, apns, ...
│   ├── queues/wallet-push.ts    # BullMQ queue (no usado en Vercel pero código intacto)
│   ├── workers/wallet-push.ts   # BullMQ worker (no usado en Vercel)
│   └── server.ts                # buildServer(): Fastify + plugins + routes
├── vercel.json                  # routes (legacy), functions, buildCommand
├── docker-compose.yml           # Postgres + Redis para dev local
├── Dockerfile                   # Para Fly/VPS si se quisiera mover (no usado en prod actual)
└── fly.toml                     # Idem (no usado)
```

**Routes mapeo URL → archivo**:

| URL | Route file | Notas |
|---|---|---|
| `POST /v1/auth/staff/login` | `src/routes/auth.ts` | login email/password, devuelve JWT |
| `GET/POST/PATCH /v1/customers` | `src/routes/customers.ts` | CRUD cliente |
| `GET /v1/cards/:id`, `POST /v1/cards/:id/earn`, `POST /v1/cards/:id/redeem` | `src/routes/cards.ts` | Operaciones POS |
| `GET/POST/PATCH/DELETE /v1/campaigns` y `/duplicate`, `/send`, `/deliveries` | `src/routes/campaigns.ts` | |
| `GET/POST/DELETE /v1/tiers` | `src/routes/tiers.ts` | |
| `GET/POST/PATCH/DELETE /v1/rewards` | `src/routes/rewards.ts` | |
| `GET /v1/admin/transactions`, `/v1/admin/stats`, `GET/PATCH /v1/admin/tenant` | `src/routes/admin.ts` | KPIs + branding + geofence |
| `GET /v1/public/tenants/:slug`, `POST /v1/public/enroll`, `GET /v1/public/tenants/:slug/tiers` | `src/routes/public.ts` | Sin auth, para landing |
| `GET /v1/wallet/loyalty/:id/apple`, `/google` | `src/routes/wallet.ts` | Descarga del pase |
| `POST/DELETE/GET /v1/wallet/apple/v1/...` | `src/routes/wallet.ts` | Apple PassKit web service |
| `POST /v1/terminal/tap` | `src/routes/terminal.ts` | NFC tap (no usado todavía, queda para VAS) |
| `POST /v1/admin/terminals` | `src/routes/terminals-admin.ts` | Create/list terminals |

---

## Cómo correr local

```bash
cd ~/Desktop/chui-loyalty
docker compose up -d                      # Postgres + Redis
cp .env.example .env                      # editar JWT_SECRET y NFC_TOKEN_SECRET
npm install
npm run prisma:migrate                    # crea schema en Postgres local (schema=public)
npm run seed                              # Chui tenant + tiers + rewards + owner
npm run dev                               # arranca Fastify en :3000 con worker inline
```

Probar:
- `http://localhost:3000/health`
- `http://localhost:3000/app/enroll.html?tenant=chui`
- `http://localhost:3000/app/pos.html` (login `owner@chui.com` / `chui-change-me-please`)
- `http://localhost:3000/app/admin.html`

Para que el pase Apple Wallet local genere `.pkpass` válido:
- Copiar `certs/pass.pem`, `certs/pass.key`, `certs/wwdr.pem` (no committeados, los tiene Nico).
- Setear `APPLE_PASS_TYPE_IDENTIFIER`, `APPLE_TEAM_IDENTIFIER`, `APPLE_PASS_CERT_PATH`, `APPLE_PASS_KEY_PATH`, `APPLE_WWDR_CERT_PATH` en `.env`.

---

## Deploy

```bash
cd ~/Desktop/chui-loyalty
npx vercel deploy --prod
```

Vercel CLI ya está logueada como `nicolaskasaks-ui` y el proyecto está linkeado (`.vercel/project.json`).

Si se modifica el schema de Prisma:
1. `npx prisma migrate dev --name <nombre>` local (aplica a Postgres docker, en schema `public`).
2. Aplicar la migración manualmente al Supabase con prefijo `chui_loyalty` via MCP. **No correr `prisma migrate deploy` directo a Supabase** (chocaría con tablas en `public`).
3. `vercel deploy --prod` (Vercel corre `prisma generate` durante el build).

---

## Decisiones de diseño que NO son obvias

- **Schema `chui_loyalty` en lugar de `public`**: porque el proyecto Supabase MISC ya tiene otras apps con tablas que colisionan en nombre (ej. `tenants`, `staff_users`).
- **Vercel `routes` legacy en lugar de `rewrites`**: porque catch-all functions de Vercel solo agarran 1 segmento de path en proyectos no-Next.js. Con `routes` + `handle: filesystem` enrutamos todo al `api/index.ts` con la URL original intacta.
- **`waitUntil` en lugar de `setImmediate`**: en Vercel, `setImmediate` se cancela cuando la función responde. `waitUntil` mantiene viva la función para el push APNs que toma ~1s.
- **No usamos `setNFC` en el pase**: requiere VAS (Apple Value Added Services) que es una aprobación aparte de Apple. Por ahora, todo va por QR del barcode. Cuando Apple apruebe VAS, descomentar y agregar la encryption public key.
- **Tier no se muestra en el pase**: el programa es points-first. El tier afecta perks en el back-office (descuento, multiplier) pero no se renderiza en el front del pase para no clutterear visualmente.
- **Pase Friends Card matchea Juicy 1:1**: las assets PNG (logo, strip) se extrajeron del `.pkpass` original de Juicy y se reusan literalmente para que la transición visual sea invisible para el cliente.
- **Tenants multi-país**: el modelo soporta tener `chui` (BA) y `chui-mx` (México) como tenants distintos, cada uno con sus propias `assets/passes/<slug>/` y branding. El selector de país en el enroll ya maneja clientes internacionales.
- **`brandColor` por defecto en DB es `#0F1B2D` (legacy navy)**: pero el pase usa `rgb(16,40,26)` hardcoded en `wallet-apple.ts`. El `brandColor` afecta solo el gift card pase. **TODO**: si querés que `brandColor` controle el loyalty pass, hay que cambiar `backgroundColor` en `buildLoyaltyPass` para que use `args.tenant.brandColor`.

---

## Lo que falta para "lanzar a clientes" v1

1. **Cambiar la password del owner** desde `card.chui.com.ar/app/admin.html` → Marca → no, ahí no se cambia. **Falta endpoint de cambio de password** (TODO v1.1, fácil: PATCH `/v1/auth/staff/password`).
2. **Definir tiers reales** (los actuales Silver/Gold/Platinum son seed placeholder).
3. **Definir premios reales** (3 placeholder).
4. **Configurar geofence** en Settings con lat/lng del local de Buenos Aires.
5. **Comunicar a clientes Juicy**: mandar email/WhatsApp con `https://card.chui.com.ar` invitando a re-enrolarse. Cuando haya masa crítica, dar de baja Juicy.

## Roadmap propuesto v2

### Quick wins (½ día c/u)

1. **Endpoint cambio de password staff** + UI en admin.
2. **Reset password olvidado**: link por email (con SendGrid o Resend gratuita).
3. **Onboarding de tenant nuevo**: hoy es por seed/script. Endpoint de admin global o CLI para crear tenant + assets.
4. **Bumpear `card.updatedAt` masivamente cuando cambia el tenant**: para que el geofence/branding lleguen a pases ya instalados.
5. **Importar emails de Juicy a un mailing**: si Juicy permite export, levantar a tabla `Customer` para que cuando re-enrolen los reconozcamos.

### Features grandes

6. **Google Wallet activation**: el código está implementado. Necesita:
   - Crear proyecto en Google Cloud, habilitar Wallet API.
   - Pedir Issuer ID en `pay.google.com/business/console` (1-7 días Google).
   - Generar service account JSON.
   - Setear `GOOGLE_WALLET_ISSUER_ID` y `GOOGLE_WALLET_SA_JSON_B64` en Vercel.
   - Probar que el `addMessage` de campañas llegue a Android.

7. **Apple VAS NFC tap**: para que la tarjeta funcione con tap en NFC reader (en lugar de scan QR). Requiere:
   - Apple VAS approval (4-8 semanas).
   - Comprar lector ID TECH VP4880 ($250-350).
   - Integrar `setNFC` con la encryption public key en `wallet-apple.ts`.
   - Implementar el cliente del lector que llame a `/v1/terminal/tap`.

8. **Multi-país (Chuí México)**:
   - Crear tenant `chui-mx` con su branding propio.
   - Copiar assets a `assets/passes/chui-mx/`.
   - URL: `card.chui.com.mx` o `mx.card.chui.com.ar`.
   - Selector de país hace ya distingue idioma del cliente.

9. **Reportes y analytics avanzados**:
   - LTV por tier.
   - Retention (qué % de Silver llegan a Gold en N meses).
   - Cohort analysis.
   - Stripe-billing-style charts en admin.

10. **Stripe Billing para vendérselo a otros restaurantes**:
    - Subscripción por tenant.
    - Métricas de uso (cards activas, campañas enviadas).
    - Self-serve onboarding.

11. **Worker dedicado en lugar de waitUntil**:
    - Si volumen crece, mover el push a un worker BullMQ separado en Fly o Railway.
    - El código de `src/queues/wallet-push.ts` y `src/workers/wallet-push.ts` ya está armado para activarse con `REDIS_URL` definida.

### Mejoras UX

12. **Reglas dinámicas de tiers**: hoy los tiers son threshold-based (puntos o gasto). Agregar reglas custom (ej. "5 visitas en 30 días = Gold").
13. **Notificaciones programadas**: campañas con `scheduledFor` ya soportadas en schema; falta el cron que las dispare. Para Vercel: Vercel Cron Jobs (gratis hasta cierto volumen) que llame a `/v1/admin/tasks/dispatch-scheduled`.
14. **Birthday push**: si `Customer.birthDate` está seteado, mandar push con un beneficio el día del cumpleaños. Cron job + un campo `Reward.tag = "birthday"` o similar.
15. **Histórico de visitas en el pase**: agregar back field con últimos 5 earn transactions.
16. **Transferir tarjeta**: dar al cliente un código para mover su balance a otro email/teléfono.

### Infra y DX

17. **Tests E2E con Playwright**: enroll, login, earn, redeem, campaign send.
18. **Vercel preview deploys**: cada PR genera URL preview con su propia DB de testing.
19. **Logging estructurado**: Pino ya emite JSON; agregar Vercel Log Drains a Logtail/Axiom para retention real.
20. **Sentry**: error monitoring para excepciones en producción.

---

## Acceso y secretos (no committeados)

Todo en Vercel env vars (production):
- `DATABASE_URL` (con password de Supabase MISC)
- `JWT_SECRET`, `NFC_TOKEN_SECRET` (random base64-32)
- `APPLE_PASS_TYPE_IDENTIFIER`, `APPLE_TEAM_IDENTIFIER`
- `APPLE_PASS_CERT_B64`, `APPLE_PASS_KEY_B64`, `APPLE_WWDR_CERT_B64`
- `NODE_ENV=production`, `LOG_LEVEL=info`

Local (`.env`, gitignored):
- Mismas + paths a certs en disk.

Listar todos: `npx vercel env ls production` desde el repo.

Si se pierde el cert de Apple, hay que regenerarlo desde `developer.apple.com` (Pass Type ID `pass.com.chui.loyalty` → Edit → Create Certificate). Subir nuevo CSR (genera con `openssl req -new -key pass.key -out pass.csr ...`). Bajar nuevo `.cer`, convertir a `.pem`, base64, setear en Vercel. Los pases ya emitidos siguen siendo válidos (firma persiste); pero los pushes nuevos requieren cert válido.

Si Nico no tiene la password de Supabase MISC, resetearla en `supabase.com/dashboard/project/xespohzcyofyzsiksqrm/settings/database` → Reset Password. Reconstruir el `DATABASE_URL` con el formato: `postgresql://postgres.xespohzcyofyzsiksqrm:<NEW_PASSWORD>@aws-0-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1&schema=chui_loyalty`. Setear con `vercel env add DATABASE_URL production --force`.

---

## Bugs/limitaciones conocidos

- **Cold start de Vercel**: la primera request a la función después de un período inactivo toma ~3-7s (Prisma + assets + cert load). Las siguientes son rápidas (~50-200ms).
- **El bundle de Vercel pesa ~28MB**: dentro del límite Pro pero cerca del free (50MB). Si crece, hay que excluir cosas (passkit-generator + crypto = ~10MB).
- **Geofence no retroactivo**: ver "Lo que falta" punto 4.
- **No hay rate limit por IP en `/v1/public/enroll`**: alguien podría flood-enrolar. Vercel tiene rate limit nativo a nivel red, pero conviene agregar un `@fastify/rate-limit` con scope por IP.
- **`brandColor` no afecta el pase loyalty**: hardcoded a `rgb(16,40,26)`.
- **Apple VAS NFC**: deshabilitado, todo va por QR.
- **Google Wallet**: implementado pero sin Issuer ID, salta como "not configured".
- **POS Terminal NFC**: route existe (`/v1/terminal/tap`) pero no hay cliente de hardware integrado.
- **No hay endpoint de cambio de password staff**.
- **Los cierres de transacciones (REVERSAL)**: schema soporta pero no hay UI ni endpoint.

---

## Comandos útiles para el agente nuevo

```bash
# Ver logs de Vercel en vivo
cd ~/Desktop/chui-loyalty && npx vercel logs https://chui-loyalty.vercel.app

# Inspeccionar deployment
npx vercel inspect chui-loyalty.vercel.app

# Listar env vars
npx vercel env ls production

# Pull env vars a .env.production.local para testear local con prod DB
npx vercel env pull .env.production.local

# Deploy
npx vercel deploy --prod

# Conectar a Supabase y correr SQL ad-hoc desde el agente:
# Usar el MCP server de Supabase ya configurado (project_id: xespohzcyofyzsiksqrm).

# Rollback a versión anterior:
npx vercel rollback https://chui-loyalty-<deploy-id>.vercel.app
```

---

## Last commit en el branch

`bf70c10` — Add web (chui.com.ar) and WhatsApp (+1 415 969 2279) to pass back

Branch `claude/loyalty-wallet-nfc-EIywB` está adelantado de `main` por todos los commits del v1. Eventual merge a main cuando se haya validado un par de semanas en producción.

---

## Contacto

- Owner: Nico (`nicolas.kasakoff@gmail.com`, GitHub `nicolaskasaks-ui`).
- Apple Developer: cuenta personal de Nico, email `nico.kskff@gmail.com`.
- Supabase / Vercel / Hostinger: misma cuenta consolidada.
- Customer support en producción: por ahora WhatsApp `+1 415 969 2279`.
