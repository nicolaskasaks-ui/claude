# 04 · NFC y hardware: la realidad

## Por qué el NFC no es "comprar un lector USB y listo"

Apple y Google **no permiten** que cualquier lector NFC lea sus pases de lealtad. Hay un handshake protegido que solo termina si el lector está autorizado:

- **Apple Wallet** → protocolo **VAS** (*Value Added Services*).
- **Google Wallet** → protocolo **Smart Tap**.

Sin ese handshake, aunque el cliente tenga el pase abierto en pantalla y lo apoye en un lector NFC genérico, el iPhone **no transmite nada útil**. Es por diseño de seguridad.

## Qué hace falta para tener tap-to-pay con loyalty

| Requisito | Apple VAS | Google Smart Tap |
|---|---|---|
| Aprobación de la plataforma | Apple Business Register, 4–8 semanas | Google Wallet console, días |
| Llaves criptográficas en el lector | Sí (VAS Merchant Public Key) | Sí (Smart Tap key) |
| Terminal certificado | Obligatorio | Más flexible (incluye lectores USB) |
| Funciona con cualquier ACR1252U | No | Parcialmente |

## ¿Y la terminal de Mercado Pago?

**Hardware**: sí, físicamente puede leer pases (es la misma placa NFC que usa para Apple Pay y Google Pay).

**Acceso**: no. MercadoPago no expone una API VAS / Smart Tap a terceros. Su SDK procesa pagos, no lee pases de lealtad.

Lo mismo ocurre con **Square, Stripe Terminal LATAM, Cielo, Stone, Clover, Fiserv**. Todos los adquirentes mantienen el VAS bloqueado.

**Implicación**: si querés NFC real, necesitás un dispositivo dedicado solo para lealtad, conviviendo con la terminal de cobro existente. Eso son dos taps en la fila, no uno.

## Cuáles lectores sí sirven (con precios)

Comprás directo a un distribuidor de hardware POS, no a un adquirente. Precios USD nuevos en USA. En LATAM sumar 30–80% por importación.

### Lectores NFC dedicados (más baratos, lo recomendado para arrancar con NFC)

| Modelo | USD nuevo | USD refurbished | Notas |
|---|---|---|---|
| ID TECH VP3300 | 150–220 | 80–120 | Bluetooth, el más barato |
| ID TECH VP4880 | 250–350 | 150–200 | USB, robusto, el más popular |
| ID TECH VP6800 | 280–380 | 180–230 | USB con pantalla |

### Smart terminals (Android, batería, todo en uno)

| Modelo | USD nuevo | Notas |
|---|---|---|
| PAX A77 | 200–320 | Android handheld |
| PAX A920 | 350–550 | Android, popular para integraciones custom |
| Sunmi P2 / V2 Pro | 300–500 | Alternativa china barata |

### Premium (calidad enterprise)

| Modelo | USD nuevo | Notas |
|---|---|---|
| Verifone P400 | 280–450 | Countertop |
| Verifone e285 | 350–550 | Portátil |
| Ingenico Lane/3000 | 350–550 | Countertop |
| Ingenico Lane/5000 | 500–700 | Con PIN pad |

## Costos extra a considerar

| Concepto | USD |
|---|---|
| Configuración con tus llaves VAS / Smart Tap | 0–200 (one-time, depende del distribuidor) |
| Importación a LATAM | +30–80% sobre precio FOB |
| Soporte técnico anual (opcional) | 50–150/año |

## Distribuidores

- **Argentina**: NovaPOS, Soluciones Tecnológicas, Datanet POS.
- **Brasil**: M3Tecnologia, Bematech, NTK.
- **México**: Posguys MX, Smartcomex.
- **USA (importás directo)**: Barcodes Inc, POSGuys, IDWholesaler, eBay refurbished.

## Cuándo conviene invertir en NFC

**No conviene si**:
- Estás validando el concepto en Chui o en los primeros 3 restaurantes.
- El volumen es bajo y el QR no es cuello de botella en horas pico.
- No tenés Apple VAS aprobado todavía.

**Sí conviene cuando**:
- Tenés VAS aprobado y un Smart Tap key listos.
- El restaurante factura mucho en horas pico y los segundos importan.
- Querés diferenciarte como "premium" (UX tipo Starbucks).

## Estrategia de pricing al vender el lector

Comprás el ID TECH VP4880 a USD 250 y se lo vendés/alquilás al restaurante:

- **Venta directa**: USD 350–450 one-time como "Kit NFC".
- **Alquiler**: USD 15–25/mes incluido en el plan Pro+. A los 18 meses lo amortizaste.

## Cero costo recurrente del lado de Apple/Google por usar NFC

Apple no cobra por tap. Google no cobra por tap. La única recurrencia es **Apple Developer Program (USD 99/año)** que pagás igual aunque no tengas NFC.
