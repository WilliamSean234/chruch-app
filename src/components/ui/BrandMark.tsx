import Image from "next/image";

/** Lambang gereja untuk menu samping, halaman masuk, dan halaman daftar. */
export default function BrandMark({ size = 40 }: { size?: number }) {
  return <Image src="/icons/icon-192.png" alt="" width={size} height={size} priority className="flex-none" aria-hidden="true" />;
}
