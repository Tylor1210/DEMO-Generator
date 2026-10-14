# Shape catalog (L3)

The template draws packaging from parameters. There are no per-demo 3D models. Pick the shape closest to the real package; when nothing fits, use `photo`.

| shape | Looks like | Use for |
|---|---|---|
| can | 12 oz aluminum drink can | soda, sparkling water, energy drinks, canned cocktails, cold brew cans |
| bottle | tall bottle with a cap | cleansers, toners, shampoo, hot sauce, juice, kombucha bottles, oils |
| dropper | small glass bottle with a dropper | serums, face oils, tinctures, extracts |
| jar | short wide jar with a lid | moisturizers, balms, chili crisp, jams, nut butters, candles |
| tube | squeeze tube with a cap | sunscreen, lotion, toothpaste, gel, condiments in tubes |
| tub | wide plastic tub with a screw lid | protein powder, supplements, greens powder, pre-workout |
| photo | the product photo on a rounded slab | bags of coffee, boxes, apparel, pouches, bars, anything else |

## Rules
- One shape per product. Products in one lineup can mix shapes.
- An uploaded "label artwork" image is wrapped around the shape (`label`). It works best on can, bottle, jar and tub.
- An uploaded "product photo" forces `photo` and sets `photo` to that image.
- If the scraped product image clearly shows a bag, box or pouch, use `photo` with that image.
- Colors: `color` is the main package color, `deep` a darker shade for shading and gradients, `ink` the text color on the package (must read on `color`).
