import React, { useState } from 'react';
import { Upload, Eye, EyeOff } from 'lucide-react';

interface UILayerProps {
  isLoading: boolean;
  onUpload: (files: FileList) => void;
  isHidden: boolean;
  toggleVisibility: () => void;
}

export const UILayer: React.FC<UILayerProps> = ({ 
  isLoading, 
  onUpload, 
  isHidden, 
  toggleVisibility 
}) => {
  const [isHoveringUpload, setIsHoveringUpload] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUpload(e.target.files);
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black transition-opacity duration-1000">
        <div className="w-16 h-16 border border-[#d4af37]/20 border-t-[#d4af37] rounded-full animate-spin mb-8" />
        <div className="text-[#d4af37] text-sm tracking-[0.3em] uppercase font-light animate-pulse">
          Constructing Holiday Magic
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-between py-12">
      {/* Header */}
      <div className={`transition-opacity duration-700 ${isHidden ? 'opacity-0' : 'opacity-100'}`}>
        <h1 className="text-5xl md:text-7xl font-['Cinzel'] text-transparent bg-clip-text bg-gradient-to-b from-white to-[#eebb66] tracking-[0.15em] drop-shadow-[0_0_30px_rgba(252,238,167,0.4)] text-center">
          Merry Christmas
        </h1>
        <p className="text-[#d4af37]/60 text-center text-xs tracking-[0.4em] uppercase mt-4">
          Luxury Edition
        </p>
      </div>

      {/* Controls */}
      <div className={`pointer-events-auto flex flex-col items-center gap-4 transition-all duration-500 transform ${isHidden ? 'translate-y-20 opacity-0' : 'translate-y-0 opacity-100'}`}>
        
        <div 
          className="relative group"
          onMouseEnter={() => setIsHoveringUpload(true)}
          onMouseLeave={() => setIsHoveringUpload(false)}
        >
          <label className="
            relative cursor-pointer 
            flex items-center gap-3 
            px-8 py-3 
            bg-black/40 backdrop-blur-md 
            border border-[#d4af37]/40 
            text-[#d4af37] 
            uppercase tracking-[0.2em] text-xs font-bold
            transition-all duration-300
            hover:bg-[#d4af37] hover:text-black hover:shadow-[0_0_30px_rgba(212,175,55,0.4)]
          ">
            <Upload size={14} />
            <span>Add Memories</span>
            <input 
              type="file" 
              multiple 
              accept="image/*" 
              className="hidden" 
              onChange={handleFileChange}
            />
          </label>
        </div>

        <div className="text-[#d4af37]/40 text-[10px] tracking-widest uppercase mt-2">
          Drag to Rotate • Click to Focus
        </div>
      </div>

      {/* Visibility Toggle (Always Visible) */}
      <button 
        onClick={toggleVisibility}
        className="pointer-events-auto absolute bottom-8 right-8 text-[#d4af37]/30 hover:text-[#d4af37] transition-colors duration-300"
      >
        {isHidden ? <Eye size={20} /> : <EyeOff size={20} />}
      </button>
    </div>
  );
};
