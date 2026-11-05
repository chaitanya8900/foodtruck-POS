import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Store, Receipt, Sliders } from 'lucide-react';
import toast from 'react-hot-toast';

import settingsApi from '@/api/settings';
import useAuthStore from '@/store/auth';
import { Business } from '@/types';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';

export const SettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const setAuthBusiness = useAuthStore((state) => state.setBusiness);

  // Form State
  const [formData, setFormData] = useState<Partial<Business>>({
    name: '',
    address: '',
    phone: '',
    email: '',
    gstin: '',
    fssaiNumber: '',
    receiptHeader: '',
    receiptFooter: '',
    taxRate: 5,
    operatingHours: '11:00 AM - 11:00 PM',
    dineInEnabled: true,
    takeawayEnabled: true,
    tokenPrefix: '',
    tokenResetTime: '04:00',
  });

  const { data: business, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.getSettings,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (business) {
      setFormData(business);
    }
  }, [business]);

  const updateMutation = useMutation({
    mutationFn: settingsApi.updateSettings,
    onSuccess: (updated) => {
      toast.success('Business settings successfully saved');
      setAuthBusiness(updated);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to update settings');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  if (isLoading && !business) {
    return (
      <div className="py-24 flex items-center justify-center">
        <Spinner size="lg" label="Loading business settings..." />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl pb-12">
      <div>
        <h1 className="text-2xl font-black text-[#3A0A0F] tracking-tight">Business Configuration</h1>
        <p className="text-xs text-[#6B4F48]">
          Manage brand details, tax compliance, receipts, and order token numbering rules
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Business Profile */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Store className="w-5 h-5 text-[#5B0F1B]" />
              <CardTitle>Business Profile & Location</CardTitle>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Food Truck / Business Name *"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
              <Input
                label="Primary Phone Number"
                value={formData.phone || ''}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Official Email"
                type="email"
                value={formData.email || ''}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
              <Input
                label="Operating Hours"
                value={formData.operatingHours || ''}
                onChange={(e) => setFormData({ ...formData, operatingHours: e.target.value })}
                placeholder="e.g. 12:00 PM - 11:30 PM"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#3A0A0F]">Physical Address / Truck Location</label>
              <textarea
                rows={2}
                value={formData.address || ''}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full text-sm rounded-lg border border-[#EAD8C0] bg-[#FAF4F2] text-[#3A0A0F] p-2.5 focus:border-[#3A0A0F] focus:outline-none focus:ring-2 focus:ring-[#3A0A0F]/15"
              />
            </div>
          </CardBody>
        </Card>

        {/* Section 2: Taxation & Statutory */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sliders className="w-5 h-5 text-[#5B0F1B]" />
              <CardTitle>Tax & Compliance</CardTitle>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Input
                label="GSTIN (Optional)"
                value={formData.gstin || ''}
                onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
                placeholder="36AAAAA0000A1Z5"
              />
              <Input
                label="FSSAI License Number"
                value={formData.fssaiNumber || ''}
                onChange={(e) => setFormData({ ...formData, fssaiNumber: e.target.value })}
                placeholder="10018022007890"
              />
              <Input
                label="GST / Tax Rate (%)"
                type="number"
                step="0.1"
                value={formData.taxRate ?? 5}
                onChange={(e) =>
                  setFormData({ ...formData, taxRate: parseFloat(e.target.value) || 0 })
                }
                helperText="Standard restaurant tax is 5%"
              />
            </div>
          </CardBody>
        </Card>

        {/* Section 3: Receipt & KOT Slips */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-[#5B0F1B]" />
              <CardTitle>Thermal Receipt & Token Slip</CardTitle>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Receipt Header Subtitle"
                value={formData.receiptHeader || ''}
                onChange={(e) => setFormData({ ...formData, receiptHeader: e.target.value })}
                placeholder="e.g. Best Gourmet Burgers in Town"
              />
              <Input
                label="Receipt Footer Message"
                value={formData.receiptFooter || ''}
                onChange={(e) => setFormData({ ...formData, receiptFooter: e.target.value })}
                placeholder="e.g. Thank you! Visit us again."
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <Input
                label="Token Prefix (Optional)"
                value={formData.tokenPrefix || ''}
                onChange={(e) => setFormData({ ...formData, tokenPrefix: e.target.value })}
                placeholder="e.g. A (for A001, A002)"
                helperText="Leave blank for numeric tokens (001, 002...)"
              />
              <Input
                label="Token Sequence Daily Reset Time"
                value={formData.tokenResetTime || '04:00'}
                onChange={(e) => setFormData({ ...formData, tokenResetTime: e.target.value })}
                placeholder="04:00"
                helperText="Time when daily tokens reset to 001"
              />
            </div>

            <div className="flex items-center gap-6 pt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.dineInEnabled}
                  onChange={(e) => setFormData({ ...formData, dineInEnabled: e.target.checked })}
                  className="w-4 h-4 text-[#3A0A0F] accent-[#3A0A0F] rounded border-[#EAD8C0] focus:ring-[#3A0A0F]"
                />
                <span className="text-sm font-medium text-[#3A0A0F]">Dine-In Enabled</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.takeawayEnabled}
                  onChange={(e) => setFormData({ ...formData, takeawayEnabled: e.target.checked })}
                  className="w-4 h-4 text-[#3A0A0F] accent-[#3A0A0F] rounded border-[#EAD8C0] focus:ring-[#3A0A0F]"
                />
                <span className="text-sm font-medium text-[#3A0A0F]">Takeaway Enabled</span>
              </label>
            </div>
          </CardBody>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={updateMutation.isPending}
            leftIcon={<Save className="w-5 h-5" />}
            className="font-bold shadow-lg shadow-[#3A0A0F]/20 px-8"
          >
            Save All Settings
          </Button>
        </div>
      </form>
    </div>
  );
};

export default SettingsPage;
