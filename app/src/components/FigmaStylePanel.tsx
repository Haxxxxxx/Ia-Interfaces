"use client";

import { useState, useCallback, useEffect } from "react";

// ============================================================================
// Types - Matching Figma's style structure
// ============================================================================

interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface FigmaFill {
  type: "SOLID" | "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | "IMAGE";
  color?: FigmaColor;
  opacity?: number;
  visible?: boolean;
}

interface FigmaStroke {
  type: "SOLID";
  color?: FigmaColor;
  opacity?: number;
}

interface FigmaEffect {
  type: "DROP_SHADOW" | "INNER_SHADOW" | "LAYER_BLUR" | "BACKGROUND_BLUR";
  visible?: boolean;
  color?: FigmaColor;
  offset?: { x: number; y: number };
  radius?: number;
  spread?: number;
}

interface FigmaTextStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: number | { value: number; unit: "PIXELS" | "PERCENT" | "AUTO" };
  letterSpacing?: number;
  textAlignHorizontal?: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";
}

interface FigmaLayoutStyle {
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL";
  primaryAxisAlignItems?: "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
  counterAxisAlignItems?: "MIN" | "CENTER" | "MAX";
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  itemSpacing?: number;
}

export interface FigmaNodeStyles {
  name: string;
  type: string;
  width?: number;
  height?: number;
  fills?: FigmaFill[];
  strokes?: FigmaStroke[];
  strokeWeight?: number;
  cornerRadius?: number;
  effects?: FigmaEffect[];
  textStyle?: FigmaTextStyle;
  layout?: FigmaLayoutStyle;
  opacity?: number;
}

interface FigmaStylePanelProps {
  node: FigmaNodeStyles | null;
  onStyleChange?: (property: string, value: any) => void;
  onGenerateCSS?: (css: string) => void;
  className?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function rgbaToHex(color: FigmaColor): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function rgbaToString(color: FigmaColor): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return `rgba(${r}, ${g}, ${b}, ${color.a.toFixed(2)})`;
}

function hexToRgba(hex: string, alpha: number = 1): FigmaColor {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { r: 0, g: 0, b: 0, a: alpha };
  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255,
    a: alpha,
  };
}

// ============================================================================
// Sub-Components
// ============================================================================

function SectionHeader({ title, icon }: { title: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-terminal-muted uppercase tracking-wider border-b border-terminal-border/50">
      {icon}
      {title}
    </div>
  );
}

function PropertyRow({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between px-3 py-1.5 hover:bg-terminal-surface/50 ${className}`}>
      <span className="text-xs text-terminal-muted">{label}</span>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = "px",
  className = "",
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        min={min}
        max={max}
        step={step}
        className="w-14 px-1.5 py-0.5 text-xs bg-terminal-bg border border-terminal-border rounded text-right focus:border-terminal-accent focus:outline-none"
      />
      <span className="text-xs text-terminal-muted">{unit}</span>
    </div>
  );
}

function ColorInput({
  color,
  onChange,
}: {
  color: FigmaColor;
  onChange: (color: FigmaColor) => void;
}) {
  const hex = rgbaToHex(color);

  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-6 h-6 rounded border border-terminal-border cursor-pointer"
        style={{ backgroundColor: rgbaToString(color) }}
      >
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(hexToRgba(e.target.value, color.a))}
          className="w-full h-full opacity-0 cursor-pointer"
        />
      </div>
      <input
        type="text"
        value={hex.toUpperCase()}
        onChange={(e) => onChange(hexToRgba(e.target.value, color.a))}
        className="w-16 px-1.5 py-0.5 text-xs bg-terminal-bg border border-terminal-border rounded font-mono focus:border-terminal-accent focus:outline-none"
      />
      <NumberInput
        value={Math.round(color.a * 100)}
        onChange={(v) => onChange({ ...color, a: v / 100 })}
        min={0}
        max={100}
        unit="%"
        className="w-16"
      />
    </div>
  );
}

function SelectInput({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-1.5 py-0.5 text-xs bg-terminal-bg border border-terminal-border rounded focus:border-terminal-accent focus:outline-none"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function FigmaStylePanel({
  node,
  onStyleChange,
  onGenerateCSS,
  className = "",
}: FigmaStylePanelProps) {
  const [localStyles, setLocalStyles] = useState<FigmaNodeStyles | null>(node);
  const [expandedSections, setExpandedSections] = useState({
    layout: true,
    fill: true,
    stroke: true,
    effects: true,
    typography: true,
  });

  useEffect(() => {
    setLocalStyles(node);
  }, [node]);

  const updateStyle = useCallback(
    (property: string, value: any) => {
      setLocalStyles((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, [property]: value };
        onStyleChange?.(property, value);
        return updated;
      });
    },
    [onStyleChange]
  );

  const updateNestedStyle = useCallback(
    (section: string, property: string, value: any) => {
      setLocalStyles((prev) => {
        if (!prev) return prev;
        const sectionData = (prev as any)[section] || {};
        const updated = {
          ...prev,
          [section]: { ...sectionData, [property]: value },
        };
        onStyleChange?.(`${section}.${property}`, value);
        return updated;
      });
    },
    [onStyleChange]
  );

  const generateCSS = useCallback(() => {
    if (!localStyles) return "";

    const lines: string[] = [];
    const className = localStyles.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    lines.push(`.${className} {`);

    // Dimensions
    if (localStyles.width) lines.push(`  width: ${localStyles.width}px;`);
    if (localStyles.height) lines.push(`  height: ${localStyles.height}px;`);

    // Layout
    if (localStyles.layout?.layoutMode && localStyles.layout.layoutMode !== "NONE") {
      lines.push(`  display: flex;`);
      lines.push(`  flex-direction: ${localStyles.layout.layoutMode === "VERTICAL" ? "column" : "row"};`);

      if (localStyles.layout.itemSpacing) {
        lines.push(`  gap: ${localStyles.layout.itemSpacing}px;`);
      }

      const alignMap: Record<string, string> = {
        MIN: "flex-start",
        CENTER: "center",
        MAX: "flex-end",
        SPACE_BETWEEN: "space-between",
      };

      if (localStyles.layout.primaryAxisAlignItems) {
        lines.push(`  justify-content: ${alignMap[localStyles.layout.primaryAxisAlignItems]};`);
      }
      if (localStyles.layout.counterAxisAlignItems) {
        lines.push(`  align-items: ${alignMap[localStyles.layout.counterAxisAlignItems]};`);
      }

      // Padding
      const { paddingTop = 0, paddingRight = 0, paddingBottom = 0, paddingLeft = 0 } = localStyles.layout;
      if (paddingTop || paddingRight || paddingBottom || paddingLeft) {
        lines.push(`  padding: ${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px;`);
      }
    }

    // Background
    if (localStyles.fills && localStyles.fills.length > 0) {
      const fill = localStyles.fills[0];
      if (fill.type === "SOLID" && fill.color && fill.visible !== false) {
        lines.push(`  background-color: ${rgbaToString(fill.color)};`);
      }
    }

    // Border radius
    if (localStyles.cornerRadius) {
      lines.push(`  border-radius: ${localStyles.cornerRadius}px;`);
    }

    // Border
    if (localStyles.strokes && localStyles.strokes.length > 0 && localStyles.strokeWeight) {
      const stroke = localStyles.strokes[0];
      if (stroke.color) {
        lines.push(`  border: ${localStyles.strokeWeight}px solid ${rgbaToString(stroke.color)};`);
      }
    }

    // Opacity
    if (localStyles.opacity !== undefined && localStyles.opacity < 1) {
      lines.push(`  opacity: ${localStyles.opacity};`);
    }

    // Effects (shadows)
    if (localStyles.effects) {
      const shadows = localStyles.effects
        .filter((e) => e.type === "DROP_SHADOW" && e.visible !== false)
        .map((e) => {
          const x = e.offset?.x || 0;
          const y = e.offset?.y || 0;
          const blur = e.radius || 0;
          const spread = e.spread || 0;
          const color = e.color ? rgbaToString(e.color) : "rgba(0,0,0,0.25)";
          return `${x}px ${y}px ${blur}px ${spread}px ${color}`;
        });

      if (shadows.length > 0) {
        lines.push(`  box-shadow: ${shadows.join(", ")};`);
      }
    }

    // Typography
    if (localStyles.textStyle) {
      const ts = localStyles.textStyle;
      if (ts.fontFamily) lines.push(`  font-family: "${ts.fontFamily}", sans-serif;`);
      if (ts.fontSize) lines.push(`  font-size: ${ts.fontSize}px;`);
      if (ts.fontWeight) lines.push(`  font-weight: ${ts.fontWeight};`);
      if (ts.lineHeight) {
        const lh = typeof ts.lineHeight === "number" ? ts.lineHeight : ts.lineHeight.value;
        lines.push(`  line-height: ${lh}px;`);
      }
      if (ts.letterSpacing) lines.push(`  letter-spacing: ${ts.letterSpacing}px;`);
      if (ts.textAlignHorizontal) {
        lines.push(`  text-align: ${ts.textAlignHorizontal.toLowerCase()};`);
      }
    }

    lines.push(`}`);
    return lines.join("\n");
  }, [localStyles]);

  const handleGenerateCSS = () => {
    const css = generateCSS();
    onGenerateCSS?.(css);
  };

  if (!localStyles) {
    return (
      <div className={`figma-style-panel bg-terminal-surface border-l border-terminal-border ${className}`}>
        <div className="p-4 text-center text-terminal-muted">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
          </svg>
          <p className="text-sm">Select a Figma element</p>
          <p className="text-xs mt-1">Use /figma code to load styles</p>
        </div>
      </div>
    );
  }

  const fill = localStyles.fills?.[0];
  const stroke = localStyles.strokes?.[0];

  return (
    <div className={`figma-style-panel bg-terminal-surface border-l border-terminal-border overflow-y-auto ${className}`}>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-terminal-surface border-b border-terminal-border">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded bg-terminal-purple" />
            <span className="text-sm font-medium truncate max-w-[120px]">{localStyles.name}</span>
          </div>
          <span className="text-xs text-terminal-muted">{localStyles.type}</span>
        </div>
      </div>

      {/* Dimensions */}
      <SectionHeader
        title="Size"
        icon={
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
          </svg>
        }
      />
      <div className="py-1">
        <PropertyRow label="W">
          <NumberInput
            value={localStyles.width || 0}
            onChange={(v) => updateStyle("width", v)}
          />
        </PropertyRow>
        <PropertyRow label="H">
          <NumberInput
            value={localStyles.height || 0}
            onChange={(v) => updateStyle("height", v)}
          />
        </PropertyRow>
        {localStyles.cornerRadius !== undefined && (
          <PropertyRow label="Radius">
            <NumberInput
              value={localStyles.cornerRadius}
              onChange={(v) => updateStyle("cornerRadius", v)}
              min={0}
            />
          </PropertyRow>
        )}
      </div>

      {/* Layout (Auto Layout) */}
      {localStyles.layout && (
        <>
          <SectionHeader
            title="Auto Layout"
            icon={
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              </svg>
            }
          />
          <div className="py-1">
            <PropertyRow label="Direction">
              <SelectInput
                value={localStyles.layout.layoutMode || "NONE"}
                options={[
                  { value: "NONE", label: "None" },
                  { value: "HORIZONTAL", label: "Row" },
                  { value: "VERTICAL", label: "Column" },
                ]}
                onChange={(v) => updateNestedStyle("layout", "layoutMode", v)}
              />
            </PropertyRow>
            <PropertyRow label="Gap">
              <NumberInput
                value={localStyles.layout.itemSpacing || 0}
                onChange={(v) => updateNestedStyle("layout", "itemSpacing", v)}
                min={0}
              />
            </PropertyRow>
            <PropertyRow label="Padding">
              <div className="grid grid-cols-4 gap-0.5">
                <NumberInput
                  value={localStyles.layout.paddingTop || 0}
                  onChange={(v) => updateNestedStyle("layout", "paddingTop", v)}
                  min={0}
                  unit=""
                />
                <NumberInput
                  value={localStyles.layout.paddingRight || 0}
                  onChange={(v) => updateNestedStyle("layout", "paddingRight", v)}
                  min={0}
                  unit=""
                />
                <NumberInput
                  value={localStyles.layout.paddingBottom || 0}
                  onChange={(v) => updateNestedStyle("layout", "paddingBottom", v)}
                  min={0}
                  unit=""
                />
                <NumberInput
                  value={localStyles.layout.paddingLeft || 0}
                  onChange={(v) => updateNestedStyle("layout", "paddingLeft", v)}
                  min={0}
                  unit=""
                />
              </div>
            </PropertyRow>
          </div>
        </>
      )}

      {/* Fill */}
      <SectionHeader
        title="Fill"
        icon={
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="10" />
          </svg>
        }
      />
      <div className="py-1 px-3">
        {fill && fill.color ? (
          <ColorInput
            color={fill.color}
            onChange={(color) => {
              const newFills = [{ ...fill, color }];
              updateStyle("fills", newFills);
            }}
          />
        ) : (
          <button
            onClick={() => updateStyle("fills", [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 }, visible: true }])}
            className="w-full py-1.5 text-xs text-terminal-muted hover:text-terminal-accent border border-dashed border-terminal-border rounded"
          >
            + Add fill
          </button>
        )}
      </div>

      {/* Stroke */}
      <SectionHeader
        title="Stroke"
        icon={
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
          </svg>
        }
      />
      <div className="py-1">
        {stroke && stroke.color ? (
          <>
            <div className="px-3 py-1">
              <ColorInput
                color={stroke.color}
                onChange={(color) => {
                  const newStrokes = [{ ...stroke, color }];
                  updateStyle("strokes", newStrokes);
                }}
              />
            </div>
            <PropertyRow label="Weight">
              <NumberInput
                value={localStyles.strokeWeight || 1}
                onChange={(v) => updateStyle("strokeWeight", v)}
                min={0}
                step={0.5}
              />
            </PropertyRow>
          </>
        ) : (
          <div className="px-3">
            <button
              onClick={() => {
                updateStyle("strokes", [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }]);
                updateStyle("strokeWeight", 1);
              }}
              className="w-full py-1.5 text-xs text-terminal-muted hover:text-terminal-accent border border-dashed border-terminal-border rounded"
            >
              + Add stroke
            </button>
          </div>
        )}
      </div>

      {/* Effects */}
      <SectionHeader
        title="Effects"
        icon={
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
          </svg>
        }
      />
      <div className="py-1 px-3">
        {localStyles.effects && localStyles.effects.length > 0 ? (
          localStyles.effects.map((effect, index) => (
            <div key={index} className="mb-2 p-2 bg-terminal-bg rounded text-xs">
              <div className="flex justify-between items-center mb-1">
                <span className="text-terminal-muted">{effect.type.replace("_", " ")}</span>
              </div>
              {effect.color && (
                <ColorInput
                  color={effect.color}
                  onChange={(color) => {
                    const newEffects = [...localStyles.effects!];
                    newEffects[index] = { ...effect, color };
                    updateStyle("effects", newEffects);
                  }}
                />
              )}
            </div>
          ))
        ) : (
          <button
            onClick={() =>
              updateStyle("effects", [
                {
                  type: "DROP_SHADOW",
                  visible: true,
                  color: { r: 0, g: 0, b: 0, a: 0.25 },
                  offset: { x: 0, y: 4 },
                  radius: 8,
                  spread: 0,
                },
              ])
            }
            className="w-full py-1.5 text-xs text-terminal-muted hover:text-terminal-accent border border-dashed border-terminal-border rounded"
          >
            + Add shadow
          </button>
        )}
      </div>

      {/* Typography (if text node) */}
      {localStyles.textStyle && (
        <>
          <SectionHeader
            title="Typography"
            icon={
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 7V4h16v3M9 20h6M12 4v16" />
              </svg>
            }
          />
          <div className="py-1">
            <PropertyRow label="Font">
              <input
                type="text"
                value={localStyles.textStyle.fontFamily || "Inter"}
                onChange={(e) => updateNestedStyle("textStyle", "fontFamily", e.target.value)}
                className="w-24 px-1.5 py-0.5 text-xs bg-terminal-bg border border-terminal-border rounded focus:border-terminal-accent focus:outline-none"
              />
            </PropertyRow>
            <PropertyRow label="Size">
              <NumberInput
                value={localStyles.textStyle.fontSize || 16}
                onChange={(v) => updateNestedStyle("textStyle", "fontSize", v)}
                min={1}
              />
            </PropertyRow>
            <PropertyRow label="Weight">
              <SelectInput
                value={String(localStyles.textStyle.fontWeight || 400)}
                options={[
                  { value: "300", label: "Light" },
                  { value: "400", label: "Regular" },
                  { value: "500", label: "Medium" },
                  { value: "600", label: "Semibold" },
                  { value: "700", label: "Bold" },
                ]}
                onChange={(v) => updateNestedStyle("textStyle", "fontWeight", parseInt(v))}
              />
            </PropertyRow>
            <PropertyRow label="Line H">
              <NumberInput
                value={
                  typeof localStyles.textStyle.lineHeight === "number"
                    ? localStyles.textStyle.lineHeight
                    : localStyles.textStyle.lineHeight?.value || 24
                }
                onChange={(v) => updateNestedStyle("textStyle", "lineHeight", v)}
                min={1}
              />
            </PropertyRow>
          </div>
        </>
      )}

      {/* Generate CSS Button */}
      <div className="sticky bottom-0 p-3 bg-terminal-surface border-t border-terminal-border">
        <button
          onClick={handleGenerateCSS}
          className="w-full py-2 text-sm font-medium bg-terminal-accent text-terminal-bg rounded hover:opacity-90 transition-opacity"
        >
          Generate CSS
        </button>
        <p className="text-xs text-terminal-muted text-center mt-1">Updates code in real-time</p>
      </div>
    </div>
  );
}

// ============================================================================
// Preview Component - Shows live CSS preview
// ============================================================================

export function FigmaStylePreview({
  css,
  className = "",
}: {
  css: string;
  className?: string;
}) {
  return (
    <div className={`figma-preview bg-terminal-bg border border-terminal-border rounded-lg overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-terminal-border bg-terminal-surface">
        <span className="text-xs font-medium">Generated CSS</span>
        <button
          onClick={() => navigator.clipboard.writeText(css)}
          className="text-xs text-terminal-muted hover:text-terminal-accent"
        >
          Copy
        </button>
      </div>
      <pre className="p-3 text-xs font-mono overflow-x-auto text-terminal-text">
        <code>{css || "/* Edit styles to generate CSS */"}</code>
      </pre>
    </div>
  );
}
