'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { HugeiconsIcon } from '@hugeicons/react';
import { Search01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';

interface ImageGalleryProps {
  images: string[];
  productName: string;
}

export const ImageGallery: React.FC<ImageGalleryProps> = ({ images, productName }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isZoomModalOpen, setIsZoomModalOpen] = useState(false);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - left) / width) * 100;
    const y = ((e.clientY - top) / height) * 100;
    setZoomPos({ x, y });
  };

  return (
    <div className="flex flex-col-reverse lg:flex-row gap-4 sm:gap-6 w-full items-start">
      {/* Thumbnail Strip: Horizontal with generous padding & breathing room on mobile, vertical on desktop */}
      <div className="flex lg:flex-col gap-3 sm:gap-3.5 overflow-x-auto lg:overflow-visible no-scrollbar justify-start shrink-0 w-full lg:w-[140px] xl:w-[152px] py-2 sm:py-2.5 px-1 -mx-1">
        {images.map((img, idx) => {
          const isSelected = selectedIndex === idx;
          return (
            <button
              key={idx}
              onClick={() => setSelectedIndex(idx)}
              className={`relative aspect-square w-[30%] min-w-[90px] max-w-[120px] sm:w-28 sm:min-w-0 sm:max-w-none lg:w-full lg:h-[160px] xl:lg:h-[167px] bg-[#F0EEED] rounded-2xl overflow-hidden shrink-0 transition-all ${
                isSelected
                  ? 'ring-2 ring-black ring-offset-2 shadow-sm'
                  : 'hover:opacity-80 opacity-90'
              }`}
              aria-label={`Thumbnail view ${idx + 1}`}
            >
              <Image
                src={img}
                alt={`${productName} thumbnail ${idx + 1}`}
                fill
                sizes="(max-width: 640px) 33vw, 152px"
                className="object-cover object-center"
              />
            </button>
          );
        })}
      </div>

      {/* Main Product Preview Container with Guaranteed Separate Flex Column */}
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onMouseMove={handleMouseMove}
        onClick={() => setIsZoomModalOpen(true)}
        className="relative flex-1 min-w-0 w-full aspect-square lg:aspect-auto lg:h-[500px] xl:lg:h-[530px] bg-[#F0EEED] rounded-3xl overflow-hidden shadow-sm cursor-zoom-in group"
      >
        <Image
          src={images[selectedIndex] || images[0]}
          alt={productName}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 550px"
          className="object-cover object-center transition-transform duration-200"
          style={
            isHovered
              ? {
                  transformOrigin: `${zoomPos.x}% ${zoomPos.y}%`,
                  transform: 'scale(1.4)',
                }
              : undefined
          }
        />

        {/* Zoom Hint Indicator */}
        <div className="absolute top-4 right-4 bg-white/80 backdrop-blur-sm p-2.5 rounded-full text-black opacity-0 group-hover:opacity-100 transition-opacity shadow-sm pointer-events-none">
          <HugeiconsIcon icon={Search01Icon} size={18} />
        </div>
      </div>

      {/* Fullscreen Lightbox Modal */}
      {isZoomModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in">
          <button
            onClick={() => setIsZoomModalOpen(false)}
            className="absolute top-6 right-6 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Close zoom preview"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={24} />
          </button>

          <div className="relative max-w-4xl max-h-[85vh] w-full h-[80vh]">
            <Image
              src={images[selectedIndex] || images[0]}
              alt={productName}
              fill
              className="object-contain"
              sizes="100vw"
            />
          </div>
        </div>
      )}
    </div>
  );
};
