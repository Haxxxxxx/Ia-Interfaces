/**
 * Figma to Code - AI-powered design to code conversion
 *
 * This module provides utilities for converting Figma designs to code,
 * extracting design tokens, and generating component files.
 */

import type { FigmaNodeStyles } from "@/components/FigmaStylePanel";

// ============================================================================
// Types
// ============================================================================

export interface DesignTokens {
  colors: Record<string, string>;
  typography: {
    fontFamilies: string[];
    fontSizes: Record<string, string>;
    fontWeights: Record<string, number>;
    lineHeights: Record<string, string>;
  };
  spacing: Record<string, string>;
  borderRadius: Record<string, string>;
  shadows: Record<string, string>;
}

export interface GeneratedComponent {
  name: string;
  code: string;
  css: string;
  tailwind: string;
  tokens: Partial<DesignTokens>;
}

export interface ComponentPattern {
  type: "button" | "card" | "input" | "modal" | "nav" | "list" | "grid" | "container" | "text" | "image" | "icon" | "unknown";
  confidence: number;
  suggestions: string[];
}

// ============================================================================
// Pattern Detection - Identify common UI components
// ============================================================================

export function detectComponentPattern(node: FigmaNodeStyles): ComponentPattern {
  const name = node.name.toLowerCase();
  const type = node.type?.toLowerCase() || "";

  // Button detection
  if (
    name.includes("button") || name.includes("btn") || name.includes("cta") ||
    (node.cornerRadius && node.cornerRadius > 0 && node.width && node.height &&
     node.width < 300 && node.height < 80 && node.fills?.length)
  ) {
    return {
      type: "button",
      confidence: name.includes("button") ? 0.95 : 0.7,
      suggestions: [
        "Add onClick handler",
        "Consider hover/active states",
        "Add loading state variant",
        "Make it accessible with proper aria labels"
      ]
    };
  }

  // Card detection
  if (
    name.includes("card") ||
    (node.cornerRadius && node.cornerRadius >= 8 && node.effects?.some(e => e.type === "DROP_SHADOW"))
  ) {
    return {
      type: "card",
      confidence: name.includes("card") ? 0.95 : 0.6,
      suggestions: [
        "Add hover effect for interactive cards",
        "Consider adding a link wrapper",
        "Add image slot at top if needed"
      ]
    };
  }

  // Input detection
  if (name.includes("input") || name.includes("field") || name.includes("textbox")) {
    return {
      type: "input",
      confidence: 0.9,
      suggestions: [
        "Add label and error message slots",
        "Handle focus states",
        "Add validation feedback",
        "Consider placeholder text"
      ]
    };
  }

  // Modal/Dialog detection
  if (name.includes("modal") || name.includes("dialog") || name.includes("popup")) {
    return {
      type: "modal",
      confidence: 0.9,
      suggestions: [
        "Add backdrop overlay",
        "Handle escape key to close",
        "Trap focus inside modal",
        "Add close button"
      ]
    };
  }

  // Navigation detection
  if (name.includes("nav") || name.includes("menu") || name.includes("header") || name.includes("sidebar")) {
    return {
      type: "nav",
      confidence: 0.85,
      suggestions: [
        "Make responsive for mobile",
        "Add active state for current page",
        "Consider mobile hamburger menu"
      ]
    };
  }

  // List detection
  if (name.includes("list") || name.includes("items") || (node.layout?.layoutMode === "VERTICAL" && node.layout.itemSpacing)) {
    return {
      type: "list",
      confidence: 0.7,
      suggestions: [
        "Use map() to render items",
        "Add key prop for each item",
        "Consider virtualization for long lists"
      ]
    };
  }

  // Grid detection
  if (name.includes("grid") || (node.layout?.layoutMode === "HORIZONTAL" && node.width && node.width > 400)) {
    return {
      type: "grid",
      confidence: 0.6,
      suggestions: [
        "Use CSS Grid or Flexbox wrap",
        "Make responsive with breakpoints",
        "Consider gap between items"
      ]
    };
  }

  // Text detection
  if (type === "text" || node.textStyle) {
    return {
      type: "text",
      confidence: 0.95,
      suggestions: [
        "Use semantic HTML (h1-h6, p, span)",
        "Consider line clamping for long text",
        "Add responsive font sizes"
      ]
    };
  }

  // Container/Frame detection
  if (node.layout?.layoutMode) {
    return {
      type: "container",
      confidence: 0.5,
      suggestions: [
        "Use as a reusable layout component",
        "Consider responsive padding",
        "Add max-width for readability"
      ]
    };
  }

  return {
    type: "unknown",
    confidence: 0.3,
    suggestions: [
      "Analyze the component structure",
      "Consider its purpose in the UI",
      "Look at similar components in the design"
    ]
  };
}

// ============================================================================
// Design Token Extraction
// ============================================================================

export function extractDesignTokens(nodes: FigmaNodeStyles[]): DesignTokens {
  const tokens: DesignTokens = {
    colors: {},
    typography: {
      fontFamilies: [],
      fontSizes: {},
      fontWeights: {},
      lineHeights: {},
    },
    spacing: {},
    borderRadius: {},
    shadows: {},
  };

  const colorSet = new Set<string>();
  const fontFamilySet = new Set<string>();
  const fontSizeSet = new Set<number>();
  const radiusSet = new Set<number>();
  const spacingSet = new Set<number>();

  for (const node of nodes) {
    // Extract colors from fills
    if (node.fills) {
      for (const fill of node.fills) {
        if (fill.type === "SOLID" && fill.color && fill.visible !== false) {
          const hex = rgbToHex(fill.color.r, fill.color.g, fill.color.b);
          colorSet.add(hex);
        }
      }
    }

    // Extract colors from strokes
    if (node.strokes) {
      for (const stroke of node.strokes) {
        if (stroke.color) {
          const hex = rgbToHex(stroke.color.r, stroke.color.g, stroke.color.b);
          colorSet.add(hex);
        }
      }
    }

    // Extract typography
    if (node.textStyle) {
      if (node.textStyle.fontFamily) {
        fontFamilySet.add(node.textStyle.fontFamily);
      }
      if (node.textStyle.fontSize) {
        fontSizeSet.add(node.textStyle.fontSize);
      }
      if (node.textStyle.fontWeight) {
        tokens.typography.fontWeights[`weight-${node.textStyle.fontWeight}`] = node.textStyle.fontWeight;
      }
    }

    // Extract border radius
    if (node.cornerRadius) {
      radiusSet.add(node.cornerRadius);
    }

    // Extract spacing from layout
    if (node.layout) {
      if (node.layout.itemSpacing) spacingSet.add(node.layout.itemSpacing);
      if (node.layout.paddingTop) spacingSet.add(node.layout.paddingTop);
      if (node.layout.paddingRight) spacingSet.add(node.layout.paddingRight);
      if (node.layout.paddingBottom) spacingSet.add(node.layout.paddingBottom);
      if (node.layout.paddingLeft) spacingSet.add(node.layout.paddingLeft);
    }

    // Extract shadows
    if (node.effects) {
      for (const effect of node.effects) {
        if (effect.type === "DROP_SHADOW" && effect.visible !== false) {
          const shadowName = `shadow-${node.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
          const x = effect.offset?.x || 0;
          const y = effect.offset?.y || 0;
          const blur = effect.radius || 0;
          const spread = effect.spread || 0;
          const color = effect.color
            ? `rgba(${Math.round(effect.color.r * 255)}, ${Math.round(effect.color.g * 255)}, ${Math.round(effect.color.b * 255)}, ${(effect.color.a || 0.25).toFixed(2)})`
            : "rgba(0,0,0,0.25)";
          tokens.shadows[shadowName] = `${x}px ${y}px ${blur}px ${spread}px ${color}`;
        }
      }
    }
  }

  // Convert sets to named tokens
  let colorIndex = 1;
  Array.from(colorSet).forEach((color) => {
    const name = getColorName(color) || `color-${colorIndex++}`;
    tokens.colors[name] = color;
  });

  tokens.typography.fontFamilies = Array.from(fontFamilySet);

  Array.from(fontSizeSet).forEach((size) => {
    tokens.typography.fontSizes[`text-${size}`] = `${size}px`;
  });

  Array.from(radiusSet).forEach((radius) => {
    tokens.borderRadius[`radius-${radius}`] = `${radius}px`;
  });

  Array.from(spacingSet).forEach((spacing) => {
    tokens.spacing[`space-${spacing}`] = `${spacing}px`;
  });

  return tokens;
}

// ============================================================================
// Code Generation - Enhanced with AI context
// ============================================================================

export function generateSmartComponent(
  node: FigmaNodeStyles,
  options: {
    format: "react" | "react-tailwind" | "vue" | "html";
    includeTypes?: boolean;
    includeProps?: boolean;
    responsiveBreakpoints?: boolean;
  } = { format: "react-tailwind" }
): GeneratedComponent {
  const pattern = detectComponentPattern(node);
  const componentName = toPascalCase(node.name) || "Component";
  const className = toKebabCase(node.name) || "component";

  let code = "";
  let css = "";
  let tailwind = "";

  // Generate Tailwind classes
  tailwind = generateTailwindClasses(node, options.responsiveBreakpoints);

  // Generate CSS
  css = generateCSSFromNode(node, className);

  // Generate component code based on pattern and format
  switch (options.format) {
    case "react-tailwind":
      code = generateReactTailwindComponent(node, componentName, tailwind, pattern, options);
      break;
    case "react":
      code = generateReactCSSComponent(node, componentName, className, pattern, options);
      break;
    case "vue":
      code = generateVueComponent(node, componentName, tailwind, pattern);
      break;
    case "html":
      code = generateHTMLComponent(node, className, pattern);
      css = generateCSSFromNode(node, className);
      break;
  }

  return {
    name: componentName,
    code,
    css,
    tailwind,
    tokens: extractDesignTokens([node]),
  };
}

function generateReactTailwindComponent(
  node: FigmaNodeStyles,
  name: string,
  tailwind: string,
  pattern: ComponentPattern,
  options: { includeTypes?: boolean; includeProps?: boolean }
): string {
  const hasChildren = node.type !== "TEXT";

  // Build props based on pattern
  let propsInterface = "";
  let propsDestructure = "className = \"\"";
  let propsUsage = "";

  if (options.includeTypes) {
    switch (pattern.type) {
      case "button":
        propsInterface = `interface ${name}Props {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "outline";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  className?: string;
}`;
        propsDestructure = `children, onClick, disabled, variant = "primary", size = "md", loading, className = ""`;
        break;
      case "card":
        propsInterface = `interface ${name}Props {
  title?: string;
  description?: string;
  image?: string;
  children?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}`;
        propsDestructure = `title, description, image, children, onClick, className = ""`;
        break;
      case "input":
        propsInterface = `interface ${name}Props {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  type?: "text" | "email" | "password" | "number";
  className?: string;
}`;
        propsDestructure = `label, value, onChange, placeholder, error, disabled, type = "text", className = ""`;
        break;
      default:
        propsInterface = `interface ${name}Props {
  children?: React.ReactNode;
  className?: string;
}`;
        propsDestructure = `children, className = ""`;
    }
  }

  // Generate component body based on pattern
  let componentBody = "";
  switch (pattern.type) {
    case "button":
      componentBody = `<button
      onClick={onClick}
      disabled={disabled || loading}
      className={\`${tailwind} \${className}\`}
    >
      {loading ? <span className="animate-spin">⟳</span> : children}
    </button>`;
      break;
    case "input":
      componentBody = `<div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium">{label}</label>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={\`${tailwind} \${error ? "border-red-500" : ""} \${className}\`}
      />
      {error && <span className="text-sm text-red-500">{error}</span>}
    </div>`;
      break;
    case "card":
      componentBody = `<div onClick={onClick} className={\`${tailwind} \${onClick ? "cursor-pointer" : ""} \${className}\`}>
      {image && <img src={image} alt="" className="w-full h-auto rounded-t-lg" />}
      {title && <h3 className="font-semibold">{title}</h3>}
      {description && <p className="text-sm opacity-70">{description}</p>}
      {children}
    </div>`;
      break;
    default:
      componentBody = hasChildren
        ? `<div className={\`${tailwind} \${className}\`}>
      {children}
    </div>`
        : `<div className={\`${tailwind} \${className}\`} />`;
  }

  // Assemble the component
  let result = "";

  if (options.includeTypes && propsInterface) {
    result += propsInterface + "\n\n";
  }

  result += `export function ${name}({ ${propsDestructure} }${options.includeTypes ? `: ${name}Props` : ""}) {
  return (
    ${componentBody}
  );
}`;

  // Add usage example as comment
  result += `\n\n/* Usage:
${generateUsageExample(name, pattern)}

${pattern.suggestions.length > 0 ? `Suggestions:\n${pattern.suggestions.map(s => `- ${s}`).join("\n")}` : ""}
*/`;

  return result;
}

function generateReactCSSComponent(
  node: FigmaNodeStyles,
  name: string,
  className: string,
  pattern: ComponentPattern,
  options: { includeTypes?: boolean }
): string {
  return `import styles from './${name}.module.css';

export function ${name}({ children, className = "" }) {
  return (
    <div className={\`\${styles.root} \${className}\`}>
      {children}
    </div>
  );
}`;
}

function generateVueComponent(
  node: FigmaNodeStyles,
  name: string,
  tailwind: string,
  pattern: ComponentPattern
): string {
  return `<template>
  <div class="${tailwind}">
    <slot />
  </div>
</template>

<script setup lang="ts">
// ${name} component
// Pattern detected: ${pattern.type} (${Math.round(pattern.confidence * 100)}% confidence)
</script>`;
}

function generateHTMLComponent(
  node: FigmaNodeStyles,
  className: string,
  pattern: ComponentPattern
): string {
  return `<!-- ${pattern.type.toUpperCase()} Component -->
<div class="${className}">
  <!-- Content here -->
</div>`;
}

function generateUsageExample(name: string, pattern: ComponentPattern): string {
  switch (pattern.type) {
    case "button":
      return `<${name} onClick={() => console.log("clicked")}>
  Click me
</${name}>`;
    case "input":
      return `<${name}
  label="Email"
  value={email}
  onChange={setEmail}
  placeholder="you@example.com"
/>`;
    case "card":
      return `<${name}
  title="Card Title"
  description="Card description text"
  image="/placeholder.jpg"
/>`;
    default:
      return `<${name}>
  Content here
</${name}>`;
  }
}

// ============================================================================
// Export Functions - Generate files
// ============================================================================

export function generateComponentFiles(
  component: GeneratedComponent,
  format: "react" | "react-tailwind" | "vue"
): { filename: string; content: string }[] {
  const files: { filename: string; content: string }[] = [];

  switch (format) {
    case "react-tailwind":
      files.push({
        filename: `${component.name}.tsx`,
        content: component.code,
      });
      break;
    case "react":
      files.push({
        filename: `${component.name}.tsx`,
        content: component.code,
      });
      files.push({
        filename: `${component.name}.module.css`,
        content: component.css,
      });
      break;
    case "vue":
      files.push({
        filename: `${component.name}.vue`,
        content: component.code,
      });
      break;
  }

  return files;
}

export function generateDesignTokensFile(tokens: DesignTokens, format: "css" | "tailwind" | "json"): string {
  switch (format) {
    case "css":
      return generateCSSVariables(tokens);
    case "tailwind":
      return generateTailwindConfig(tokens);
    case "json":
      return JSON.stringify(tokens, null, 2);
  }
}

function generateCSSVariables(tokens: DesignTokens): string {
  let css = `:root {\n`;
  css += `  /* Colors */\n`;
  for (const [name, value] of Object.entries(tokens.colors)) {
    css += `  --${name}: ${value};\n`;
  }
  css += `\n  /* Typography */\n`;
  for (const [name, value] of Object.entries(tokens.typography.fontSizes)) {
    css += `  --${name}: ${value};\n`;
  }
  css += `\n  /* Spacing */\n`;
  for (const [name, value] of Object.entries(tokens.spacing)) {
    css += `  --${name}: ${value};\n`;
  }
  css += `\n  /* Border Radius */\n`;
  for (const [name, value] of Object.entries(tokens.borderRadius)) {
    css += `  --${name}: ${value};\n`;
  }
  css += `\n  /* Shadows */\n`;
  for (const [name, value] of Object.entries(tokens.shadows)) {
    css += `  --${name}: ${value};\n`;
  }
  css += `}\n`;
  return css;
}

function generateTailwindConfig(tokens: DesignTokens): string {
  const config: any = {
    theme: {
      extend: {
        colors: {},
        fontSize: {},
        spacing: {},
        borderRadius: {},
        boxShadow: {},
      },
    },
  };

  for (const [name, value] of Object.entries(tokens.colors)) {
    config.theme.extend.colors[name] = value;
  }
  for (const [name, value] of Object.entries(tokens.typography.fontSizes)) {
    config.theme.extend.fontSize[name.replace("text-", "")] = value;
  }
  for (const [name, value] of Object.entries(tokens.spacing)) {
    config.theme.extend.spacing[name.replace("space-", "")] = value;
  }
  for (const [name, value] of Object.entries(tokens.borderRadius)) {
    config.theme.extend.borderRadius[name.replace("radius-", "")] = value;
  }
  for (const [name, value] of Object.entries(tokens.shadows)) {
    config.theme.extend.boxShadow[name.replace("shadow-", "")] = value;
  }

  return `// tailwind.config.js - Generated from Figma
module.exports = ${JSON.stringify(config, null, 2)}`;
}

// ============================================================================
// Utility Functions
// ============================================================================

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

function toKebabCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/^-+|-+$/g, "");
}

function getColorName(hex: string): string | null {
  // Basic color name mapping
  const colorMap: Record<string, string> = {
    "#ffffff": "white",
    "#000000": "black",
    "#ff0000": "red",
    "#00ff00": "green",
    "#0000ff": "blue",
    "#ffff00": "yellow",
    "#ff00ff": "magenta",
    "#00ffff": "cyan",
  };
  return colorMap[hex.toLowerCase()] || null;
}

function generateTailwindClasses(node: FigmaNodeStyles, responsive?: boolean): string {
  const classes: string[] = [];

  // Dimensions
  if (node.width) classes.push(`w-[${node.width}px]`);
  if (node.height) classes.push(`h-[${node.height}px]`);

  // Border radius
  if (node.cornerRadius) {
    const r = node.cornerRadius;
    if (r >= 9999) classes.push("rounded-full");
    else if (r >= 16) classes.push("rounded-2xl");
    else if (r >= 12) classes.push("rounded-xl");
    else if (r >= 8) classes.push("rounded-lg");
    else if (r >= 6) classes.push("rounded-md");
    else if (r >= 4) classes.push("rounded");
    else classes.push(`rounded-[${r}px]`);
  }

  // Background
  if (node.fills && node.fills.length > 0) {
    const fill = node.fills[0];
    if (fill.type === "SOLID" && fill.color && fill.visible !== false) {
      const hex = rgbToHex(fill.color.r, fill.color.g, fill.color.b);
      classes.push(`bg-[${hex}]`);
    }
  }

  // Border
  if (node.strokes && node.strokes.length > 0 && node.strokeWeight) {
    classes.push(`border-[${node.strokeWeight}px]`);
    const stroke = node.strokes[0];
    if (stroke.color) {
      const hex = rgbToHex(stroke.color.r, stroke.color.g, stroke.color.b);
      classes.push(`border-[${hex}]`);
    }
  }

  // Layout
  if (node.layout?.layoutMode && node.layout.layoutMode !== "NONE") {
    classes.push("flex");
    classes.push(node.layout.layoutMode === "VERTICAL" ? "flex-col" : "flex-row");

    if (node.layout.itemSpacing) {
      classes.push(`gap-[${node.layout.itemSpacing}px]`);
    }

    const justifyMap: Record<string, string> = {
      MIN: "justify-start",
      CENTER: "justify-center",
      MAX: "justify-end",
      SPACE_BETWEEN: "justify-between",
    };
    const alignMap: Record<string, string> = {
      MIN: "items-start",
      CENTER: "items-center",
      MAX: "items-end",
    };

    if (node.layout.primaryAxisAlignItems) {
      classes.push(justifyMap[node.layout.primaryAxisAlignItems] || "justify-start");
    }
    if (node.layout.counterAxisAlignItems) {
      classes.push(alignMap[node.layout.counterAxisAlignItems] || "items-start");
    }

    // Padding
    const { paddingTop = 0, paddingRight = 0, paddingBottom = 0, paddingLeft = 0 } = node.layout;
    if (paddingTop === paddingRight && paddingRight === paddingBottom && paddingBottom === paddingLeft && paddingTop > 0) {
      classes.push(`p-[${paddingTop}px]`);
    } else {
      if (paddingTop) classes.push(`pt-[${paddingTop}px]`);
      if (paddingRight) classes.push(`pr-[${paddingRight}px]`);
      if (paddingBottom) classes.push(`pb-[${paddingBottom}px]`);
      if (paddingLeft) classes.push(`pl-[${paddingLeft}px]`);
    }
  }

  // Typography
  if (node.textStyle) {
    if (node.textStyle.fontSize) classes.push(`text-[${node.textStyle.fontSize}px]`);
    if (node.textStyle.fontWeight) {
      const w = node.textStyle.fontWeight;
      if (w <= 300) classes.push("font-light");
      else if (w <= 400) classes.push("font-normal");
      else if (w <= 500) classes.push("font-medium");
      else if (w <= 600) classes.push("font-semibold");
      else classes.push("font-bold");
    }
  }

  return classes.join(" ");
}

function generateCSSFromNode(node: FigmaNodeStyles, className: string): string {
  const props: string[] = [];

  if (node.width) props.push(`  width: ${node.width}px;`);
  if (node.height) props.push(`  height: ${node.height}px;`);
  if (node.cornerRadius) props.push(`  border-radius: ${node.cornerRadius}px;`);

  if (node.fills && node.fills.length > 0) {
    const fill = node.fills[0];
    if (fill.type === "SOLID" && fill.color && fill.visible !== false) {
      const { r, g, b, a } = fill.color;
      props.push(`  background-color: rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a.toFixed(2)});`);
    }
  }

  if (node.strokes && node.strokes.length > 0 && node.strokeWeight) {
    const stroke = node.strokes[0];
    if (stroke.color) {
      const { r, g, b, a } = stroke.color;
      props.push(`  border: ${node.strokeWeight}px solid rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${(a || 1).toFixed(2)});`);
    }
  }

  if (node.layout?.layoutMode && node.layout.layoutMode !== "NONE") {
    props.push(`  display: flex;`);
    props.push(`  flex-direction: ${node.layout.layoutMode === "VERTICAL" ? "column" : "row"};`);
    if (node.layout.itemSpacing) props.push(`  gap: ${node.layout.itemSpacing}px;`);
  }

  if (node.textStyle) {
    if (node.textStyle.fontFamily) props.push(`  font-family: "${node.textStyle.fontFamily}", sans-serif;`);
    if (node.textStyle.fontSize) props.push(`  font-size: ${node.textStyle.fontSize}px;`);
    if (node.textStyle.fontWeight) props.push(`  font-weight: ${node.textStyle.fontWeight};`);
  }

  return `.${className} {\n${props.join("\n")}\n}`;
}
