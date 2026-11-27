import { Link } from 'react-router-dom';
import { ShieldX } from 'lucide-react';
import { usePermissions } from '../contexts/PermissionContext';

export default function Unauthorized() {
  const { defaultRoute } = usePermissions();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#fffaf5] px-6 text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-red-50 text-red-500">
        <ShieldX size={48} strokeWidth={1.5} />
      </div>
      <p className="mt-6 text-[13px] font-black uppercase tracking-[0.16em] text-[#a64b09]">Error 403</p>
      <h1 className="mt-2 text-[32px] font-black text-[#27201c]">Access Denied</h1>
      <p className="mt-3 max-w-md text-[15px] text-[#796d66]">
        You do not have permission to access this page. Contact your administrator if you believe this is an error.
      </p>
      <Link
        to={defaultRoute || '/admin/profile'}
        className="mt-8 inline-flex h-12 items-center rounded-full bg-[#fd761a] px-8 text-[14px] font-black text-white shadow-[0_10px_22px_rgba(253,118,26,0.25)] transition hover:-translate-y-0.5"
      >
        Back to my workspace
      </Link>
    </div>
  );
}
