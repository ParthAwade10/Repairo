/**
 * Logo Component
 * Reusable logo component for Repairo
 * Supports both image logo and SVG fallback
 */

import { useState } from 'react';

export default function Logo({ size = 'md', showText = true, className = '' }) {
  const [imageError, setImageError] = useState(false);
  
  // Size variants
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
    '2xl': 'w-24 h-24',
    '3xl': 'w-32 h-32',
  };

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-lg',
    lg: 'text-2xl',
    xl: 'text-3xl',
  };

  // Try PNG first (better for photos/JPEG conversions), then SVG
  const [logoSrc, setLogoSrc] = useState('/logo.png');
  
  const handleImageError = () => {
    // Try SVG if PNG fails
    if (logoSrc === '/logo.png') {
      setLogoSrc('/logo.svg');
    } else if (logoSrc === '/logo.svg') {
      // Try JPEG as last resort
      setLogoSrc('/logo.jpg');
    } else {
      // If all fail, show fallback icon
      setImageError(true);
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Try to load logo image, fallback to SVG icon */}
      {!imageError ? (
        <img
          src={logoSrc}
          alt="Repairo Logo"
          className={`${sizeClasses[size]} object-contain flex-shrink-0`}
          onError={handleImageError}
          style={{ 
            imageRendering: 'crisp-edges',
            maxWidth: '100%',
            height: 'auto',
            display: 'block'
          }}
          loading="eager"
          decoding="async"
        />
      ) : (
        <div className={`${sizeClasses[size]} bg-[#0f2f4c] rounded-xl flex items-center justify-center shadow-lg overflow-hidden`}>
          <svg className={`${sizeClasses[size]}`} viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision" preserveAspectRatio="xMidYMid meet">
            <path d="M256 32C176 32 112 96 112 176C112 256 256 448 256 448C256 448 400 256 400 176C400 96 336 32 256 32Z" fill="#0f2f4c"/>
            <rect x="200" y="140" width="112" height="24" fill="white" rx="2"/>
            <rect x="240" y="140" width="32" height="8" fill="white"/>
            <rect x="248" y="164" width="16" height="180" fill="white" rx="1"/>
            <path d="M248 344 L244 360 L268 360 L264 344 Z" fill="white"/>
          </svg>
        </div>
      )}
      {showText && (
        <span className={`font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent ${textSizeClasses[size]}`}>
          Repairo
        </span>
      )}
    </div>
  );
}

