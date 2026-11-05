import React, { useState, useRef, useEffect, useCallback } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { ZoomIn, ZoomOut, RotateCw, RefreshCw, Check, Move } from 'lucide-react';

export interface ImageAdjustModalProps {
  isOpen: boolean;
  imageSrc: string;
  onClose: () => void;
  onConfirm: (croppedImageDataUrl: string) => void;
}

export const ImageAdjustModal: React.FC<ImageAdjustModalProps> = ({
  isOpen,
  imageSrc,
  onClose,
  onConfirm,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [aspect, setAspect] = useState<number>(4 / 3);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [imgNaturalSize, setImgNaturalSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [isProcessing, setIsProcessing] = useState(false);

  // Reset controls whenever a new image is loaded
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setRotation(0);
      setAspect(4 / 3);
    }
  }, [isOpen, imageSrc]);

  // Read natural image dimensions
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const target = e.currentTarget;
    setImgNaturalSize({
      width: target.naturalWidth || target.width,
      height: target.naturalHeight || target.height,
    });
  };

  // Drag handlers for mouse
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - pan.x,
      y: e.clientY - pan.y,
    });
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    },
    [isDragging, dragStart]
  );

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch handlers for mobile / touchscreen
  const touchStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const touchDistanceRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      touchStartRef.current = {
        x: e.touches[0].clientX - pan.x,
        y: e.touches[0].clientY - pan.y,
      };
    } else if (e.touches.length === 2) {
      // Pinch to zoom start
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchDistanceRef.current = Math.hypot(dx, dy);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging) {
      setPan({
        x: e.touches[0].clientX - touchStartRef.current.x,
        y: e.touches[0].clientY - touchStartRef.current.y,
      });
    } else if (e.touches.length === 2 && touchDistanceRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const currentDist = Math.hypot(dx, dy);
      const factor = currentDist / touchDistanceRef.current;
      setZoom((prev) => Math.max(1, Math.min(3.5, prev * factor)));
      touchDistanceRef.current = currentDist;
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    touchDistanceRef.current = null;
  };

  // Wheel to zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomStep = e.deltaY < 0 ? 0.08 : -0.08;
    setZoom((z) => Math.max(1, Math.min(3.5, +(z + zoomStep).toFixed(2))));
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
  };

  // Crop & Export via HTML5 Canvas
  const handleApply = async () => {
    if (!imageSrc || !imgNaturalSize.width || !imgNaturalSize.height || !containerRef.current) {
      return;
    }

    try {
      setIsProcessing(true);

      const targetWidth = 800;
      const targetHeight = Math.round(targetWidth / aspect);

      const frameWidth = containerRef.current.clientWidth;
      const frameHeight = containerRef.current.clientHeight;

      const isRotated90or270 = rotation % 180 !== 0;
      const effectiveImgWidth = isRotated90or270 ? imgNaturalSize.height : imgNaturalSize.width;
      const effectiveImgHeight = isRotated90or270 ? imgNaturalSize.width : imgNaturalSize.height;

      // Scale factor to cover the container frame
      const s0 = Math.max(frameWidth / effectiveImgWidth, frameHeight / effectiveImgHeight);
      const k = targetWidth / frameWidth;

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Canvas 2D context unavailable');
      }

      // Draw background
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, targetWidth, targetHeight);

      // Load image into native Image element
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = (err) => reject(err);
        img.src = imageSrc;
      });

      ctx.save();
      // Move to center of canvas + apply scaled pan
      ctx.translate(targetWidth / 2 + pan.x * k, targetHeight / 2 + pan.y * k);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(zoom * s0 * k, zoom * s0 * k);

      // Draw image centered at its origin
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      ctx.restore();

      const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
      onConfirm(croppedDataUrl);
      onClose();
    } catch (err) {
      console.error('Failed to crop and export image', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Preview frame dimensions based on selected aspect ratio
  const previewMaxHeight = 320;
  const previewWidth = aspect >= 1 ? Math.min(440, previewMaxHeight * aspect) : 280;
  const previewHeight = Math.round(previewWidth / aspect);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Adjust & Frame Food Picture"
      description="Drag to reposition • Scroll or use the slider to zoom in/out"
      maxWidth="xl"
    >
      <div className="space-y-4 pt-1">
        {/* Viewport Outer Container */}
        <div className="relative w-full py-4 bg-stone-950 rounded-2xl border-2 border-[#3A0A0F]/20 shadow-inner flex items-center justify-center overflow-hidden select-none">
          {/* Framed Crop Box with Dimmed Outside & Grid Lines */}
          <div
            ref={containerRef}
            style={{ width: `${previewWidth}px`, height: `${previewHeight}px` }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheel}
            className={`relative overflow-hidden rounded-xl border-2 border-white/80 shadow-2xl bg-black ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
          >
            {/* The Image Element */}
            {imageSrc && (
              <img
                ref={imageRef}
                src={imageSrc}
                alt="Adjust preview"
                onLoad={handleImageLoad}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${zoom})`,
                  transformOrigin: 'center center',
                  maxWidth: 'none',
                  maxHeight: 'none',
                  minWidth: '100%',
                  minHeight: '100%',
                  objectFit: 'cover',
                  userSelect: 'none',
                  pointerEvents: 'none',
                  transition: isDragging ? 'none' : 'transform 0.05s ease-out',
                }}
              />
            )}

            {/* Rule of Thirds Grid Overlay */}
            <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 border border-white/30">
              <div className="border-r border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div className="border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div className="border-r border-b border-white/20" />
              <div className="border-b border-white/20" />
              <div className="border-r border-white/20" />
              <div className="border-r border-white/20" />
              <div className="border-white/20" />
            </div>

            {/* Drag helper hint */}
            <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-md text-white text-[10px] font-semibold px-2 py-0.5 rounded-md pointer-events-none border border-white/10 flex items-center gap-1">
              <Move className="w-3 h-3 text-[#EAD8C0]" />
              <span>Drag to move</span>
            </div>

            {/* Live Zoom Badge */}
            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md text-[#EAD8C0] text-[10px] font-mono font-bold px-2 py-0.5 rounded-md pointer-events-none border border-white/10">
              {Math.round(zoom * 100)}%
            </div>
          </div>
        </div>

        {/* Controls Bar */}
        <div className="p-4 bg-[#FAF4F2] rounded-2xl border border-[#EAD8C0] space-y-3.5">
          {/* Zoom Slider */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-[#3A0A0F] whitespace-nowrap flex items-center gap-1">
              <ZoomIn className="w-3.5 h-3.5" />
              <span>Zoom</span>
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(1, +(z - 0.1).toFixed(2)))}
              className="p-1.5 rounded-lg hover:bg-[#EAD8C0] text-[#3A0A0F] transition-colors cursor-pointer"
              title="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <input
              type="range"
              min={1}
              max={3}
              step={0.02}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 h-2 bg-[#EAD8C0] rounded-lg appearance-none cursor-pointer accent-[#3A0A0F]"
            />
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)))}
              className="p-1.5 rounded-lg hover:bg-[#EAD8C0] text-[#3A0A0F] transition-colors cursor-pointer"
              title="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          {/* Aspect Ratio and Rotate Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#EAD8C0]/70">
            {/* Aspect Ratio Presets */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-[#6B4F48] mr-1">Aspect:</span>
              <button
                type="button"
                onClick={() => setAspect(4 / 3)}
                className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                  aspect === 4 / 3
                    ? 'bg-[#3A0A0F] text-white border-[#3A0A0F] shadow-xs'
                    : 'bg-white text-[#3A0A0F] border-[#EAD8C0] hover:bg-[#FAF4F2]'
                }`}
              >
                4:3 (Food Card)
              </button>
              <button
                type="button"
                onClick={() => setAspect(1)}
                className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                  aspect === 1
                    ? 'bg-[#3A0A0F] text-white border-[#3A0A0F] shadow-xs'
                    : 'bg-white text-[#3A0A0F] border-[#EAD8C0] hover:bg-[#FAF4F2]'
                }`}
              >
                1:1 (Square)
              </button>
              <button
                type="button"
                onClick={() => setAspect(16 / 9)}
                className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                  aspect === 16 / 9
                    ? 'bg-[#3A0A0F] text-white border-[#3A0A0F] shadow-xs'
                    : 'bg-white text-[#3A0A0F] border-[#EAD8C0] hover:bg-[#FAF4F2]'
                }`}
              >
                16:9 (Banner)
              </button>
            </div>

            {/* Rotation & Reset Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="text-xs font-bold text-[#3A0A0F] bg-white hover:bg-[#FAF4F2] border border-[#EAD8C0] px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                title="Rotate 90 degrees clockwise"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Rotate</span>
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="text-xs font-bold text-[#6B4F48] hover:text-[#3A0A0F] hover:bg-[#EAD8C0]/30 px-2.5 py-1.5 rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
                title="Reset zoom and position"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#EAD8C0]">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleApply}
            isLoading={isProcessing}
            leftIcon={<Check className="w-4 h-4" />}
            className="font-bold shadow-md shadow-[#3A0A0F]/20 px-6 cursor-pointer"
          >
            Apply & Save Picture
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ImageAdjustModal;
