import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, FolderTree } from 'lucide-react';
import toast from 'react-hot-toast';

import menuApi from '@/api/menu';
import { MenuCategory } from '@/types';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import EmptyState from '@/components/ui/EmptyState';
import Spinner from '@/components/ui/Spinner';

export const CategoriesPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [displayOrder, setDisplayOrder] = useState('0');
  const [isActive, setIsActive] = useState(true);

  // Fetch categories
  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: menuApi.getCategories,
    staleTime: 60 * 1000,
  });

  // Open modal for Create or Edit
  const handleOpenModal = (category?: MenuCategory) => {
    if (category) {
      setEditingCategory(category);
      setName(category.name);
      setDescription(category.description || '');
      setDisplayOrder(String(category.displayOrder || 0));
      setIsActive(category.isActive);
    } else {
      setEditingCategory(null);
      setName('');
      setDescription('');
      setDisplayOrder(String(categories.length));
      setIsActive(true);
    }
    setIsModalOpen(true);
  };

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (data: Partial<MenuCategory>) => {
      if (editingCategory) {
        return menuApi.updateCategory(editingCategory.id, data);
      }
      return menuApi.createCategory(data);
    },
    onSuccess: () => {
      toast.success(editingCategory ? 'Category updated' : 'Category created');
      setIsModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to save category');
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => menuApi.deleteCategory(id),
    onSuccess: () => {
      toast.success('Category removed');
      setDeleteConfirmId(null);
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to delete category');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Category name is required');
      return;
    }
    saveMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      displayOrder: parseInt(displayOrder, 10) || 0,
      isActive,
    });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#3A0A0F] tracking-tight">Menu Categories</h1>
          <p className="text-sm text-[#6B4F48] mt-0.5">Organize items into browsable food & beverage sections</p>
        </div>
        <Button
          type="button"
          variant="primary"
          leftIcon={<Plus className="w-4 h-4 stroke-[3]" />}
          onClick={() => handleOpenModal()}
          className="font-bold shadow-md shadow-[#3A0A0F]/20 bg-[#3A0A0F] hover:bg-[#5B0F1B] rounded-xl text-white px-5"
        >
          Add New Category
        </Button>
      </div>

      {/* Categories Grid / List */}
      {isLoading && categories.length === 0 ? (
        <div className="py-20 flex justify-center">
          <Spinner label="Loading categories..." />
        </div>
      ) : categories.length === 0 ? (
        <EmptyState
          icon={<FolderTree className="w-8 h-8 text-[#5B0F1B]" />}
          title="No Categories Yet"
          description="Create your first menu category (e.g. Burgers, Beverages, Combos) to organize your menu."
          action={
            <Button variant="primary" onClick={() => handleOpenModal()}>
              Add First Category
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {categories.map((category) => (
            <div
              key={category.id}
              className="bg-[#FDF6EC] rounded-2xl border border-[#EAD8C0] p-6 shadow-xs hover:border-[#3A0A0F] transition-all flex flex-col justify-between min-h-[175px]"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#3A0A0F] bg-[#EAD8C0] px-2.5 py-0.5 rounded-lg">
                    Order : {category.displayOrder}
                  </span>
                  <span
                    className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                      category.isActive
                        ? 'bg-[#DDF0E4] text-[#1F5A34] border border-[#BCE1C7]'
                        : 'bg-[#FAF4F2] text-[#9B1C1C] border border-[#EAD8C0]'
                    }`}
                  >
                    {category.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <h3 className="text-xl font-black text-[#3A0A0F] tracking-tight">{category.name}</h3>
                {category.description && (
                  <p className="text-xs text-[#6B4F48] line-clamp-2 leading-relaxed">{category.description}</p>
                )}
              </div>

              <div className="pt-4 mt-4 flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => handleOpenModal(category)}
                  className="p-1.5 rounded-lg text-[#5B0F1B] hover:text-[#3A0A0F] hover:bg-[#EAD8C0]/50 transition-colors"
                  title="Edit Category"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(category.id)}
                  className="p-1.5 rounded-lg text-[#5B0F1B] hover:text-red-700 hover:bg-[#EAD8C0]/50 transition-colors"
                  title="Delete Category"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Category Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingCategory ? 'Edit Menu Category' : 'Create Menu Category'}
        description="Configure category display name and sorting order"
      >
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <Input
            label="Category Name *"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Signature Burgers, Hot Beverages"
            required
          />

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[#3A0A0F]">Description (Optional)</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description shown to customers"
              className="w-full text-sm rounded-lg border border-[#EAD8C0] bg-[#FAF4F2] text-[#3A0A0F] placeholder-[#6B4F48]/60 p-2.5 focus:border-[#3A0A0F] focus:outline-none focus:ring-2 focus:ring-[#3A0A0F]/15"
            />
          </div>

          <Input
            label="Display Order"
            type="number"
            value={displayOrder}
            onChange={(e) => setDisplayOrder(e.target.value)}
            helperText="Lower numbers appear first in the menu"
          />

          <div className="flex items-center gap-3 pt-2">
            <input
              type="checkbox"
              id="isActiveCategory"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 text-[#3A0A0F] rounded border-[#EAD8C0] focus:ring-[#5B0F1B]"
            />
            <label htmlFor="isActiveCategory" className="text-sm font-medium text-slate-700 select-none">
              Visible on POS & Customer QR Menu
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
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
              {editingCategory ? 'Save Changes' : 'Create Category'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title="Delete Category?"
        description="Are you sure you want to delete this category? Items inside this category may become unassigned."
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
    </div>
  );
};

export default CategoriesPage;
