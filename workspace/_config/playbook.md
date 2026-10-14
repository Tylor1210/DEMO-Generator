# Demo playbook (L3)

Source: `scroll_web_demos/PLAYBOOK.md`. These rules decide what a demo contains. The template renders them; the brief and config feed them.

1. **Don't fight the scroll.** One idea per screen. The only pin is the short shop shelf. Always a "Skip to shop" link.
2. **Buying is one tap away.** The hero shows the primary CTA without scrolling. A sticky buy bar appears after the hero.
3. **Beats answer buying objections, not features.** Exactly 4 beats, in this order: safe, fit, price, where. See `objection-framework.md`.
4. **Shoppable 3D.** Picking a product anywhere updates the hero product. Tapping a card opens its details. A pack or routine builder raises order value.
5. **End on an offer, not a slogan.** Giant type (2 to 3 words), then a real offer and a ZIP store finder. If the site shows no offer, invent a modest one and set `isDemo: true`.
6. **Trust rides with the motion.** Claims, ratings and retailers sit inside the beat cards. Real reviews only.
7. **Speed and fallbacks.** Handled by the template. Nothing to write.
8. **Measure everything.** Handled by the template.

## What a good demo needs from the brief
- 3 to 5 hero products the brand actually sells now, with the brand's own names.
- The best-selling or flagship product as `featuredIndex`.
- A filter that helps someone pick (skin type, flavor mood, heat level, roast). Each option points to one product. Skip it if the site gives no basis for one.
- Claims the brand states, short enough for a chip (2 to 5 words each).
- Where to buy: retailers named on the site, plus the brand's own store.

## Quality bar
The hand-built Culture Pop demo is the benchmark: bold headline in the brand's voice, a clear hero product, flavors that each feel distinct, honest claims, an outro line people remember.
