import Image from "next/image";
import Link from "next/link";
import { safeUrl } from "@/lib/safe-url";

/**
 * The supplied lockup (mark plus wordmark) is used as-is, at a fixed height,
 * so the header always shows the real logo rather than a redrawn copy.
 */
export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link href={safeUrl(href)} aria-label="KaiDAO home" className="flex shrink-0 items-center">
      <Image
        src="/kaidao-logo.png"
        alt=""
        width={1224}
        height={226}
        priority
        sizes="200px"
        className="h-7 w-auto sm:h-8"
      />
    </Link>
  );
}
