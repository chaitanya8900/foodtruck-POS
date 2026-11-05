import apiClient from './client';
import { MenuCategory, MenuItem, ModifierGroup } from '@/types';

export const menuApi = {
  // Categories
  getCategories: async (): Promise<MenuCategory[]> => {
    const response = await apiClient.get<MenuCategory[]>('/menu/categories');
    return response.data;
  },

  createCategory: async (data: Partial<MenuCategory>): Promise<MenuCategory> => {
    const response = await apiClient.post<MenuCategory>('/menu/categories', data);
    return response.data;
  },

  updateCategory: async (id: string, data: Partial<MenuCategory>): Promise<MenuCategory> => {
    const response = await apiClient.put<MenuCategory>(`/menu/categories/${id}`, data);
    return response.data;
  },

  deleteCategory: async (id: string): Promise<void> => {
    await apiClient.delete(`/menu/categories/${id}`);
  },

  reorderCategories: async (categoryIds: string[]): Promise<void> => {
    await apiClient.post('/menu/categories/reorder', { categoryIds });
  },

  // Items
  getItems: async (categoryId?: string): Promise<MenuItem[]> => {
    const response = await apiClient.get<MenuItem[]>('/menu/items', {
      params: categoryId ? { categoryId } : undefined,
    });
    return response.data;
  },

  createItem: async (data: Partial<MenuItem>): Promise<MenuItem> => {
    const response = await apiClient.post<MenuItem>('/menu/items', data);
    return response.data;
  },

  updateItem: async (id: string, data: Partial<MenuItem>): Promise<MenuItem> => {
    const response = await apiClient.put<MenuItem>(`/menu/items/${id}`, data);
    return response.data;
  },

  deleteItem: async (id: string): Promise<void> => {
    await apiClient.delete(`/menu/items/${id}`);
  },

  toggleAvailability: async (id: string, isAvailable: boolean): Promise<MenuItem> => {
    const response = await apiClient.patch<MenuItem>(`/menu/items/${id}/availability`, { isAvailable });
    return response.data;
  },

  uploadImage: async (base64Image: string): Promise<{ url: string }> => {
    const response = await apiClient.post<{ url: string }>('/menu/upload-image', { image: base64Image });
    return response.data;
  },

  // Modifiers
  getModifierGroups: async (itemId?: string): Promise<ModifierGroup[]> => {
    const response = await apiClient.get<ModifierGroup[]>('/menu/modifiers', {
      params: itemId ? { itemId } : undefined,
    });
    return response.data;
  },

  createModifierGroup: async (data: Partial<ModifierGroup>): Promise<ModifierGroup> => {
    const response = await apiClient.post<ModifierGroup>('/menu/modifiers', data);
    return response.data;
  },

  updateModifierGroup: async (id: string, data: Partial<ModifierGroup>): Promise<ModifierGroup> => {
    const response = await apiClient.put<ModifierGroup>(`/menu/modifiers/${id}`, data);
    return response.data;
  },

  deleteModifierGroup: async (id: string): Promise<void> => {
    await apiClient.delete(`/menu/modifiers/${id}`);
  },
};

export default menuApi;
