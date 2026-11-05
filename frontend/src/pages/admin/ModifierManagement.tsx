import React, { useState } from 'react';
import { Plus, Trash2, PlusCircle } from 'lucide-react';
import { ModifierGroup, ModifierOption, SelectionType } from '@/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';

interface ModifierManagementProps {
  modifierGroups: ModifierGroup[];
  onChange: (groups: ModifierGroup[]) => void;
}

export const ModifierManagement: React.FC<ModifierManagementProps> = ({
  modifierGroups,
  onChange,
}) => {
  const [activeGroupIndex, setActiveGroupIndex] = useState<number | null>(null);

  const handleAddGroup = () => {
    const newGroup: ModifierGroup = {
      id: `temp-${Date.now()}`,
      businessId: '',
      name: 'New Customization Group',
      selectionType: SelectionType.SINGLE,
      minSelections: 1,
      maxSelections: 1,
      isRequired: true,
      options: [
        {
          id: `opt-${Date.now()}-1`,
          modifierGroupId: `temp-${Date.now()}`,
          name: 'Regular',
          price: 0,
          isAvailable: true,
          displayOrder: 0,
        },
      ],
    };
    const updated = [...modifierGroups, newGroup];
    onChange(updated);
    setActiveGroupIndex(updated.length - 1);
  };

  const handleRemoveGroup = (index: number) => {
    const updated = modifierGroups.filter((_, i) => i !== index);
    onChange(updated);
    if (activeGroupIndex === index) {
      setActiveGroupIndex(null);
    }
  };

  const handleUpdateGroup = (index: number, fields: Partial<ModifierGroup>) => {
    const updated = [...modifierGroups];
    updated[index] = { ...updated[index], ...fields };
    onChange(updated);
  };

  const handleAddOption = (groupIndex: number) => {
    const group = modifierGroups[groupIndex];
    const newOption: ModifierOption = {
      id: `opt-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      modifierGroupId: group.id,
      name: 'New Option',
      price: 0,
      isAvailable: true,
      displayOrder: group.options.length,
    };
    handleUpdateGroup(groupIndex, {
      options: [...group.options, newOption],
    });
  };

  const handleUpdateOption = (groupIndex: number, optionIndex: number, fields: Partial<ModifierOption>) => {
    const group = modifierGroups[groupIndex];
    const updatedOptions = [...group.options];
    updatedOptions[optionIndex] = { ...updatedOptions[optionIndex], ...fields };
    handleUpdateGroup(groupIndex, { options: updatedOptions });
  };

  const handleRemoveOption = (groupIndex: number, optionIndex: number) => {
    const group = modifierGroups[groupIndex];
    const updatedOptions = group.options.filter((_, i) => i !== optionIndex);
    handleUpdateGroup(groupIndex, { options: updatedOptions });
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-slate-800">Customizations & Modifiers</h4>
          <p className="text-xs text-slate-500">Allow customers to choose size, crust, extra toppings, etc.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          leftIcon={<Plus className="w-3.5 h-3.5" />}
          onClick={handleAddGroup}
          className="text-xs"
        >
          Add Modifier Group
        </Button>
      </div>

      {modifierGroups.length === 0 ? (
        <div className="p-4 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-center text-xs text-slate-500">
          No customizations configured for this item yet.
        </div>
      ) : (
        <div className="space-y-4">
          {modifierGroups.map((group, gIdx) => (
            <div
              key={group.id || gIdx}
              className="p-4 bg-[#FAF4F2] rounded-2xl border border-[#EAD8C0] space-y-3"
            >
              <div className="flex items-center justify-between gap-3">
                <input
                  type="text"
                  value={group.name}
                  onChange={(e) => handleUpdateGroup(gIdx, { name: e.target.value })}
                  placeholder="Group Name (e.g. Choose Size, Extra Toppings)"
                  className="font-bold text-sm bg-white border border-[#EAD8C0] rounded-lg px-3 py-1.5 flex-1 text-[#3A0A0F] focus:border-[#3A0A0F] focus:ring-1 focus:ring-[#3A0A0F] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleRemoveGroup(gIdx)}
                  className="text-stone-400 hover:text-red-600 p-1.5 rounded-lg"
                  title="Remove group"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Group Configuration Rules */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <Select
                  label="Selection Type"
                  value={group.selectionType}
                  onChange={(e) =>
                    handleUpdateGroup(gIdx, {
                      selectionType: e.target.value as SelectionType,
                    })
                  }
                  options={[
                    { value: SelectionType.SINGLE, label: 'Single Choice (Radio)' },
                    { value: SelectionType.MULTIPLE, label: 'Multiple Choices (Checkbox)' },
                  ]}
                />

                <div className="flex items-center gap-2 pt-6">
                  <input
                    type="checkbox"
                    id={`req-${gIdx}`}
                    checked={group.isRequired}
                    onChange={(e) => handleUpdateGroup(gIdx, { isRequired: e.target.checked })}
                    className="w-4 h-4 text-[#3A0A0F] rounded border-[#EAD8C0] focus:ring-[#5B0F1B]"
                  />
                  <label htmlFor={`req-${gIdx}`} className="text-xs font-semibold text-[#3A0A0F]">
                    Mandatory Selection
                  </label>
                </div>

                {group.selectionType === SelectionType.MULTIPLE && (
                  <Input
                    label="Max Selections"
                    type="number"
                    value={group.maxSelections || ''}
                    onChange={(e) =>
                      handleUpdateGroup(gIdx, {
                        maxSelections: parseInt(e.target.value, 10) || 1,
                      })
                    }
                  />
                )}
              </div>

              {/* Options in this group */}
              <div className="space-y-2 pt-2 border-t border-[#EAD8C0]">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#3A0A0F]">Options</span>
                  <button
                    type="button"
                    onClick={() => handleAddOption(gIdx)}
                    className="text-xs font-bold text-[#5B0F1B] hover:text-[#3A0A0F] flex items-center gap-1"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>Add Option</span>
                  </button>
                </div>

                {group.options.map((opt, oIdx) => (
                  <div key={opt.id || oIdx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={opt.name}
                      onChange={(e) => handleUpdateOption(gIdx, oIdx, { name: e.target.value })}
                      placeholder="Option Name (e.g. Extra Cheese)"
                      className="text-xs bg-white border border-[#EAD8C0] rounded-lg px-2.5 py-1.5 flex-1 text-[#3A0A0F] focus:border-[#3A0A0F] focus:outline-none"
                    />
                    <div className="relative w-28">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-stone-400">₹</span>
                      <input
                        type="number"
                        value={opt.price}
                        onChange={(e) =>
                          handleUpdateOption(gIdx, oIdx, { price: parseFloat(e.target.value) || 0 })
                        }
                        placeholder="0.00"
                        className="text-xs bg-white border border-[#EAD8C0] rounded-lg pl-6 pr-2 py-1.5 w-full text-[#3A0A0F] focus:border-[#3A0A0F] focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(gIdx, oIdx)}
                      className="text-stone-400 hover:text-red-500 p-1 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ModifierManagement;
