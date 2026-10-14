// CSS-only product render. Paints instantly, used for the static variant, low-end devices,
// reduced motion, and as the placeholder before 3D loads (hidden once html.has-3d is set).
// Photo-shape products show their real product photo instead.
import { asset, brand } from '../brand'

export default function StaticProduct({ product, className = '' }) {
  const photo = product.shape === 'photo' ? asset(product.photo || product.image) : null
  if (photo) {
    return (
      <div className={`sp sp-photo ${className}`} aria-hidden="true">
        <img src={photo} alt="" loading="lazy" decoding="async" />
      </div>
    )
  }
  return (
    <div
      className={`sp sp-${product.shape} ${className}`}
      style={{ '--c': product.color, '--d': product.deep, '--ink': product.ink }}
      aria-hidden="true"
    >
      <div className="sp-cap" />
      <div className="sp-body">
        <span className="sp-wm">{brand.wordmark}</span>
        <span className="sp-name">{product.name}</span>
        <span className="sp-type">{product.type}</span>
      </div>
    </div>
  )
}
