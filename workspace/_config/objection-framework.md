# Objection beats (L3)

Every demo has exactly 4 beats, one screen each, in this order. Each beat names the doubt in the shopper's words, answers it in one line, and backs it with proof from the site.

| id | Shopper's doubt (adapt to category) | proof | What backs it |
|---|---|---|---|
| safe | Is it safe / healthy / clean? Will it break me out? What's in it? | `claims` | Ingredient, certification and "free from" claims quoted from the site |
| fit | Is it right for me? Which one should I get? | `filter` | Real product differences (skin type, flavor, heat, roast). If none, use `products` and let them pick a flavor |
| price | Is it worth the price? | `price` | Real prices, pack sizes, shipping thresholds or subscribe-and-save quoted from the site. If no prices were found, frame it on value the site states and keep prices `null` |
| where | Where do I get it? | `retailers` | Retailers and the brand's own store, named on the site |

## Writing each beat
- `question`: the doubt, as a shopper would say it. 3 to 7 words. Ends with "?".
- `title`: the answer. One sentence, under 10 words, in the brand's voice.
- `body`: 1 or 2 short sentences. Only facts the site states. UI hints are fine ("Tap a flavor").
- `claimIds`: the evidence ids that back the body.

## Category examples
- Drinks: "Is it actually good for me?" / "Which flavor is mine?" / "Is it worth it over regular soda?" / "Where can I grab one?"
- Skincare: "Will it break me out?" / "Is it right for my skin?" / "Is it worth the price?" / "Where do I get it?"
- Sauce: "What's actually in it?" / "How hot is it?" / "Is it worth $X a jar?" / "Where do I find it?"
- Coffee: "Is it ethically sourced?" / "Which roast is for me?" / "Is it worth it?" / "Where do I buy it?"
- Supplements: "Is it safe to take daily?" / "Which one fits my goal?" / "Is it worth it?" / "Where do I get it?"
