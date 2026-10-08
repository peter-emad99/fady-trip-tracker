import { useReceiptSrc, isLocalReceipt } from '@/lib/localReceipts';

// <img> for a receipt URL, including photos still on this device waiting to upload ("local:…").
// With `link`, it opens the full image in a new tab.
export default function ReceiptImage({ url, alt, className, link = false, linkClassName }) {
  const src = useReceiptSrc(url);
  const img = src ? (
    <img src={src} alt={alt} loading="lazy" className={className} />
  ) : (
    <div className={`${className} bg-slate-100`} aria-label={alt} />
  );
  if (!link || !src) return img;
  return (
    <a href={src} target="_blank" rel="noreferrer" className={linkClassName} title={isLocalReceipt(url) ? 'Waiting to upload' : undefined}>
      {img}
    </a>
  );
}
