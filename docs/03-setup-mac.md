# 03 · Setup en Mac (paso a paso)

Walkthrough completo desde una Mac limpia. Si algo ya lo tenés instalado, saltealo.

## 1. Pre-requisitos

```bash
# Homebrew (gestor de paquetes de macOS)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Git, Node 20, Docker Desktop
brew install git node@20
brew install --cask docker
```

Después de instalar Docker, **abrilo desde Aplicaciones una vez** para que arranque el daemon (sale el ícono de la ballena en la barra de menú).

Verificá:

```bash
git --version
node --version    # tiene que decir v20.x.x
docker --version
```

## 2. Clonar el repo

```bash
cd ~/Desktop
git clone https://github.com/nicolaskasaks-ui/claude.git chui-loyalty
cd chui-loyalty
git checkout claude/loyalty-wallet-nfc-EIywB
```

## 3. Variables de entorno

```bash
cp .env.example .env
```

Generá las dos claves seguras y abrí el archivo:

```bash
echo "JWT_SECRET=\"$(openssl rand -base64 32)\""
echo "NFC_TOKEN_SECRET=\"$(openssl rand -base64 32)\""
open -e .env
```

Reemplazá los valores de `JWT_SECRET` y `NFC_TOKEN_SECRET` con los que imprimió la terminal. Guardá.

## 4. Levantar Postgres

```bash
docker compose up -d
docker ps   # tiene que aparecer chui-postgres
```

## 5. Instalar dependencias y crear las tablas

```bash
npm install
npm run prisma:migrate     # cuando pregunte el nombre, escribí: init
npm run seed
```

El seed debe imprimir:
```
Seed complete. Tenant: chui  Owner: owner@chui.com / chui-change-me-please
```

## 6. Arrancar el servidor

```bash
npm run dev
```

Deja la terminal abierta. Vas a ver `Server listening at http://0.0.0.0:3000`.

## 7. Probarlo en el browser

- **Inscripción cliente**: http://localhost:3000/app/enroll.html?tenant=chui
- **POS cajero**: http://localhost:3000/app/pos.html
  - Login: `owner@chui.com`
  - Pass: `chui-change-me-please`
- **Healthcheck**: http://localhost:3000/health

## 8. Probar el flujo completo

1. Desde tu iPhone (en la misma red WiFi que la Mac), abrí `http://<ip-de-tu-mac>:3000/app/enroll.html?tenant=chui`. Para encontrar la IP de tu Mac: `ifconfig | grep "inet " | grep -v 127.0.0.1`.
2. Llená el formulario y enrolate.
3. Si los certs de Apple Wallet **no están cargados**, los botones "Add to Wallet" van a fallar — eso es esperable.
4. Mientras tanto, en la Mac abrí `http://localhost:3000/app/pos.html` y logueate.
5. Buscá tu cliente con la búsqueda manual. Acreditá una venta de $20 (genera ~25 puntos en Silver). Probá canjear un premio.

## Comandos útiles del día a día

```bash
npm run dev                  # arrancar server (modo watch)
npm run prisma:studio        # GUI para ver/editar la base de datos
npm run prisma:migrate       # crear nueva migration tras cambiar schema
npm run seed                 # re-correr seed (idempotente)
npm test                     # correr tests
docker compose down          # apagar postgres
docker compose down -v       # apagar y BORRAR la base (cuidado)
```

## Troubleshooting rápido

Si algo falla, mirá [`07-runbook.md`](07-runbook.md). Los más comunes:

| Síntoma | Solución |
|---|---|
| `Can't reach database server` | Esperá 5s después de `docker compose up -d` y reintentá |
| `port 5432 already in use` | Tenés otro Postgres local. Apagalo o cambiá el puerto en `docker-compose.yml` |
| Browser bloquea cámara en POS | Solo HTTP en localhost lo permite; en producción usar HTTPS |
| `npm install` lento | Normal la primera vez (3 min). Si se traba, probá con `npm install --no-audit` |

## Apagar todo

```bash
# CTRL+C en la terminal del server
docker compose down
```

Los datos quedan persistidos en el volumen de Docker (`chui_pgdata`). La próxima vez que levantes con `docker compose up -d`, todo sigue ahí.
