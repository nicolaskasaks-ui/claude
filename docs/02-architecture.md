# 02 · Decisiones de arquitectura

## Sin app del cliente

**Decisión**: emitir tarjetas y gift cards como pases de Apple Wallet y Google Wallet, no como una app propia.

**Por qué**:
- Cero costo de adquisición: el cliente no descarga nada.
- Cero mantenimiento de app (releases en App Store / Play Store, soporte de versiones, traducciones).
- El pase ya vive donde el cliente mira mil veces al día (wallet del teléfono).
- Push notifications por updates de pase = canal gratis a la pantalla de bloqueo, sin APNs nuestro propio.

**Trade-off**: la UX está limitada al formato del pase. No hay onboarding rico, no hay catálogo navegable. Para eso eventualmente puede haber una landing web (sin login con password — el pase es la credencial).

## QR primero, NFC después

**Decisión**: el flujo operativo del día uno usa QR (cámara del POS lee el QR del pase). NFC se suma cuando hay volumen que lo justifique.

**Por qué**:
- NFC con Apple Wallet **requiere VAS**, que requiere terminal certificado (USD 200–500), aprobación de Apple (semanas) y configuración del lector. Detalle en [`04-nfc-and-hardware.md`](04-nfc-and-hardware.md).
- El QR del pase se imprime desde Apple/Google Wallet con un toque, escanea en menos de un segundo desde el iPad y no requiere hardware extra.
- El backend trata QR y NFC con el mismo identificador (`nfcSerial`), así que cuando se sume hardware **no cambia código**.

## Multi-tenant desde el día uno

**Decisión**: cada restaurante es una fila en `Tenant`. Todas las demás entidades (cliente, tarjeta, transacción, terminal, campaña) llevan `tenantId`.

**Por qué**:
- Migrar a multi-tenant después es doloroso (data migrations, riesgo de leakage entre tenants).
- Los queries quedan limpios desde el principio (`where: { tenantId }`).
- Un solo deploy sirve a N clientes; el costo marginal de sumar un restaurante es 0.

**Trade-off**: agrega un campo extra a casi todas las queries y a los índices. Aceptable.

## Postgres + Prisma (no Mongo)

**Decisión**: Postgres relacional con Prisma como ORM.

**Por qué**:
- Puntos y saldos de gift card requieren **integridad transaccional**: una redención no puede dejar el balance en un estado inconsistente. Postgres serializable + transacciones de Prisma resuelven esto trivialmente.
- Idempotency keys con `@unique` evitan double-charging por reintentos del POS.
- Prisma da migrations versionadas y un cliente type-safe en TypeScript.

**Trade-off**: setup más rígido que Mongo. Aceptable: el dominio es estructurado.

## Fastify + TypeScript

**Decisión**: Fastify como framework HTTP, TypeScript como lenguaje.

**Por qué**:
- TypeScript: las librerías oficiales de Apple Wallet (`passkit-generator`) y Google Wallet (`googleapis`) son maduras en Node y tienen mejor docs que en Python o Go.
- Fastify es más rápido que Express con menos código boilerplate. Validación con Zod alineada con los tipos de Prisma.

## Ledger append-only

**Decisión**: la tabla `Transaction` es append-only. No se actualiza una fila para "corregirla" — se inserta una nueva fila con `kind: REVERSAL` que apunta a la original.

**Por qué**:
- Auditoría completa: cualquier movimiento es reconstruible desde el ledger.
- Diff trivial entre balance calculado del ledger y el balance cacheado en `LoyaltyCard.pointsBalance` para detectar drift.

## Tier engine con lock-in mid-period

**Decisión**: una vez que el cliente sube de tier dentro de un período de calificación, **no baja** hasta que el período cierra. Una devolución no le baja el nivel.

**Por qué**:
- Es como las aerolíneas. Da una expectativa estable al cliente.
- Reduce confusion en disputas ("perdí mi nivel por una devolución").

## Auth: JWT staff + API key por terminal

**Decisión**: dos esquemas de auth distintos.

- **Staff** (panel admin / POS web): JWT con role (OWNER/MANAGER/CASHIER).
- **Terminales NFC** (futuro hardware): API key generada al provisionar el dispositivo, hasheada con argon2 al persistirla. Una API key compromete solo un dispositivo.

## Glosario rápido

| Sigla | Qué es |
|---|---|
| **VAS** | *Value Added Services*. Protocolo de Apple para que un terminal NFC certificado lea pases de Apple Wallet (loyalty / gift / membership). |
| **Smart Tap** | Equivalente de Google. Protocolo NFC para leer pases de Google Wallet. |
| **PassKit** | API de Apple para crear, firmar y actualizar pases. |
| **HCE** | *Host Card Emulation*. La capacidad de Android (y de iOS desde 17.4 en EU) de hacer que el teléfono se comporte como una tarjeta NFC. |
| **APNs** | *Apple Push Notification service*. El canal por el que iOS recibe notificaciones de updates de pases. |
| **EMV contactless** | Protocolo NFC universal para pagos con tarjetas. Distinto y separado de VAS. |
| **NTAG / NFC tag** | Chip pasivo NFC físico. **No usamos** — todo es virtual. |
