import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { Menu, Wifi, WifiOff } from 'lucide-react';
import useSocketStore from '@/store/socket';

export const AdminLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isConnected = useSocketStore((state) => state.isConnected);

  return (
    <div className="flex h-screen bg-[#F8EFE6] overflow-hidden font-sans">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#F8EFE6]">
        {/* Top Header */}
        <header className="h-16 bg-[#F8EFE6] border-b border-[#EAD8C0] px-4 sm:px-6 flex items-center justify-between shrink-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-[#3A0A0F] hover:bg-[#EAD8C0]/40"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-black text-[#3A0A0F] tracking-tight">Admin Console</h2>
          </div>

          <div className="flex items-center gap-4">
            {/* Live Socket Status */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                isConnected
                  ? 'bg-[#DDF0E4] text-[#1F5A34] border-[#BCE1C7]'
                  : 'bg-[#FAF4F2] text-[#9B1C1C] border-[#EAD8C0]'
              }`}
            >
              {isConnected ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-[#1F5A34]" />
                  <span>Realtime Live</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-[#9B1C1C]" />
                  <span>Disconnected</span>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Scrollable page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-[#F8EFE6]">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
