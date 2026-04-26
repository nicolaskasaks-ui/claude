# 06 · Estado actual

Estado del proyecto a la fecha del último commit en `claude/loyalty-wallet-nfc-EIywB`.

## Código

| Componente | Estado | Notas |
|---|---|---|
| Schema de Prisma multi-tenant | ✅ Done | Tenants, customers, cards, tiers, rewards, gift cards, transactions, terminals, wallet devices, campaigns |
| Tier engine (Silver/Gold/Platinum) | ✅ Done | Lock-in mid-period; rollover por tenant period |
| Loyalty service (issue, earn, redeem) | ✅ Done | Idempotency keys, transacciones serializables |
| Gift card service (issue, redeem) | ✅ Done | PIN opcional con argon2; redención parcial |
| Apple Wallet pass generator | ✅ Done | Falta cargar certs y assets PNG para que firme |
| Google Wallet save link generator | ✅ Done | Falta service account + Issuer ID |
| APNs push real (HTTP/2 + cert) | ✅ Done | Empty payload spec correcto |
| Google Wallet push (PATCH object) | 🟡 Stub | Solo console.log; falta implementación |
| Apple PassKit web service | ✅ Done | Register/unregister/list updated/get pass |
| Tier-targeted campaigns | ✅ Done | Resolución de audiencia en send-time |
| HTTP routes (auth, customers, cards, gifts, tiers, rewards, campaigns, terminal, wallet, public, lookup) | ✅ Done | Validación con Zod |
| Auth: staff JWT + terminal API key | ✅ Done | Roles: OWNER/MANAGER/CASHIER |
| Página pública de enrollment | ✅ Done | `/app/enroll.html?tenant=chui` |
| POS web para cajero | ✅ Done | Login, búsqueda manual, scan QR, earn, redeem, gift |
| Escaneo de QR en POS | ✅ Done | jsQR + getUserMedia, funciona en localhost |
| Seed de Chui | ✅ Done | Owner + Silver/Gold/Platinum + 3 rewards |
| Tests del tier engine | ✅ Done | Vitest |
| Worker dedicado para APNs (BullMQ + Redis) | ❌ Pending | Hoy se hace inline con setImmediate |
| Panel admin web | ❌ Pending | Crear campañas, gestionar tiers/rewards desde UI |
| Reportes y analytics | ❌ Pending | LTV por tier, retention, cohorts |
| Onboarding self-service de tenants | ❌ Pending | Hoy se crean por seed/script |
| Integración con Stripe Billing | ❌ Pending | Para cobrar a otros restaurantes |

## Trámites externos

| Trámite | Estado |
|---|---|
| Apple Developer account | ✅ Done (el usuario lo tiene) |
| Pass Type ID + certificate | ❌ Pending |
| Apple WWDR cert descargado | ❌ Pending |
| Assets PNG del pase (icon, logo) | ❌ Pending |
| Apple VAS approval | ❌ Pending (no necesario para arrancar con QR) |
| Google Cloud project + Wallet API | ❌ Pending |
| Google Wallet service account | ❌ Pending |
| Google Wallet Issuer ID | ❌ Pending |
| Hosting (Render / Fly / Railway) | ❌ Pending |
| Dominio + HTTPS | ❌ Pending |
| Privacy policy + T&C | ❌ Pending |

## Camino crítico para Chui en producción (sin NFC)

En orden:

1. **Hosting + dominio + HTTPS** (1 día).
2. **Apple Pass Type ID + certificate + assets** (2–5 días, depende del diseñador).
3. **Google Wallet API + Issuer ID** (1–7 días).
4. **Privacy policy + T&C** (1–3 días).
5. **Smoke test en producción**: enrolar 5 personas reales, hacer 5 ventas, mandar 1 campaña.
6. **Lanzamiento Chui** con QR.

Tiempo razonable: **2–3 semanas** si todo va en paralelo.

## Camino para sumar NFC después

1. Apple VAS approval (4–8 semanas, en paralelo desde el día 1).
2. Comprar 1 lector ID TECH VP4880 (USD 250–350).
3. Configurar el lector con la VAS Merchant Public Key.
4. Implementar el cliente del lector que llame a `/v1/terminal/tap`.
5. Smoke test en Chui.

## Camino para sumar el segundo restaurante

1. Crear tenant nuevo via script (`prisma seed` o endpoint admin futuro).
2. Configurar marca (logo, color, currency).
3. Crear staff user del restaurante.
4. Capacitarlos con el POS web (5 minutos).
5. Imprimir QR de la landing de enrollment con el slug del tenant.

Tiempo por restaurante: **1 día de onboarding**.

## Riesgos abiertos

- **Apple VAS rechazo**: Apple puede demorar o pedir cambios. Mitigación: arrancar con QR, no bloquearse.
- **Costo de soporte**: cada restaurante va a tener preguntas. Plan: docs claras + chat de soporte por WhatsApp en los primeros 5 tenants.
- **Cliente final no instala el pase**: típico ~30% no llegan a instalarlo aunque se enrolan. Mitigación: SMS automático con el link directo a la wallet (no incluido aún).
