# Chui Loyalty — Handoff

Plataforma de lealtad y gift cards en wallet virtual (Apple/Google), multi-tenant, lista para arrancar con Chui y vendible a otros restaurantes.

## Quick start (5 comandos)

```bash
git checkout claude/loyalty-wallet-nfc-EIywB
docker compose up -d
cp .env.example .env   # editar JWT_SECRET y NFC_TOKEN_SECRET
npm install && npm run prisma:migrate && npm run seed
npm run dev
```

Browser:
- Inscripción cliente: http://localhost:3000/app/enroll.html?tenant=chui
- POS cajero: http://localhost:3000/app/pos.html (`owner@chui.com` / `chui-change-me-please`)

Setup detallado: [`docs/03-setup-mac.md`](docs/03-setup-mac.md).

## Mapa de docs

| Para entender... | Leer |
|---|---|
| Visión, mercado, monetización | [`docs/01-business.md`](docs/01-business.md) |
| Por qué este stack y este diseño | [`docs/02-architecture.md`](docs/02-architecture.md) |
| Cómo correrlo en Mac | [`docs/03-setup-mac.md`](docs/03-setup-mac.md) |
| NFC, Apple VAS, hardware y precios | [`docs/04-nfc-and-hardware.md`](docs/04-nfc-and-hardware.md) |
| Cuentas y trámites externos | [`docs/05-external-services.md`](docs/05-external-services.md) |
| Qué está hecho y qué falta | [`docs/06-status.md`](docs/06-status.md) |
| Errores comunes | [`docs/07-runbook.md`](docs/07-runbook.md) |
| Estructura del repo y flujo NFC | [`README.md`](README.md) |
| Referencia de endpoints | [`docs/api.md`](docs/api.md) |

## Resumen ejecutivo (1 minuto)

- **Producto**: el cliente del restaurante recibe una tarjeta de lealtad o gift card como pase de Apple/Google Wallet (sin instalar app). El cajero la lee con QR (cámara del iPad) o NFC (cuando se invierta en lector certificado).
- **Tiers tipo aerolínea**: Silver / Gold / Platinum con descuento automático y multiplicador de puntos. Calificación por gasto o puntos en período rolling de 365 días.
- **Push por tier**: campañas dirigidas (p.ej. solo Platinum) llegan como notificación de pase de wallet en pantalla de bloqueo, sin app del cliente.
- **Multi-tenant**: Chui es el primer tenant; el modelo está pensado para sumar otros restaurantes con cero refactor.
- **Estado**: backend completo, POS web funcionando con QR, APNs de Apple implementado. Faltan certs de Apple/Google y assets de imagen del pase. Mientras tanto la operación arranca con QR sin ningún hardware extra.

## Estado de la branch

Trabajo activo en `claude/loyalty-wallet-nfc-EIywB`. 3 commits:
1. Bootstrap del backend multi-tenant.
2. APNs real, enrollment público, POS web.
3. Escaneo de QR en el POS.

Cualquier cambio nuevo va a esta branch hasta merge a `main`.
