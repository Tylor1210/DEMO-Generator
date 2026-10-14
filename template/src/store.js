// Tiny global store (no dependency). The 3D scene reads getState() every frame without re-rendering.
import { useSyncExternalStore } from 'react'
import { brand, bundleWord, cap } from './brand'
import { track } from './analytics'

const subs = new Set()
let state = null

export function initStore() {
  state = {
    selected: brand.featuredIndex ?? 0, // product shown as the "hero" everywhere
    detail: -1, // product opened in the shop detail view
    cart: {}, // { productIndex: qty }
    bundles: [], // [{ key, items: [productIndex], discount }] bundles keep their discount in the cart
    box: [], // bundle being built in the shop: [{ key, index }]
    cartOpen: false,
    toast: null,
  }
}

export const getState = () => state
export function setState(patch) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }
  subs.forEach(fn => fn())
}
const subscribe = cb => { subs.add(cb); return () => subs.delete(cb) }
export const useStore = sel => useSyncExternalStore(subscribe, () => sel(state))

const P = () => brand.products
let toastTimer
function toast(msg) {
  setState({ toast: msg })
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => setState({ toast: null }), 2200)
}

export const actions = {
  select(index, source) {
    if (index === state.selected) return
    setState({ selected: index })
    track('product_select', { product: P()[index].id, source })
  },
  openDetail(index, source = 'shop') {
    setState({ detail: index, selected: index })
    track('product_open', { product: P()[index].id, source })
  },
  closeDetail() { if (state.detail >= 0) setState({ detail: -1 }) },
  addToCart(index, source) {
    setState(s => ({ cart: { ...s.cart, [index]: (s.cart[index] || 0) + 1 } }))
    track('add_to_cart', { product: P()[index].id, source })
    toast(`${P()[index].name} added to cart`)
  },
  setQty(index, qty) {
    setState(s => {
      const cart = { ...s.cart }
      if (qty <= 0) delete cart[index]; else cart[index] = qty
      return { cart }
    })
  },
  addToBox(index) {
    const max = brand.shop.bundleSize
    if (state.box.length >= max) { toast(`Your ${bundleWord()} is full`); return }
    const box = [...state.box, { key: `${index}-${Date.now()}`, index }]
    setState({ box })
    track('bundle_add', { product: P()[index].id, filled: box.length })
    if (box.length === max) {
      track('bundle_complete', { products: box.map(r => P()[r.index].id).join(',') })
      toast(`${cap(bundleWord())} complete. Discount unlocked.`)
    } else toast(`${P()[index].name} added to your ${bundleWord()}`)
  },
  removeFromBox(key) { setState(s => ({ box: s.box.filter(r => r.key !== key) })) },
  boxToCart() {
    const full = state.box.length === brand.shop.bundleSize
    if (full) {
      const bundle = { key: `b${Date.now()}`, items: state.box.map(r => r.index), discount: brand.shop.bundleDiscount }
      setState(s => ({ bundles: [...s.bundles, bundle], box: [], cartOpen: true }))
    } else {
      const cart = { ...state.cart }
      state.box.forEach(r => { cart[r.index] = (cart[r.index] || 0) + 1 })
      setState({ cart, box: [], cartOpen: true })
    }
    track('bundle_to_cart', { size: state.box.length, full })
  },
  removeBundle(key) { setState(s => ({ bundles: s.bundles.filter(b => b.key !== key) })) },
  toggleCart(open) { setState(s => ({ cartOpen: open ?? !s.cartOpen })) },
}

// Prices can be unknown (null). Totals cover what we know and count what we don't.
export function totals(s) {
  let sum = 0, unknown = 0, saved = 0
  for (const [i, q] of Object.entries(s.cart)) {
    const p = brand.products[i].price
    if (p == null) unknown += q; else sum += p * q
  }
  for (const b of s.bundles) {
    for (const i of b.items) {
      const p = brand.products[i].price
      if (p == null) unknown++; else { sum += p * (1 - b.discount); saved += p * b.discount }
    }
  }
  const count = Object.values(s.cart).reduce((a, q) => a + q, 0) + s.bundles.reduce((a, b) => a + b.items.length, 0)
  return { sum, unknown, saved, count }
}
