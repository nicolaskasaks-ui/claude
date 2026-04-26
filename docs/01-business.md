# 01 · Contexto de negocio

## El cliente cero: Chui

Chui es un restaurante. La plataforma se diseñó pensando primero en sus necesidades reales:

- Tarjetas de lealtad para fidelizar clientes recurrentes.
- Tiers tipo aerolínea (Silver / Gold / Platinum) con descuento automático y beneficios escalonados.
- Gift cards 100% virtuales (sin tarjeta plástica) para vender, regalar y redimir en el local.
- NFC para que el cobro sea un tap, sin abrir nada.
- Push notifications dirigidas por tier para promociones específicas.

## La visión SaaS

Una vez que Chui valida el flujo, el mismo software se le vende a otros restaurantes como SaaS. Por eso la arquitectura es **multi-tenant desde el día uno**: cada restaurante = un `tenant`, aislado a nivel de datos, con su propia marca, sus propios tiers, sus propios premios y campañas.

## Modelo de monetización (sugerido)

| Plan | Precio (USD/mes) | Incluye |
|---|---|---|
| Starter (QR) | 30–50 | Wallet pass, tiers, gift cards, hasta 1.000 clientes activos |
| Pro | 80–150 | Sin límite de clientes, campañas push ilimitadas, reportes |
| NFC Add-on | +20/mes o terminal one-time | Lector NFC certificado, configurado y enviado |

Costos variables para vos por tenant: hosting marginal (centavos), Apple/Google son gratis a nivel de pase. Margen bruto ~85–90%.

## Comparación rápida con la competencia

| Plataforma | USD/mes | Hardware mínimo | Wallet pass nativa | Multi-tenant |
|---|---|---|---|---|
| Toast Loyalty | 50–100 + comisión | Toast POS (encadenado) | Limitado | No |
| Square Loyalty | 45 (500 visitas) | Square Terminal | No nativo | No |
| Chui Loyalty (este proyecto) | 30–80 | Cualquier iPad/Android (cámara) | Sí | Sí |
| Stamp Me, Loopy Loyalty | 25–60 | App propia | Sí | Mixed |

Diferenciación: **wallet pass nativa + multi-tenant + sin POS encadenado**. Vos vendés sin obligar a cambiar de POS, eso es mucho más fácil de ingresar a un restaurante existente.

## ¿Por qué esto puede crecer?

1. **Cero fricción de onboarding para el comercio**: el restaurante no instala nada — solo abre el POS web en su iPad. Pueden tener Toast, Square, MercadoPago, lo que sea, no importa.
2. **Cero fricción de adopción para el cliente**: nada de "instalá la app de Chui". El pase entra a Wallet con un toque.
3. **El push es gratis y no necesita app**: cualquier cambio en el pase dispara la notificación. Acceso al lock screen del cliente sin pagar APNs ni mantener una app de cliente.
4. **Multi-tenant nativo**: agregar el segundo, tercer y vigésimo restaurante es solo crear un row en `Tenant`.

## Próximos hitos comerciales

1. Validar con Chui que el ticket promedio sube y la frecuencia de visita aumenta (KPI clave de cualquier programa de loyalty).
2. Onboardear 2–3 restaurantes amigos a precio de costo durante 3 meses para refinar el flujo.
3. Construir landing pública + autoservicio de alta. Recién ahí se puede escalar comercialmente.
