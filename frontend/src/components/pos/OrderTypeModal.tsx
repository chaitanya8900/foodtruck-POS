import React, { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import { OrderType, Table } from '@/types';
import { Utensils, ShoppingBag, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OrderTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (orderType: OrderType, tableId?: string | null) => void;
  tables?: Table[];
  isSubmitting?: boolean;
}

export const OrderTypeModal: React.FC<OrderTypeModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  tables = [],
  isSubmitting = false,
}) => {
  const [selectedType, setSelectedType] = useState<OrderType | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [error, setError] = useState<string>('');

  const handleSelect = (type: OrderType) => {
    setSelectedType(type);
    setError('');
  };

  const handleConfirm = () => {
    if (!selectedType) {
      setError('Please select an order type to proceed');
      return;
    }

    onConfirm(selectedType, selectedType === OrderType.DINE_IN ? selectedTableId || null : null);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Select Order Service Type"
      description="Choose how the customer will receive this order"
      maxWidth="lg"
    >
      <div className="space-y-6 pt-2">
        {/* Two prominent selection cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Dine-In Card */}
          <button
            type="button"
            onClick={() => handleSelect(OrderType.DINE_IN)}
            className={cn(
              'relative flex flex-col items-center justify-center p-6 rounded-2xl border-2 text-center transition-all cursor-pointer min-h-[160px]',
              selectedType === OrderType.DINE_IN
                ? 'border-[#3A0A0F] bg-[#FAF4F2] shadow-md ring-2 ring-[#3A0A0F]/20'
                : 'border-[#EAD8C0] bg-[#FDF6EC] hover:border-[#3A0A0F]/40 hover:bg-[#FAF4F2]'
            )}
          >
            {selectedType === OrderType.DINE_IN && (
              <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-[#3A0A0F] text-white flex items-center justify-center">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </div>
            )}
            <div
              className={cn(
                'w-16 h-16 rounded-2xl flex items-center justify-center mb-3 transition-colors',
                selectedType === OrderType.DINE_IN
                  ? 'bg-[#3A0A0F] text-white shadow-lg shadow-[#3A0A0F]/30'
                  : 'bg-[#EAD8C0]/60 text-[#3A0A0F]'
              )}
            >
              <Utensils className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-bold text-[#3A0A0F]">DINE-IN</h4>
            <p className="text-xs text-[#6B4F48] mt-1">Serve at table / eat at the counter</p>
          </button>

          {/* Takeaway Card */}
          <button
            type="button"
            onClick={() => handleSelect(OrderType.TAKEAWAY)}
            className={cn(
              'relative flex flex-col items-center justify-center p-6 rounded-2xl border-2 text-center transition-all cursor-pointer min-h-[160px]',
              selectedType === OrderType.TAKEAWAY
                ? 'border-[#3A0A0F] bg-[#FAF4F2] shadow-md ring-2 ring-[#3A0A0F]/20'
                : 'border-[#EAD8C0] bg-[#FDF6EC] hover:border-[#3A0A0F]/40 hover:bg-[#FAF4F2]'
            )}
          >
            {selectedType === OrderType.TAKEAWAY && (
              <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-[#3A0A0F] text-white flex items-center justify-center">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </div>
            )}
            <div
              className={cn(
                'w-16 h-16 rounded-2xl flex items-center justify-center mb-3 transition-colors',
                selectedType === OrderType.TAKEAWAY
                  ? 'bg-[#3A0A0F] text-white shadow-lg shadow-[#3A0A0F]/30'
                  : 'bg-[#EAD8C0]/60 text-[#3A0A0F]'
              )}
            >
              <ShoppingBag className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-bold text-[#3A0A0F]">TAKEAWAY</h4>
            <p className="text-xs text-[#6B4F48] mt-1">Pack for carry-out / parcel</p>
          </button>
        </div>

        {/* Table Selector Dropdown (Shown only when Dine-In is selected) */}
        {selectedType === OrderType.DINE_IN && tables.length > 0 && (
          <div className="p-4 bg-[#FAF4F2] rounded-xl border border-[#EAD8C0] space-y-2 transition-all">
            <Select
              label="Select Table Number"
              value={selectedTableId}
              onChange={(e) => {
                setSelectedTableId(e.target.value);
                setError('');
              }}
              options={[
                { value: '', label: '-- Select Table --' },
                ...tables.map((t) => ({
                  value: t.id,
                  label: `${t.tableName} (${t.tableNumber})`,
                })),
              ]}
            />
          </div>
        )}

        {error && <p className="text-sm text-red-600 font-medium text-center">{error}</p>}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#EAD8C0]">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="lg"
            onClick={handleConfirm}
            isLoading={isSubmitting}
            disabled={!selectedType}
            className="px-8 font-bold"
          >
            Confirm & Complete Order
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default OrderTypeModal;
