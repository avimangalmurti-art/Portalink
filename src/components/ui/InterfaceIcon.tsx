import React from 'react';
import type { LucideIcon } from 'lucide-react';

export type InterfaceIconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type InterfaceIconWeight = 'regular' | 'medium' | 'semibold';
export type InterfaceIconRenderingMode = 'monochrome' | 'hierarchical' | 'palette' | 'multicolor';
/** Motion is reserved for indeterminate loading state. */
export type InterfaceIconEffect = 'rotate';
export type InterfaceIconSource = LucideIcon | React.ComponentType<React.SVGProps<SVGSVGElement>>;

export type InterfaceIconProps = {
  icon: InterfaceIconSource;
  size?: InterfaceIconSize;
  weight?: InterfaceIconWeight;
  renderingMode?: InterfaceIconRenderingMode;
  /** Optional semantic layer colours for palette and multicolor rendering. */
  palette?: [string, string?, string?];
  /** A changing value from 0–1, used only to communicate progress or strength. */
  variableValue?: number;
  /** Symbol motion is opt-in, meaningful, and suppressed by Reduced Motion. */
  effect?: InterfaceIconEffect;
  effectActive?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /**
   * Tiny visual correction for asymmetric glyphs. The frame remains centred;
   * only the artwork moves, so adjoining labels and controls never shift.
   */
  opticalOffset?: {
    x?: number;
    y?: number;
  };
  /** Directional actions such as Back and Next reverse in right-to-left UI. */
  mirroredInRtl?: boolean;
  /**
   * Supply a label only when the glyph is meaningful on its own. Icons inside
   * labelled controls are decorative and remain hidden from assistive tech.
   */
  label?: string;
  /** Keeps intentional semantic or selected-state paint out of theme repainting. */
  keepColor?: boolean;
  fill?: string;
  stroke?: string;
};

/**
 * The platform's single interface-glyph frame.
 *
 * Lucide supplies the vector vocabulary; this component supplies the shared
 * optical box, sizes, stroke weights, VoiceOver semantics, and RTL behaviour.
 * Full-colour creator artwork and brand marks deliberately do not pass through
 * this component.
 */
export function InterfaceIcon({
  icon,
  size = 'md',
  weight = 'regular',
  renderingMode = 'monochrome',
  palette,
  variableValue,
  effect,
  effectActive = false,
  className = '',
  style: suppliedStyle,
  opticalOffset,
  mirroredInRtl = false,
  label,
  keepColor = false,
  fill,
  stroke
}: InterfaceIconProps) {
  const Icon = icon as React.ElementType<React.SVGProps<SVGSVGElement>>;
  const style = {
    ...suppliedStyle,
    '--interface-icon-offset-x': `${opticalOffset?.x ?? 0}px`,
    '--interface-icon-offset-y': `${opticalOffset?.y ?? 0}px`,
    '--interface-icon-primary': palette?.[0] ?? 'currentColor',
    '--interface-icon-secondary': palette?.[1] ?? palette?.[0] ?? 'currentColor',
    '--interface-icon-tertiary': palette?.[2] ?? palette?.[1] ?? palette?.[0] ?? 'currentColor',
    '--interface-icon-variable': Math.min(1, Math.max(0, variableValue ?? 1))
  } as React.CSSProperties;

  return <span
    data-interface-icon-frame=""
    data-keep-color={keepColor ? '' : undefined}
    data-icon-size={size}
    data-icon-weight={weight}
    data-icon-rendering={renderingMode}
    data-icon-variable={variableValue === undefined ? undefined : ''}
    data-icon-effect={effect}
    data-icon-effect-active={effect && effectActive ? '' : undefined}
    data-mirror-in-rtl={mirroredInRtl ? '' : undefined}
    className={className}
    style={style}
    role={label ? 'img' : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
  >
      <Icon
        data-interface-icon=""
        data-keep-color={keepColor ? '' : undefined}
        aria-hidden="true"
        focusable="false"
        fill={fill ?? 'none'}
        stroke={stroke ?? 'currentColor'}
      />
    </span>;
}
