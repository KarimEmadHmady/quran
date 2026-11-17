'use client';

import { CART_MAX_ITEMS, useCartStore } from '@/store/useCartStore';
import { Icon } from './Icon';

/** "+ أضف للسلة" / "في السلة ✓" (spec 4.1). */
export function CartToggle({ ayahId }: { ayahId: number }) {
  const inCart = useCartStore((s) => s.items.some((i) => i.ayahId === ayahId));
  const full = useCartStore((s) => s.items.length >= CART_MAX_ITEMS);
  const add = useCartStore((s) => s.add);
  const remove = useCartStore((s) => s.remove);
  return (
    <button
      type="button"
      onClick={() => (inCart ? remove(ayahId) : add(ayahId))}
      disabled={!inCart && full}
      aria-pressed={inCart}
      title={!inCart && full ? `السلة فيها ${CART_MAX_ITEMS} آية (الحد الأقصى)` : undefined}
      className={`ui-chip disabled:opacity-50 ${inCart ? '!border-[var(--accent)] !bg-[var(--accent)] !text-white' : ''}`}
    >
      <Icon name="cart" className="h-4 w-4" />
      {inCart ? 'في السلة ✓' : '+ أضف للسلة'}
    </button>
  );
}
