// Shared state between GSAP (writes) and the 3D scene (reads every frame).
// focus:  hero -> featured product forward (0..1)
// spin:   beat index, fractional (0..beats-1)
// offer:  beats -> offer close-up (0..1)
// shop:   offer -> products ride on the shop cards (0..1)
export const S = { focus: 0, spin: 0, offer: 0, shop: 0, reduced: false }

// DOM anchors the 3D products attach to (shop cards, routine box).
export const anchors = new Map()
export const anchorRef = key => el => { if (el) anchors.set(key, el); else anchors.delete(key) }

// Live product groups, so other 3D pieces (routine box) can read their positions.
export const productGroups = []
