import { Scissors } from 'lucide-react';

export default function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="relative grid h-10 w-10 place-items-center rounded-xl bg-stone-900 text-white shadow-2xs">
        <Scissors className="h-5 w-5 text-emerald-400" strokeWidth={2.4} />
      </div>
      <div className="leading-tight">
        <p className="font-display text-lg font-extrabold text-stone-900">shaveup</p>
        <p className="text-[10px] font-bold tracking-widest text-stone-500">BARBER SHOP</p>
      </div>
    </div>
  );
}