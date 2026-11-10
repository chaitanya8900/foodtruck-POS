import React, { useState, useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { MenuItem, ModifierGroup, CartItemModifier, SelectionType } from '@/types';
import { formatCurrency } from '@/lib/utils';

export interface CustomerCustomizationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  menuItem: MenuItem | null;
  initialModifiers?: CartItemModifier[];
  initialQuantity?: number;
  initialInstructions?: string;
  isEditing?: boolean;
  onAddToCart: (
    item: MenuItem,
    quantity: number,
    customizations: CartItemModifier[],
    instructions?: string
  ) => void;
  onUpdateCartItem?: (
    cartItemId: string,
    quantity: number,
    customizations: CartItemModifier[],
    instructions?: string
  ) => void;
  cartItemId?: string;
}

export function isItemVeg(name: string, description?: string): boolean {
  const text = `${name} ${description || ''}`.toLowerCase();
  const nonVegKeywords = [
    'chicken',
    'mutton',
    'egg',
    'fish',
    'meat',
    'pork',
    'beef',
    'bacon',
    'prawn',
    'shrimp',
    'seafood',
    'wings',
    'keema',
    'pepperoni',
    'murgh',
    'ghost',
    'gosht'
  ];
  return !nonVegKeywords.some((kw) => text.includes(kw));
}

export const CustomerCustomizationDrawer: React.FC<CustomerCustomizationDrawerProps> = ({
  isOpen,
  onClose,
  menuItem,
  initialModifiers = [],
  initialQuantity = 1,
  initialInstructions = '',
  isEditing = false,
  onAddToCart,
  onUpdateCartItem,
  cartItemId,
}) => {
  const [quantity, setQuantity] = useState(initialQuantity);
  const [selectedModifiers, setSelectedModifiers] = useState<CartItemModifier[]>([]);
  const [instructions, setInstructions] = useState(initialInstructions);
  const [validationError, setValidationError] = useState('');

  // Sync state when drawer opens or item changes
  useEffect(() => {
    if (menuItem && isOpen) {
      setQuantity(initialQuantity || 1);
      setInstructions(initialInstructions || '');
      setValidationError('');

      if (initialModifiers && initialModifiers.length > 0) {
        setSelectedModifiers(initialModifiers);
      } else {
        // Auto-select required single-select options if any
        const defaults: CartItemModifier[] = [];
        if (menuItem.modifierGroups) {
          menuItem.modifierGroups.forEach((group) => {
            const isSingleGroup = group.selectionType === SelectionType.SINGLE || (group.selectionType as any) === 'SINGLE';
            if (group.isRequired && isSingleGroup && group.options.length > 0) {
              const firstOpt = group.options.find((o) => o.isAvailable) || group.options[0];
              defaults.push({
                modifierGroupId: group.id,
                modifierGroupName: group.name,
                optionId: firstOpt.id,
                optionName: firstOpt.name,
                price: Number(firstOpt.price ?? (firstOpt as any).additionalPrice ?? (firstOpt as any).additional_price ?? 0),
              });
            }
          });
        }
        setSelectedModifiers(defaults);
      }
    }
  }, [menuItem, isOpen, initialModifiers, initialQuantity, initialInstructions]);

  if (!isOpen || !menuItem) return null;

  const isVeg = isItemVeg(menuItem.name, menuItem.description);

  const handleSingleSelect = (group: ModifierGroup, optionId: string) => {
    const opt = group.options.find((o) => o.id === optionId);
    if (!opt) return;

    setSelectedModifiers((prev) => {
      const filtered = prev.filter((m) => m.modifierGroupId !== group.id);
      return [
        ...filtered,
        {
          modifierGroupId: group.id,
          modifierGroupName: group.name,
          optionId: opt.id,
          optionName: opt.name,
          price: Number(opt.price || 0),
        },
      ];
    });
    setValidationError('');
  };

  const handleMultipleSelect = (group: ModifierGroup, optionId: string, checked: boolean) => {
    const opt = group.options.find((o) => o.id === optionId);
    if (!opt) return;

    setSelectedModifiers((prev) => {
      if (checked) {
        const inThisGroup = prev.filter((m) => m.modifierGroupId === group.id);
        if (group.maxSelections && inThisGroup.length >= group.maxSelections) {
          return prev; // Hit max selections limit
        }
        return [
          ...prev,
          {
            modifierGroupId: group.id,
            modifierGroupName: group.name,
            optionId: opt.id,
            optionName: opt.name,
            price: Number(opt.price || 0),
          },
        ];
      } else {
        return prev.filter((m) => !(m.modifierGroupId === group.id && m.optionId === optionId));
      }
    });
    setValidationError('');
  };

  const modifierTotal = selectedModifiers.reduce((acc, m) => acc + m.price, 0);
  const basePrice = Number(menuItem.price || 0);
  const totalItemPrice = (basePrice + modifierTotal) * quantity;

  const handleConfirm = () => {
    // Validate required modifier groups
    if (menuItem.modifierGroups) {
      for (const group of menuItem.modifierGroups) {
        const count = selectedModifiers.filter((m) => m.modifierGroupId === group.id).length;
        if (group.isRequired && count === 0) {
          setValidationError(`Please select an option for "${group.name}"`);
          return;
        }
        if (group.minSelections && count < group.minSelections) {
          setValidationError(`Please choose at least ${group.minSelections} option(s) for "${group.name}"`);
          return;
        }
      }
    }

    if (isEditing && cartItemId && onUpdateCartItem) {
      onUpdateCartItem(cartItemId, quantity, selectedModifiers, instructions);
    } else {
      onAddToCart(menuItem, quantity, selectedModifiers, instructions);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Dimmed Blurred Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Slide-Up Bottom Sheet matching IMG_4294.PNG */}
      <div className="relative bg-white rounded-t-[32px] w-full max-w-md max-h-[88vh] flex flex-col shadow-2xl z-10 animate-in slide-in-from-bottom duration-200">
        {/* Grab Handle */}
        <div className="pt-3 pb-1 flex justify-center cursor-pointer" onClick={onClose}>
          <div className="w-12 h-1.5 bg-neutral-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-6 py-3 border-b border-neutral-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Veg / Non-Veg Icon */}
              <span
                className={`inline-flex items-center justify-center w-4 h-4 rounded-xs border p-0.5 shrink-0 ${
                  isVeg ? 'border-emerald-600' : 'border-rose-700'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isVeg ? 'bg-emerald-600' : 'bg-rose-700'}`} />
              </span>

              <span className="text-sm font-semibold text-neutral-600">
                {menuItem.name} <span className="text-neutral-400">·</span> {formatCurrency(menuItem.price)}
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-500 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <h3 className="text-lg font-bold text-neutral-900 mt-2 tracking-tight">
            Customise as per your taste
          </h3>
        </div>

        {/* Modifier Groups & Items List */}
        <div className="px-6 py-4 overflow-y-auto space-y-6 flex-1 divide-y divide-neutral-100">
          {menuItem.modifierGroups && menuItem.modifierGroups.length > 0 ? (
            menuItem.modifierGroups.map((group) => {
              const isSingle = group.selectionType === SelectionType.SINGLE || (group.selectionType as any) === 'SINGLE';
              const currentGroupSelections = selectedModifiers.filter((m) => m.modifierGroupId === group.id);
              const maxCount = group.maxSelections || (isSingle ? 1 : group.options.length);

              return (
                <div key={group.id} className="pt-4 first:pt-0 space-y-3">
                  {/* Group Title matching IMG_4294.PNG */}
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-bold text-neutral-900">
                      {group.name}
                      <span className="text-sm font-normal text-neutral-500 ml-1.5">
                        ({currentGroupSelections.length}/{maxCount})
                      </span>
                    </h4>
                    {group.isRequired && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                        Required
                      </span>
                    )}
                  </div>

                  {/* Options List */}
                  <div className="space-y-3.5">
                    {group.options.map((option) => {
                      const isChecked = currentGroupSelections.some((m) => m.optionId === option.id);

                      return (
                        <div
                          key={option.id}
                          onClick={() => {
                            if (!option.isAvailable) return;
                            if (isSingle) {
                              handleSingleSelect(group, option.id);
                            } else {
                              handleMultipleSelect(group, option.id, !isChecked);
                            }
                          }}
                          className={`flex items-center justify-between py-1 cursor-pointer select-none transition-colors ${
                            !option.isAvailable ? 'opacity-40 cursor-not-allowed' : ''
                          }`}
                        >
                          <span className="text-base font-medium text-neutral-800">
                            {option.name}
                          </span>

                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-neutral-500 font-mono">
                              {option.price > 0 ? `+${formatCurrency(option.price)}` : 'Free'}
                            </span>

                            {/* Custom Checkbox / Radio matching IMG_4294.PNG */}
                            <div
                              className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                                isChecked
                                  ? 'bg-[#3A0A0F] border-[#3A0A0F] text-white shadow-xs'
                                  : 'border-neutral-300 bg-white hover:border-neutral-400'
                              } ${isSingle ? 'rounded-full' : 'rounded-md'}`}
                            >
                              {isChecked && (
                                <Check className="w-3.5 h-3.5 stroke-[3] text-white" />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-neutral-500 italic py-4">No additional custom toppings available for this item.</p>
          )}

          {/* Cooking Instructions (Optional) */}
          <div className="pt-4 space-y-1.5">
            <label className="text-xs font-semibold text-neutral-700">Cooking Note (Optional)</label>
            <input
              type="text"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Extra spicy, no onions..."
              className="w-full text-xs rounded-xl border border-neutral-200 bg-neutral-50 p-2.5 text-neutral-900 focus:outline-none focus:border-[#3A0A0F]"
            />
          </div>

          {validationError && (
            <p className="text-xs text-red-600 font-semibold text-center pt-2">{validationError}</p>
          )}
        </div>

        {/* Sticky Bottom Bar matching IMG_4294.PNG */}
        <div className="px-6 py-4 bg-white border-t border-neutral-100 flex items-center justify-between shrink-0 shadow-lg">
          <div>
            <span className="text-xl font-extrabold text-neutral-900 font-mono">
              {formatCurrency(totalItemPrice)}
            </span>
          </div>

          <button
            type="button"
            onClick={handleConfirm}
            className="bg-[#3A0A0F] hover:bg-[#5B0F1B] active:scale-95 text-white px-8 py-3.5 rounded-full font-bold text-sm tracking-wide shadow-md transition-all flex items-center justify-center min-w-[150px]"
          >
            {isEditing ? 'Update Item' : 'Add to Cart'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomerCustomizationDrawer;
