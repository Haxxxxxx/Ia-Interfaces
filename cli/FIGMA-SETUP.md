# Figma MCP Setup Guide

Quick setup for front-end developers to integrate Figma designs directly into the CLI.

## 1. Get Your Figma Token (2 minutes)

1. Go to [Figma Account Settings](https://www.figma.com/settings)
2. Scroll to **Personal Access Tokens**
3. Click **Generate new token**
4. Name it: `rodeo-cli`
5. Copy the token (starts with `figd_`)

## 2. Configure the CLI

```bash
# Start the CLI
cd cli
./run.sh

# Configure Figma (paste your token)
/mcp setup figma figd_YOUR_TOKEN_HERE
```

You should see: `✓ Figma connected!`

## 3. Quick Commands

| Command | Description |
|---------|-------------|
| `/figma files` | List your recent Figma files |
| `/figma file <key>` | Get file structure (pages, frames) |
| `/figma components <key>` | List all components |
| `/figma styles <key>` | Get design tokens (colors, typography) |
| `/figma export <key> <node-id>` | Export as PNG |
| `/figma search <key> <text>` | Find text in designs |

### Getting the File Key

From any Figma URL:
```
https://www.figma.com/file/ABC123xyz/My-Design
                           ^^^^^^^^^^^
                           This is your file key
```

## 4. AI-Powered Workflows

Once Figma is connected, just ask naturally:

```
"Show me the components in my design system file"
"Extract the color palette from the brand guidelines"
"Generate React code for the header component"
"What's the typography scale in the design?"
```

The AI will automatically use Figma tools to help.

## 5. Common Workflows

### Design-to-Code
```
You: "I need to implement the card component from Figma file ABC123"

The AI will:
1. Fetch the component structure
2. Extract styles and tokens
3. Generate starter React/Vue code
4. Suggest CSS based on Figma properties
```

### Design Tokens Export
```
You: "Export all colors from the design system as CSS variables"

The AI will:
1. Get all color styles from Figma
2. Format them as CSS custom properties
3. Create a colors.css file
```

### Component Inventory
```
You: "List all components and their variants in the UI kit"

The AI will:
1. Fetch all components
2. Get variant properties
3. Generate a component inventory
```

## 6. Tips for Front-End Devs

- **Keep Figma file keys handy** - Save them in your project's README
- **Use consistent naming** - Component names in Figma become class/component names
- **Check the styles first** - `/figma styles <key>` before coding
- **Export assets as needed** - `/figma export` for icons and images

## 7. Troubleshooting

### "Figma API error: 403"
Your token might be expired or invalid. Generate a new one.

### "Component not found"
The node ID might be wrong. Use `/figma file <key>` to browse the structure.

### Token not saving
Check permissions on `~/.rodeo/mcp.json`

## 8. Example Session

```
> /figma files
Recent Figma Files:
  1. Design System v2 (key: ABC123)
  2. Mobile App Screens (key: XYZ789)

> /figma components ABC123
Components in Design System v2:
  - Button (variants: primary, secondary, ghost)
  - Card (variants: default, elevated)
  - Input (variants: text, password, search)

> /figma styles ABC123
Design Tokens:
  Colors:
    - Primary/500: #6366F1
    - Gray/900: #111827
  Typography:
    - Heading/H1: Inter 48px Bold
    - Body/Regular: Inter 16px Regular

> Implement the Button component with all variants

[AI generates React component code based on Figma...]
```

---

**Need help?** Ask the AI: "How do I use Figma integration?"
