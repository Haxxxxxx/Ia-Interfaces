"use client";

import { useState, useCallback, useEffect } from "react";
import { FigmaStylePanel, FigmaStylePreview, type FigmaNodeStyles } from "./FigmaStylePanel";
import {
  detectComponentPattern,
  generateSmartComponent,
  extractDesignTokens,
  generateDesignTokensFile,
  type ComponentPattern,
  type DesignTokens,
  type GeneratedComponent,
} from "@/lib/figma-to-code";

// ============================================================================
// Types
// ============================================================================

interface FigmaFile {
  key: string;
  name: string;
  lastModified: string;
  thumbnailUrl?: string;
}

interface FigmaFrame {
  id: string;
  name: string;
  type: string;
  width?: number;
  height?: number;
  isIcon?: boolean;
  exportable?: boolean;
  children?: FigmaFrame[];
  childCount?: number;
}

interface FigmaPage {
  id: string;
  name: string;
  children: FigmaFrame[];
}

interface FigmaAsset {
  id: string;
  name: string;
  path: string;
  type: string;
  width?: number;
  height?: number;
  category?: string;
  variants?: number;
  characters?: string;
  fontSize?: number;
  fontFamily?: string;
}

interface FigmaAssets {
  components: FigmaAsset[];
  componentSets: FigmaAsset[];
  instances: FigmaAsset[];
  frames: FigmaAsset[];
  vectors: FigmaAsset[];
  images: FigmaAsset[];
  text: FigmaAsset[];
  icons: FigmaAsset[];
}

interface FigmaStats {
  totalComponents: number;
  totalInstances: number;
  totalFrames: number;
  totalVectors: number;
  totalImages: number;
  totalIcons: number;
}

type AssetCategory = "all" | "components" | "icons" | "frames" | "images" | "vectors" | "text";

interface FigmaWorkspaceProps {
  figmaToken: string | null;
  onTokenRequest?: () => void;
  onCodeGenerated?: (code: string, css: string) => void;
  className?: string;
}

type CodeFormat = "react" | "react-tailwind" | "vue" | "html" | "css-only";
type TokenFormat = "css" | "tailwind" | "json";

// ============================================================================
// Main Component
// ============================================================================

export function FigmaWorkspace({
  figmaToken,
  onTokenRequest,
  onCodeGenerated,
  className = "",
}: FigmaWorkspaceProps) {
  // State
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [pages, setPages] = useState<FigmaPage[]>([]);
  const [selectedNode, setSelectedNode] = useState<FigmaNodeStyles | null>(null);
  const [generatedCode, setGeneratedCode] = useState<{ code: string; css: string }>({ code: "", css: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"files" | "structure" | "assets" | "code">("files");
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [fileInput, setFileInput] = useState("");
  const [userInfo, setUserInfo] = useState<{ handle?: string; email?: string } | null>(null);
  const [codeFormat, setCodeFormat] = useState<CodeFormat>("react-tailwind");
  const [copied, setCopied] = useState<string | null>(null);

  // Assets state
  const [assets, setAssets] = useState<FigmaAssets | null>(null);
  const [stats, setStats] = useState<FigmaStats | null>(null);
  const [assetCategory, setAssetCategory] = useState<AssetCategory>("components");
  const [assetSearch, setAssetSearch] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [assetImageUrl, setAssetImageUrl] = useState<string | null>(null);
  const [exportingImage, setExportingImage] = useState(false);

  // Pagination and view state
  const [assetPage, setAssetPage] = useState(0);
  const [assetsPerPage, setAssetsPerPage] = useState(50);
  const [assetViewMode, setAssetViewMode] = useState<"grid" | "list">("list");
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<"name" | "size" | "type">("name");

  // Smart generation state
  const [componentPattern, setComponentPattern] = useState<ComponentPattern | null>(null);
  const [smartComponent, setSmartComponent] = useState<GeneratedComponent | null>(null);
  const [designTokens, setDesignTokens] = useState<DesignTokens | null>(null);
  const [includeTypes, setIncludeTypes] = useState(true);
  const [includeProps, setIncludeProps] = useState(true);
  const [tokenExportFormat, setTokenExportFormat] = useState<TokenFormat>("css");
  const [showTokens, setShowTokens] = useState(false);
  const [allSelectedNodes, setAllSelectedNodes] = useState<FigmaNodeStyles[]>([]);

  // Verify token on mount
  useEffect(() => {
    if (figmaToken) {
      verifyToken();
    }
  }, [figmaToken]);

  // Parse file key from URL or direct key
  const parseFileKey = (input: string): string | null => {
    const trimmed = input.trim();
    // Direct key (alphanumeric, 22+ chars)
    if (/^[a-zA-Z0-9]{10,}$/.test(trimmed)) {
      return trimmed;
    }
    // Figma URL: https://www.figma.com/design/FILE_KEY/... or /file/FILE_KEY/...
    const match = trimmed.match(/figma\.com\/(?:design|file)\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  };

  const verifyToken = async () => {
    if (!figmaToken) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/figma?action=verify", {
        headers: { "X-Figma-Token": figmaToken },
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setUserInfo(data.user);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const key = parseFileKey(fileInput);
    if (key) {
      fetchFileStructure(key);
    } else {
      setError("Invalid Figma URL or file key. Paste a Figma file URL.");
    }
  };

  const fetchFileStructure = async (fileKey: string) => {
    if (!figmaToken) return;

    setLoading(true);
    setError(null);
    setSelectedFile(fileKey);

    try {
      const res = await fetch(`/api/figma?file=${fileKey}`, {
        headers: { "X-Figma-Token": figmaToken },
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setPages(data.pages || []);
        setFileName(data.name || "Figma File");
        // Set assets and stats
        setAssets(data.assets || null);
        setStats(data.stats || null);
        // Default to assets view if we have assets
        setView(data.assets?.components?.length > 0 ? "assets" : "structure");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Export image from Figma
  const exportAssetImage = async (nodeId: string, format: "png" | "svg" = "png") => {
    if (!figmaToken || !selectedFile) return null;

    setExportingImage(true);
    try {
      const res = await fetch(
        `/api/figma?file=${selectedFile}&action=images&nodes=${nodeId}&format=${format}&scale=2`,
        { headers: { "X-Figma-Token": figmaToken } }
      );
      const data = await res.json();
      return data.images?.[nodeId] || null;
    } catch {
      return null;
    } finally {
      setExportingImage(false);
    }
  };

  // Filter assets by category and search - NO LIMITS
  const getFilteredAssets = (): FigmaAsset[] => {
    if (!assets) return [];

    let list: FigmaAsset[] = [];
    switch (assetCategory) {
      case "all":
        list = [
          ...assets.components,
          ...assets.componentSets,
          ...assets.icons,
          ...assets.frames,
          ...assets.vectors,
          ...assets.images,
          ...assets.text,
          ...assets.instances,
        ];
        break;
      case "components":
        list = [...assets.components, ...assets.componentSets, ...assets.instances];
        break;
      case "icons":
        list = assets.icons;
        break;
      case "frames":
        list = assets.frames;
        break;
      case "images":
        list = assets.images;
        break;
      case "vectors":
        list = assets.vectors;
        break;
      case "text":
        list = assets.text;
        break;
    }

    // Apply search filter
    if (assetSearch.trim()) {
      const search = assetSearch.toLowerCase();
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(search) ||
          a.path?.toLowerCase().includes(search)
      );
    }

    // Sort
    list.sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "size":
          return ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0));
        case "type":
          return a.type.localeCompare(b.type);
        default:
          return 0;
      }
    });

    return list;
  };

  // Get paginated assets
  const getPaginatedAssets = (): FigmaAsset[] => {
    const filtered = getFilteredAssets();
    const start = assetPage * assetsPerPage;
    return filtered.slice(start, start + assetsPerPage);
  };

  // Get total pages
  const getTotalPages = (): number => {
    return Math.ceil(getFilteredAssets().length / assetsPerPage);
  };

  // Group assets by path for tree view
  const getGroupedAssets = (): Map<string, FigmaAsset[]> => {
    const filtered = getFilteredAssets();
    const grouped = new Map<string, FigmaAsset[]>();

    for (const asset of filtered) {
      const pathParts = asset.path?.split(" / ") || [asset.name];
      const parentPath = pathParts.slice(0, -1).join(" / ") || "Root";

      if (!grouped.has(parentPath)) {
        grouped.set(parentPath, []);
      }
      grouped.get(parentPath)!.push(asset);
    }

    return grouped;
  };

  // Toggle path expansion
  const togglePathExpansion = (path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Reset pagination when category or search changes
  useEffect(() => {
    setAssetPage(0);
  }, [assetCategory, assetSearch]);

  const fetchNodeStyles = async (nodeId: string, nodeName: string) => {
    if (!figmaToken || !selectedFile) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/figma?file=${selectedFile}&node=${nodeId}`, {
        headers: { "X-Figma-Token": figmaToken },
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        const node = data.node as FigmaNodeStyles;
        setSelectedNode(node);

        // Detect component pattern
        const pattern = detectComponentPattern(node);
        setComponentPattern(pattern);

        // Generate smart component with props and types
        const format = codeFormat === "css-only" ? "html" : (codeFormat === "react-tailwind" ? "react-tailwind" : codeFormat as "react" | "vue" | "html");
        const smart = generateSmartComponent(node, {
          format,
          includeTypes,
          includeProps,
        });
        setSmartComponent(smart);

        // Track selected nodes for design token extraction
        setAllSelectedNodes((prev) => {
          const exists = prev.some((n) => n.name === node.name);
          return exists ? prev : [...prev, node];
        });

        // Extract design tokens from all selected nodes
        const tokens = extractDesignTokens([...allSelectedNodes, node]);
        setDesignTokens(tokens);

        // Set generated code
        setGeneratedCode({ code: smart.code, css: smart.css });
        setView("code");
        onCodeGenerated?.(smart.code, smart.css);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStyleChange = useCallback((property: string, value: any) => {
    if (!selectedNode) return;
    // Regenerate code when styles change
    const updated = { ...selectedNode, [property]: value };
    setSelectedNode(updated);

    // Update pattern detection
    const pattern = detectComponentPattern(updated);
    setComponentPattern(pattern);

    // Regenerate with smart component
    const smartFormat = codeFormat === "css-only" ? "html" : (codeFormat === "react-tailwind" ? "react-tailwind" : codeFormat as "react" | "vue" | "html");
    const smart = generateSmartComponent(updated, {
      format: smartFormat,
      includeTypes,
      includeProps,
    });
    setSmartComponent(smart);
    setGeneratedCode({ code: smart.code, css: smart.css });
  }, [selectedNode, codeFormat, includeTypes, includeProps]);

  const handleFormatChange = (format: CodeFormat) => {
    setCodeFormat(format);
    if (selectedNode) {
      // Use smart component generation
      const smartFormat = format === "css-only" ? "html" : (format === "react-tailwind" ? "react-tailwind" : format as "react" | "vue" | "html");
      const smart = generateSmartComponent(selectedNode, {
        format: smartFormat,
        includeTypes,
        includeProps,
      });
      setSmartComponent(smart);
      setGeneratedCode({ code: smart.code, css: smart.css });
    }
  };

  const handleOptionsChange = (types: boolean, props: boolean) => {
    setIncludeTypes(types);
    setIncludeProps(props);
    if (selectedNode) {
      const smartFormat = codeFormat === "css-only" ? "html" : (codeFormat === "react-tailwind" ? "react-tailwind" : codeFormat as "react" | "vue" | "html");
      const smart = generateSmartComponent(selectedNode, {
        format: smartFormat,
        includeTypes: types,
        includeProps: props,
      });
      setSmartComponent(smart);
      setGeneratedCode({ code: smart.code, css: smart.css });
    }
  };

  const exportDesignTokens = async (format: TokenFormat) => {
    if (!designTokens) return;
    const content = generateDesignTokensFile(designTokens, format);
    await copyToClipboard(content, "tokens");
  };

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ success: boolean; message: string } | null>(null);

  const saveToProject = async () => {
    if (!smartComponent) return;

    setSaving(true);
    setSaveStatus(null);

    try {
      const files: { filename: string; content: string }[] = [];

      // Main component file
      const ext = codeFormat === "vue" ? ".vue" : ".tsx";
      files.push({
        filename: `${smartComponent.name}${ext}`,
        content: smartComponent.code,
      });

      // CSS module if using React + CSS
      if (codeFormat === "react" && smartComponent.css) {
        files.push({
          filename: `${smartComponent.name}.module.css`,
          content: smartComponent.css,
        });
      }

      const res = await fetch("/api/figma/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
      });

      const data = await res.json();

      if (data.success) {
        setSaveStatus({ success: true, message: `Saved: ${data.files.join(", ")}` });
      } else {
        setSaveStatus({ success: false, message: data.error });
      }
    } catch (err: any) {
      setSaveStatus({ success: false, message: err.message });
    } finally {
      setSaving(false);
      // Clear status after 3 seconds
      setTimeout(() => setSaveStatus(null), 3000);
    }
  };

  const copyToClipboard = async (text: string, type: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  // No token state
  if (!figmaToken) {
    return (
      <div className={`figma-workspace bg-terminal-surface rounded-lg border border-terminal-border ${className}`}>
        <div className="p-6 text-center">
          <svg className="w-16 h-16 mx-auto mb-4 text-terminal-purple opacity-50" viewBox="0 0 38 57" fill="currentColor">
            <path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" />
            <path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" />
            <path d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" />
            <path d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" />
            <path d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" />
          </svg>
          <h3 className="text-lg font-semibold mb-2">Connect Figma</h3>
          <p className="text-sm text-terminal-muted mb-4">
            Link your Figma account to import designs directly
          </p>
          <button
            onClick={onTokenRequest}
            className="px-4 py-2 bg-terminal-purple text-white rounded-lg hover:opacity-90 transition-opacity"
          >
            Connect Figma Account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`figma-workspace flex flex-col h-full bg-terminal-surface ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-terminal-border">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-terminal-purple" viewBox="0 0 38 57" fill="currentColor">
            <path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" />
            <path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" opacity="0.8" />
          </svg>
          <span className="text-sm font-medium truncate max-w-[150px]">
            {fileName || "Figma"}
          </span>
          {userInfo && (
            <span className="text-xs text-terminal-muted">({userInfo.handle})</span>
          )}
        </div>
        {selectedNode && (
          <span className="text-xs px-2 py-0.5 bg-terminal-purple/20 text-terminal-purple rounded">
            {selectedNode.name}
          </span>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-terminal-border">
        <button
          onClick={() => setView("files")}
          className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${
            view === "files"
              ? "text-terminal-accent border-b-2 border-terminal-accent bg-terminal-accent/5"
              : "text-terminal-muted hover:text-terminal-text"
          }`}
        >
          📁 Import
        </button>
        <button
          onClick={() => selectedFile && assets && setView("assets")}
          disabled={!assets}
          className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${
            view === "assets"
              ? "text-terminal-accent border-b-2 border-terminal-accent bg-terminal-accent/5"
              : "text-terminal-muted hover:text-terminal-text disabled:opacity-40"
          }`}
        >
          🎨 Assets
          {stats && <span className="ml-1 opacity-60">({stats.totalComponents})</span>}
        </button>
        <button
          onClick={() => selectedFile && setView("structure")}
          disabled={!selectedFile}
          className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${
            view === "structure"
              ? "text-terminal-accent border-b-2 border-terminal-accent bg-terminal-accent/5"
              : "text-terminal-muted hover:text-terminal-text disabled:opacity-40"
          }`}
        >
          🌳 Layers
        </button>
        <button
          onClick={() => selectedNode && setView("code")}
          disabled={!selectedNode}
          className={`flex-1 px-2 py-2 text-xs font-medium transition-colors ${
            view === "code"
              ? "text-terminal-accent border-b-2 border-terminal-accent bg-terminal-accent/5"
              : "text-terminal-muted hover:text-terminal-text disabled:opacity-40"
          }`}
        >
          💻 Code
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Loading */}
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-terminal-accent border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              <p className="text-xs text-terminal-muted">Loading...</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex-1 p-3">
            <div className="p-3 bg-terminal-red/10 border border-terminal-red/30 rounded text-sm text-terminal-red">
              {error}
              <button
                onClick={() => setError(null)}
                className="ml-2 underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Files View - Import */}
        {view === "files" && !loading && !error && (
          <div className="flex-1 p-4 overflow-y-auto">
            <form onSubmit={handleFileSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Paste Figma File URL
                </label>
                <input
                  type="text"
                  value={fileInput}
                  onChange={(e) => setFileInput(e.target.value)}
                  placeholder="https://www.figma.com/design/abc123..."
                  className="w-full px-3 py-2 text-sm bg-terminal-bg border border-terminal-border rounded-lg focus:border-terminal-accent focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={!fileInput.trim()}
                className="w-full py-2 text-sm font-medium bg-terminal-purple text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                Load Figma File
              </button>
            </form>

            <div className="mt-4 p-3 bg-terminal-bg rounded-lg">
              <p className="text-xs text-terminal-muted mb-2">How to use:</p>
              <ol className="text-xs text-terminal-muted space-y-1">
                <li>1. Open your design in Figma</li>
                <li>2. Copy the URL from your browser</li>
                <li>3. Paste it above and click Load</li>
                <li>4. Select any frame or component</li>
                <li>5. Get instant React/CSS code</li>
              </ol>
            </div>
          </div>
        )}

        {/* Structure View - Layer Tree */}
        {view === "structure" && !loading && !error && (
          <div className="flex-1 overflow-y-auto p-2">
            {pages.length === 0 ? (
              <p className="text-sm text-terminal-muted text-center py-4">No pages found</p>
            ) : (
              pages.map((page) => (
                <div key={page.id} className="mb-3">
                  <div className="flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-terminal-muted bg-terminal-bg rounded">
                    📄 {page.name}
                  </div>
                  <FrameTree
                    frames={page.children}
                    depth={0}
                    expanded={expandedNodes}
                    onToggle={toggleNode}
                    onSelect={fetchNodeStyles}
                    selectedName={selectedNode?.name}
                  />
                </div>
              ))
            )}
          </div>
        )}

        {/* Assets View - Categorized Assets */}
        {view === "assets" && !loading && !error && assets && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Stats Bar */}
            {stats && (
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-terminal-bg border-b border-terminal-border text-xs">
                <span className="text-terminal-muted">
                  <strong className="text-terminal-accent">{stats.totalComponents}</strong> components
                </span>
                <span className="text-terminal-muted">
                  <strong className="text-terminal-purple">{stats.totalIcons}</strong> icons
                </span>
                <span className="text-terminal-muted">
                  <strong>{stats.totalFrames}</strong> frames
                </span>
                <span className="text-terminal-muted">
                  <strong>{stats.totalImages}</strong> images
                </span>
                <span className="text-terminal-muted">
                  <strong>{stats.totalVectors}</strong> vectors
                </span>
                <span className="text-terminal-muted">
                  <strong>{stats.totalInstances}</strong> instances
                </span>
              </div>
            )}

            {/* Category Filter */}
            <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-terminal-border bg-terminal-surface/50">
              {(["all", "components", "icons", "frames", "images", "vectors", "text"] as AssetCategory[]).map((cat) => {
                const count = cat === "all" ? getFilteredAssets().length :
                  cat === "components" ? (assets.components.length + assets.componentSets.length + assets.instances.length) :
                  cat === "icons" ? assets.icons.length :
                  cat === "frames" ? assets.frames.length :
                  cat === "images" ? assets.images.length :
                  cat === "vectors" ? assets.vectors.length :
                  assets.text.length;
                return (
                  <button
                    key={cat}
                    onClick={() => setAssetCategory(cat)}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      assetCategory === cat
                        ? "bg-terminal-accent text-terminal-bg"
                        : "text-terminal-muted hover:text-terminal-text hover:bg-terminal-bg"
                    }`}
                  >
                    {cat === "all" ? `All (${count})` :
                     cat === "components" ? `◆ Components (${count})` :
                     cat === "icons" ? `⬡ Icons (${count})` :
                     cat === "frames" ? `▢ Frames (${count})` :
                     cat === "images" ? `🖼 Images (${count})` :
                     cat === "vectors" ? `⟡ Vectors (${count})` : `T Text (${count})`}
                  </button>
                );
              })}
            </div>

            {/* Search, Sort, View Controls */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-terminal-border">
              <input
                type="text"
                value={assetSearch}
                onChange={(e) => setAssetSearch(e.target.value)}
                placeholder="Search by name or path..."
                className="flex-1 px-2 py-1 text-xs bg-terminal-bg border border-terminal-border rounded focus:border-terminal-accent focus:outline-none"
              />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "name" | "size" | "type")}
                className="px-2 py-1 text-xs bg-terminal-bg border border-terminal-border rounded"
              >
                <option value="name">Sort: Name</option>
                <option value="size">Sort: Size</option>
                <option value="type">Sort: Type</option>
              </select>
              <div className="flex border border-terminal-border rounded">
                <button
                  onClick={() => setAssetViewMode("list")}
                  className={`px-2 py-1 text-xs ${assetViewMode === "list" ? "bg-terminal-accent text-terminal-bg" : "text-terminal-muted"}`}
                  title="List view"
                >
                  ☰
                </button>
                <button
                  onClick={() => setAssetViewMode("grid")}
                  className={`px-2 py-1 text-xs ${assetViewMode === "grid" ? "bg-terminal-accent text-terminal-bg" : "text-terminal-muted"}`}
                  title="Grid view"
                >
                  ⊞
                </button>
              </div>
              <select
                value={assetsPerPage}
                onChange={(e) => { setAssetsPerPage(Number(e.target.value)); setAssetPage(0); }}
                className="px-2 py-1 text-xs bg-terminal-bg border border-terminal-border rounded"
              >
                <option value={25}>25/page</option>
                <option value={50}>50/page</option>
                <option value={100}>100/page</option>
                <option value={200}>200/page</option>
              </select>
            </div>

            {/* Results Count & Pagination Header */}
            <div className="flex items-center justify-between px-3 py-1 text-xs text-terminal-muted border-b border-terminal-border">
              <span>
                Showing {assetPage * assetsPerPage + 1}-{Math.min((assetPage + 1) * assetsPerPage, getFilteredAssets().length)} of {getFilteredAssets().length} assets
              </span>
              {getTotalPages() > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setAssetPage(0)}
                    disabled={assetPage === 0}
                    className="px-1 py-0.5 rounded hover:bg-terminal-surface disabled:opacity-30"
                  >
                    ««
                  </button>
                  <button
                    onClick={() => setAssetPage(p => Math.max(0, p - 1))}
                    disabled={assetPage === 0}
                    className="px-1 py-0.5 rounded hover:bg-terminal-surface disabled:opacity-30"
                  >
                    «
                  </button>
                  <span className="px-2">
                    Page {assetPage + 1} of {getTotalPages()}
                  </span>
                  <button
                    onClick={() => setAssetPage(p => Math.min(getTotalPages() - 1, p + 1))}
                    disabled={assetPage >= getTotalPages() - 1}
                    className="px-1 py-0.5 rounded hover:bg-terminal-surface disabled:opacity-30"
                  >
                    »
                  </button>
                  <button
                    onClick={() => setAssetPage(getTotalPages() - 1)}
                    disabled={assetPage >= getTotalPages() - 1}
                    className="px-1 py-0.5 rounded hover:bg-terminal-surface disabled:opacity-30"
                  >
                    »»
                  </button>
                </div>
              )}
            </div>

            {/* Asset List/Grid */}
            <div className="flex-1 overflow-y-auto">
              {assetViewMode === "list" ? (
                /* List View */
                <div className="divide-y divide-terminal-border">
                  {getPaginatedAssets().map((asset) => (
                    <button
                      key={asset.id}
                      onClick={async () => {
                        setSelectedAssetId(asset.id);
                        await fetchNodeStyles(asset.id, asset.name);
                      }}
                      className={`w-full px-3 py-2 text-left hover:bg-terminal-surface transition-colors ${
                        selectedAssetId === asset.id ? "bg-terminal-accent/10 border-l-2 border-terminal-accent" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg opacity-60 w-6 text-center">
                          {asset.type === "COMPONENT" ? "◆" :
                           asset.type === "COMPONENT_SET" ? "◇" :
                           asset.type === "INSTANCE" ? "◇" :
                           asset.type === "VECTOR" ? "⟡" :
                           asset.type === "TEXT" ? "T" :
                           asset.type === "FRAME" ? "▢" :
                           asset.type === "BOOLEAN_OPERATION" ? "⊕" : "•"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{asset.name}</span>
                            <span className="text-xs px-1 py-0.5 bg-terminal-surface rounded text-terminal-muted">
                              {asset.type}
                            </span>
                          </div>
                          <p className="text-xs text-terminal-muted truncate mt-0.5">
                            {asset.path}
                          </p>
                        </div>
                        <div className="text-right text-xs text-terminal-muted">
                          {asset.width && asset.height && (
                            <span>{asset.width}×{asset.height}</span>
                          )}
                          {asset.characters && (
                            <span className="block truncate max-w-[100px]">"{asset.characters}"</span>
                          )}
                          {asset.variants && (
                            <span>{asset.variants} variants</span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                /* Grid View */
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2">
                  {getPaginatedAssets().map((asset) => (
                    <button
                      key={asset.id}
                      onClick={async () => {
                        setSelectedAssetId(asset.id);
                        await fetchNodeStyles(asset.id, asset.name);
                      }}
                      className={`p-3 text-left rounded border transition-colors ${
                        selectedAssetId === asset.id
                          ? "border-terminal-accent bg-terminal-accent/10"
                          : "border-terminal-border hover:border-terminal-accent/50 hover:bg-terminal-surface"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-xl opacity-60">
                          {asset.type === "COMPONENT" ? "◆" :
                           asset.type === "COMPONENT_SET" ? "◇" :
                           asset.type === "INSTANCE" ? "◇" :
                           asset.type === "VECTOR" ? "⟡" :
                           asset.type === "TEXT" ? "T" :
                           asset.type === "FRAME" ? "▢" : "•"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{asset.name}</p>
                          <p className="text-xs text-terminal-muted">{asset.type}</p>
                          {asset.width && asset.height && (
                            <p className="text-xs text-terminal-muted">
                              {asset.width} × {asset.height}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {getFilteredAssets().length === 0 && (
                <p className="text-center text-terminal-muted text-sm py-8">
                  No assets found. Try a different category or search term.
                </p>
              )}
            </div>

            {/* Bottom Pagination */}
            {getTotalPages() > 1 && (
              <div className="flex items-center justify-center gap-1 px-3 py-2 border-t border-terminal-border bg-terminal-bg">
                {Array.from({ length: Math.min(7, getTotalPages()) }, (_, i) => {
                  let pageNum;
                  if (getTotalPages() <= 7) {
                    pageNum = i;
                  } else if (assetPage < 3) {
                    pageNum = i;
                  } else if (assetPage > getTotalPages() - 4) {
                    pageNum = getTotalPages() - 7 + i;
                  } else {
                    pageNum = assetPage - 3 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setAssetPage(pageNum)}
                      className={`w-8 h-8 text-xs rounded transition-colors ${
                        assetPage === pageNum
                          ? "bg-terminal-accent text-terminal-bg"
                          : "text-terminal-muted hover:bg-terminal-surface"
                      }`}
                    >
                      {pageNum + 1}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Selected Asset Actions */}
            {selectedAssetId && (
              <div className="flex items-center gap-2 px-3 py-2 border-t border-terminal-border bg-terminal-surface">
                <span className="text-xs text-terminal-muted">Selected:</span>
                <span className="text-xs font-medium truncate max-w-[150px]">
                  {getPaginatedAssets().find(a => a.id === selectedAssetId)?.name || selectedAssetId}
                </span>
                <div className="flex-1" />
                <button
                  onClick={async () => {
                    const url = await exportAssetImage(selectedAssetId, "png");
                    if (url) {
                      setAssetImageUrl(url);
                      window.open(url, "_blank");
                    }
                  }}
                  disabled={exportingImage}
                  className="px-2 py-1 text-xs bg-terminal-purple/20 text-terminal-purple rounded hover:bg-terminal-purple/30"
                >
                  {exportingImage ? "..." : "PNG"}
                </button>
                <button
                  onClick={async () => {
                    const url = await exportAssetImage(selectedAssetId, "svg");
                    if (url) window.open(url, "_blank");
                  }}
                  disabled={exportingImage}
                  className="px-2 py-1 text-xs bg-terminal-accent/20 text-terminal-accent rounded hover:bg-terminal-accent/30"
                >
                  SVG
                </button>
                <button
                  onClick={() => setView("code")}
                  className="px-2 py-1 text-xs bg-terminal-green/20 text-terminal-green rounded hover:bg-terminal-green/30"
                >
                  Code →
                </button>
              </div>
            )}
          </div>
        )}

        {/* Code View - Generated Code */}
        {view === "code" && !loading && !error && selectedNode && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Pattern Detection Badge */}
            {componentPattern && (
              <div className="flex items-center gap-2 px-3 py-2 bg-terminal-purple/10 border-b border-terminal-border">
                <span className="text-xs font-medium text-terminal-purple">
                  {componentPattern.type.toUpperCase()}
                </span>
                <span className="text-xs text-terminal-muted">
                  {Math.round(componentPattern.confidence * 100)}% confidence
                </span>
                {componentPattern.suggestions.length > 0 && (
                  <span
                    className="text-xs text-terminal-accent cursor-help"
                    title={componentPattern.suggestions.join("\n")}
                  >
                    💡 {componentPattern.suggestions.length} tips
                  </span>
                )}
              </div>
            )}

            {/* Format Selector with Options */}
            <div className="flex flex-wrap items-center gap-1 p-2 border-b border-terminal-border bg-terminal-bg">
              <div className="flex gap-1">
                {(["react-tailwind", "react", "vue", "html", "css-only"] as CodeFormat[]).map((format) => (
                  <button
                    key={format}
                    onClick={() => handleFormatChange(format)}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      codeFormat === format
                        ? "bg-terminal-accent text-terminal-bg"
                        : "text-terminal-muted hover:text-terminal-text"
                    }`}
                  >
                    {format === "react-tailwind" ? "React+TW" :
                     format === "react" ? "React+CSS" :
                     format === "vue" ? "Vue" :
                     format === "html" ? "HTML" : "CSS"}
                  </button>
                ))}
              </div>
              <div className="flex-1" />
              {(codeFormat === "react-tailwind" || codeFormat === "react") && (
                <div className="flex gap-2 text-xs">
                  <label className="flex items-center gap-1 text-terminal-muted">
                    <input
                      type="checkbox"
                      checked={includeTypes}
                      onChange={(e) => handleOptionsChange(e.target.checked, includeProps)}
                      className="w-3 h-3"
                    />
                    Types
                  </label>
                  <label className="flex items-center gap-1 text-terminal-muted">
                    <input
                      type="checkbox"
                      checked={includeProps}
                      onChange={(e) => handleOptionsChange(includeTypes, e.target.checked)}
                      className="w-3 h-3"
                    />
                    Props
                  </label>
                </div>
              )}
            </div>

            {/* Code Output */}
            <div className="flex-1 overflow-y-auto">
              {/* Component Code */}
              <div className="border-b border-terminal-border">
                <div className="flex items-center justify-between px-3 py-2 bg-terminal-bg">
                  <span className="text-xs font-medium">
                    {codeFormat === "vue" ? "Vue Component" : codeFormat.includes("react") ? "React Component" : "HTML"}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => copyToClipboard(generatedCode.code, "code")}
                      className={`text-xs px-2 py-0.5 rounded transition-colors ${
                        copied === "code"
                          ? "bg-terminal-green/20 text-terminal-green"
                          : "text-terminal-muted hover:text-terminal-accent"
                      }`}
                    >
                      {copied === "code" ? "✓ Copied" : "Copy"}
                    </button>
                    {codeFormat !== "css-only" && codeFormat !== "html" && (
                      <button
                        onClick={saveToProject}
                        disabled={saving}
                        className={`text-xs px-2 py-0.5 rounded transition-colors ${
                          saveStatus?.success
                            ? "bg-terminal-green/20 text-terminal-green"
                            : saveStatus && !saveStatus.success
                            ? "bg-terminal-red/20 text-terminal-red"
                            : "bg-terminal-purple/20 text-terminal-purple hover:bg-terminal-purple/30"
                        }`}
                      >
                        {saving ? "Saving..." : saveStatus ? (saveStatus.success ? "✓ Saved" : "Failed") : "💾 Save to Project"}
                      </button>
                    )}
                  </div>
                </div>
                <pre className="p-3 text-xs font-mono overflow-x-auto bg-terminal-bg/50">
                  <code className="text-terminal-text">{generatedCode.code}</code>
                </pre>
              </div>

              {/* CSS Code */}
              {generatedCode.css && (
                <div>
                  <div className="flex items-center justify-between px-3 py-2 bg-terminal-bg">
                    <span className="text-xs font-medium">
                      {codeFormat === "react-tailwind" ? "Tailwind Classes" : "CSS Styles"}
                    </span>
                    <button
                      onClick={() => copyToClipboard(generatedCode.css, "css")}
                      className={`text-xs px-2 py-0.5 rounded transition-colors ${
                        copied === "css"
                          ? "bg-terminal-green/20 text-terminal-green"
                          : "text-terminal-muted hover:text-terminal-accent"
                      }`}
                    >
                      {copied === "css" ? "✓ Copied" : "Copy"}
                    </button>
                  </div>
                  <pre className="p-3 text-xs font-mono overflow-x-auto bg-terminal-bg/50">
                    <code className="text-terminal-text">{generatedCode.css}</code>
                  </pre>
                </div>
              )}

              {/* Design Tokens Panel */}
              {designTokens && (
                <div className="border-t border-terminal-border">
                  <button
                    onClick={() => setShowTokens(!showTokens)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-terminal-bg hover:bg-terminal-bg/80"
                  >
                    <span className="text-xs font-medium flex items-center gap-2">
                      🎨 Design Tokens
                      <span className="text-terminal-muted">
                        ({Object.keys(designTokens.colors).length} colors,
                        {Object.keys(designTokens.spacing).length} spacing)
                      </span>
                    </span>
                    <svg
                      className={`w-4 h-4 text-terminal-muted transition-transform ${showTokens ? "rotate-180" : ""}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>

                  {showTokens && (
                    <div className="p-3 bg-terminal-bg/50 space-y-3">
                      {/* Token Format Selector */}
                      <div className="flex gap-2">
                        {(["css", "tailwind", "json"] as TokenFormat[]).map((format) => (
                          <button
                            key={format}
                            onClick={() => {
                              setTokenExportFormat(format);
                              exportDesignTokens(format);
                            }}
                            className={`px-2 py-1 text-xs rounded transition-colors ${
                              copied === "tokens" && tokenExportFormat === format
                                ? "bg-terminal-green/20 text-terminal-green"
                                : "bg-terminal-purple/20 text-terminal-purple hover:bg-terminal-purple/30"
                            }`}
                          >
                            {copied === "tokens" && tokenExportFormat === format ? "✓ Copied" : `Export ${format.toUpperCase()}`}
                          </button>
                        ))}
                      </div>

                      {/* Token Preview */}
                      <div className="grid grid-cols-2 gap-3">
                        {/* Colors */}
                        {Object.keys(designTokens.colors).length > 0 && (
                          <div>
                            <p className="text-xs text-terminal-muted mb-1">Colors</p>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(designTokens.colors).slice(0, 8).map(([name, color]) => (
                                <div
                                  key={name}
                                  className="w-6 h-6 rounded border border-terminal-border"
                                  style={{ backgroundColor: color }}
                                  title={`${name}: ${color}`}
                                />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Typography */}
                        {designTokens.typography.fontFamilies.length > 0 && (
                          <div>
                            <p className="text-xs text-terminal-muted mb-1">Fonts</p>
                            <div className="text-xs text-terminal-text truncate">
                              {designTokens.typography.fontFamilies.join(", ")}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Component Suggestions */}
              {componentPattern && componentPattern.suggestions.length > 0 && (
                <div className="border-t border-terminal-border p-3 bg-terminal-accent/5">
                  <p className="text-xs font-medium mb-2">💡 Suggestions for {componentPattern.type}</p>
                  <ul className="text-xs text-terminal-muted space-y-1">
                    {componentPattern.suggestions.map((suggestion, i) => (
                      <li key={i} className="flex items-start gap-1">
                        <span className="text-terminal-accent">•</span>
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Style Preview Panel */}
            <div className="border-t border-terminal-border max-h-[200px] overflow-y-auto">
              <FigmaStylePanel
                node={selectedNode}
                onStyleChange={handleStyleChange}
                onGenerateCSS={(css) => {
                  setGeneratedCode(prev => ({ ...prev, css }));
                }}
                className="text-xs"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Frame Tree Component
// ============================================================================

function FrameTree({
  frames,
  depth,
  expanded,
  onToggle,
  onSelect,
  selectedName,
}: {
  frames: FigmaFrame[];
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string, name: string) => void;
  selectedName?: string;
}) {
  if (!frames || frames.length === 0) return null;

  return (
    <div className="ml-2">
      {frames.map((frame) => {
        const hasChildren = frame.children && frame.children.length > 0;
        const isExpanded = expanded.has(frame.id);
        const isSelected = selectedName === frame.name;

        return (
          <div key={frame.id}>
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded text-sm cursor-pointer transition-colors ${
                isSelected
                  ? "bg-terminal-accent/20 text-terminal-accent"
                  : "hover:bg-terminal-bg"
              }`}
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
            >
              {hasChildren ? (
                <button
                  onClick={(e) => { e.stopPropagation(); onToggle(frame.id); }}
                  className="w-4 h-4 flex items-center justify-center text-terminal-muted hover:text-terminal-text"
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
              <span
                onClick={() => onSelect(frame.id, frame.name)}
                className="flex-1 truncate flex items-center gap-1"
              >
                <span className="opacity-60">{getFrameIcon(frame.type)}</span>
                <span>{frame.name}</span>
              </span>
            </div>
            {hasChildren && isExpanded && (
              <FrameTree
                frames={frame.children!}
                depth={depth + 1}
                expanded={expanded}
                onToggle={onToggle}
                onSelect={onSelect}
                selectedName={selectedName}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function getFrameIcon(type: string): string {
  switch (type) {
    case "COMPONENT": return "◆";
    case "COMPONENT_SET": return "◇";
    case "INSTANCE": return "◇";
    case "FRAME": return "▢";
    case "GROUP": return "▣";
    case "TEXT": return "T";
    case "RECTANGLE": return "□";
    case "ELLIPSE": return "○";
    case "VECTOR": return "⟡";
    default: return "•";
  }
}

// ============================================================================
// Code Generation
// ============================================================================

function generateCode(node: FigmaNodeStyles, format: CodeFormat): { code: string; css: string } {
  const componentName = node.name.replace(/[^a-zA-Z0-9]/g, "") || "Component";
  const className = node.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  // Generate CSS properties
  const cssProps = generateCSSProperties(node);
  const tailwindClasses = generateTailwindClasses(node);

  switch (format) {
    case "react-tailwind":
      return {
        code: `export function ${componentName}({ children, className = "" }) {
  return (
    <div className={\`${tailwindClasses} \${className}\`}>
      {children}
    </div>
  );
}`,
        css: `/* Tailwind classes used: */
${tailwindClasses.split(" ").map(c => `- ${c}`).join("\n")}`,
      };

    case "react":
      return {
        code: `import styles from './${componentName}.module.css';

export function ${componentName}({ children, className = "" }) {
  return (
    <div className={\`\${styles.root} \${className}\`}>
      {children}
    </div>
  );
}`,
        css: `.root {
${cssProps}
}`,
      };

    case "html":
      return {
        code: `<div class="${className}">
  <!-- Content -->
</div>`,
        css: `.${className} {
${cssProps}
}`,
      };

    case "css-only":
      return {
        code: `.${className} {
${cssProps}
}`,
        css: "",
      };

    case "vue":
      return {
        code: `<template>
  <div class="${tailwindClasses}">
    <slot />
  </div>
</template>

<script setup lang="ts">
// ${componentName} component
</script>`,
        css: `/* Tailwind classes used: */
${tailwindClasses.split(" ").map(c => `- ${c}`).join("\n")}`,
      };

    default:
      return { code: "", css: "" };
  }
}

function generateCSSProperties(node: FigmaNodeStyles): string {
  const props: string[] = [];

  // Dimensions
  if (node.width) props.push(`  width: ${node.width}px;`);
  if (node.height) props.push(`  height: ${node.height}px;`);

  // Border radius
  if (node.cornerRadius) props.push(`  border-radius: ${node.cornerRadius}px;`);

  // Background
  if (node.fills && node.fills.length > 0) {
    const fill = node.fills[0];
    if (fill.type === "SOLID" && fill.color && fill.visible !== false) {
      const { r, g, b, a } = fill.color;
      const rgba = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a.toFixed(2)})`;
      props.push(`  background-color: ${rgba};`);
    }
  }

  // Border
  if (node.strokes && node.strokes.length > 0 && node.strokeWeight) {
    const stroke = node.strokes[0];
    if (stroke.color) {
      const { r, g, b, a } = stroke.color;
      const rgba = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${(a || 1).toFixed(2)})`;
      props.push(`  border: ${node.strokeWeight}px solid ${rgba};`);
    }
  }

  // Layout
  if (node.layout?.layoutMode && node.layout.layoutMode !== "NONE") {
    props.push(`  display: flex;`);
    props.push(`  flex-direction: ${node.layout.layoutMode === "VERTICAL" ? "column" : "row"};`);

    if (node.layout.itemSpacing) {
      props.push(`  gap: ${node.layout.itemSpacing}px;`);
    }

    const alignMap: Record<string, string> = {
      MIN: "flex-start",
      CENTER: "center",
      MAX: "flex-end",
      SPACE_BETWEEN: "space-between",
    };

    if (node.layout.primaryAxisAlignItems) {
      props.push(`  justify-content: ${alignMap[node.layout.primaryAxisAlignItems] || "flex-start"};`);
    }
    if (node.layout.counterAxisAlignItems) {
      props.push(`  align-items: ${alignMap[node.layout.counterAxisAlignItems] || "flex-start"};`);
    }

    // Padding
    const { paddingTop = 0, paddingRight = 0, paddingBottom = 0, paddingLeft = 0 } = node.layout;
    if (paddingTop || paddingRight || paddingBottom || paddingLeft) {
      props.push(`  padding: ${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px;`);
    }
  }

  // Effects (shadows)
  if (node.effects) {
    const shadows = node.effects
      .filter((e) => e.type === "DROP_SHADOW" && e.visible !== false)
      .map((e) => {
        const x = e.offset?.x || 0;
        const y = e.offset?.y || 0;
        const blur = e.radius || 0;
        const spread = e.spread || 0;
        const color = e.color
          ? `rgba(${Math.round(e.color.r * 255)}, ${Math.round(e.color.g * 255)}, ${Math.round(e.color.b * 255)}, ${(e.color.a || 0.25).toFixed(2)})`
          : "rgba(0,0,0,0.25)";
        return `${x}px ${y}px ${blur}px ${spread}px ${color}`;
      });

    if (shadows.length > 0) {
      props.push(`  box-shadow: ${shadows.join(", ")};`);
    }
  }

  // Typography
  if (node.textStyle) {
    if (node.textStyle.fontFamily) props.push(`  font-family: "${node.textStyle.fontFamily}", sans-serif;`);
    if (node.textStyle.fontSize) props.push(`  font-size: ${node.textStyle.fontSize}px;`);
    if (node.textStyle.fontWeight) props.push(`  font-weight: ${node.textStyle.fontWeight};`);
    if (node.textStyle.lineHeight) {
      const lh = typeof node.textStyle.lineHeight === "number"
        ? node.textStyle.lineHeight
        : node.textStyle.lineHeight.value;
      props.push(`  line-height: ${lh}px;`);
    }
  }

  // Opacity
  if (node.opacity !== undefined && node.opacity < 1) {
    props.push(`  opacity: ${node.opacity};`);
  }

  return props.join("\n");
}

function generateTailwindClasses(node: FigmaNodeStyles): string {
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
      if (fill.color.a < 1) {
        classes.push(`bg-opacity-[${Math.round(fill.color.a * 100)}]`);
      }
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

  // Opacity
  if (node.opacity !== undefined && node.opacity < 1) {
    classes.push(`opacity-[${Math.round(node.opacity * 100)}]`);
  }

  return classes.join(" ");
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// ============================================================================
// Figma Connect Modal
// ============================================================================

export function FigmaConnectModal({
  isOpen,
  onClose,
  onConnect,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (token: string) => void;
}) {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!token.trim()) return;

    setConnecting(true);
    setError(null);

    try {
      // Verify token before connecting
      const res = await fetch("/api/figma?action=verify", {
        headers: { "X-Figma-Token": token.trim() },
      });
      const data = await res.json();

      if (data.error) {
        setError(data.error);
        setConnecting(false);
        return;
      }

      onConnect(token.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to verify token");
      setConnecting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div
        className="bg-terminal-surface border border-terminal-border rounded-2xl w-full max-w-md shadow-2xl animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with gradient */}
        <div className="relative overflow-hidden rounded-t-2xl">
          <div className="absolute inset-0 bg-gradient-to-br from-[#F24E1E] via-[#A259FF] to-[#1ABCFE] opacity-10" />
          <div className="relative p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#F24E1E] via-[#A259FF] to-[#1ABCFE] flex items-center justify-center shadow-lg">
              <svg className="w-6 h-6 text-white" viewBox="0 0 38 57" fill="currentColor">
                <path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" />
                <path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" opacity="0.8" />
                <path d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" opacity="0.6" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold">Connect Figma</h2>
              <p className="text-sm text-terminal-muted">Link your account to browse designs</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-terminal-muted hover:text-terminal-text hover:bg-terminal-bg rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Steps */}
          <div className="space-y-3">
            <div className="flex items-start gap-3 group">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#F24E1E] to-[#FF7262] text-white text-xs flex items-center justify-center flex-shrink-0 font-medium shadow-sm">1</div>
              <div>
                <p className="text-sm font-medium">Open Figma Settings</p>
                <a
                  href="https://www.figma.com/settings"
                  target="_blank"
                  rel="noopener"
                  className="text-xs text-terminal-accent hover:underline inline-flex items-center gap-1"
                >
                  figma.com/settings
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                  </svg>
                </a>
              </div>
            </div>
            <div className="flex items-start gap-3 group">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#A259FF] to-[#C77DFF] text-white text-xs flex items-center justify-center flex-shrink-0 font-medium shadow-sm">2</div>
              <div>
                <p className="text-sm font-medium">Create Access Token</p>
                <p className="text-xs text-terminal-muted">Under "Personal Access Tokens" section</p>
              </div>
            </div>
            <div className="flex items-start gap-3 group">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#1ABCFE] to-[#0ACF83] text-white text-xs flex items-center justify-center flex-shrink-0 font-medium shadow-sm">3</div>
              <div>
                <p className="text-sm font-medium">Paste Token Below</p>
                <p className="text-xs text-terminal-muted">Your token is stored locally only</p>
              </div>
            </div>
          </div>

          {/* Token Input */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-terminal-muted uppercase tracking-wider">Access Token</label>
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => { setToken(e.target.value); setError(null); }}
                placeholder="figd_xxxxxxxxxxxx"
                className={`w-full px-4 py-3 bg-terminal-bg border ${error ? 'border-terminal-red' : 'border-terminal-border'} rounded-xl focus:border-terminal-accent focus:outline-none focus:ring-2 focus:ring-terminal-accent/20 transition-all text-sm font-mono pr-10`}
                onKeyDown={(e) => e.key === "Enter" && handleConnect()}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-terminal-muted hover:text-terminal-text transition-colors"
              >
                {showToken ? (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            {error && (
              <p className="text-xs text-terminal-red flex items-center gap-1">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </p>
            )}
          </div>

          {/* Security Note */}
          <div className="flex items-start gap-2 p-3 bg-terminal-bg/50 rounded-lg border border-terminal-border/50">
            <svg className="w-4 h-4 text-terminal-green mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <p className="text-[11px] text-terminal-muted leading-relaxed">
              Your token is stored locally in your browser and never sent to our servers. It's used only for direct communication with Figma's API.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 pt-0 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 text-sm text-terminal-muted hover:text-terminal-text border border-terminal-border rounded-xl hover:bg-terminal-bg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConnect}
            disabled={!token.trim() || connecting}
            className="flex-1 px-4 py-2.5 text-sm bg-gradient-to-r from-[#A259FF] to-[#1ABCFE] text-white rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium flex items-center justify-center gap-2"
          >
            {connecting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
                </svg>
                Connect
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
