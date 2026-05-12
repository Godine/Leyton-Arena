"use client";

import { icons, type LucideProps } from "lucide-react";
import { Award } from "lucide-react";

interface Props extends LucideProps {
  name: string;
}

/**
 * Render a Lucide icon by string name. The full icon set is tree-shaken at
 * build time when this is used via the dynamic-name path, so prefer direct
 * imports in components where the icon is known at author time. This helper
 * exists for the data-driven catalog where icons come from the badge
 * catalog's `icon` field.
 */
export function LucideIcon({ name, ...rest }: Props) {
  const Icon = (icons as Record<string, React.ComponentType<LucideProps>>)[name] ?? Award;
  return <Icon {...rest} />;
}
