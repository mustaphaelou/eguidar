import { logo } from "@/lib/site"

export function Logo() {
  return (
    <img
      src={logo.src}
      width={logo.width}
      height={logo.height}
      alt={logo.alt}
      className="h-[36px] w-auto"
    />
  )
}
