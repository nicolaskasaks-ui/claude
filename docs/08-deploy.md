# 08 · Deploy a producción

Guía paso a paso para llevar Chuí Loyalty de tu Mac a un servicio público accesible. Asume Fly.io como plataforma; los principios sirven para Render, Railway o cualquier host que corra Docker + tenga Postgres y Redis manejados.

Tres bloques, en orden:

1. **Generar el Apple Pass Type ID + certificado** (el único trámite externo crítico).
2. **Codificar los secrets a base64** (lo que Fly va a almacenar).
3. **Crear app en Fly, setear secrets, deployar**.

Tiempo total razonable: **2–4 horas** distribuidas en 2 sesiones (Apple tarda 5–15 min en aprobar el Pass Type ID).

---

## 1 · Apple Pass Type ID + certificado

Tenés que hacerlo una vez. Resultado: tres archivos PEM/KEY en tu Mac que después codificamos a base64.

### 1a · Crear el Pass Type ID

1. Ir a [developer.apple.com → Identifiers](https://developer.apple.com/account/resources/identifiers/list/passTypeId).
2. `+` → seleccionar **Pass Type IDs** → Continue.
3. **Description**: `Chuí Friends Card`
4. **Identifier**: `pass.com.chui.loyalty` (este es el `APPLE_PASS_TYPE_IDENTIFIER`).
5. Continue → Register.

### 1b · Generar el certificado

1. En la lista, hacé click en `pass.com.chui.loyalty` → **Create Certificate**.
2. Apple te pide un **CSR** (Certificate Signing Request). Generalo en tu Mac:

   ```bash
   cd ~/Desktop/chui-loyalty
   mkdir -p certs && cd certs
   openssl genrsa -out pass.key 2048
   openssl req -new -key pass.key -out pass.csr \
     -subj "/emailAddress=nicolas.kasakoff@gmail.com/CN=Chui Friends Card/C=AR"
   ```

3. En Apple, **Choose File** → seleccioná `pass.csr` → Continue.
4. Apple te genera un `.cer`. Descargalo (`pass.cer`). Guardalo en `~/Desktop/chui-loyalty/certs/`.
5. Convertí el `.cer` a PEM:

   ```bash
   cd ~/Desktop/chui-loyalty/certs
   openssl x509 -in pass.cer -inform DER -out pass.pem -outform PEM
   ```

### 1c · Bajar el WWDR (root chain)

1. Andá a [Apple PKI](https://www.apple.com/certificateauthority/).
2. Buscá **"Worldwide Developer Relations - G4"** (vigente hasta diciembre 2030) → Download `.cer`.
3. Convertí a PEM:

   ```bash
   cd ~/Desktop/chui-loyalty/certs
   openssl x509 -in AppleWWDRCAG4.cer -inform DER -out wwdr.pem -outform PEM
   ```

### 1d · Conseguir tu Team Identifier

En [developer.apple.com → Membership](https://developer.apple.com/account#MembershipDetailsCard) → **Team ID** (10 chars, mayúsculas). Ese es el `APPLE_TEAM_IDENTIFIER`.

### 1e · Probar local antes de deployar

Editá `~/Desktop/chui-loyalty/.env`:

```bash
APPLE_PASS_TYPE_IDENTIFIER="pass.com.chui.loyalty"
APPLE_TEAM_IDENTIFIER="ABCDE12345"   # tu Team ID real
APPLE_PASS_CERT_PATH="./certs/pass.pem"
APPLE_PASS_KEY_PATH="./certs/pass.key"
APPLE_WWDR_CERT_PATH="./certs/wwdr.pem"
```

Reiniciá el dev server (`npm run dev`), generá un pase de prueba con curl:

```bash
TOKEN=$(curl -sf -X POST http://localhost:3000/v1/auth/staff/login \
  -H 'content-type: application/json' \
  -d '{"tenantSlug":"chui","email":"owner@chui.com","password":"chui-change-me-please"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

CARD_ID=$(curl -sf -X POST http://localhost:3000/v1/customers \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"email":"test@chui.com","firstName":"Test"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["card"]["id"])')

curl -sf "http://localhost:3000/v1/wallet/apple/passes/$CARD_ID" \
  -H "authorization: Bearer $TOKEN" -o /tmp/test.pkpass

open /tmp/test.pkpass   # debería abrir Wallet preview en macOS
```

Si Wallet abre el pase con el verde, "CHUÍ", y el QR — todo OK.

---

## 2 · Google Wallet (opcional, podés saltearlo de inicio)

Si querés Android nativo desde el día 1, repetí el flujo equivalente:

1. [Google Cloud Console](https://console.cloud.google.com/) → crear proyecto.
2. Habilitar **Google Wallet API**.
3. APIs & Services → Credentials → Create Service Account → Generate JSON key. Guardá como `~/Desktop/chui-loyalty/certs/google-wallet-sa.json`.
4. Pedir Issuer ID en [pay.google.com/business/console](https://pay.google.com/business/console) → Wallet API → tarda 1–7 días.
5. Setear en `.env`:

   ```bash
   GOOGLE_WALLET_ISSUER_ID="3388000000022XXXXXX"
   GOOGLE_WALLET_SERVICE_ACCOUNT_PATH="./certs/google-wallet-sa.json"
   ```

Mientras no tengas Issuer ID, el código se desactiva solo: el worker procesa los jobs, Apple anda, Google logea "not configured" y el job termina exitoso.

---

## 3 · Codificar secrets a base64

Fly recibe los certs como variables de entorno (no como archivos en disco). Conviértelos:

```bash
cd ~/Desktop/chui-loyalty/certs

base64 -i pass.pem -o pass.pem.b64
base64 -i pass.key -o pass.key.b64
base64 -i wwdr.pem -o wwdr.pem.b64
base64 -i google-wallet-sa.json -o google-wallet-sa.json.b64   # solo si usás Google
```

Generá también los secrets de auth (no los reuses entre dev y prod):

```bash
openssl rand -base64 32   # JWT_SECRET
openssl rand -base64 32   # NFC_TOKEN_SECRET
```

---

## 4 · Deploy a Fly.io

### 4a · Instalar y loguearse

```bash
brew install flyctl
flyctl auth login
```

Te abre el navegador, te logueás con tu cuenta. Si no tenés, te pide crear una y agregar tarjeta.

### 4b · Crear la app y los servicios manejados

Desde `~/Desktop/chui-loyalty`:

```bash
# Crear la app (no deployar todavía)
flyctl launch --no-deploy --copy-config --name chui-loyalty --region iad

# Postgres manejado
flyctl postgres create --name chui-loyalty-db --region iad
flyctl postgres attach chui-loyalty-db --app chui-loyalty
# Esto setea DATABASE_URL automáticamente como secret en chui-loyalty.

# Redis (Upstash, gratis para dev)
flyctl redis create --name chui-loyalty-redis --region iad
# El comando te imprime una URL. Copiala — la usamos abajo.
```

### 4c · Setear los demás secrets

```bash
cd ~/Desktop/chui-loyalty/certs

flyctl secrets set --app chui-loyalty \
  JWT_SECRET="$(openssl rand -base64 32)" \
  NFC_TOKEN_SECRET="$(openssl rand -base64 32)" \
  REDIS_URL="redis://default:xxxxx@fly-chui-loyalty-redis.upstash.io:6379" \
  APPLE_PASS_TYPE_IDENTIFIER="pass.com.chui.loyalty" \
  APPLE_TEAM_IDENTIFIER="TU_TEAM_ID" \
  APPLE_PASS_CERT_B64="$(cat pass.pem.b64 | tr -d '\n')" \
  APPLE_PASS_KEY_B64="$(cat pass.key.b64 | tr -d '\n')" \
  APPLE_WWDR_CERT_B64="$(cat wwdr.pem.b64 | tr -d '\n')"

# Solo si vas a usar Google Wallet:
flyctl secrets set --app chui-loyalty \
  GOOGLE_WALLET_ISSUER_ID="3388000000022XXXXXX" \
  GOOGLE_WALLET_SA_JSON_B64="$(cat google-wallet-sa.json.b64 | tr -d '\n')"
```

### 4d · Deploy

```bash
cd ~/Desktop/chui-loyalty
flyctl deploy
```

`fly.toml` ya tiene configurado:
- Dos procesos: `app` (HTTP) y `worker` (BullMQ consumer).
- Release command: `npx prisma migrate deploy` (corre antes de promocionar la nueva versión).
- Health check en `/health`.

### 4e · Crear el tenant Chuí en producción

El seed de dev no corre en producción. Hacelo a mano una vez:

```bash
flyctl ssh console --app chui-loyalty -C "node -e 'import(\"./dist/../prisma/seed.js\")'"
```

(Si el seed `tsx` no transpila a `dist/`, en su lugar levantá una shell SSH y corré el seed manualmente con `npx tsx prisma/seed.ts`. Asegurate de tener `tsx` en deps si vas por ese camino, o portar `prisma/seed.ts` a JS plano y compilarlo con el resto.)

Como atajo, un `prisma/seed.mjs` plano funciona sin tsx. Si te trabás, avisame y lo armo.

### 4f · Smoke test en prod

```bash
APP_URL="https://chui-loyalty.fly.dev"

# Health
curl -sf $APP_URL/health
# {"status":"ok"}

# Login owner
TOKEN=$(curl -sf -X POST $APP_URL/v1/auth/staff/login \
  -H 'content-type: application/json' \
  -d '{"tenantSlug":"chui","email":"owner@chui.com","password":"chui-change-me-please"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')

# Stats
curl -sf $APP_URL/v1/admin/stats -H "authorization: Bearer $TOKEN" | python3 -m json.tool
```

Y desde el navegador del iPhone:

- `https://chui-loyalty.fly.dev/app/enroll.html?tenant=chui` — debería funcionar el enroll y bajar un `.pkpass` con el verde y el "CHUÍ".

### 4g · Cambiar la contraseña por defecto

Una vez que confirmes que el panel anda:

```bash
# Login
flyctl ssh console --app chui-loyalty
# Dentro de la VM:
node -e '
const { PrismaClient } = require("@prisma/client");
const argon2 = require("argon2");
(async () => {
  const p = new PrismaClient();
  const hash = await argon2.hash("LA_CONTRASEÑA_NUEVA_QUE_QUIERAS");
  await p.staffUser.updateMany({ where: { email: "owner@chui.com" }, data: { passwordHash: hash } });
  console.log("ok");
})();
'
```

---

## 5 · Mantenimiento

- **Logs en vivo**: `flyctl logs --app chui-loyalty`
- **Logs solo del worker**: `flyctl logs --app chui-loyalty --process=worker`
- **Reiniciar**: `flyctl apps restart chui-loyalty`
- **Escalar**: `flyctl scale count 2 --app chui-loyalty` (más instancias del proceso `app`)
- **Estado**: `flyctl status --app chui-loyalty`
- **Console (shell SSH)**: `flyctl ssh console --app chui-loyalty`

---

## 6 · Migrar usuarios de Juicy Suite

Cuando estés listo para dar de baja Juicy:

1. **Comunicación** a clientes existentes: email/WhatsApp con el link `https://chui-loyalty.fly.dev/app/enroll.html?tenant=chui` y un mensaje explicando que se actualizó el sistema y tienen que volver a enrolarse (puntos arrancan en 0, beneficios definidos según el panel admin).
2. **Período de gracia**: dejar Juicy activo 30 días en paralelo para que la gente se reenrole.
3. **Baja**: cancelar la suscripción a Juicy.

No hay migración técnica de puntos/clientes — empezamos limpio según [conversación previa].

---

## 7 · Costos esperados

- Fly.io app (1 VM 512MB): **gratis** dentro del free tier (3 vm-hours/mo).
- Fly Postgres (dev tier): **~$2–3/mes**.
- Upstash Redis: **gratis** hasta 10k cmd/día.
- Apple Developer membership: **USD 99/año** (ya pagás).
- Google Wallet API: **gratis**.

**Total**: ~$3/mes de variable + tu membership de Apple.
