import React from 'react';
import { CartItem as ICartItem } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { Plus, Minus, Trash2 } from 'lucide-react';

interface CartItemProps {
  item: ICartItem;
  onUpdateQuantity: (cartItemId: string, quantity: number) => void;
  onRemove: (cartItemId: string) => void;
}

export const CartItem: React.FC<CartItemProps> = ({
  item,
  onUpdateQuantity,
  onRemove,
}) => {
  return (
    <div className="p-3 bg-[#FAF4F2] rounded-xl border border-[#EAD8C0] shadow-xs space-y-2 hover:border-[#3A0A0F]/30 transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-[#3A0A0F] leading-snug truncate">
            {item.menuItem.name}
          </h4>
          <p className="text-xs font-semibold text-[#6B4F48]">
            {formatCurrency(item.unitPrice)}
          </p>
        </div>

        <button
          onClick={() => onRemove(item.cartItemId)}
          title="Remove item"
          className="text-[#6B4F48] hover:text-[#5B0F1B] p-1 rounded-md transition-colors shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Customizations tags */}
      {item.customizations && item.customizations.length > 0 && (
        <div className="flex flex-wrap gap-1 text-[11px] text-[#3A0A0F] bg-[#FDF6EC] p-1.5 rounded-lg border border-[#EAD8C0]">
          {item.customizations.map((mod, idx) => (
            <span key={idx} className="bg-[#EAD8C0]/50 px-1.5 py-0.5 rounded border border-[#EAD8C0] font-medium text-[#3A0A0F]">
              +{mod.optionName} {mod.price > 0 && `(${formatCurrency(mod.price)})`}
            </span>
          ))}
        </div>
      )}

      {/* Special instructions note */}
      {item.specialInstructions && (
        <p className="text-[11px] text-[#1F5A34] italic bg-[#DDF0E4] px-2 py-0.5 rounded border border-[#BCE1C7]">
          Note: {item.specialInstructions}
        </p>
      )}

      {/* Quantity Controls and Line Total */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-1.5 bg-[#FDF6EC] p-1 rounded-lg border border-[#EAD8C0]">
          <button
            type="button"
            onClick={() => onUpdateQuantity(item.cartItemId, item.quantity - 1)}
            className="w-7 h-7 rounded-md bg-[#FAF4F2] border border-[#EAD8C0] flex items-center justify-center text-[#3A0A0F] hover:bg-[#EAD8C0] shadow-xs transition-colors"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="w-6 text-center text-xs font-bold text-[#3A0A0F]">{item.quantity}</span>
          <button
            type="button"
            onClick={() => onUpdateQuantity(item.cartItemId, item.quantity + 1)}
            className="w-7 h-7 rounded-md bg-[#FAF4F2] border border-[#EAD8C0] flex items-center justify-center text-[#3A0A0F] hover:bg-[#EAD8C0] shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="text-right">
          <span className="text-sm font-bold text-[#3A0A0F]">{formatCurrency(item.lineTotal)}</span>
        </div>
      </div>
    </div>
  );
};

export default CartItem;
