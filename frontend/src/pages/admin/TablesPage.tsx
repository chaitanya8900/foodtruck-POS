import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { Plus, Download, Edit2, Trash2, QrCode, ExternalLink, Copy } from 'lucide-react';
import toast from 'react-hot-toast';

import tablesApi from '@/api/tables';
import { apiClient } from '@/api/client';
import { Table } from '@/types';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import EmptyState from '@/components/ui/EmptyState';
import Spinner from '@/components/ui/Spinner';

export const TablesPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form State
  const [tableNumber, setTableNumber] = useState('');
  const [tableName, setTableName] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Fetch tables
  const { data: tables = [], isLoading } = useQuery({
    queryKey: ['tables'],
    queryFn: tablesApi.getTables,
    staleTime: 60 * 1000,
  });

  // Fetch local network IP for mobile testing
  const { data: networkInfo } = useQuery<{ localIp: string; port: number }>({
    queryKey: ['network-info'],
    queryFn: async () => {
      const res = await apiClient.get('/public/network-info');
      return res.data;
    },
    staleTime: 60000,
  });

  const handleOpenModal = (table?: Table) => {
    if (table) {
      setEditingTable(table);
      setTableNumber(table.tableNumber);
      setTableName(table.tableName);
      setIsActive(table.isActive);
    } else {
      setEditingTable(null);
      const nextNum = (tables.length + 1).toString().padStart(2, '0');
      setTableNumber(nextNum);
      setTableName(`Table ${nextNum}`);
      setIsActive(true);
    }
    setIsModalOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: (data: { tableNumber: string; tableName: string; isActive?: boolean }) => {
      if (editingTable) {
        return tablesApi.updateTable(editingTable.id, data);
      }
      return tablesApi.createTable(data);
    },
    onSuccess: () => {
      toast.success(editingTable ? 'Table updated' : 'Table registered');
      setIsModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['tables'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to save table');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tablesApi.deleteTable(id),
    onSuccess: () => {
      toast.success('Table deleted');
      setDeleteConfirmId(null);
      queryClient.invalidateQueries({ queryKey: ['tables'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to delete table');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableName.trim() || !tableNumber.trim()) {
      toast.error('Table name and number are required');
      return;
    }
    saveMutation.mutate({
      tableNumber: tableNumber.trim(),
      tableName: tableName.trim(),
      isActive,
    });
  };

  const getQRUrl = (token: string) => {
    // If accessing via localhost on computer, encode the local Wi-Fi IP so phones scanning can connect directly!
    if ((window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && networkInfo?.localIp) {
      return `http://${networkInfo.localIp}:${window.location.port || '3000'}/order/t/${token}`;
    }
    return `${window.location.origin}/order/t/${token}`;
  };

  const mainQRUrl = getQRUrl('main');

  const handleDownloadMainQR = () => {
    const svg = document.getElementById('main-qr-svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width + 40;
      canvas.height = img.height + 80;
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 20, 20);
        ctx.fillStyle = '#3A0A0F';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Main Ordering QR', canvas.width / 2, canvas.height - 25);
      }
      const pngFile = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = 'Main_QR_Ordering.png';
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handleDownloadQR = (table: Table) => {
    const svg = document.getElementById(`qr-svg-${table.id}`);
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width + 40;
      canvas.height = img.height + 80;
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 20, 20);
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(table.tableName, canvas.width / 2, canvas.height - 25);
      }
      const pngFile = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `${table.tableName.replace(/\s+/g, '_')}_QR.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#3A0A0F] tracking-tight">Tables & QR Codes</h1>
          <p className="text-sm text-[#6B4F48] mt-0.5">
            Generate and print unique table QR codes for customer self-ordering
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          leftIcon={<Plus className="w-4 h-4 stroke-[3]" />}
          onClick={() => handleOpenModal()}
          className="font-bold shadow-md shadow-[#3A0A0F]/20 bg-[#3A0A0F] hover:bg-[#5B0F1B] rounded-xl text-white px-5"
        >
          Add New Table
        </Button>
      </div>

      {/* Main QR Card */}
      <div className="bg-[#FAF4F2] border-2 border-[#EAD8C0] rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-6">
          <div className="flex-1 space-y-3 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2.5 flex-wrap">
              <span className="p-2 rounded-xl bg-[#3A0A0F] text-white shadow-xs">
                <QrCode className="w-5 h-5 text-white" />
              </span>
              <h2 className="text-xl font-black text-[#3A0A0F] tracking-tight">Main QR</h2>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider bg-[#DDF0E4] text-[#1F5A34] border border-[#BCE1C7]">
                Unified (No Tables)
              </span>
            </div>
            <p className="text-sm text-[#6B4F48] leading-relaxed max-w-xl">
              Unified ordering QR code for counter orders, takeaway, or open seating without assigned table numbers.
              Customers can scan this to browse the full menu, customize items, and place orders directly without selecting a table number.
            </p>
            <div className="flex items-center justify-center md:justify-start gap-3 pt-1 flex-wrap">
              <Button
                type="button"
                variant="primary"
                size="sm"
                leftIcon={<Download className="w-4 h-4" />}
                onClick={handleDownloadMainQR}
                className="font-bold bg-[#3A0A0F] hover:bg-[#5B0F1B] rounded-xl text-white px-4"
              >
                Download Main QR
              </Button>
              <a
                href={mainQRUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#5B0F1B] hover:text-[#3A0A0F] bg-white hover:bg-[#EAD8C0]/30 border border-[#EAD8C0] px-4 py-2 rounded-xl transition-colors shadow-xs"
              >
                <span>Test in Browser</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>

          <div className="p-3 bg-white border-2 border-[#EAD8C0] rounded-2xl shadow-xs shrink-0 flex flex-col items-center">
            <QRCodeSVG
              id="main-qr-svg"
              value={mainQRUrl}
              size={130}
              level="H"
              includeMargin={false}
            />
            <span className="text-[10px] font-extrabold text-[#3A0A0F] mt-2 tracking-wider uppercase">
              Main QR Scan
            </span>
          </div>
        </div>

        {/* Link at the bottom of Main QR card */}
        <div className="mt-5 pt-4 border-t border-[#EAD8C0] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-[#3A0A0F]">Main QR Link:</span>
            <span className="font-mono font-bold text-xs bg-white text-[#3A0A0F] px-3 py-1.5 rounded-xl border border-[#EAD8C0] shadow-xs break-all">
              {mainQRUrl}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(mainQRUrl);
              toast.success('Main QR link copied to clipboard!');
            }}
            className="text-xs font-bold text-[#5B0F1B] hover:text-[#3A0A0F] bg-white hover:bg-[#EAD8C0]/30 border border-[#EAD8C0] px-3.5 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 shadow-xs shrink-0 self-end sm:self-auto cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy Link</span>
          </button>
        </div>
      </div>

      {isLoading && tables.length === 0 ? (
        <div className="py-20 flex justify-center">
          <Spinner label="Loading tables..." />
        </div>
      ) : tables.length === 0 ? (
        <EmptyState
          icon={<QrCode className="w-8 h-8 text-[#5B0F1B]" />}
          title="No Tables Configured"
          description="Add table numbers to generate scannable QR codes for your diners."
          action={
            <Button variant="primary" onClick={() => handleOpenModal()}>
              Create First Table
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {tables.map((table: any) => {
            const qrToken = table.qrToken || table.qr_token || '';
            const tableName = table.tableName || table.table_name || 'Table';
            const tableNumber = table.tableNumber || table.table_number || (tableName.match(/\d+/)?.[0] ?? '1');
            const isActive = table.isActive !== undefined ? table.isActive : (table.is_active !== undefined ? table.is_active : true);
            const qrUrl = getQRUrl(qrToken);

            return (
              <div
                key={table.id}
                className="bg-[#FDF6EC] rounded-2xl border border-[#EAD8C0] p-6 shadow-xs hover:border-[#3A0A0F] transition-all flex flex-col items-center text-center justify-between"
              >
                <div className="w-full flex items-center justify-between pb-3">
                  <span className="font-mono text-xs font-bold text-[#3A0A0F] bg-[#EAD8C0] px-2.5 py-0.5 rounded-lg">
                    #{tableNumber}
                  </span>
                  <span
                    className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                      isActive
                        ? 'bg-[#DDF0E4] text-[#1F5A34] border border-[#BCE1C7]'
                        : 'bg-[#FAF4F2] text-[#9B1C1C] border border-[#EAD8C0]'
                    }`}
                  >
                    {isActive ? 'Active' : 'Disabled'}
                  </span>
                </div>

                <div className="p-3.5 bg-white border border-[#EAD8C0] rounded-2xl shadow-xs my-2 hover:border-[#3A0A0F] transition-colors">
                  <QRCodeSVG
                    id={`qr-svg-${table.id}`}
                    value={qrUrl}
                    size={135}
                    level="H"
                    includeMargin={false}
                  />
                </div>

                <h3 className="font-black text-lg text-[#3A0A0F] mt-2 tracking-tight">{tableName}</h3>
                {qrToken ? (
                  <a
                    href={qrUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#5B0F1B] hover:text-[#3A0A0F] font-semibold flex items-center gap-1 mt-1 transition-colors"
                  >
                    <span>Test Ordering Link</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-xs text-[#92400E] font-medium mt-1">Token generating...</span>
                )}

                {/* Actions */}
                <div className="pt-4 mt-3 border-t border-[#EAD8C0] w-full flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    leftIcon={<Download className="w-3.5 h-3.5" />}
                    onClick={() => handleDownloadQR({ ...table, tableName })}
                    className="text-xs flex-1 border-[#EAD8C0] bg-white text-[#3A0A0F] hover:bg-[#EAD8C0]/30"
                  >
                    Download QR
                  </Button>
                  <button
                    type="button"
                    onClick={() => handleOpenModal({ ...table, tableName, tableNumber, isActive })}
                    className="p-1.5 rounded-lg text-[#5B0F1B] hover:text-[#3A0A0F] hover:bg-[#EAD8C0]/50 transition-colors"
                    title="Edit Table"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmId(table.id)}
                    className="p-1.5 rounded-lg text-[#5B0F1B] hover:text-red-700 hover:bg-[#EAD8C0]/50 transition-colors"
                    title="Delete Table"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Table Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTable ? 'Edit Table' : 'Add New Table'}
        description="Configure table identity to generate a unique self-ordering QR token"
      >
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <Input
            label="Table Number (Short code) *"
            value={tableNumber}
            onChange={(e) => setTableNumber(e.target.value)}
            placeholder="e.g. 01, 02, T3"
            required
          />

          <Input
            label="Display Table Name *"
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            placeholder="e.g. Table 01, Patio High Top"
            required
          />

          <div className="flex items-center gap-3 pt-2">
            <input
              type="checkbox"
              id="isActiveTable"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 text-[#3A0A0F] rounded border-[#EAD8C0] focus:ring-[#5B0F1B]"
            />
            <label htmlFor="isActiveTable" className="text-sm font-medium text-slate-700 select-none">
              Active & Accepting QR Orders
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
              {editingTable ? 'Save Table' : 'Generate Table & QR'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirmId}
        onClose={() => setDeleteConfirmId(null)}
        title="Delete Table?"
        description="Are you sure you want to remove this table? Any existing printed QR codes for this table will no longer work."
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

export default TablesPage;
