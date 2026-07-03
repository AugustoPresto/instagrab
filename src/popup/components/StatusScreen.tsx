import type { ReactNode } from "react";

interface StatusScreenProps {
  icon: string;
  title: string;
  subtitle: string;
  children?: ReactNode;
}

export default function StatusScreen({ icon, title, subtitle, children }: StatusScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-10 gap-3">
      <span className="text-3xl">{icon}</span>
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="text-xs text-gray-400 mt-1 leading-relaxed">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
