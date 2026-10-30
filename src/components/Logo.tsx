import { Scissors } from 'lucide-react';

export default function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="relative grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-stone-900 to-stone-800 shadow-md">
        <Scissors className="h-5 w-5 text-amber-400" strokeWidth={2.5} />
      </div>
      <div className="leading-tight">
        <p className="font-display text-lg font-extrabold text-stone-900">البريمي</p>
        <p className="text-[10px] font-bold tracking-widest text-amber-600">BARBER SHOP</p>
      </div>
    </div>
  );
}
