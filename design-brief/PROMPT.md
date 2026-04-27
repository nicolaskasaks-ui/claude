# Prompt listo para pegar en Claude.ai

> Cómo usarlo: subí TODOS los archivos de esta carpeta a un nuevo chat en `claude.ai` (drag & drop), y pegá el siguiente texto. Claude tiene soporte de imágenes, vision, y puede generar SVG/HTML que después se rasterizan a PNG.

---

## El prompt

```
Necesito que diseñes 4 "strip images" para pases Apple Wallet del programa de membresía
de Chuí, un restaurante en Buenos Aires (cocina al fuego, patio tropical bajo vías de tren,
calidez sin pretensión).

Te subí en este chat:
- Tipografías oficiales (futura-bold.ttf y mabrypro-*.otf) — son las fuentes de la marca
- Imágenes del sitio chui.com.ar para referencia (web-hero.jpg, web-comida.png, logos)
- Logo actual del pase (pass-logo-current.png — monograma CH sobre verde)
- Strips placeholder actuales (01-04 current placeholder) — NO son referencia, son lo
  que queremos reemplazar
- BRIEF.md — el brief completo con todas las especificaciones

Por favor leé BRIEF.md primero, después generá los 4 strips siguiendo:

1. AMIGO DE CHUÍ          (tier de entrada — sobrio, cálido)
2. HABITUÉ DE CHUÍ        (tier mid — íntimo, refinado)
3. COFRADE DEL FUEGO      (tier top — núcleo, único que puede llevar acento ember #C4622A)
4. REGALO DE CHUÍ         (gift card — festivo pero contenido)

Especificaciones obligatorias:
- Cada strip: 3 versiones PNG (375×144, 750×288, 1125×432)
- Fondo verde profundo #10281A (rgb 16,40,26)
- Foreground cream #EDEBE2 (rgb 237,235,226)
- Wordmarks en Futura Bold mayúsculas (la fuente está adjunta)
- Subtítulos / detalles en Mabry Pro si los hay
- Sin emojis, sin gradientes complejos, sin iconografía religiosa/medieval/luxury
- Cada tier tiene que sentirse parte de la misma familia, distinguidos por refinamiento
  no por bling
- Safe area: 24px de margen lateral a 1x (los iconos del header del pase los tapan parcial)

Output que necesito:

OPCIÓN A (preferida): generá SVGs vectoriales de cada strip que pueda rasterizar yo a PNG.
Si elegís esta vía, dame los 4 SVGs en bloques de código separados, con dimensiones
viewBox="0 0 375 144" y todo el typesetting en Futura Bold (font-family="Futura").

OPCIÓN B: generá los 12 PNGs directamente (4 strips × 3 densidades) si tenés acceso a
herramienta de imagen y typography rendering preciso.

OPCIÓN C: si no podés generar archivos, dame instrucciones detalladas para Figma:
posicionamiento exacto, font-size en px, tracking, color hex, decoraciones, layer por layer,
listo para que un diseñador lo arme en 30 minutos.

Antes de empezar, hacé 1-2 propuestas de concepto en texto (qué carácter visual va a
tener cada tier y por qué) para que yo apruebe la dirección. Después armás los 4.

Cualquier cosa que necesites aclarar sobre el brief, preguntá.
```

---

## Tips para usarlo bien

1. **Subí todos los archivos a la vez**: Claude.ai te deja arrastrar varios PNGs/JPGs/MD/TTF al chat. Las TTF/OTF Claude las puede leer como referencia (no las renderiza pero las "ve" como assets).

2. **Iterá**: si la primera propuesta no te convence, decile "más sobrio" / "más cálido" / "más refinado" / "el ember se ve cheap, sacalo". Claude itera bien sobre design feedback.

3. **Si entrega SVGs**: pasás los 4 SVGs al script `scripts/gen-tier-strips.ts` (lo modificamos rápido) y rasteriza a las 3 densidades. Lo armo yo cuando me pases los SVG.

4. **Si entrega PNGs**: directamente los reemplazás en `assets/passes/chui/strips/{amigo,habitue,cofrade}/strip{,@2x,@3x}.png` y `assets/passes/chui/gift/strip{,@2x,@3x}.png`. No requiere cambios en código.

5. **Si entrega instrucciones Figma**: las pasás a un diseñador (1-2 horas de trabajo). Si no tenés diseñador a mano, pegá las instrucciones en otro chat de Claude pidiéndole que las convierta a SVG.

---

## Plan B: si Claude.ai no llega al nivel visual que querés

Alternativas si lo que sale del prompt no es suficiente:

- **Figma + diseñador humano**: el BRIEF.md + las fuentes + los placeholders dan trabajo de un par de horas a un diseñador profesional. Costo estimado AR: $80-150 USD por los 4 strips finales con sus 3 densidades.
- **Midjourney / FLUX 2 Pro** para generar texturas/imaginería, y después componer el wordmark encima en Figma. Esto es lo que recomiendo si querés que el strip tenga foto real (ej: textura del piso del patio, hojas, brasas).
- **Veo Anthropic Skills** (`anthropic-skills:canvas-design` o `web-design-expert`) — son skills que ya están instalados localmente para tareas de diseño visual programático.
