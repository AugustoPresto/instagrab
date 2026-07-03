export default function Header() {
  return (
    <div className="px-4 pt-4 pb-3 flex items-center gap-2.5 border-b border-gray-800">
      {/* Logo mark */}
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: "linear-gradient(135deg, #f77737, #e1306c, #833ab4)" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </div>

      {/* Name */}
      <div>
        <h1 className="text-sm font-bold leading-none gradient-text">InstaGrab</h1>
        <p className="text-[10px] text-gray-500 mt-0.5">Instagram Media Downloader</p>
      </div>

      {/* Version badge */}
      <span className="ml-auto text-[10px] text-gray-600 font-mono">v1.0</span>
    </div>
  );
}
