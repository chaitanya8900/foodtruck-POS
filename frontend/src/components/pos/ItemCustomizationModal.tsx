import React, { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { MenuItem, ModifierGroup, CartItemModifier, SelectionType } from '@/types';
import { formatCurrency } from '@/lib/utils';
import { Plus, Minus } from 'lucide-react';

export interface ItemCustomizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  menuItem: MenuItem | null;
  onAddToCart: (
    item: MenuItem,
    quantity: number,
    customizations: CartItemModifier[],
    specialInstructions?: string
  ) => void;
}

export const ItemCustomizationModal: React.FC<ItemCustomizationModalProps> = ({
  isOpen,
  onClose,
  menuItem,
  onAddToCart,
}) => {
  const [quantity, setQuantity] = useState(1);
  const [selectedModifiers, setSelectedModifiers] = useState<CartItemModifier[]>([]);
  const [instructions, setInstructions] = useState('');
  const [validationError, setValidationError] = useState('');

  // Reset state when a new item is opened
  useEffect(() => {
    if (menuItem) {
      setQuantity(1);
      setInstructions('');
      setValidationError('');

      // Auto-select first option for required single-select groups
      const initialModifiers: CartItemModifier[] = [];
      if (menuItem.modifierGroups) {
        menuItem.modifierGroups.forEach((group) => {
          const isSingle = group.selectionType === SelectionType.SINGLE || (group.selectionType as any) === 'SINGLE';
          if (group.isRequired && isSingle && group.options.length > 0) {
            const firstAvailable = group.options.find((o) => o.isAvailable) || group.options[0];
            initialModifiers.push({
              modifierGroupId: group.id,
              modifierGroupName: group.name,
              optionId: firstAvailable.id,
              optionName: firstAvailable.name,
              price: Number(firstAvailable.price ?? (firstAvailable as any).additionalPrice ?? (firstAvailable as any).additional_price ?? 0),
            });
          }
        });
      }
      setSelectedModifiers(initialModifiers);
    }
  }, [menuItem, isOpen]);

  if (!menuItem) return null;

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
        const currentInGroup = prev.filter((m) => m.modifierGroupId === group.id);
        if (group.maxSelections && currentInGroup.length >= group.maxSelections) {
          return prev; // Reached max
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

  // Calculate pricing
  const modifierTotal = selectedModifiers.reduce((acc, m) => acc + m.price, 0);
  const unitPrice = Number(menuItem.price || 0);
  const totalItemPrice = (unitPrice + modifierTotal) * quantity;

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

    onAddToCart(menuItem, quantity, selectedModifiers, instructions);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={menuItem.name}
      description={menuItem.description || 'Customize your selection'}
      maxWidth="lg"
    >
      <div className="flex flex-col max-h-[calc(80vh-100px)]">
        {/* Scrollable Modifier Groups and Instructions */}
        <div className="flex-1 overflow-y-auto space-y-5 pr-2 pb-2">
          {/* Modifier Groups */}
          {menuItem.modifierGroups && menuItem.modifierGroups.length > 0 ? (
            menuItem.modifierGroups.map((group) => {
              const isSingle = group.selectionType === SelectionType.SINGLE || (group.selectionType as any) === 'SINGLE';
              const currentSelected = selectedModifiers.filter((m) => m.modifierGroupId === group.id);

              return (
                <div key={group.id} className="p-4 bg-[#FAF4F2] rounded-xl border border-[#EAD8C0] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-[#3A0A0F] text-sm">{group.name}</h4>
                      <p className="text-xs text-[#6B4F48]">
                        {isSingle
                          ? group.isRequired
                            ? 'Select 1 (Required)'
                            : 'Select up to 1 (Optional)'
                          : `Select up to ${group.maxSelections || 'multiple'}${
                              group.isRequired ? ' (Required)' : ''
                            }`}
                      </p>
                    </div>
                    {group.isRequired && (
                      <span className="text-[10px] uppercase font-bold tracking-wider text-[#1F5A34] bg-[#DDF0E4] border border-[#BCE1C7] px-2 py-0.5 rounded-full">
                        Required
                      </span>
                    )}
                  </div>

                  <div className="space-y-2 pt-1">
                    {group.options.map((option) => {
                      const isChecked = currentSelected.some((m) => m.optionId === option.id);

                      return (
                        <label
                          key={option.id}
                          className={`flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer ${
                            isChecked
                              ? 'border-[#3A0A0F] bg-[#EAD8C0]/40 text-[#3A0A0F] ring-1 ring-[#3A0A0F]/20'
                              : 'border-[#EAD8C0] bg-[#FDF6EC] text-[#3A0A0F] hover:bg-[#FAF4F2]'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type={isSingle ? 'radio' : 'checkbox'}
                              name={`group-${group.id}`}
                              checked={isChecked}
                              onChange={(e) => {
                                if (isSingle) {
                                  handleSingleSelect(group, option.id);
                                } else {
                                  handleMultipleSelect(group, option.id, e.target.checked);
                                }
                              }}
                              className="w-4 h-4 text-[#3A0A0F] accent-[#3A0A0F] focus:ring-[#3A0A0F] border-[#EAD8C0]"
                            />
                            <span className="text-sm font-medium">{option.name}</span>
                          </div>
                          <span className="text-sm font-semibold text-[#3A0A0F]">
                            {option.price > 0 ? `+${formatCurrency(option.price)}` : 'Free'}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-[#6B4F48] italic">No extra customizations available for this item.</p>
          )}

          {/* Special Instructions */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#3A0A0F]">Special Cooking Instructions</label>
            <textarea
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Less spicy, no onion, extra crispy..."
              className="w-full text-sm rounded-lg border border-[#EAD8C0] bg-[#FDF6EC] text-[#3A0A0F] placeholder-[#6B4F48]/60 p-2.5 focus:border-[#3A0A0F] focus:outline-none focus:ring-2 focus:ring-[#3A0A0F]/15"
            />
          </div>

          {validationError && (
            <p className="text-xs text-red-600 font-semibold text-center bg-red-50 border border-red-200 py-1.5 px-3 rounded-lg">
              {validationError}
            </p>
          )}
        </div>

        {/* Fixed / Sticky Bottom Section: Quantity, Total Price & Add to Cart */}
        <div className="shrink-0 pt-4 border-t border-[#EAD8C0] mt-3 bg-[#FDF6EC] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Quantity Controls */}
            <div className="flex items-center gap-2 bg-[#FAF4F2] border border-[#EAD8C0] rounded-xl p-1 shadow-xs">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                className="w-8 h-8 rounded-lg bg-[#FDF6EC] border border-[#EAD8C0] flex items-center justify-center text-[#3A0A0F] hover:bg-[#EAD8C0] disabled:opacity-40 transition-colors cursor-pointer"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-6 text-center font-bold text-sm text-[#3A0A0F] font-mono">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                className="w-8 h-8 rounded-lg bg-[#FDF6EC] border border-[#EAD8C0] flex items-center justify-center text-[#3A0A0F] hover:bg-[#EAD8C0] transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Total Price */}
            <div>
              <p className="text-[11px] text-[#6B4F48] font-medium leading-none">Total Price</p>
              <p className="text-xl font-black text-[#3A0A0F] font-mono mt-0.5">{formatCurrency(totalItemPrice)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="lg"
              onClick={handleConfirm}
              className="font-bold shadow-md shadow-[#3A0A0F]/20 px-6 cursor-pointer"
            >
              Add to Cart
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default ItemCustomizationModal;
