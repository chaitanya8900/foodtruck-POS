import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Store, Receipt, Sliders, Clock, Smartphone } from 'lucide-react';
import toast from 'react-hot-toast';

import settingsApi from '@/api/settings';
import useAuthStore from '@/store/auth';
import { Business, MobileOrderingSchedule } from '@/types';
import {
  normalizeOperatingHours,
  evaluateOrderingStatus,
  formatTime12Hour,
  DEFAULT_SCHEDULE
} from '@/lib/operatingHours';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui/Card';
import Spinner from '@/components/ui/Spinner';

const DAYS = [
  { key: 'MON', label: 'M', full: 'Mon' },
  { key: 'TUE', label: 'T', full: 'Tue' },
  { key: 'WED', label: 'W', full: 'Wed' },
  { key: 'THU', label: 'T', full: 'Thu' },
  { key: 'FRI', label: 'F', full: 'Fri' },
  { key: 'SAT', label: 'S', full: 'Sat' },
  { key: 'SUN', label: 'S', full: 'Sun' },
];

function formatRepeatSummary(days: string[]): string {
  if (!days || days.length === 0) return 'Never (All days closed)';
  if (days.length === 7) return 'Every day';
  const isWeekdays = days.length === 5 && ['MON', 'TUE', 'WED', 'THU', 'FRI'].every((d) => days.includes(d));
  if (isWeekdays) return 'Weekdays (Mon–Fri)';
  const isWeekends = days.length === 2 && days.includes('SAT') && days.includes('SUN');
  if (isWeekends) return 'Weekends (Sat–Sun)';
  const map: Record<string, string> = { MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun' };
  return days.map((d) => map[d] || d).join(', ');
}

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
    dineInEnabled: true,
    takeawayEnabled: true,
    tokenPrefix: '',
    tokenResetTime: '04:00',
  });

  const [schedule, setSchedule] = useState<MobileOrderingSchedule>(DEFAULT_SCHEDULE);

  const { data: business, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.getSettings,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (business) {
      const { operating_hours, operatingHours, ...cleanBusiness } = business as any;
      setFormData(cleanBusiness);
      const hoursToNormalize = business.operatingHours || (business as any).operating_hours;
      if (hoursToNormalize) {
        setSchedule(normalizeOperatingHours(hoursToNormalize));
      }
    }
  }, [business]);

  const toggleDay = (dayKey: string) => {
    setSchedule((prev) => {
      const exists = prev.days.includes(dayKey);
      const nextDays = exists ? prev.days.filter((d) => d !== dayKey) : [...prev.days, dayKey];
      return { ...prev, days: nextDays };
    });
  };

  const currentStatus = evaluateOrderingStatus(
    schedule,
    (business as any)?.timezone || 'Asia/Kolkata'
  );

  const updateMutation = useMutation({
    mutationFn: settingsApi.updateSettings,
    onSuccess: (updated) => {
      toast.success('Business settings successfully saved');
      setAuthBusiness(updated);
      queryClient.setQueryData(['settings'], updated);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      const updatedHours = updated.operatingHours || (updated as any).operating_hours;
      if (updatedHours) {
        setSchedule(normalizeOperatingHours(updatedHours));
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to update settings');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalSchedule = {
      ...schedule,
      manualClosed: Boolean(schedule.manualClosed),
      manualClosedDate: schedule.manualClosed
        ? (schedule.manualClosedDate || new Date().toISOString().split('T')[0])
        : '',
    };
    const { operating_hours, operatingHours, ...restForm } = formData as any;
    updateMutation.mutate({
      ...restForm,
      operatingHours: finalSchedule,
      operating_hours: finalSchedule,
    });
  };

  if (isLoading && !business) {
    return (
      <div className="py-24 flex items-center justify-center">
        <Spinner size="lg" label="Loading business settings..." />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl pb-32">
      <div>
        <h1 className="text-2xl font-black text-[#3A0A0F] tracking-tight">Business Configuration</h1>
        <p className="text-xs text-[#6B4F48]">
          Manage brand details, tax compliance, receipts, and order token numbering rules
        </p>
      </div>

      <form id="settings-form" onSubmit={handleSubmit} className="space-y-6">
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

            <div className="grid grid-cols-1 gap-4">
              <Input
                label="Official Email"
                type="email"
                value={formData.email || ''}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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

        {/* Section 2: Mobile QR Ordering Schedule (iPhone Alarm Style) */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between w-full flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#5B0F1B]" />
                <CardTitle>Mobile Ordering Hours & Schedule</CardTitle>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
                  currentStatus.isOpen
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-rose-50 text-rose-800 border-rose-300'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${currentStatus.isOpen ? 'bg-emerald-600' : 'bg-rose-600'}`} />
                <span>{currentStatus.isOpen ? 'Accepting Orders' : 'Currently Closed'}</span>
              </span>
            </div>
          </CardHeader>
          <CardBody className="space-y-6">
            {/* Toggles Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-2xl bg-[#FAF4F2] border border-[#EAD8C0]">
              {/* Automated Schedule Master Toggle */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-[#3A0A0F]">Automated Schedule</p>
                  <p className="text-xs text-[#6B4F48] mt-0.5">
                    Automatically open and close mobile ordering on scheduled days and hours
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                  <input
                    type="checkbox"
                    checked={schedule.enabled}
                    onChange={(e) => setSchedule({ ...schedule, enabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-[#EAD8C0] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#EAD8C0] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#3A0A0F]"></div>
                </label>
              </div>

              {/* Manual Close Today Override */}
              <div className="flex items-start justify-between gap-3 md:border-l md:border-[#EAD8C0] md:pl-4">
                <div>
                  <p className="text-sm font-bold text-[#8C232C]">Close for Today (Manual Override)</p>
                  <p className="text-xs text-[#6B4F48] mt-0.5">
                    Turn off ordering today immediately. Customers see &ldquo;We are sorry, we are closed for today&rdquo;.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                  <input
                    type="checkbox"
                    checked={Boolean(schedule.manualClosed)}
                    onChange={(e) =>
                      setSchedule({
                        ...schedule,
                        manualClosed: e.target.checked,
                        manualClosedDate: e.target.checked
                          ? (schedule.manualClosedDate || new Date().toISOString().split('T')[0])
                          : '',
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-[#EAD8C0] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-[#EAD8C0] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#8C232C]"></div>
                </label>
              </div>
            </div>

            {/* Days of Week Selector (iPhone Alarm Style) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-[#3A0A0F]">
                  Operating Days (iPhone Alarm Repeat)
                </label>
                <span className="text-xs font-bold text-[#5B0F1B] bg-[#EAD8C0]/40 px-2.5 py-1 rounded-full border border-[#EAD8C0]">
                  {formatRepeatSummary(schedule.days)}
                </span>
              </div>

              <div className="flex items-center justify-between sm:justify-start gap-2 pt-1">
                {DAYS.map((d) => {
                  const isSelected = schedule.days.includes(d.key);
                  return (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => toggleDay(d.key)}
                      className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full font-bold text-sm transition-all flex flex-col items-center justify-center shadow-xs cursor-pointer select-none ${
                        isSelected
                          ? 'bg-[#3A0A0F] text-white shadow-md shadow-[#3A0A0F]/20 scale-105 ring-2 ring-[#3A0A0F]/20'
                          : 'bg-[#FAF4F2] border border-[#EAD8C0] text-[#6B4F48] hover:border-[#3A0A0F]'
                      }`}
                    >
                      <span className="leading-tight">{d.label}</span>
                      <span className="text-[9px] opacity-80 leading-none">{d.full}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-[#6B4F48]">
                Select the days mobile ordering is active. Customers can view the menu anytime, but can only order on active days.
              </p>
            </div>

            {/* Daily Hours Pickers */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#3A0A0F] flex items-center justify-between">
                  <span>Daily Opening Time</span>
                  <span className="text-xs font-bold text-[#5B0F1B] font-mono">
                    {formatTime12Hour(schedule.openTime)}
                  </span>
                </label>
                <input
                  type="time"
                  value={schedule.openTime}
                  onChange={(e) => setSchedule({ ...schedule, openTime: e.target.value })}
                  className="w-full text-sm rounded-xl border border-[#EAD8C0] bg-[#FAF4F2] text-[#3A0A0F] p-2.5 focus:border-[#3A0A0F] focus:outline-none focus:ring-2 focus:ring-[#3A0A0F]/15 font-mono font-bold"
                />
                <p className="text-[11px] text-[#6B4F48]">Default: 17:00 (5:00 PM)</p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[#3A0A0F] flex items-center justify-between">
                  <span>Daily Closing Time</span>
                  <span className="text-xs font-bold text-[#5B0F1B] font-mono">
                    {formatTime12Hour(schedule.closeTime)}
                  </span>
                </label>
                <input
                  type="time"
                  value={schedule.closeTime}
                  onChange={(e) => setSchedule({ ...schedule, closeTime: e.target.value })}
                  className="w-full text-sm rounded-xl border border-[#EAD8C0] bg-[#FAF4F2] text-[#3A0A0F] p-2.5 focus:border-[#3A0A0F] focus:outline-none focus:ring-2 focus:ring-[#3A0A0F]/15 font-mono font-bold"
                />
                <p className="text-[11px] text-[#6B4F48]">Default: 22:00 (10:00 PM)</p>
              </div>
            </div>

            {/* Custom Closed Message */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[#3A0A0F]">
                Closed Message (Shown when truck is closed today)
              </label>
              <Input
                value={schedule.manualClosedMessage || ''}
                onChange={(e) => setSchedule({ ...schedule, manualClosedMessage: e.target.value })}
                placeholder="We are sorry, we are closed for today"
              />
            </div>

            {/* Live Customer Preview Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-[#FAF4F2] to-[#FDF6EC] border border-[#EAD8C0] space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#3A0A0F]">
                <Smartphone className="w-4 h-4 text-[#5B0F1B]" />
                <span>Live Customer Mobile Preview</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-white/80 p-3 rounded-xl border border-[#EAD8C0]">
                  <p className="text-[11px] text-[#6B4F48] font-semibold mb-1">Customer Cart Button</p>
                  {currentStatus.isOpen ? (
                    <span className="inline-block bg-[#3A0A0F] text-white px-3 py-1.5 rounded-full font-bold text-xs shadow-xs">
                      Proceed to Order Type &rarr;
                    </span>
                  ) : (
                    <span className="inline-block bg-[#A86B6B] text-white px-3 py-1.5 rounded-full font-bold text-xs shadow-xs cursor-not-allowed">
                      {currentStatus.closedButtonText}
                    </span>
                  )}
                </div>

                <div className="bg-white/80 p-3 rounded-xl border border-[#EAD8C0]">
                  <p className="text-[11px] text-[#6B4F48] font-semibold mb-1">Customer Top Alert Banner</p>
                  <p className="text-xs text-[#3A0A0F] font-medium leading-snug">
                    {currentStatus.bannerText}
                  </p>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Section 3: Taxation & Statutory */}
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

      </form>

      {/* Fixed Bottom Save Box - Stuck flush to the very bottom of the screen, matching setting cards width & styling */}
      <div className="fixed bottom-0 left-0 lg:left-64 right-0 px-4 sm:px-6 lg:px-8 pointer-events-none z-30">
        <div className="max-w-4xl w-full pointer-events-auto bg-[#FDF6EC]/95 backdrop-blur-md border-t border-x border-[#EAD8C0] rounded-t-2xl p-4 sm:px-6 sm:py-4 shadow-[0_-4px_20px_rgba(58,10,15,0.08)] flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#5B0F1B] shrink-0" />
            <p className="text-xs text-[#6B4F48]">
              <span className="font-bold text-[#3A0A0F]">Business Settings:</span>
              <span className="hidden sm:inline"> Click &ldquo;Save All Settings&rdquo; to apply your changes across POS &amp; Mobile QR ordering.</span>
              <span className="sm:hidden"> Tap Save to apply changes.</span>
            </p>
          </div>
          <div className="flex items-center justify-end shrink-0">
            <Button
              type="submit"
              form="settings-form"
              variant="primary"
              size="lg"
              isLoading={updateMutation.isPending}
              leftIcon={<Save className="w-5 h-5" />}
              className="font-bold shadow-lg shadow-[#3A0A0F]/25 px-6 sm:px-8 text-sm sm:text-base whitespace-nowrap"
            >
              Save All Settings
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
