# HANDOFF — Product Marketing Packs (negocio de contenido para sellers)

> Estado al 2026-07-11. Sesión remota de Claude Code (rama `claude/product-photo-video-skill-gwk9f1`).
> Para continuar en la Mac: clonar/checkout de esta rama (remote: `https://github.com/nicolaskasaks-ui/claude.git`), abrir Claude Code con el MCP de **Higgsfield** conectado, y decir: *"lee HANDOFF-marketing-packs.md y continuá donde quedó"*.

---

## 1. El negocio (contexto en una línea)

Vender **packs de material de marketing generado con IA** (fotos studio + lifestyle + video + UGC) a sellers de Amazon/Shopify que tienen buenas reviews pero solo fotos estáticas básicas. Flujo: demo gratis con SU producto → cold email con el "después" → cerrar el pack completo → retainer mensual.

## 2. Lo ya construido

### Skill `product-marketing-packs` (commiteada en esta rama)
- `.claude/skills/product-marketing-packs/SKILL.md` — orquestación: intake (URL o foto) → brief → 4 packs → entrega + página de pitch.
- `.claude/skills/product-marketing-packs/references/pack-specs.md` — prompts exactos, aspect ratios, secuencia de tools por pack.
- `.claude/skills/product-marketing-packs/references/outreach.md` — pricing por tiers, loop de batch por prospecto, reglas do/don't.
- Nota: `.gitignore` tiene la excepción `!.claude/skills/` para que la skill se versione.

Los 4 packs por defecto: **1) Studio/Hero** (blanco puro, 1:1), **2) Lifestyle** (contexto real, 4:5), **3) Video** (5-12s, 9:16/1:1/16:9), **4) UGC** (talking-head estilo TikTok con voz).

## 3. Cliente elegido para el primer demo: **Kitchenley**

Tienda Shopify de kitchen gadgets. Por qué: 8,289 reviews a 4.86★ (facturan de verdad), mid-size (el dueño lee el inbox), categoría con máximo salto foto→video, y "kitchen gadgets TikTok" es género probado.

- Web: https://kitchenley.com · Contacto: `Admin@kitchenley.com` · https://kitchenley.com/pages/contact
- También venden en Amazon (storefront "Kitchenly") y tienen canal de YouTube → pitch multicanal.

**Productos reales encontrados (elegir uno para anclar el demo):**
1. ⭐ Cast Iron Skillet 10.5" pre-seasoned — https://kitchenley.com/products/pre-seasoned-cast-iron-skillet-10-5-inch-heat-distribution-versatile-cooking-nonstick-surface-campfire-safe-easy-drain-pour
2. Canasta de drenaje magnética (el más "TikTok viral") — https://kitchenley.com/products/magnetic-sink-drain-basket-triangle-vegetable-and-fruit-drainage-basket-food-waste-filter-collector-kitchen-storage-organizer
3. Termo/taza café inox 380/510ml — https://kitchenley.com/products/380ml-510ml-stainless-steel-coffee-cup-thermal-mug-garrafa-termica-cafe-copo-termico-caneca-non-slip-travel-car-insulated-bottle

## 4. Demo-concepto YA generado (Higgsfield)

Demo con un gadget representativo (prensa de ajo inox) para validar calidad. Assets renderizados (también en el panel de Higgsfield / `show_generations`):

| Asset | Job ID | URL |
|---|---|---|
| Hero studio 1:1 | `af76633a-0ea4-4c76-84b3-2ef04884776a` | https://d8j0ntlcm91z4.cloudfront.net/user_31NkqhnmAPsj1G4slFERZiVbHzB/hf_20260711_212940_af76633a-0ea4-4c76-84b3-2ef04884776a.png |
| Lifestyle 4:5 | `146893a9-e49c-4941-8649-22fcd0fa3e82` | https://d8j0ntlcm91z4.cloudfront.net/user_31NkqhnmAPsj1G4slFERZiVbHzB/hf_20260711_212942_146893a9-e49c-4941-8649-22fcd0fa3e82.png |
| UGC video 12s 9:16 con voz | `3d3539e5-ce2f-4911-aeb7-799fddd64b95` | https://d8j0ntlcm91z4.cloudfront.net/user_31NkqhnmAPsj1G4slFERZiVbHzB/hf_20260711_213029_3d3539e5-ce2f-4911-aeb7-799fddd64b95.mp4 |

Detalle clave: `marketing_studio_video` convirtió solo el prompt en un **UGC con creadora hablando** ("Okay this garlic press is unreal—solid stainless, super comfy grip… it makes prep so much faster") — ese formato es el corazón de la oferta.

**Créditos Higgsfield:** plan Creator, quedaban **~1,933** tras el demo (~276 gastados). Un demo completo cuesta ~250-300 créditos → alcanza para ~6-7 demos más sin recargar.

## 5. LISTA COMPLETA DE PROSPECTOS (50)

Origen: investigación previa — sellers de Amazon/Shopify con reviews fuertes que hoy dependen solo de fotos estáticas. Reordenada acá por **prioridad de outreach** según los 4 filtros: (1) contacto directo publicado, (2) tamaño mid (el dueño lee el inbox), (3) categoría donde video/UGC es obviamente el eslabón faltante, (4) facilidad de producir un demo convincente.

### TIER A — Atacar primero (contacto directo + mid-size + categoría visual)

| # | Seller | Categoría | Prueba social | Contacto |
|---|--------|-----------|---------------|----------|
| 1 | **Kitchenley** ⭐ EN CURSO | Kitchen gadgets (Shopify) | 8,289 reviews, 4.86★, 2.5M+ clientes | Admin@kitchenley.com · kitchenley.com |
| 2 | **Petivoo** | Pet (Shopify) | 2,400+ reviews, 4.8★ | deals@petivoo.store · support@petivoo.store · tel 978-615-9222 |
| 3 | **Yechen Home** | Muebles rattan/boho (Shopify) | 676 reviews, 4.99★ | service@yechenhome.com · tel 1-888-292-2399 |
| 4 | **The Blackened Teeth** | Decor gótico (Shopify) | 3,841 reviews, 4.96★ | contact@theblackenedteeth.com |
| 5 | **Majesty Home Decor** | Wall art de lujo (Shopify) | 1,000+ reviews, 4.8★ | info@majestyhomedecor.com |
| 6 | **Pookie Pets** | Pet boutique (Shopify) | boutique, wholesale disponible | info@shoppookiepets.com |
| 7 | **Kitchen Tales** | Cocina (Shopify) | 150K+ unidades, 4.8★ | kitchentales.shop |
| 8 | **Zayan and Zidan** | Muebles/lighting lujo (Shopify) | 1,200+ reviews, 4.9★ | zayanandzidan.com |
| 9 | **My Kitchen Gadgets** | Gadgets cocina (Shopify) | reviews verificadas | my-kitchengadgets.com |
| 10 | **Ornate Home** | Muebles/decor (Shopify, 5 empleados) | desde 2021 | ornatehome.com |
| 11 | **Prepared Hero** | Emergencia/seguridad | — | support@preparedhero.com · tel 888-457-2672 · Sheridan, WY |
| 12 | **NearMoon** | Baño/home improvement (Amazon+web) | 10K+ reviews, 5.0★ | support@nearmoon.net · tel +86 135 1075 9792 |
| 13 | **Gulf Coast Pet Supplies** | Pet (Amazon+web) | 4.9★ | gulfcoastpetsupplies.com (Harbor Pet Supplies LLC) |
| 14 | **Tree of Life Beauty** | Skincare natural (Amazon+web) | 4.9★, 1,623 ratings | treeoflifebeauty.com |
| 15 | **Zazzee Naturals** | Suplementos/beauty (Amazon+web) | — | info@zazzeenaturals.com · Austin, TX 78741 |

### TIER B — Segunda ola (contacto existe pero más débil, o demo más difícil)

| # | Seller | Categoría | Prueba social | Contacto |
|---|--------|-----------|---------------|----------|
| 16 | MIULEE / Miulee Home | Cortinas/almohadones | 54K+ reviews, 4.9★ | contact@miulee.com · SF, CA |
| 17 | LinenSpa | Colchones/bedding | marca grande | info@linenspa.com · tel 844-871-7087 |
| 18 | Bare Home | Bedding (MN) | 4.83★ | care@barehome.com |
| 19 | Just Love Fashion | Pijamas/loungewear | 148K+ feedback, Top 150 | justlovefashion.com · M&A Imports, Amityville NY |
| 20 | Bellaterra Cosmetics | Mineral makeup USA | 4,000+ reviews, 4.6★ | mallcosmetics.com |
| 21 | Vtopmart | Organización cocina | — | vtopmart.net |
| 22 | Apex Tool Supply | Repuestos motor/tools | 3,935 ratings, 4.9★ | Avian Services LLC, Anchorage AK |
| 23 | HVAC And TOOLS Direct | HVAC tools | 802 ratings, 92% | Imperial WA AC Supply, Miami FL |
| 24 | Utopia Deals / Utopia Brands | Bedding/kitchen/home | Top brand | utopiadeals.com · utopiabrands.com |
| 25 | Life and Home | Home & kitchen, tools | Top 1000 Amazon | web propia |
| 26 | Elite Home & Kitchen | Home/kitchen Amazon | — | — |
| 27 | Cumulus Clogs | Calzado | 4K+ reviews, 5.0★ | Amazon (desde 2019) |
| 28 | 1TopTools | Herramientas multimarca | 4.7★, 517 ratings | Amazon |
| 29 | MiYang Fashion Store | Moda mujer/swim/plus | 16,988 reviews, 5.0★, Top 1000 | Amazon |
| 30 | Queen Bee Organic Skin Care | Skincare orgánico | 4.8★, 1,161 ratings | Amazon-only |

### TIER C — Amazon-only sin canal directo (requieren otro approach: Amazon messaging, LinkedIn del owner, o esperar a encontrarles web)

| # | Seller | Categoría | Prueba social |
|---|--------|-----------|---------------|
| 31 | Flora Home (Biscaynebay) | Bedding | 4.85★ |
| 32 | Bedecor | Bed skirts/encasements | 97K+ reviews, 4.89★ |
| 33 | Piperclassics | Farmhouse bedding | 16K+ reviews, 4.89★ |
| 34 | decorUhome | Home decor | 4,130 reviews, 5.0★, Top 1200 |
| 35 | CVHOMEDECO | Decor madera/LED | 4.8★, 439 ratings |
| 36 | Tfs Home Decor (Freshculture) | Bed skirts/sheets | 4.5★ |
| 37 | Klar&Co. | K-beauty | 1,905 reviews, 5.0★, Top 5000 |
| 38 | Pogi's Pet Supplies | Grooming/wipes | 16K+ reviews, 4.9★ (Phantom Holdings, HK) |
| 39 | J&C Pet Supply | Pet | 16,020 reviews, 5.0★ (desde 2017) |
| 40 | YowPets! | Pet | 19,956 reviews, 5.0★ |
| 41 | MIDOG-USA INC | Collares inflables/juguetes | 4.9★, 329 ratings |
| 42 | CRZ YOGA | Activewear | 76K+ reviews, 5.0★, Top 300 |

### TIER D — NO hacer cold outreach (gigantes con equipo creativo propio; solo servirían por referido/inbound)

| # | Seller | Por qué descartado |
|---|--------|--------------------|
| 43 | Brooklinen | DTC grande, equipo creativo in-house (hello@brooklinen.com · tel 646-798-7447) |
| 44 | Ruggable | Ídem (support@ruggable.com · tel 877-331-4662) |
| 45 | Paula's Choice | Corporación skincare, Seattle |
| 46 | COSRX | K-beauty global, Top 500 Amazon |
| 47 | Pixi Beauty | Marca establecida desde 1999 (friends@pixibeauty.com) |
| 48 | Kosas Cosmetics | Clean beauty con agencia (letschat@kosas.com) |
| 49 | Bedsure | Amazon Top 100, corporativo (safety@bedsurehome.com · tel 855-888-9966) |
| 50 | Zulay Kitchen | 100K+ reviews, equipo grande (wholesale@zulay.net) |

> ⚠️ Los datos de contacto vienen de una investigación previa (2026-07): **verificar cada email/teléfono antes de enviar** (mirar la página de contacto actual del sitio). Respetar CAN-SPAM: identificarse, dirección física real, y opt-out en cada email.

## 6. Bloqueos de la sesión remota (y por qué en la Mac desaparecen)

- El entorno remoto tenía **egress allowlist**: 403 del proxy a kitchenley.com, shop.app, archive.org, r.jina.ai y cloudfront (no se pudo scrapear el sitio ni descargar assets). **En la Mac no existe ese proxy** → abrir el sitio, copiar la foto del producto y bajar los assets funciona directo.
- `show_marketing_studio(action='fetch', url=...)` (Higgsfield ingesta la URL de producto desde SUS servers) falló por "requires approval" — en sesión interactiva en la Mac el prompt de aprobación sí aparece. **Probar primero esta vía.**

## 7. Próximos pasos exactos (en orden)

1. **Anclar el demo al producto real de Kitchenley** — dos vías:
   - Vía A (preferida): `show_marketing_studio(action='fetch', type='product', url='<URL del skillet>')` y aprobar el prompt.
   - Vía B: abrir la página del skillet, click derecho en la foto principal → copiar dirección de imagen (`kitchenley.com/cdn/shop/...`) → `media_import_url(url)` → usar el `media_id` como referencia en `generate_image`/`generate_video` (`medias[{value, role}]`).
2. **Regenerar los 3-4 assets** con la referencia real (seguir `references/pack-specs.md`). Upscale de finales.
3. **Página de preview antes/después** (Artifact HTML): foto actual del listing vs. packs generados. Es lo que va en el email.
4. **Verificar el email de contacto actual** en kitchenley.com/pages/contact y **enviar el cold email** (template abajo).
5. Sin respuesta en ~4 días hábiles → follow-up de 1 línea + re-link. Sin respuesta → siguiente del Tier A (Petivoo).
6. Al cerrar: cotizar por tiers (ver `references/outreach.md`) y producir el lineup completo.
7. En paralelo (opcional): correr demos batch para los Tier A #2-#6 — con ~1,900 créditos alcanzan ~6 demos.

## 8. Cold email listo (copiar/pegar)

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
> {contacto + dirección física + unsubscribe}

## 9. Reglas ya decididas (no re-litigar)

- UGC = persona **generada**, nunca la cara/voz/nombre de un cliente real. Nada de reviews falsas ni endorsements inventados.
- La imagen de referencia es la fuente de verdad del producto: no inventar detalles del packaging.
- Siempre chequear `balance` y avisar el costo antes de un batch grande.
- Tier D no recibe cold outreach.
- El contenido se entiende como generado; el seller aprueba antes de publicar en su listing.
