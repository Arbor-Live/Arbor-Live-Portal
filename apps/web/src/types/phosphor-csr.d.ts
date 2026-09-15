declare module "@phosphor-icons/react/dist/csr/*.es.js" {
  import type { ComponentType, SVGProps } from "react";

  const Icon: ComponentType<
    SVGProps<SVGSVGElement> & {
      weight?: "regular" | "bold" | "fill" | "light" | "thin" | "duotone";
    }
  >;
  export default Icon;
}
