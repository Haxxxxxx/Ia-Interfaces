/**
 * Figma API Proxy - Professional asset management for frontend developers
 *
 * GET /api/figma?action=verify - Verify token
 * GET /api/figma?file=<key> - Get full file structure with all assets
 * GET /api/figma?file=<key>&node=<id> - Get node styles
 * GET /api/figma?file=<key>&action=components - List all components
 * GET /api/figma?file=<key>&action=styles - Get design system styles
 * GET /api/figma?file=<key>&action=images&nodes=<ids> - Export images
 */

import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIGMA_API = "https://api.figma.com/v1";

async function figmaRequest(endpoint: string, token: string) {
  const response = await fetch(`${FIGMA_API}${endpoint}`, {
    headers: {
      "X-Figma-Token": token,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Figma API error: ${response.status} - ${text}`);
  }

  return response.json();
}

export async function GET(req: NextRequest) {
  const token = req.headers.get("X-Figma-Token");

  if (!token) {
    return Response.json(
      { error: "Missing X-Figma-Token header" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);
  const fileKey = searchParams.get("file");
  const nodeId = searchParams.get("node");
  const action = searchParams.get("action");
  const nodeIds = searchParams.get("nodes");
  const format = searchParams.get("format") || "png";
  const scale = searchParams.get("scale") || "2";

  try {
    // Verify token and get user info
    if (action === "verify" || action === "files") {
      const data = await figmaRequest("/me", token);
      return Response.json({
        user: {
          id: data.id,
          handle: data.handle,
          email: data.email,
          img_url: data.img_url,
        },
        message: "Token valid. Enter a Figma file URL or key to browse.",
        hint: "Copy URL from Figma: https://www.figma.com/design/FILE_KEY/...",
      });
    }

    // Export images from nodes
    if (fileKey && action === "images" && nodeIds) {
      const ids = nodeIds.split(",").map((id) => id.trim());
      const data = await figmaRequest(
        `/images/${fileKey}?ids=${ids.join(",")}&format=${format}&scale=${scale}`,
        token
      );
      return Response.json({
        images: data.images,
        format,
        scale,
      });
    }

    // Get all components in file
    if (fileKey && action === "components") {
      const data = await figmaRequest(`/files/${fileKey}/components`, token);
      return Response.json({
        components: data.meta?.components || [],
        componentSets: data.meta?.component_sets || [],
      });
    }

    // Get design system styles (colors, text, effects, grids)
    if (fileKey && action === "styles") {
      const data = await figmaRequest(`/files/${fileKey}/styles`, token);
      return Response.json({
        styles: data.meta?.styles || [],
      });
    }

    // Get full file structure with comprehensive asset listing
    if (fileKey && !nodeId) {
      const data = await figmaRequest(`/files/${fileKey}`, token);

      // Extract all assets organized by category
      const assets = extractAllAssets(data.document);

      return Response.json({
        name: data.name,
        lastModified: data.lastModified,
        version: data.version,
        thumbnailUrl: data.thumbnailUrl,
        // Full page structure
        pages: data.document?.children?.map((page: any) => ({
          id: page.id,
          name: page.name,
          children: extractNodes(page.children || [], 0, 6), // Deeper hierarchy
        })),
        // Categorized assets
        assets: {
          components: assets.components,
          componentSets: assets.componentSets,
          instances: assets.instances,
          frames: assets.frames,
          vectors: assets.vectors,
          images: assets.images,
          text: assets.text,
          icons: assets.icons,
        },
        // Summary stats
        stats: {
          totalComponents: assets.components.length,
          totalInstances: assets.instances.length,
          totalFrames: assets.frames.length,
          totalVectors: assets.vectors.length,
          totalImages: assets.images.length,
          totalIcons: assets.icons.length,
        },
      });
    }

    // Get specific node styles with full details
    if (fileKey && nodeId) {
      const data = await figmaRequest(`/files/${fileKey}/nodes?ids=${nodeId}`, token);
      const nodeData = data.nodes?.[nodeId]?.document;

      if (!nodeData) {
        return Response.json({ error: "Node not found" }, { status: 404 });
      }

      const styles = extractNodeStyles(nodeData);

      // Also get image URL for this node if it's exportable
      let imageUrl = null;
      try {
        const imageData = await figmaRequest(
          `/images/${fileKey}?ids=${nodeId}&format=png&scale=2`,
          token
        );
        imageUrl = imageData.images?.[nodeId];
      } catch {
        // Ignore image export errors
      }

      return Response.json({
        node: styles,
        imageUrl,
        exportable: isExportable(nodeData.type),
      });
    }

    return Response.json(
      { error: "Missing file or action parameter" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Figma API error:", error);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// Check if node type is exportable
function isExportable(type: string): boolean {
  return [
    "FRAME", "COMPONENT", "COMPONENT_SET", "INSTANCE",
    "VECTOR", "STAR", "LINE", "ELLIPSE", "RECTANGLE",
    "REGULAR_POLYGON", "SLICE", "GROUP", "BOOLEAN_OPERATION"
  ].includes(type);
}

// All node types we want to track
const ALL_NODE_TYPES = [
  "FRAME", "COMPONENT", "COMPONENT_SET", "INSTANCE", "GROUP",
  "VECTOR", "STAR", "LINE", "ELLIPSE", "RECTANGLE", "REGULAR_POLYGON",
  "TEXT", "SLICE", "BOOLEAN_OPERATION"
];

// Extract all nodes with deeper hierarchy (up to depth 6)
function extractNodes(children: any[], depth = 0, maxDepth = 6): any[] {
  if (depth > maxDepth || !children) return [];

  return children
    .filter((c) => ALL_NODE_TYPES.includes(c.type))
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      // Include size for components/frames
      width: c.absoluteBoundingBox?.width ? Math.round(c.absoluteBoundingBox.width) : undefined,
      height: c.absoluteBoundingBox?.height ? Math.round(c.absoluteBoundingBox.height) : undefined,
      // Component metadata
      componentId: c.componentId,
      // Is it likely an icon? (small vector/frame)
      isIcon: isLikelyIcon(c),
      // Has exportable settings
      exportable: c.exportSettings?.length > 0 || isExportable(c.type),
      // Children
      children: c.children ? extractNodes(c.children, depth + 1, maxDepth) : undefined,
      childCount: c.children?.length || 0,
    }));
}

// Detect if a node is likely an icon
function isLikelyIcon(node: any): boolean {
  const box = node.absoluteBoundingBox;
  if (!box) return false;

  const size = Math.max(box.width, box.height);
  const isSmall = size <= 64;
  const isSquarish = Math.abs(box.width - box.height) <= 8;
  const isVectorOrFrame = ["VECTOR", "FRAME", "COMPONENT", "INSTANCE", "GROUP"].includes(node.type);
  const nameHint = /icon|ico|svg|arrow|chevron|check|close|menu|search|star|heart|user|home|settings/i.test(node.name);

  return isVectorOrFrame && isSmall && isSquarish || nameHint;
}

// Extract all assets from document, categorized
function extractAllAssets(document: any) {
  const assets = {
    components: [] as any[],
    componentSets: [] as any[],
    instances: [] as any[],
    frames: [] as any[],
    vectors: [] as any[],
    images: [] as any[],
    text: [] as any[],
    icons: [] as any[],
  };

  function traverse(node: any, path: string[] = []) {
    if (!node) return;

    const nodePath = [...path, node.name];
    const box = node.absoluteBoundingBox;
    const assetInfo = {
      id: node.id,
      name: node.name,
      path: nodePath.join(" / "),
      type: node.type,
      width: box?.width ? Math.round(box.width) : undefined,
      height: box?.height ? Math.round(box.height) : undefined,
      componentId: node.componentId,
    };

    // Categorize by type
    switch (node.type) {
      case "COMPONENT":
        if (isLikelyIcon(node)) {
          assets.icons.push({ ...assetInfo, category: "icon" });
        } else {
          assets.components.push(assetInfo);
        }
        break;
      case "COMPONENT_SET":
        assets.componentSets.push({
          ...assetInfo,
          variants: node.children?.length || 0,
        });
        break;
      case "INSTANCE":
        assets.instances.push(assetInfo);
        break;
      case "FRAME":
        if (isLikelyIcon(node)) {
          assets.icons.push({ ...assetInfo, category: "icon-frame" });
        } else {
          assets.frames.push(assetInfo);
        }
        break;
      case "VECTOR":
      case "STAR":
      case "LINE":
      case "ELLIPSE":
      case "REGULAR_POLYGON":
      case "BOOLEAN_OPERATION":
        if (isLikelyIcon(node)) {
          assets.icons.push({ ...assetInfo, category: "vector" });
        } else {
          assets.vectors.push(assetInfo);
        }
        break;
      case "TEXT":
        assets.text.push({
          ...assetInfo,
          characters: node.characters?.slice(0, 100),
          fontSize: node.style?.fontSize,
          fontFamily: node.style?.fontFamily,
        });
        break;
      case "RECTANGLE":
        // Check if it's an image fill
        if (node.fills?.some((f: any) => f.type === "IMAGE")) {
          assets.images.push(assetInfo);
        }
        break;
    }

    // Traverse children
    if (node.children) {
      for (const child of node.children) {
        traverse(child, nodePath);
      }
    }
  }

  // Start traversal from document
  if (document.children) {
    for (const page of document.children) {
      traverse(page, []);
    }
  }

  return assets;
}

// Extract comprehensive styles from a Figma node
function extractNodeStyles(node: any) {
  const styles: any = {
    name: node.name,
    type: node.type,
  };

  // Dimensions
  if (node.absoluteBoundingBox) {
    styles.width = Math.round(node.absoluteBoundingBox.width);
    styles.height = Math.round(node.absoluteBoundingBox.height);
  }

  // Size constraints
  if (node.constraints) {
    styles.constraints = node.constraints;
  }

  // Corner radius
  if (node.cornerRadius !== undefined) {
    styles.cornerRadius = node.cornerRadius;
  } else if (node.rectangleCornerRadii) {
    styles.cornerRadius = node.rectangleCornerRadii[0];
    styles.cornerRadii = {
      topLeft: node.rectangleCornerRadii[0],
      topRight: node.rectangleCornerRadii[1],
      bottomRight: node.rectangleCornerRadii[2],
      bottomLeft: node.rectangleCornerRadii[3],
    };
  }

  // Fills
  if (node.fills && node.fills.length > 0) {
    styles.fills = node.fills.map((fill: any) => ({
      type: fill.type,
      color: fill.color ? {
        r: fill.color.r,
        g: fill.color.g,
        b: fill.color.b,
        a: fill.opacity ?? 1,
      } : undefined,
      visible: fill.visible !== false,
      opacity: fill.opacity,
      gradientStops: fill.gradientStops,
      gradientHandlePositions: fill.gradientHandlePositions,
      imageRef: fill.imageRef,
      scaleMode: fill.scaleMode,
    }));
  }

  // Strokes
  if (node.strokes && node.strokes.length > 0) {
    styles.strokes = node.strokes.map((stroke: any) => ({
      type: stroke.type,
      color: stroke.color ? {
        r: stroke.color.r,
        g: stroke.color.g,
        b: stroke.color.b,
        a: stroke.opacity ?? 1,
      } : undefined,
    }));
    styles.strokeWeight = node.strokeWeight;
    styles.strokeAlign = node.strokeAlign;
    styles.strokeCap = node.strokeCap;
    styles.strokeJoin = node.strokeJoin;
    styles.dashPattern = node.dashPattern;
  }

  // Effects (shadows, blur)
  if (node.effects && node.effects.length > 0) {
    styles.effects = node.effects.map((effect: any) => ({
      type: effect.type,
      visible: effect.visible !== false,
      color: effect.color ? {
        r: effect.color.r,
        g: effect.color.g,
        b: effect.color.b,
        a: effect.color.a ?? 0.25,
      } : undefined,
      offset: effect.offset,
      radius: effect.radius,
      spread: effect.spread,
      blendMode: effect.blendMode,
    }));
  }

  // Opacity and blend mode
  if (node.opacity !== undefined && node.opacity < 1) {
    styles.opacity = node.opacity;
  }
  if (node.blendMode && node.blendMode !== "PASS_THROUGH") {
    styles.blendMode = node.blendMode;
  }

  // Auto-layout (flexbox)
  if (node.layoutMode && node.layoutMode !== "NONE") {
    styles.layout = {
      layoutMode: node.layoutMode,
      primaryAxisSizingMode: node.primaryAxisSizingMode,
      counterAxisSizingMode: node.counterAxisSizingMode,
      primaryAxisAlignItems: node.primaryAxisAlignItems,
      counterAxisAlignItems: node.counterAxisAlignItems,
      paddingLeft: node.paddingLeft || 0,
      paddingRight: node.paddingRight || 0,
      paddingTop: node.paddingTop || 0,
      paddingBottom: node.paddingBottom || 0,
      itemSpacing: node.itemSpacing || 0,
      counterAxisSpacing: node.counterAxisSpacing,
      layoutWrap: node.layoutWrap,
    };
  }

  // Text styles
  if (node.type === "TEXT") {
    styles.textStyle = {
      fontFamily: node.style?.fontFamily,
      fontSize: node.style?.fontSize,
      fontWeight: node.style?.fontWeight,
      fontStyle: node.style?.italic ? "italic" : "normal",
      lineHeight: node.style?.lineHeightPx || node.style?.lineHeightPercent,
      letterSpacing: node.style?.letterSpacing,
      textAlignHorizontal: node.style?.textAlignHorizontal,
      textAlignVertical: node.style?.textAlignVertical,
      textDecoration: node.style?.textDecoration,
      textCase: node.style?.textCase,
    };
    styles.characters = node.characters;
  }

  // Component properties (for variants)
  if (node.componentProperties) {
    styles.componentProperties = node.componentProperties;
  }

  // Export settings
  if (node.exportSettings && node.exportSettings.length > 0) {
    styles.exportSettings = node.exportSettings.map((exp: any) => ({
      format: exp.format,
      suffix: exp.suffix,
      constraint: exp.constraint,
    }));
  }

  // Children summary with more detail
  if (node.children) {
    styles.childCount = node.children.length;
    styles.children = node.children.slice(0, 20).map((child: any) => ({
      id: child.id,
      name: child.name,
      type: child.type,
      width: child.absoluteBoundingBox?.width ? Math.round(child.absoluteBoundingBox.width) : undefined,
      height: child.absoluteBoundingBox?.height ? Math.round(child.absoluteBoundingBox.height) : undefined,
    }));
  }

  // Vector paths (for SVG export)
  if (node.type === "VECTOR" || node.type === "BOOLEAN_OPERATION") {
    styles.vectorPaths = node.fillGeometry || node.strokeGeometry;
  }

  return styles;
}
