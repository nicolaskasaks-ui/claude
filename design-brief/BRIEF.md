# Brief de diseño · Pases Apple Wallet de Chuí Friends

## Contexto

Estamos rediseñando los **strips** (la imagen hero que ocupa el centro del pase) para los 4 pases que vamos a emitir desde el programa de membresía:

1. **Amigo de Chuí** (tier de entrada, automático al enrolar)
2. **Habitué** (tier mid, ~6 visitas o $300k/año)
3. **Cofrade del Fuego** (tier top, ~24 visitas o $1.2M/año)
4. **Regalo de Chuí** (tarjeta de regalo, no es un tier)

Los pases existen en `assets/passes/chui/`. Tenemos placeholders generados por código (Helvetica Neue + texto plano) que vienen de muestra en esta carpeta como `01-current-amigo-placeholder.png` etc. **Esos NO van a producción** — los vamos a reemplazar con el output de este brief.

---

## ADN visual a respetar

La fuente de verdad es chui.com.ar. Lo que está en este brief refleja lo que está vivo ahí.

### Tipografías

Las fuentes oficiales de la marca están en esta carpeta como archivos:

| Archivo | Uso |
|---|---|
| `futura-bold.ttf` | Display, wordmarks en mayúsculas |
| `mabrypro-bold.otf` | Énfasis dentro de body |
| `mabrypro-regular.otf` | Body principal |
| `mabrypro-light.otf` | Body suave, captions |

**Reglas duras de tipografía Chuí (no negociables)**:
- Futura: SOLO Bold, SOLO mayúsculas. Nunca italic, nunca regular.
- Mabry Pro: para todo lo demás.
- La palabra "Chuí" a tamaño grande NO se setea en fuente — siempre va como logo (imagen).

### Paleta de colores

| Nombre | Hex | RGB | Uso |
|---|---|---|---|
| Verde profundo | `#10281A` | `rgb(16,40,26)` | Fondo de pase, color de marca |
| Cream | `#EDEBE2` | `rgb(237,235,226)` | Foreground sobre verde, texto |
| Ember | `#C4622A` | `rgb(196,98,42)` | Acento cálido, sólo en Cofrade y donde haga sentido |
| Charcoal | `#2C4030` | `rgb(44,64,48)` | Variante más oscura del verde |

El pase entero usa **fondo verde profundo + texto cream**. Hardcoded. No tocar.

### Imaginario y mood

Mirá `web-hero.jpg`: **patio bajo las vías, verde tropical denso, mesas de madera, luz natural caliente, cocina al fuego/leña, atmósfera oasis urbano**.

Lo que NO es Chuí:
- Plant-based / vegetariano upfront
- Cocina de autor
- Luxury bling (oro, plateado, brillos)
- Cupones / OFERTAS / lenguaje de outlet
- Religioso / cofradía-medieval (aunque uno de los tiers se llama "Cofrade del Fuego", el design no debe sonar a Semana Santa)

Lo que SÍ es Chuí:
- Cocina de fuegos / a la leña
- Jardín tropical contenido por estructura urbana
- Refinamiento sin pretensión
- Calidez / hospitalidad porteña
- Repetir, ser habitué, conocerte por nombre

---

## Especificaciones técnicas Apple Wallet — strip image

El strip es la única zona del pase que es 100% nuestra para diseñar. Se renderiza arriba, ocupa todo el ancho del pase, debajo del header (donde van los puntos).

### Dimensiones (las 3 son obligatorias para Retina iPhone)

| Variante | Tamaño px | Densidad |
|---|---|---|
| `strip.png` | **375 × 144** | 1x (iPhone SE / older) |
| `strip@2x.png` | **750 × 288** | 2x |
| `strip@3x.png` | **1125 × 432** | 3x (iPhone Pro / Plus modernos) |

Apple sirve la versión que mejor matchea el device. Hay que entregar las tres.

### Restricciones técnicas

- **Formato**: PNG con transparencia opcional (pero el fondo va a ser verde sólido — sin transparencia es más predecible)
- **Compresión**: PNG-8 o PNG-24, optimizado vía `pngquant --quality=85-95` para que cada PNG pese < 80KB
- **Safe area**: dejar ~24px de margen en los lados (a 1x) — el pase tiene esquinas redondeadas, los iconos del header lo cubren parcialmente
- **Sin texto crítico en los bordes**: lo que va en el strip es decorativo / refuerzo de marca, no info funcional (eso ya está en otros campos)
- **Sin gradientes complejos** que se compriman feo en JPEG (servimos PNG, pero por las dudas)

### Estructura recomendada del strip

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│             [WORDMARK / IMAGEN / TEXTURA]                    │
│                                                              │
│             [opcional: filete / acento ember]                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
   1125px wide @ 3x         432px tall @ 3x
```

Pero está abierto. Pueden incluir foto, ilustración, textura, lo que aporte al ADN de la marca.

---

## Los 4 deliverables

### 1. Strip "Amigo de Chuí" (entry tier)

- **Wordmark sugerido**: `AMIGO DE CHUÍ` o trilingüe `AMIGO · FRIEND · AMICO DE CHUÍ`
- **Mood**: el primer reconocimiento. Cálido, abierto, "te recibimos".
- **Diferenciación visual**: el más sobrio de los tres tiers. Solo wordmark cream sobre verde.
- **Sugerencia**: Futura Bold UC, tracking amplio (~80-120 unidades), centrado vertical y horizontal. Tamaño ~32-36px @1x.

### 2. Strip "Habitué" (mid tier)

- **Wordmark sugerido**: `HABITUÉ DE CHUÍ`
- **Mood**: "venís seguido, te conocemos por nombre". Más íntimo, menos formal.
- **Diferenciación visual**: agregar un detalle gráfico mínimo que lo distinga del Amigo. Ideas:
  - Un par de puntos/asteriscos del cream
  - Un small caps subscript "miembro"
  - Una textura sutil (5% opacity) detrás del wordmark — quizás patrón inspirado en azulejos del local o textura de madera quemada

### 3. Strip "Cofrade del Fuego" (top tier)

- **Wordmark sugerido**: `COFRADE DEL FUEGO`
- **Mood**: "círculo cerrado, núcleo, mesa del chef". Refinamiento alto sin ostentación.
- **Diferenciación visual**: este es el único tier que puede tener acento **ember** (#C4622A). Ideas:
  - Filete fino ember bajo el wordmark (1-3px @1x)
  - Pequeño detalle como una llama estilizada / brasa abstracta a un costado
  - Tracking más espacioso que los otros (~140-180 unidades)
  - Quizás versales de la palabra "FUEGO" en ember en lugar de cream

### 4. Strip "Regalo de Chuí" (gift card)

- **Wordmark sugerido**: `REGALO DE CHUÍ` (o agregar EN: `REGALO · GIFT FROM CHUÍ`)
- **Mood**: festivo pero contenido. Es un regalo, no una tarjeta de débito.
- **Diferenciación visual**: aceptable que tenga un mínimo de calidez extra. Ideas:
  - Un acento ember sutil (no tan fuerte como Cofrade)
  - Mini ornamento a los lados del wordmark
  - Variante temporada (en diciembre podríamos cambiarlo a "FIESTAS")

---

## Lo que NO queremos

- Emojis de ningún tipo
- Em dash (—) en cualquier output
- Palabras huérfanas (palabra sola al final de línea)
- "Chuí" tipografeado a tamaño grande (siempre como logo si va en grande)
- Iconografía religiosa o medieval
- Iconos genéricos de loyalty (estrellas, escudos, coronas, sellos de descuento)
- Gradientes vibrantes
- Texto en italic
- Cupones, sellos de descuento, lenguaje de oferta

---

## Formato de entrega esperado

**Por cada uno de los 4 strips, queremos los 3 archivos**:

```
strip.png           # 375×144
strip@2x.png        # 750×288
strip@3x.png        # 1125×432
```

Total: **12 PNGs** (4 strips × 3 densidades).

Ubicación final en el repo (vamos a copiarlos nosotros):

```
assets/passes/chui/strips/amigo/strip{,@2x,@3x}.png
assets/passes/chui/strips/habitue/strip{,@2x,@3x}.png
assets/passes/chui/strips/cofrade/strip{,@2x,@3x}.png
assets/passes/chui/gift/strip{,@2x,@3x}.png
```

Si lo más natural es entregar SVGs primero (para iterar sobre tipografía / posicionamiento), también los aceptamos — los rasterizamos nosotros.

---

## Archivos en esta carpeta

| Archivo | Qué es |
|---|---|
| `BRIEF.md` | Este documento |
| `PROMPT.md` | Prompt listo para pegar en Claude.ai |
| `futura-bold.ttf` | Tipografía display oficial Chuí |
| `mabrypro-{light,regular,bold}.otf` | Tipografía body oficial Chuí |
| `web-hero.jpg` | Foto del local (patio bajo vías, mood reference) |
| `web-comida.png` | Foto de un plato (mood reference) |
| `web-logo.png` / `web-logo-ch.png` | Logo Chuí del sitio (transparente sobre verde) |
| `web-logo-puerta.png` | Logo grande del sitio |
| `pass-logo-current.png` | Logo actual del pase (monograma "CH" sobre verde) |
| `pass-icon-current.png` | Icono actual del pase |
| `01-current-amigo-placeholder.png` (y resto) | Strips placeholder actuales — NO son referencia, son lo que queremos reemplazar |
| `spec-strip@3x-reference.png` | Mismo placeholder a 3x para que veas la dimensión final |

---

## Notas finales

- Si querés ver el pase armado completo: airdroprear `/tmp/chui-cofrade-del-fuego.pkpass` al iPhone para ver cómo queda en Wallet (con strip placeholder actual)
- Los assets `pass-logo-current.png` y `pass-icon-current.png` se mantienen — sólo cambian los 12 strips
- El pase tiene fondo verde fijo, foreground cream fijo: el strip tiene que vivir bien sobre ese contexto, no compite ni domina
