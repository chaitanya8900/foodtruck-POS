import React, { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  UtensilsCrossed,
  Upload,
  Camera,
  Crop
} from 'lucide-react';
import toast from 'react-hot-toast';

import menuApi from '@/api/menu';
import { MenuItem, ModifierGroup, SelectionType } from '@/types';
import { formatCurrency } from '@/lib/utils';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import EmptyState from '@/components/ui/EmptyState';
import Spinner from '@/components/ui/Spinner';
import ModifierManagement from './ModifierManagement';
import ImageAdjustModal from '@/components/admin/ImageAdjustModal';

export const MenuItemsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [rawImageToAdjust, setRawImageToAdjust] = useState('');
  const [preparationTimeMinutes, setPreparationTimeMinutes] = useState('10');
  const [isAvailable, setIsAvailable] = useState(true);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);

  // Fetch items & categories
  const { data: menuItems = [], isLoading: loadingItems } = useQuery({
    queryKey: ['menuItems'],
    queryFn: () => menuApi.getItems(),
    staleTime: 60 * 1000,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: menuApi.getCategories,
    staleTime: 60 * 1000,
  });

  // Filter items
  const filteredItems = useMemo(() => {
    return menuItems.map((item: any) => ({
      ...item,
      categoryId: item.categoryId || item.category_id,
      imageUrl: item.imageUrl || item.image_url || '',
      isAvailable: item.isAvailable !== undefined ? item.isAvailable : (item.is_available !== undefined ? item.is_available : true),
      price: Number(item.price || 0),
      modifierGroups: (item.modifierGroups || item.modifier_groups || []).map((g: any, gIdx: number) => ({
        id: g.id || `temp-${gIdx}`,
        businessId: g.businessId || g.business_id || '',
        name: g.name,
        selectionType: g.selectionType || g.selection_type || SelectionType.SINGLE,
        minSelections: g.minSelections ?? g.min_selections ?? 0,
        maxSelections: g.maxSelections ?? g.max_selections ?? 1,
        isRequired: g.isRequired ?? g.is_required ?? false,
        options: (g.options || []).map((o: any, oIdx: number) => ({
          id: o.id || `opt-${gIdx}-${oIdx}`,
          modifierGroupId: o.modifierGroupId || o.group_id || g.id,
          name: o.name,
          price: Number(o.price ?? o.additionalPrice ?? o.additional_price ?? 0),
          isAvailable: o.isAvailable ?? o.is_available ?? true,
          displayOrder: o.displayOrder ?? o.display_order ?? oIdx,
        })),
      })),
    })).filter((item: any) => {
      const matchCat =
        selectedCategoryFilter === 'all' || item.categoryId === selectedCategoryFilter;
      const matchSearch =
        !searchQuery.trim() ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchCat && matchSearch;
    });
  }, [menuItems, selectedCategoryFilter, searchQuery]);

  // Open Create or Edit Modal
  const handleOpenModal = (item?: MenuItem) => {
    if (item) {
      setEditingItem(item);
      setName(item.name);
      setDescription(item.description || '');
      setPrice(String(item.price));
      setCategoryId(item.categoryId || (item as any).category_id || categories[0]?.id || '');
      setImageUrl(item.imageUrl || (item as any).image_url || '');
      setPreparationTimeMinutes(String(item.preparationTimeMinutes || (item as any).preparation_time || 10));
      setIsAvailable(item.isAvailable !== undefined ? item.isAvailable : ((item as any).is_available ?? true));
      const rawGroups = item.modifierGroups || (item as any).modifier_groups || [];
      const normalizedGroups = rawGroups.map((g: any, gIdx: number) => ({
        id: g.id || `temp-${Date.now()}-${gIdx}`,
        businessId: g.businessId || g.business_id || '',
        menuItemId: g.menuItemId || g.menu_item_id || item.id,
        name: g.name || '',
        selectionType: (g.selectionType || g.selection_type || SelectionType.SINGLE) as SelectionType,
        minSelections: g.minSelections ?? g.min_selections ?? 0,
        maxSelections: g.maxSelections ?? g.max_selections ?? 1,
        isRequired: g.isRequired ?? g.is_required ?? false,
        options: (g.options || []).map((o: any, oIdx: number) => ({
          id: o.id || `opt-${Date.now()}-${gIdx}-${oIdx}`,
          modifierGroupId: o.modifierGroupId || o.group_id || g.id,
          name: o.name || '',
          price: Number(o.price ?? o.additionalPrice ?? o.additional_price ?? 0),
          isAvailable: o.isAvailable ?? o.is_available ?? true,
          displayOrder: o.displayOrder ?? o.display_order ?? oIdx,
        })),
      }));
      setModifierGroups(normalizedGroups);
    } else {
      setEditingItem(null);
      setName('');
      setDescription('');
      setPrice('');
      setCategoryId(categories[0]?.id || '');
      setImageUrl('');
      setPreparationTimeMinutes('10');
      setIsAvailable(true);
      setModifierGroups([]);
    }
    setIsModalOpen(true);
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image size must be under 10MB');
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const rawBase64 = event.target?.result as string;
        if (rawBase64) {
          setRawImageToAdjust(rawBase64);
          setIsAdjustModalOpen(true);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error('Failed to read image file');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleCroppedImageConfirm = async (croppedBase64: string) => {
    try {
      setIsUploadingImage(true);
      try {
        const res = await menuApi.uploadImage(croppedBase64);
        setImageUrl(res.url);
        toast.success('Food picture adjusted & uploaded!');
      } catch {
        setImageUrl(croppedBase64);
        toast.success('Food picture adjusted!');
      }
    } finally {
      setIsUploadingImage(false);
      setIsAdjustModalOpen(false);
      setRawImageToAdjust('');
    }
  };

  const handleOpenAdjustModal = (srcToAdjust: string) => {
    if (!srcToAdjust) return;
    setRawImageToAdjust(srcToAdjust);
    setIsAdjustModalOpen(true);
  };

  // Quick Toggle Availability
  const toggleMutation = useMutation({
    mutationFn: ({ id, isAvailable }: { id: string; isAvailable: boolean }) =>
      menuApi.toggleAvailability(id, isAvailable),
    onSuccess: (updated) => {
      toast.success(
        `${updated.name} is now ${updated.isAvailable ? 'In Stock' : 'Out of Stock (86ed)'}`
      );
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to update availability');
    },
  });

  // Save Mutation
  const saveMutation = useMutation({
    mutationFn: (data: Partial<MenuItem>) => {
      if (editingItem) {
        return menuApi.updateItem(editingItem.id, data);
      }
      return menuApi.createItem(data);
    },
    onSuccess: () => {
      toast.success(editingItem ? 'Item updated' : 'Item added to menu');
      setIsModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to save menu item');
    },
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => menuApi.deleteItem(id),
    onSuccess: () => {
      toast.success('Item removed');
      setDeleteConfirmId(null);
      queryClient.invalidateQueries({ queryKey: ['menuItems'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to delete item');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Item name is required');
      return;
    }
    if (!price || parseFloat(price) <= 0) {
      toast.error('Valid price is required');
      return;
    }
    const targetCategoryId = categoryId || categories[0]?.id;
    if (!targetCategoryId) {
      toast.error('Please assign or create a category first');
      return;
    }

    saveMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      price: parseFloat(price),
      categoryId: targetCategoryId,
      imageUrl: imageUrl.trim() || '',
      preparationTimeMinutes: parseInt(preparationTimeMinutes, 10) || 10,
      isAvailable,
      modifierGroups,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#3A0A0F] tracking-tight">Menu Items</h1>
          <p className="text-sm text-[#6B4F48] mt-0.5">Manage products, pricing, stock availability (86) and modifiers</p>
        </div>
        <Button
          type="button"
          variant="primary"
          leftIcon={<Plus className="w-4 h-4 stroke-[3]" />}
          onClick={() => handleOpenModal()}
          className="font-bold shadow-md shadow-[#3A0A0F]/20 bg-[#3A0A0F] hover:bg-[#5B0F1B] rounded-xl text-white px-5"
        >
          Add Menu Item
        </Button>
      </div>

      {/* Search & Category Filter */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-[#FDF6EC] p-4 rounded-2xl border border-[#EAD8C0] shadow-xs">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items by name or ingredients..."
            className="w-full pl-10 pr-4 py-2.5 bg-white rounded-xl text-sm border border-[#EAD8C0] focus:border-[#3A0A0F] focus:ring-2 focus:ring-[#3A0A0F]/15 transition-all text-[#3A0A0F] placeholder-stone-400"
          />
        </div>

        <div className="w-full sm:w-64">
          <Select
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Categories' },
              ...categories.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </div>
      </div>

      {/* Items Grid */}
      {loadingItems && menuItems.length === 0 ? (
        <div className="py-20 flex justify-center">
          <Spinner label="Loading menu items..." />
        </div>
      ) : filteredItems.length === 0 ? (
        <EmptyState
          icon={<UtensilsCrossed className="w-8 h-8 text-[#5B0F1B]" />}
          title="No Menu Items Found"
          description={
            searchQuery ? 'Try adjusting your search criteria' : 'Add your first menu item to start taking orders'
          }
          action={
            <Button variant="primary" onClick={() => handleOpenModal()}>
              Add First Item
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredItems.map((item: any) => {
            const categoryName = categories.find((c) => c.id === item.categoryId)?.name || 'General';

            return (
              <div
                key={item.id}
                className={`bg-[#FDF6EC] rounded-2xl border p-5 shadow-xs transition-all flex flex-col justify-between ${
                  item.isAvailable
                    ? 'border-[#EAD8C0] hover:border-[#3A0A0F]'
                    : 'border-[#EAD8C0] opacity-80'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-[#3A0A0F] bg-[#EAD8C0] px-2.5 py-0.5 rounded-lg uppercase tracking-wider">
                      {categoryName}
                    </span>

                    {/* Quick Availability Switch */}
                    <button
                      type="button"
                      onClick={() =>
                        toggleMutation.mutate({ id: item.id, isAvailable: !item.isAvailable })
                      }
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all border ${
                        item.isAvailable
                          ? 'bg-[#DDF0E4] text-[#1F5A34] hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 border-[#BCE1C7]'
                          : 'bg-[#FAF4F2] text-[#9B1C1C] hover:bg-[#DDF0E4] hover:text-[#1F5A34] hover:border-[#BCE1C7] border-[#EAD8C0]'
                      }`}
                      title="Click to toggle In Stock vs Out of Stock"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${item.isAvailable ? 'bg-[#1F5A34]' : 'bg-[#9B1C1C]'}`} />
                      <span>{item.isAvailable ? 'In Stock' : 'Out of Stock'}</span>
                    </button>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-black text-base text-[#3A0A0F] leading-snug line-clamp-1">
                        {item.name}
                      </h3>
                      {item.description && (
                        <p className="text-xs text-[#6B4F48] line-clamp-2 mt-1 leading-relaxed">{item.description}</p>
                      )}
                    </div>
                    {item.imageUrl ? (
                      <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-[#EAD8C0] bg-white shadow-xs">
                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenModal(item)}
                        className="w-16 h-16 rounded-xl border border-dashed border-[#EAD8C0] bg-[#FAF4F2]/60 hover:bg-[#EAD8C0]/30 flex flex-col items-center justify-center shrink-0 text-[#6B4F48] transition-colors"
                        title="Add Item Picture"
                      >
                        <Camera className="w-5 h-5 opacity-70" />
                        <span className="text-[9px] font-bold mt-1">Add Photo</span>
                      </button>
                    )}
                  </div>

                  <div className="pt-2 flex items-center justify-between border-t border-[#EAD8C0]">
                    <span className="text-lg font-black text-[#3A0A0F] font-mono">
                      {formatCurrency(item.price)}
                    </span>
                    {item.modifierGroups && item.modifierGroups.length > 0 && (
                      <span className="text-[11px] text-[#3A0A0F] font-semibold bg-[#EAD8C0]/60 px-2 py-0.5 rounded-lg border border-[#DFC9AF]">
                        {item.modifierGroups.length} mod group(s)
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-4 mt-3 flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleOpenModal(item)}
                    className="p-1.5 rounded-lg text-[#5B0F1B] hover:text-[#3A0A0F] hover:bg-[#EAD8C0]/50 transition-colors"
                    title="Edit Item"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(item.id)}
                    className="p-1.5 rounded-lg text-[#5B0F1B] hover:text-red-700 hover:bg-[#EAD8C0]/50 transition-colors"
                    title="Delete Item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Item Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          if (isAdjustModalOpen) return;
          setIsModalOpen(false);
        }}
        closeOnOutsideClick={false}
        title={editingItem ? 'Edit Menu Item' : 'Add New Menu Item'}
        description="Configure product name, price, category, photo and customizable add-ons"
        maxWidth="2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4 pt-2 max-h-[75vh] overflow-y-auto pr-1">
          {/* Item Photo Section */}
          <div className="p-4 bg-white/80 rounded-2xl border border-[#EAD8C0] space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-[#3A0A0F] uppercase tracking-wider block">
                  Item Picture (Customer QR Menu)
                </label>
                <p className="text-[11px] text-[#6B4F48]">
                  Visible on customer mobile QR menu. Cashier POS remains text-only.
                </p>
              </div>
              {imageUrl && (
                <button
                  type="button"
                  onClick={() => setImageUrl('')}
                  className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1 hover:bg-red-50 px-2 py-1 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove Picture</span>
                </button>
              )}
            </div>

            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleImageFileChange}
            />

            {imageUrl ? (
              <div className="flex items-center gap-4">
                <div className="relative w-24 h-24 rounded-2xl overflow-hidden border-2 border-[#3A0A0F]/20 shadow-md bg-stone-100 shrink-0 group">
                  <img src={imageUrl} alt="Item preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleOpenAdjustModal(imageUrl)}
                    className="absolute inset-0 bg-[#3A0A0F]/65 text-white opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 cursor-pointer"
                    title="Click to adjust zoom and framing"
                  >
                    <Crop className="w-5 h-5 text-[#EAD8C0]" />
                    <span className="text-[10px] font-bold">Adjust</span>
                  </button>
                </div>
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      leftIcon={<Crop className="w-3.5 h-3.5" />}
                      onClick={() => handleOpenAdjustModal(imageUrl)}
                      className="text-xs font-bold shadow-xs cursor-pointer"
                    >
                      Adjust / Crop
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      leftIcon={<Upload className="w-3.5 h-3.5" />}
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingImage}
                      className="text-xs font-bold cursor-pointer"
                    >
                      {isUploadingImage ? 'Uploading...' : 'Change Picture'}
                    </Button>
                  </div>
                  <input
                    type="text"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="Or edit direct image URL..."
                    className="w-full text-xs rounded-lg border border-[#EAD8C0] bg-[#FAF4F2] p-2 text-[#3A0A0F] focus:outline-none focus:border-[#3A0A0F]"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-[#EAD8C0] hover:border-[#3A0A0F] rounded-2xl p-4 flex flex-col items-center justify-center cursor-pointer bg-[#FAF4F2]/50 hover:bg-[#FAF4F2] transition-colors text-center group"
                >
                  <div className="w-10 h-10 rounded-full bg-[#EAD8C0] group-hover:bg-[#3A0A0F] group-hover:text-white flex items-center justify-center text-[#3A0A0F] mb-2 transition-colors">
                    <Camera className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-[#3A0A0F]">
                    {isUploadingImage ? 'Uploading image...' : 'Click to Upload & Adjust Food Picture'}
                  </p>
                  <p className="text-[11px] text-[#6B4F48] mt-0.5">
                    Select an image to zoom in/out, move around and adjust perfectly
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#6B4F48] font-semibold whitespace-nowrap">Or Image URL:</span>
                  <input
                    type="text"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://images.unsplash.com/... or /uploads/..."
                    className="flex-1 text-xs rounded-lg border border-[#EAD8C0] bg-[#FAF4F2] p-2 text-[#3A0A0F] focus:outline-none focus:border-[#3A0A0F]"
                  />
                  {imageUrl && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      leftIcon={<Crop className="w-3.5 h-3.5" />}
                      onClick={() => handleOpenAdjustModal(imageUrl)}
                      className="text-xs font-bold shrink-0 cursor-pointer"
                    >
                      Adjust
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Item Name *"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Loaded Cheese Fries"
              required
            />
            <Input
              label="Price (₹) *"
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="120.00"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Category *"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
            <Input
              label="Prep Time (Minutes)"
              type="number"
              value={preparationTimeMinutes}
              onChange={(e) => setPreparationTimeMinutes(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Description (Optional)</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Crispy golden fries loaded with homemade molten cheddar cheese sauce"
              className="w-full text-sm rounded-lg border border-[#EAD8C0] bg-[#FAF4F2] text-[#3A0A0F] placeholder-[#6B4F48]/60 p-2.5 focus:border-[#3A0A0F] focus:outline-none focus:ring-2 focus:ring-[#3A0A0F]/15 transition-all"
            />
          </div>

          <div className="p-3.5 bg-white/70 rounded-xl border border-[#EAD8C0] space-y-2">
            <label className="text-xs font-bold text-[#3A0A0F] uppercase tracking-wider block">
              Stock Availability Status
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsAvailable(true)}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  isAvailable
                    ? 'bg-[#1F5A34] text-white shadow-sm ring-2 ring-[#1F5A34]'
                    : 'bg-[#FDF6EC] text-[#3A0A0F] border border-[#EAD8C0] hover:bg-[#EAD8C0]/30'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isAvailable ? 'bg-white' : 'bg-[#1F5A34]'}`} />
                <span>In Stock (Available)</span>
              </button>
              <button
                type="button"
                onClick={() => setIsAvailable(false)}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                  !isAvailable
                    ? 'bg-[#9B1C1C] text-white shadow-sm ring-2 ring-[#9B1C1C]'
                    : 'bg-[#FDF6EC] text-[#3A0A0F] border border-[#EAD8C0] hover:bg-[#EAD8C0]/30'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${!isAvailable ? 'bg-white' : 'bg-[#9B1C1C]'}`} />
                <span>Out of Stock (86ed)</span>
              </button>
            </div>
            <p className="text-[11px] text-[#6B4F48]">
              {isAvailable
                ? 'This item will appear as available and orderable on customer QR sites and POS.'
                : 'This item will be marked "Unavailable" on QR sites and cannot be ordered.'}
            </p>
          </div>

          {/* Modifier Groups Management Sub-Section */}
          <div className="pt-4 border-t border-slate-200">
            <ModifierManagement
              modifierGroups={modifierGroups}
              onChange={(updated) => setModifierGroups(updated)}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsModalOpen(false)}
              disabled={saveMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              isLoading={saveMutation.isPending}
              className="font-bold"
            >
              {editingItem ? 'Save Item Changes' : 'Create Item'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title="Delete Menu Item?"
        description="Are you sure you want to permanently delete this item from your menu?"
        maxWidth="sm"
      >
        <div className="flex items-center justify-end gap-3 pt-4">
          <Button variant="ghost" onClick={() => setDeleteConfirmId(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
            isLoading={deleteMutation.isPending}
            className="font-bold"
          >
            Yes, Delete
          </Button>
        </div>
      </Modal>

      {/* Interactive Food Picture Adjustment & Crop Modal */}
      <ImageAdjustModal
        isOpen={isAdjustModalOpen}
        imageSrc={rawImageToAdjust}
        onClose={() => {
          setIsAdjustModalOpen(false);
          setRawImageToAdjust('');
        }}
        onConfirm={handleCroppedImageConfirm}
      />
    </div>
  );
};

export default MenuItemsPage;
