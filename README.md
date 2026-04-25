# Chui Loyalty

Plataforma multi-tenant de lealtad y gift cards diseñada primero para el restaurante **Chui** y pensada para venderse a otros restaurantes después.

Características:

- **Tarjetas de lealtad** virtuales en **Apple Wallet** y **Google Wallet** (sin app propia).
- **Tiers tipo aerolínea** (Silver / Gold / Platinum) con descuento automático y multiplicador de puntos.
- **Gift cards virtuales** entregadas como pase de wallet, con saldo redimible parcialmente.
- **NFC en el local**: el cajero "tap" el teléfono del cliente y el sistema acredita puntos o descuenta saldo.
- **Push por tier**: campañas dirigidas a un nivel específico (p. ej. solo Platinum) que se entregan como notificación de pase de wallet en pantalla de bloqueo, sin app instalada.
- **Multi-tenant** desde el día uno: cada restaurante = un tenant aislado.

## Stack

| Capa | Tecnología | Por qué |
|------|------------|---------|
| Lenguaje | **TypeScript** sobre Node 20+ | Mejor ecosistema para Apple Wallet + Google Wallet |
| HTTP | **Fastify** | Rápido y simple, validación con Zod |
| ORM / DB | **Prisma + PostgreSQL** | Integridad transaccional para puntos y saldos |
| Auth | **JWT (staff)** + **API key por terminal** | Aislar credenciales por dispositivo |
| Wallet | **passkit-generator** (Apple) + **googleapis / Wallet API** (Google) | Estándares oficiales |
| Tests | **Vitest** | Ligero, rápido |

## Estructura

```
prisma/
  schema.prisma            # Modelo de datos completo
  seed.ts                  # Setup inicial de Chui

src/
  server.ts                # Entrypoint Fastify
  lib/
    env.ts                 # Variables de entorno tipadas (Zod)
    prisma.ts              # Cliente Prisma compartido
    nfc-token.ts           # JWT firmado embebido en el pase (Apple VAS / Google Smart Tap)
    ids.ts                 # Generadores de códigos / NFC serials
    errors.ts              # Errores HTTP
  middleware/
    auth.ts                # Auth de staff (JWT) y de terminales (API key)
  services/
    tier-engine.ts         # Decide tier en cada compra; maneja período rolling
    loyalty.ts             # Emisión de tarjetas, earn, redeem reward
    gift-cards.ts          # Emisión y redención de gift cards virtuales
    wallet-apple.ts        # Genera .pkpass firmados (loyalty + gift)
    wallet-google.ts       # Genera "Save to Google Wallet" links
    wallet-push.ts         # Cola de actualizaciones de pase (APNs / Wallet API)
    campaigns.ts           # Campañas dirigidas por tier
  routes/
    auth.ts                # Login de staff
    customers.ts           # CRUD de clientes
    cards.ts               # Tarjetas de lealtad (earn, redeem, historial)
    gift-cards.ts          # Gift cards
    tiers.ts               # Configuración de niveles
    rewards.ts             # Catálogo de premios
    campaigns.ts           # Crear y disparar campañas push
    terminal.ts            # Endpoint que recibe el "tap" desde el lector NFC
    terminals-admin.ts     # Aprovisionar dispositivos / API keys
    wallet.ts              # Distribución de pases + Apple PassKit web service
```

## Arquitectura física

```
   Cliente (iPhone / Android)
       |
       |  pase de wallet con NFC (Apple VAS / Google Smart Tap)
       v
   Lector NFC (tablet Android o lector USB) -------+
                                                   |
                                                   v
                              [API Chui Loyalty]  (Node + Fastify)
                                                   |
                                                   v
                                              PostgreSQL
                                                   |
                                                   v
                          APNs (Apple) + Wallet API (Google) -> push pasivo a pasos
```

- El cliente **no instala una app**. Carga su pase desde un link/QR a Apple Wallet o Google Wallet.
- El restaurante usa una tablet o lector NFC barato. Solo necesita poder hacer un `POST /v1/terminal/tap` con la API key del dispositivo.
- Las "notificaciones push" se mandan **actualizando el pase** (cambia un campo y la wallet del usuario muestra el aviso). No hace falta APNs propio para clientes finales.

## Flujo de tap NFC

1. El cajero ingresa el monto de la venta en la tablet.
2. El cliente acerca el teléfono al lector.
3. El teléfono entrega la `nfcToken` firmada que vive dentro del pase (JWT HS256).
4. La tablet llama a `POST /v1/terminal/tap` con la API key de la tablet, el token y el total.
5. El backend valida la firma del token, identifica si es loyalty o gift card y:
   - **Loyalty**: aplica el descuento del tier, acredita los puntos correspondientes (con multiplicador), evalúa si subió de tier y, si sí, dispara una actualización de pase.
   - **Gift**: descuenta del saldo lo que se pueda y devuelve cuánto queda por cobrar con otro medio de pago.

## Tiers (configurable por tenant)

| Tier | Calificación anual | Descuento | Multiplicador de puntos |
|------|--------------------|-----------|--------------------------|
| Silver | $0 | 0% | 1.0x |
| Gold | $500 / 500 puntos | 5% | 1.25x |
| Platinum | $2000 / 2000 puntos | 10% | 1.5x |

- La calificación es por gasto **o** puntos en el período (default 365 días).
- Una vez ascendido, el tier queda **fijo hasta el cierre del período** (no baja por una devolución).
- Al vencer el período se recalcula desde cero y, si no recalifica, baja un nivel.

## Campañas push por tier

```
POST /v1/campaigns
{
  "title": "Brunch Platinum exclusivo",
  "message": "Este sábado: brunch privado para clientes Platinum.",
  "targetTierRanks": [3]
}
```

```
POST /v1/campaigns/:id/send
```

Se itera sobre todas las tarjetas del tenant cuyo tier coincide y se actualiza su pase de wallet. Eso causa una notificación en pantalla de bloqueo en iOS y Android, sin app propia.

## Setup local

1. Postgres:

   ```bash
   docker compose up -d
   ```

2. Variables de entorno:

   ```bash
   cp .env.example .env
   # editar JWT_SECRET y NFC_TOKEN_SECRET con: openssl rand -base64 32
   ```

3. Dependencias y migraciones:

   ```bash
   npm install
   npm run prisma:migrate
   npm run seed
   ```

4. Levantar el servidor:

   ```bash
   npm run dev
   ```

5. Healthcheck:

   ```bash
   curl http://localhost:3000/health
   ```

6. Probá las páginas:
   - Landing de inscripción (la pegás en un QR en la mesa): `http://localhost:3000/app/enroll.html?tenant=chui`
   - POS web para el cajero: `http://localhost:3000/app/pos.html` (login: `owner@chui.com` / `chui-change-me-please`)

## Certificados de wallet (cuando se pase a producción)

- **Apple**: en developer.apple.com -> Identifiers -> Pass Type IDs, crear `pass.com.chui.loyalty`. Generar el certificado, exportar a `.pem` + clave, y descargar el WWDR Intermediate. Apuntar `APPLE_PASS_*` y `APPLE_WWDR_CERT_PATH` a esos archivos. Nunca commitear los certs.
- **Google**: en Google Cloud, habilitar "Google Wallet API", crear una service account con rol "Wallet Object Issuer", descargar el JSON a `certs/google-wallet-sa.json`. Pedir un Issuer ID en pay.google.com/business/console y ponerlo en `GOOGLE_WALLET_ISSUER_ID`.
- Para NFC: registrar el "Smart Tap key" en la consola de Google Wallet y solicitar el entitlement de **Apple VAS** a Apple Business Register.

Hasta que esos cers existan, el servidor compila y arranca, los pases solo dejan de generarse.

## Roadmap a producción

1. Worker para enviar las notificaciones APNs reales (BullMQ + Redis).
2. Panel admin web (Next.js) para que el dueño del restaurante cree campañas y vea reportes.
3. App de cajero (PWA o Android nativa) que envuelva el endpoint `/terminal/tap`.
4. Onboarding self-service para nuevos restaurantes (= nuevos tenants).
5. Reportes: cohortes, retention, LTV por tier.
