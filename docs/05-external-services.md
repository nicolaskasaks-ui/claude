# 05 · Servicios externos a tramitar

Checklist accionable de todo lo que hay que abrir / configurar fuera del repo. Algunas cosas tardan semanas, conviene arrancarlas en paralelo.

## A · Apple Developer (lo más importante)

Pre-requisito: cuenta de Apple Developer Program activa (USD 99/año).

### Paso a paso

1. **Crear el Pass Type ID**
   - developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → "+"
   - Tipo: `Pass Type IDs`
   - Identifier: `pass.com.chui.loyalty`
   - Description: `Chui Loyalty`

2. **Generar el certificado del Pass Type ID**
   - En el Pass Type ID recién creado → "Create Certificate".
   - Apple pide un CSR (Certificate Signing Request).
   - Para generarlo en Mac: Keychain Access → Certificate Assistant → Request a Certificate from a Certificate Authority. Email: el de tu cuenta. CN: `Chui Loyalty`. "Saved to disk".
   - Subí el CSR. Descargá el `.cer`. Doble-clic para que entre al Keychain.

3. **Exportar a PEM y key**
   - En Keychain, click derecho en el certificado → Export → formato `.p12`.
   - Definí una passphrase fuerte (anotala).
   - Convertir:
     ```bash
     openssl pkcs12 -in pass.p12 -clcerts -nokeys -out certs/pass.pem
     openssl pkcs12 -in pass.p12 -nocerts -out certs/pass.key
     ```

4. **Bajar el WWDR Intermediate Certificate**
   - developer.apple.com → Certificates → "Apple Worldwide Developer Relations Certification Authority (G4)".
   - Download. Convertir a PEM:
     ```bash
     openssl x509 -inform DER -in AppleWWDRCAG4.cer -out certs/wwdr.pem
     ```

5. **Apuntar el `.env`**
   ```
   APPLE_PASS_TYPE_IDENTIFIER="pass.com.chui.loyalty"
   APPLE_TEAM_IDENTIFIER="<tu-team-id>"
   APPLE_PASS_CERT_PATH="./certs/pass.pem"
   APPLE_PASS_KEY_PATH="./certs/pass.key"
   APPLE_PASS_KEY_PASSPHRASE="<la passphrase del p12>"
   APPLE_WWDR_CERT_PATH="./certs/wwdr.pem"
   ```

6. **Diseñar los assets del pase** (sin esto el `.pkpass` no se firma)
   - `icon.png`: 29x29, 58x58 (@2x), 87x87 (@3x).
   - `logo.png`: 160x50, 320x100 (@2x), 480x150 (@3x).
   - PNGs sólidos, transparencia opcional. Lo más limpio: contratar un diseñador con el branding de Chui.

7. **Apple VAS** (solo si vas a sumar lectores NFC)
   - Apple Business Register → solicitar VAS para tu Pass Type ID.
   - Tarda 4–8 semanas. Apple revisa el caso de uso.

## B · Google Wallet

1. **Google Cloud project**
   - cloud.google.com → New Project: `chui-loyalty`.

2. **Habilitar Google Wallet API**
   - APIs & Services → Library → buscar "Google Wallet API" → Enable.

3. **Service account**
   - IAM & Admin → Service Accounts → Create.
   - Nombre: `wallet-issuer`.
   - Role: `Wallet Object Issuer`.
   - Crear key tipo JSON. Guardar como `certs/google-wallet-sa.json`.

4. **Issuer ID**
   - pay.google.com/business/console → solicitar Issuer ID. Aprobación inmediata para sandbox; producción tarda algunos días.
   - Anotar el Issuer ID (string numérico).

5. **`.env`**
   ```
   GOOGLE_WALLET_ISSUER_ID="<numero>"
   GOOGLE_WALLET_SERVICE_ACCOUNT_PATH="./certs/google-wallet-sa.json"
   ```

6. **Smart Tap** (opcional, solo para NFC en el local)
   - En Google Wallet console → registrar tu Smart Tap public key.

## C · Hosting

Recomendados, en orden de simplicidad para Node + Postgres:

| Plataforma | Pros | Pricing |
|---|---|---|
| **Render** | Más simple. Deploy desde GitHub. Postgres administrado incluido | App $7/mes + DB $7/mes |
| **Fly.io** | Más barato a escala. Multi-región fácil | App ~$5/mes + DB ~$5/mes |
| **Railway** | UX espectacular. Postgres + Redis incluidos | $5–20/mes según uso |

Variables de entorno: copiar todas las del `.env` al panel de la plataforma.

## D · Dominio + HTTPS

- Comprá dominio (Cloudflare, Namecheap, NIC.ar). USD 10–15/año.
- Apuntá a la URL de hosting.
- HTTPS: las plataformas mencionadas dan certificado automático (Let's Encrypt).
- **Crítico**: Apple PassKit web service exige TLS de CA pública. Self-signed no funciona.

## E · Legal (mínimo viable)

Apple exige privacy policy y T&C linkeables desde el pase para aprobarlo en producción.

- **Privacy Policy**: hay generadores online (Iubenda, Termly). USD 0–60.
- **Términos del programa de loyalty**: copiar de un programa existente y adaptar.
- **Tratamiento de datos**: cumplir GDPR / Ley 25.326 (Argentina) si aplica.

## F · Stripe / cobro a tenants (cuando empieces a vender)

- Stripe Billing con planes Starter/Pro.
- Webhook para activar/pausar tenants según pago.
- Esto es feature futura, no bloquea el lanzamiento con Chui.

## Resumen de plazos

| Trámite | Tiempo estimado |
|---|---|
| Crear Pass Type ID + certificados | 1 día |
| Diseñar assets del pase | 2–5 días |
| Google Wallet API + Issuer ID | 2–7 días |
| **Apple VAS** | **4–8 semanas** |
| Hosting + dominio + deploy | 1 día |
| Privacy policy + T&C | 1–3 días |

**Camino crítico**: Apple VAS es lo más lento. El resto se puede hacer en paralelo en una semana. Para arrancar Chui con QR no necesitás VAS.
