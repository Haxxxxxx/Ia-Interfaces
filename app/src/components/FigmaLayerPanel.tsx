"use client";

import { useState, useEffect, useCallback } from "react";

// ============================================================================
// Types - Matching Figma's layer structure
// ============================================================================

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  width?: number;
  height?: number;
  isIcon?: boolean;
  exportable?: boolean;
  childCount?: number;
  children?: FigmaNode[];
}

export interface FigmaPage {
  id: string;
  name: string;
  children: FigmaNode[];
}

export interface FigmaFileData {
  name: string;
  lastModified: string;
  thumbnailUrl?: string;
  pages: FigmaPage[];
}

interface FigmaLayerPanelProps {
  figmaToken: string | null;
  fileKey: string | null;
  fileUrl?: string;
  onFileLoad?: (data: FigmaFileData) => void;
  onNodeSelect?: (nodeId: string, nodeName: string, nodeType: string) => void;
  onNodeStylesFetched?: (styles: any, imageUrl?: string) => void;
  onCodeGenerated?: (code: string, css: string) => void;
  onAskAboutNode?: (nodeName: string, nodeStyles: any) => void;
  onCloseFile?: () => void;
  className?: string;
}

// ============================================================================
// Icons for node types
// ============================================================================

const NodeIcon = ({ type, isIcon }: { type: string; isIcon?: boolean }) => {
  if (isIcon) {
    return <span className="text-terminal-purple">⬡</span>;
  }

  switch (type) {
    case "DOCUMENT":
      return <span className="text-terminal-muted">📄</span>;
    case "CANVAS":
    case "PAGE":
      return <span className="text-terminal-accent">📑</span>;
    case "FRAME":
      return <span className="text-blue-400">▢</span>;
    case "GROUP":
      return <span className="text-terminal-muted">▣</span>;
    case "COMPONENT":
      return <span className="text-terminal-purple">◆</span>;
    case "COMPONENT_SET":
      return <span className="text-terminal-purple">◇</span>;
    case "INSTANCE":
      return <span className="text-terminal-green">◇</span>;
    case "VECTOR":
    case "STAR":
    case "LINE":
    case "ELLIPSE":
    case "REGULAR_POLYGON":
    case "BOOLEAN_OPERATION":
      return <span className="text-orange-400">⟡</span>;
    case "RECTANGLE":
      return <span className="text-blue-400">□</span>;
    case "TEXT":
      return <span className="text-terminal-accent">T</span>;
    case "SLICE":
      return <span className="text-terminal-red">✂</span>;
    default:
      return <span className="text-terminal-muted">•</span>;
  }
};

// ============================================================================
// Code Generation Utilities
// ============================================================================

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function generateTailwindClasses(styles: any): string {
  const classes: string[] = [];

  if (styles.width) classes.push(`w-[${styles.width}px]`);
  if (styles.height) classes.push(`h-[${styles.height}px]`);

  if (styles.cornerRadius) {
    const r = styles.cornerRadius;
    if (r >= 9999) classes.push("rounded-full");
    else if (r >= 16) classes.push("rounded-2xl");
    else if (r >= 12) classes.push("rounded-xl");
    else if (r >= 8) classes.push("rounded-lg");
    else if (r >= 6) classes.push("rounded-md");
    else if (r >= 4) classes.push("rounded");
    else classes.push(`rounded-[${r}px]`);
  }

  if (styles.fills?.[0]?.color) {
    const c = styles.fills[0].color;
    const hex = rgbToHex(c.r, c.g, c.b);
    classes.push(`bg-[${hex}]`);
  }

  if (styles.strokes?.[0]?.color && styles.strokeWeight) {
    classes.push(`border-[${styles.strokeWeight}px]`);
    const c = styles.strokes[0].color;
    const hex = rgbToHex(c.r, c.g, c.b);
    classes.push(`border-[${hex}]`);
  }

  if (styles.layout?.layoutMode) {
    classes.push("flex");
    classes.push(styles.layout.layoutMode === "VERTICAL" ? "flex-col" : "flex-row");
    if (styles.layout.itemSpacing) classes.push(`gap-[${styles.layout.itemSpacing}px]`);

    const justifyMap: Record<string, string> = { MIN: "justify-start", CENTER: "justify-center", MAX: "justify-end", SPACE_BETWEEN: "justify-between" };
    const alignMap: Record<string, string> = { MIN: "items-start", CENTER: "items-center", MAX: "items-end" };

    if (styles.layout.primaryAxisAlignItems) classes.push(justifyMap[styles.layout.primaryAxisAlignItems] || "");
    if (styles.layout.counterAxisAlignItems) classes.push(alignMap[styles.layout.counterAxisAlignItems] || "");

    const { paddingTop = 0, paddingRight = 0, paddingBottom = 0, paddingLeft = 0 } = styles.layout;
    if (paddingTop === paddingRight && paddingRight === paddingBottom && paddingBottom === paddingLeft && paddingTop > 0) {
      classes.push(`p-[${paddingTop}px]`);
    } else {
      if (paddingTop) classes.push(`pt-[${paddingTop}px]`);
      if (paddingRight) classes.push(`pr-[${paddingRight}px]`);
      if (paddingBottom) classes.push(`pb-[${paddingBottom}px]`);
      if (paddingLeft) classes.push(`pl-[${paddingLeft}px]`);
    }
  }

  if (styles.textStyle) {
    if (styles.textStyle.fontSize) classes.push(`text-[${styles.textStyle.fontSize}px]`);
    if (styles.textStyle.fontWeight) {
      const w = styles.textStyle.fontWeight;
      if (w <= 300) classes.push("font-light");
      else if (w <= 400) classes.push("font-normal");
      else if (w <= 500) classes.push("font-medium");
      else if (w <= 600) classes.push("font-semibold");
      else classes.push("font-bold");
    }
  }

  return classes.filter(Boolean).join(" ");
}

function generateCSS(styles: any, className: string): string {
  const props: string[] = [];

  if (styles.width) props.push(`  width: ${styles.width}px;`);
  if (styles.height) props.push(`  height: ${styles.height}px;`);
  if (styles.cornerRadius) props.push(`  border-radius: ${styles.cornerRadius}px;`);

  if (styles.fills?.[0]?.color) {
    const c = styles.fills[0].color;
    props.push(`  background-color: rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${c.a || 1});`);
  }

  if (styles.strokes?.[0]?.color && styles.strokeWeight) {
    const c = styles.strokes[0].color;
    props.push(`  border: ${styles.strokeWeight}px solid rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${c.a || 1});`);
  }

  if (styles.layout?.layoutMode) {
    props.push(`  display: flex;`);
    props.push(`  flex-direction: ${styles.layout.layoutMode === "VERTICAL" ? "column" : "row"};`);
    if (styles.layout.itemSpacing) props.push(`  gap: ${styles.layout.itemSpacing}px;`);
  }

  if (styles.textStyle) {
    if (styles.textStyle.fontFamily) props.push(`  font-family: "${styles.textStyle.fontFamily}", sans-serif;`);
    if (styles.textStyle.fontSize) props.push(`  font-size: ${styles.textStyle.fontSize}px;`);
    if (styles.textStyle.fontWeight) props.push(`  font-weight: ${styles.textStyle.fontWeight};`);
  }

  return `.${className} {\n${props.join("\n")}\n}`;
}

function generateReactComponent(styles: any): string {
  const componentName = styles.name?.replace(/[^a-zA-Z0-9]/g, "") || "Component";
  const tailwind = generateTailwindClasses(styles);

  return `export function ${componentName}({ children, className = "" }) {
  return (
    <div className={\`${tailwind} \${className}\`}>
      {children}
    </div>
  );
}`;
}

function toKebabCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/^-+|-+$/g, "");
}

// ============================================================================
// Layer Tree Node Component
// ============================================================================

function LayerNode({
  node,
  depth,
  expanded,
  selected,
  onToggle,
  onSelect,
}: {
  node: FigmaNode;
  depth: number;
  expanded: Set<string>;
  selected: string | null;
  onToggle: (id: string) => void;
  onSelect: (id: string, name: string, type: string) => void;
}) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isSelected = selected === node.id;

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-1 pr-2 cursor-pointer transition-colors ${
          isSelected
            ? "bg-terminal-accent/20 text-terminal-accent border-l-2 border-terminal-accent"
            : "hover:bg-terminal-surface border-l-2 border-transparent"
        }`}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={() => onSelect(node.id, node.name, node.type)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            className="w-4 h-4 flex items-center justify-center text-terminal-muted hover:text-terminal-text flex-shrink-0"
          >
            <svg
              className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        ) : (
          <span className="w-4" />
        )}

        <span className="flex-shrink-0 text-sm">
          <NodeIcon type={node.type} isIcon={node.isIcon} />
        </span>

        <span className="flex-1 text-xs truncate">{node.name}</span>

        {node.width && node.height && (
          <span className="text-[10px] text-terminal-muted flex-shrink-0 font-mono">
            {node.width}×{node.height}
          </span>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child) => (
            <LayerNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              selected={selected}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function FigmaLayerPanel({
  figmaToken,
  fileKey,
  fileUrl,
  onFileLoad,
  onNodeSelect,
  onNodeStylesFetched,
  onCodeGenerated,
  onAskAboutNode,
  onCloseFile,
  className = "",
}: FigmaLayerPanelProps) {
  const [fileData, setFileData] = useState<FigmaFileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingNode, setLoadingNode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [nodeStyles, setNodeStyles] = useState<any>(null);
  const [nodeImageUrl, setNodeImageUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [codeTab, setCodeTab] = useState<"tailwind" | "css" | "react">("tailwind");
  const [exporting, setExporting] = useState(false);
  const [showPanel, setShowPanel] = useState(true);

  useEffect(() => {
    if (figmaToken && fileKey) {
      loadFileStructure();
    }
  }, [figmaToken, fileKey]);

  const loadFileStructure = async () => {
    if (!figmaToken || !fileKey) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/figma?file=${fileKey}`, {
        headers: { "X-Figma-Token": figmaToken },
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        const fileData: FigmaFileData = {
          name: data.name,
          lastModified: data.lastModified,
          thumbnailUrl: data.thumbnailUrl,
          pages: data.pages || [],
        };
        setFileData(fileData);
        onFileLoad?.(fileData);

        if (data.pages?.length > 0) {
          setActivePage(data.pages[0].id);
          setExpanded(new Set([data.pages[0].id]));
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(Array.from(prev));
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleNodeSelect = async (nodeId: string, nodeName: string, nodeType: string) => {
    setSelected(nodeId);
    setShowPanel(true);
    onNodeSelect?.(nodeId, nodeName, nodeType);

    if (figmaToken && fileKey) {
      setLoadingNode(true);
      try {
        const res = await fetch(`/api/figma?file=${fileKey}&node=${nodeId}`, {
          headers: { "X-Figma-Token": figmaToken },
        });
        const data = await res.json();

        if (!data.error) {
          setNodeStyles(data.node);
          setNodeImageUrl(data.imageUrl);
          onNodeStylesFetched?.(data.node, data.imageUrl);
        }
      } catch (err) {
        console.error("Failed to fetch node styles:", err);
      } finally {
        setLoadingNode(false);
      }
    }
  };

  const copyToClipboard = async (text: string, type: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const exportImage = async (format: "png" | "svg") => {
    if (!figmaToken || !fileKey || !selected) return;

    setExporting(true);
    try {
      const res = await fetch(
        `/api/figma?file=${fileKey}&action=images&nodes=${selected}&format=${format}&scale=2`,
        { headers: { "X-Figma-Token": figmaToken } }
      );
      const data = await res.json();
      const url = data.images?.[selected];
      if (url) {
        window.open(url, "_blank");
      }
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  const filterNodes = (nodes: FigmaNode[], query: string): FigmaNode[] => {
    if (!query.trim()) return nodes;

    const lowerQuery = query.toLowerCase();
    const filtered: FigmaNode[] = [];

    for (const node of nodes) {
      const matches = node.name.toLowerCase().includes(lowerQuery);
      const childMatches = node.children ? filterNodes(node.children, query) : [];

      if (matches || childMatches.length > 0) {
        filtered.push({
          ...node,
          children: childMatches.length > 0 ? childMatches : node.children,
        });
      }
    }

    return filtered;
  };

  if (!figmaToken) {
    return (
      <div className={`flex flex-col items-center justify-center h-full p-6 ${className}`}>
        <div className="w-16 h-16 mb-4 rounded-2xl bg-gradient-to-br from-[#F24E1E] via-[#A259FF] to-[#1ABCFE] flex items-center justify-center">
          <svg className="w-8 h-8 text-white" viewBox="0 0 38 57" fill="currentColor">
            <path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" />
            <path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" opacity="0.8" />
            <path d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" opacity="0.6" />
          </svg>
        </div>
        <h3 className="text-base font-medium text-terminal-text mb-1">Connect Figma</h3>
        <p className="text-xs text-terminal-muted text-center">
          Link your Figma account to browse<br />designs and export assets
        </p>
      </div>
    );
  }

  if (!fileKey) {
    return (
      <div className={`flex flex-col items-center justify-center h-full p-6 ${className}`}>
        <div className="w-14 h-14 mb-4 rounded-xl border-2 border-dashed border-terminal-border flex items-center justify-center">
          <svg className="w-6 h-6 text-terminal-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <polyline points="13 2 13 9 20 9" />
          </svg>
        </div>
        <h3 className="text-sm font-medium text-terminal-text mb-1">No file loaded</h3>
        <p className="text-xs text-terminal-muted text-center mb-4">
          Paste a Figma URL above to<br />browse layers and assets
        </p>
        <div className="text-[10px] text-terminal-muted/60 font-mono">
          figma.com/design/abc123...
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`flex flex-col items-center justify-center h-full ${className}`}>
        <div className="relative w-12 h-12 mb-4">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-[#F24E1E] via-[#A259FF] to-[#1ABCFE] animate-pulse" />
          <div className="absolute inset-1 rounded-lg bg-terminal-bg flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-terminal-accent border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
        <p className="text-sm text-terminal-muted mb-1">Loading design...</p>
        <p className="text-[10px] text-terminal-muted/60">Fetching layers and assets</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center h-full p-6 ${className}`}>
        <div className="w-12 h-12 mb-4 rounded-xl bg-terminal-red/10 flex items-center justify-center">
          <svg className="w-6 h-6 text-terminal-red" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h3 className="text-sm font-medium text-terminal-red mb-1">Failed to load</h3>
        <p className="text-xs text-terminal-muted text-center mb-4 max-w-[200px]">
          {error}
        </p>
        <button
          onClick={loadFileStructure}
          className="px-3 py-1.5 text-xs bg-terminal-surface border border-terminal-border rounded hover:border-terminal-accent transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (!fileData) return null;

  const tailwindClasses = nodeStyles ? generateTailwindClasses(nodeStyles) : "";
  const cssCode = nodeStyles ? generateCSS(nodeStyles, toKebabCase(nodeStyles.name || "component")) : "";
  const reactCode = nodeStyles ? generateReactComponent(nodeStyles) : "";

  return (
    <div className={`flex h-full bg-terminal-bg ${className}`}>
      {/* Left: Layer Tree - 55% width */}
      <div className={`${showPanel && nodeStyles ? "w-[55%]" : "w-full"} flex flex-col border-r border-terminal-border transition-all duration-200`}>
        {/* File Header */}
        <div className="flex-shrink-0 px-3 py-2.5 border-b border-terminal-border bg-gradient-to-r from-terminal-surface to-terminal-bg">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#F24E1E] via-[#A259FF] to-[#1ABCFE] flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 38 57" fill="currentColor">
                <path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{fileData.name}</p>
              <p className="text-[10px] text-terminal-muted">{fileData.pages.length} pages</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={loadFileStructure}
                className="p-1.5 text-terminal-muted hover:text-terminal-accent hover:bg-terminal-surface rounded transition-colors"
                title="Refresh"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                </svg>
              </button>
              {onCloseFile && (
                <button
                  onClick={onCloseFile}
                  className="p-1.5 text-terminal-muted hover:text-terminal-red hover:bg-terminal-red/10 rounded transition-colors"
                  title="Close file"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="flex-shrink-0 px-2 py-2 border-b border-terminal-border bg-terminal-surface/30">
          <div className="relative">
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-terminal-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search layers..."
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-terminal-bg border border-terminal-border rounded-md focus:border-terminal-accent focus:outline-none focus:ring-1 focus:ring-terminal-accent/30 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-terminal-muted hover:text-terminal-text"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Pages Tabs */}
        <div className="flex-shrink-0 flex overflow-x-auto border-b border-terminal-border bg-terminal-bg scrollbar-thin">
          {fileData.pages.map((page) => (
            <button
              key={page.id}
              onClick={() => {
                setActivePage(page.id);
                setExpanded((prev) => new Set([...Array.from(prev), page.id]));
              }}
              className={`px-3 py-2 text-xs whitespace-nowrap border-b-2 transition-all flex items-center gap-1.5 ${
                activePage === page.id
                  ? "border-terminal-accent text-terminal-accent bg-terminal-accent/5 font-medium"
                  : "border-transparent text-terminal-muted hover:text-terminal-text hover:bg-terminal-surface/50"
              }`}
            >
              <span className="opacity-70">📑</span>
              {page.name}
            </button>
          ))}
        </div>

        {/* Layer Tree */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {fileData.pages
            .filter((page) => !activePage || page.id === activePage)
            .map((page) => {
              const filteredChildren = filterNodes(page.children, searchQuery);

              return (
                <div key={page.id}>
                  <div
                    className={`flex items-center gap-1.5 px-2 py-2 bg-terminal-surface/50 border-b border-terminal-border/50 cursor-pointer hover:bg-terminal-surface transition-colors ${
                      selected === page.id ? "bg-terminal-accent/10 border-l-2 border-l-terminal-accent" : ""
                    }`}
                    onClick={() => handleNodeSelect(page.id, page.name, "PAGE")}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(page.id);
                      }}
                      className="w-5 h-5 flex items-center justify-center text-terminal-muted hover:text-terminal-text rounded hover:bg-terminal-bg transition-colors"
                    >
                      <svg
                        className={`w-3 h-3 transition-transform duration-150 ${expanded.has(page.id) ? "rotate-90" : ""}`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </button>
                    <span className="text-sm">📑</span>
                    <span className="text-xs font-medium flex-1">{page.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-terminal-bg rounded text-terminal-muted">
                      {page.children.length}
                    </span>
                  </div>

                  {expanded.has(page.id) && (
                    <div className="bg-terminal-bg/30">
                      {filteredChildren.length === 0 ? (
                        <p className="px-6 py-3 text-xs text-terminal-muted italic">
                          {searchQuery ? `No layers matching "${searchQuery}"` : "Empty page"}
                        </p>
                      ) : (
                        filteredChildren.map((node) => (
                          <LayerNode
                            key={node.id}
                            node={node}
                            depth={1}
                            expanded={expanded}
                            selected={selected}
                            onToggle={toggleExpand}
                            onSelect={handleNodeSelect}
                          />
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>

        {/* Status Bar */}
        <div className="flex-shrink-0 px-3 py-1.5 border-t border-terminal-border bg-terminal-surface/50 text-[10px] text-terminal-muted flex items-center justify-between">
          <span>{fileData.pages.reduce((acc, p) => acc + p.children.length, 0)} layers</span>
          {selected && <span className="text-terminal-accent">1 selected</span>}
        </div>
      </div>

      {/* Right: Properties & Code Panel - 45% width */}
      {showPanel && nodeStyles && (
        <div className="w-[45%] flex flex-col overflow-hidden bg-terminal-surface/20">
          {loadingNode ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-6 h-6 border-2 border-terminal-accent border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs text-terminal-muted">Loading properties...</p>
              </div>
            </div>
          ) : (
            <>
              {/* Node Header */}
              <div className="flex-shrink-0 px-3 py-2.5 border-b border-terminal-border bg-terminal-surface">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded bg-terminal-bg flex items-center justify-center flex-shrink-0">
                      <NodeIcon type={nodeStyles.type} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{nodeStyles.name}</p>
                      <p className="text-[10px] text-terminal-muted">
                        {nodeStyles.width && nodeStyles.height ? `${nodeStyles.width} × ${nodeStyles.height}` : nodeStyles.type}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowPanel(false)}
                    className="p-1 text-terminal-muted hover:text-terminal-text rounded hover:bg-terminal-bg transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="flex-shrink-0 grid grid-cols-3 gap-1.5 p-2 border-b border-terminal-border">
                <button
                  onClick={() => exportImage("png")}
                  disabled={exporting}
                  className="flex flex-col items-center gap-1 px-2 py-2 text-xs bg-terminal-bg border border-terminal-border rounded-lg hover:border-terminal-purple hover:bg-terminal-purple/5 disabled:opacity-50 transition-all group"
                >
                  <svg className="w-4 h-4 text-terminal-purple group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  <span className="text-[10px] text-terminal-muted">{exporting ? "..." : "PNG"}</span>
                </button>
                <button
                  onClick={() => exportImage("svg")}
                  disabled={exporting}
                  className="flex flex-col items-center gap-1 px-2 py-2 text-xs bg-terminal-bg border border-terminal-border rounded-lg hover:border-terminal-accent hover:bg-terminal-accent/5 disabled:opacity-50 transition-all group"
                >
                  <svg className="w-4 h-4 text-terminal-accent group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  <span className="text-[10px] text-terminal-muted">SVG</span>
                </button>
                <button
                  onClick={() => onAskAboutNode?.(nodeStyles.name, nodeStyles)}
                  className="flex flex-col items-center gap-1 px-2 py-2 text-xs bg-terminal-bg border border-terminal-border rounded-lg hover:border-terminal-green hover:bg-terminal-green/5 transition-all group"
                >
                  <svg className="w-4 h-4 text-terminal-green group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span className="text-[10px] text-terminal-muted">Ask AI</span>
                </button>
              </div>

              {/* Properties Section */}
              <div className="flex-shrink-0 px-3 py-2.5 border-b border-terminal-border">
                <p className="text-[10px] text-terminal-muted mb-2 uppercase tracking-wider font-medium">Properties</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  {nodeStyles.width && (
                    <div className="flex items-center justify-between px-2 py-1 bg-terminal-bg rounded">
                      <span className="text-terminal-muted">W</span>
                      <span className="font-mono font-medium">{nodeStyles.width}</span>
                    </div>
                  )}
                  {nodeStyles.height && (
                    <div className="flex items-center justify-between px-2 py-1 bg-terminal-bg rounded">
                      <span className="text-terminal-muted">H</span>
                      <span className="font-mono font-medium">{nodeStyles.height}</span>
                    </div>
                  )}
                  {nodeStyles.cornerRadius && (
                    <div className="flex items-center justify-between px-2 py-1 bg-terminal-bg rounded col-span-2">
                      <span className="text-terminal-muted">Radius</span>
                      <span className="font-mono">{nodeStyles.cornerRadius}px</span>
                    </div>
                  )}
                  {nodeStyles.fills?.[0]?.color && (
                    <div className="flex items-center justify-between px-2 py-1 bg-terminal-bg rounded col-span-2">
                      <span className="text-terminal-muted">Fill</span>
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-5 h-5 rounded border border-terminal-border shadow-sm"
                          style={{
                            backgroundColor: `rgba(${Math.round(nodeStyles.fills[0].color.r * 255)}, ${Math.round(nodeStyles.fills[0].color.g * 255)}, ${Math.round(nodeStyles.fills[0].color.b * 255)}, ${nodeStyles.fills[0].color.a || 1})`,
                          }}
                        />
                        <span className="font-mono text-[11px]">
                          {rgbToHex(nodeStyles.fills[0].color.r, nodeStyles.fills[0].color.g, nodeStyles.fills[0].color.b).toUpperCase()}
                        </span>
                      </div>
                    </div>
                  )}
                  {nodeStyles.layout?.layoutMode && (
                    <div className="flex items-center justify-between px-2 py-1 bg-terminal-bg rounded col-span-2">
                      <span className="text-terminal-muted">Layout</span>
                      <span className="px-1.5 py-0.5 bg-terminal-accent/10 text-terminal-accent rounded text-[10px] font-medium">
                        {nodeStyles.layout.layoutMode.toLowerCase()} flex
                      </span>
                    </div>
                  )}
                  {nodeStyles.textStyle?.fontFamily && (
                    <div className="flex items-center justify-between px-2 py-1 bg-terminal-bg rounded col-span-2">
                      <span className="text-terminal-muted">Font</span>
                      <span className="truncate ml-2 text-[11px]">
                        {nodeStyles.textStyle.fontFamily} · {nodeStyles.textStyle.fontSize}px
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Code Tabs */}
              <div className="flex-shrink-0 flex border-b border-terminal-border">
                {(["tailwind", "css", "react"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setCodeTab(tab)}
                    className={`flex-1 px-2 py-2 text-xs font-medium transition-all ${
                      codeTab === tab
                        ? "bg-terminal-bg text-terminal-accent border-b-2 border-terminal-accent"
                        : "text-terminal-muted hover:text-terminal-text hover:bg-terminal-bg/50"
                    }`}
                  >
                    {tab === "tailwind" ? "Tailwind" : tab === "css" ? "CSS" : "React"}
                  </button>
                ))}
              </div>

              {/* Code Output */}
              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="relative flex-1 overflow-y-auto">
                  <button
                    onClick={() => copyToClipboard(
                      codeTab === "tailwind" ? tailwindClasses : codeTab === "css" ? cssCode : reactCode,
                      codeTab
                    )}
                    className={`absolute top-2 right-2 px-2.5 py-1 text-[10px] rounded-md transition-all z-10 flex items-center gap-1 ${
                      copied === codeTab
                        ? "bg-terminal-green/20 text-terminal-green border border-terminal-green/30"
                        : "bg-terminal-surface border border-terminal-border text-terminal-muted hover:text-terminal-accent hover:border-terminal-accent"
                    }`}
                  >
                    {copied === codeTab ? (
                      <>
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Copied
                      </>
                    ) : (
                      <>
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        Copy
                      </>
                    )}
                  </button>
                  <pre className="p-3 pt-10 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all bg-terminal-bg min-h-full">
                    <code className={`${codeTab === "tailwind" ? "text-terminal-accent" : "text-terminal-text"}`}>
                      {codeTab === "tailwind" ? tailwindClasses || "// No styles to generate" : codeTab === "css" ? cssCode : reactCode}
                    </code>
                  </pre>
                </div>
              </div>

              {/* Preview Image */}
              {nodeImageUrl && (
                <div className="flex-shrink-0 p-2 border-t border-terminal-border bg-terminal-surface">
                  <p className="text-[10px] text-terminal-muted mb-1.5 uppercase tracking-wider">Preview</p>
                  <div className="relative rounded-lg overflow-hidden border border-terminal-border bg-white">
                    <img
                      src={nodeImageUrl}
                      alt={nodeStyles.name}
                      className="w-full h-auto max-h-28 object-contain"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Collapsed Panel Hint */}
      {!showPanel && nodeStyles && (
        <button
          onClick={() => setShowPanel(true)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-terminal-surface border border-terminal-border rounded-lg shadow-lg hover:border-terminal-accent transition-colors group"
          title="Show properties"
        >
          <svg className="w-4 h-4 text-terminal-muted group-hover:text-terminal-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default FigmaLayerPanel;
