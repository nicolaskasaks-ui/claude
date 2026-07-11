# HANDOFF — Product Marketing Packs (negocio de contenido para sellers)

> Estado al 2026-07-11. Sesión remota de Claude Code (rama `claude/product-photo-video-skill-gwk9f1`).
> Para continuar en la Mac: `git fetch origin claude/product-photo-video-skill-gwk9f1 && git checkout claude/product-photo-video-skill-gwk9f1`, abrir Claude Code con el MCP de **Higgsfield** conectado, y decir: *"lee HANDOFF-marketing-packs.md y continuá donde quedó"*.

---

## 1. El negocio (contexto en una línea)

Vender **packs de material de marketing generado con IA** (fotos studio + lifestyle + video + UGC) a sellers de Amazon/Shopify que tienen buenas reviews pero solo fotos estáticas básicas. Se prospectó una lista de 50; el flujo es: demo gratis con SU producto → cold email → cerrar el pack completo.

## 2. Lo ya construido

### Skill `product-marketing-packs` (commiteada en esta rama)
- `.claude/skills/product-marketing-packs/SKILL.md` — orquestación: intake (URL o foto) → brief → 4 packs → entrega + página de pitch.
- `.claude/skills/product-marketing-packs/references/pack-specs.md` — prompts exactos, aspect ratios, secuencia de tools por pack.
- `.claude/skills/product-marketing-packs/references/outreach.md` — pricing por tiers, loop de batch por prospecto, reglas do/don't.
- Nota: `.gitignore` tiene la excepción `!.claude/skills/` para que la skill se versione.

Los 4 packs por defecto: **1) Studio/Hero** (blanco puro, 1:1), **2) Lifestyle** (contexto real, 4:5), **3) Video** (5-12s, 9:16/1:1/16:9), **4) UGC** (talking-head estilo TikTok con voz).

## 3. Cliente elegido para el primer demo: **Kitchenley**

Tienda Shopify de kitchen gadgets. Por qué: 8,289 reviews a 4.86★ (facturan de verdad), mid-size (el dueño lee el inbox), categoría con máximo salto foto→video, y "kitchen gadgets TikTok" es género probado.

- Web: https://kitchenley.com
- Contacto: `Admin@kitchenley.com` · página: https://kitchenley.com/pages/contact
- También venden en Amazon (storefront "Kitchenly") y tienen canal de YouTube → el pitch multicanal les pega doble.

**Productos reales encontrados (elegir uno para anclar el demo):**
1. ⭐ Cast Iron Skillet 10.5" pre-seasoned — https://kitchenley.com/products/pre-seasoned-cast-iron-skillet-10-5-inch-heat-distribution-versatile-cooking-nonstick-surface-campfire-safe-easy-drain-pour
2. Canasta de drenaje magnética (el más "TikTok viral") — https://kitchenley.com/products/magnetic-sink-drain-basket-triangle-vegetable-and-fruit-drainage-basket-food-waste-filter-collector-kitchen-storage-organizer
3. Termo/taza café inox 380/510ml — https://kitchenley.com/products/380ml-510ml-stainless-steel-coffee-cup-thermal-mug-garrafa-termica-cafe-copo-termico-caneca-non-slip-travel-car-insulated-bottle

**Alternativas si Kitchenley no responde:** Petivoo (pet, mejor tasa de respuesta probable: `deals@petivoo.store`, `support@petivoo.store`, tel 978-615-9222) · Yechen Home (muebles, ticket alto: `service@yechenhome.com`, tel 1-888-292-2399).

## 4. Demo-concepto YA generado (Higgsfield)

Se generó un demo con un gadget representativo (prensa de ajo inox) para validar calidad. Assets renderizados (visibles también en el panel de Higgsfield / `show_generations`):

| Asset | Job ID | URL |
|---|---|---|
| Hero studio 1:1 | `af76633a-0ea4-4c76-84b3-2ef04884776a` | https://d8j0ntlcm91z4.cloudfront.net/user_31NkqhnmAPsj1G4slFERZiVbHzB/hf_20260711_212940_af76633a-0ea4-4c76-84b3-2ef04884776a.png |
| Lifestyle 4:5 | `146893a9-e49c-4941-8649-22fcd0fa3e82` | https://d8j0ntlcm91z4.cloudfront.net/user_31NkqhnmAPsj1G4slFERZiVbHzB/hf_20260711_212942_146893a9-e49c-4941-8649-22fcd0fa3e82.png |
| UGC video 12s 9:16 con voz | `3d3539e5-ce2f-4911-aeb7-799fddd64b95` | https://d8j0ntlcm91z4.cloudfront.net/user_31NkqhnmAPsj1G4slFERZiVbHzB/hf_20260711_213029_3d3539e5-ce2f-4911-aeb7-799fddd64b95.mp4 |

Detalle clave: el modelo `marketing_studio_video` convirtió solo el prompt en un **UGC con creadora hablando** ("Okay this garlic press is unreal—solid stainless, super comfy grip… it makes prep so much faster") — ese formato es el corazón de la oferta.

**Créditos Higgsfield:** plan Creator, quedaban **~1,933** tras el demo (~276 gastados). Un demo completo cuesta ~250-300 créditos.

## 5. Bloqueos de esta sesión (y por qué en la Mac desaparecen)

- El entorno remoto tiene **egress allowlist**: 403 del proxy a kitchenley.com, shop.app, archive.org, r.jina.ai y cloudfront (no se pudieron descargar assets a disco ni scrapear el sitio). **En la Mac no existe este proxy** → se puede abrir el sitio, bajar la foto real del producto y descargar los assets sin problema.
- `show_marketing_studio(action='fetch', url=...)` (ingesta server-side de la URL de producto de Higgsfield) falló por "requires approval" — en sesión interactiva en la Mac ese prompt de aprobación sí aparece. **Probar primero esta vía**: le pasás la URL del skillet y Higgsfield scrapea el producto desde SUS servers.

## 6. Próximos pasos exactos (en orden)

1. **Anclar el demo al producto real** — dos vías:
   - Vía A (preferida): `show_marketing_studio(action='fetch', type='product', url='<URL del skillet>')` y aprobar el prompt. Higgsfield trae título + imágenes solo.
   - Vía B: abrir la página del skillet, click derecho en la foto principal → copiar dirección de imagen (`kitchenley.com/cdn/shop/...`) → `media_import_url(url)` → usar el `media_id` como referencia.
2. **Regenerar los 3-4 assets** con la referencia real (seguir `references/pack-specs.md`; el media_id va en `medias[{value, role}]` de `generate_image`/`generate_video`). Upscale de finales.
3. **Página de preview antes/después** (Artifact HTML): foto actual de su listing vs. los packs generados. Es lo que se manda en el email.
4. **Enviar el cold email** a `Admin@kitchenley.com` (template abajo) con el link del preview.
5. Si no responden en ~4 días hábiles: follow-up corto (1 línea + re-link). Si no, repetir el flujo con Petivoo.
6. Al cerrar: cotizar por tiers (ver `references/outreach.md`) y producir el lineup completo.

## 7. Cold email listo (copiar/pegar)

> **Subject:** Turned your cast iron skillet into a TikTok-style video — free sample
>
> Hi Kitchenley team,
>
> 8,000+ ratings at 4.8★ is serious product-market fit — but your listings are still doing all that work with static photos only.
>
> So I made you a quick sample with your 10.5" cast iron skillet: a clean studio shot, a lifestyle scene, and a UGC video with a creator voice-over — the format that's crushing it on TikTok/Reels right now.
>
> 👉 {link al preview}
>
> Free sample, no strings. If you like it, I'll do your full hero lineup (photos + video + UGC, cut for every platform — Amazon, Shopify, TikTok). Want the set?
>
> — {nombre}
> {contacto}

## 8. Reglas que ya están decididas (no re-litigar)

- UGC = persona **generada**, nunca la cara/voz/nombre de un cliente real. Nada de reviews falsas ni endorsements inventados.
- La imagen de referencia es la fuente de verdad del producto: no inventar detalles del packaging.
- Siempre chequear `balance` y avisar el costo antes de un batch grande.
- Gigantes con equipo creativo propio (Brooklinen, Ruggable, Paula's Choice, etc.) NO son targets de cold outreach.
