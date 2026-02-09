# Front-End Developer Quick Start

One-page guide to get started with Rodeo CLI + Figma for mockup implementation.

## 1. Initial Setup (5 minutes)

```bash
# Clone and install
cd cli
npm install

# Get your Figma token from:
# https://www.figma.com/settings → Personal Access Tokens → Generate

# Configure Figma (replace with your token)
./setup-figma.sh figd_YOUR_TOKEN_HERE

# Start the CLI
./run.sh
```

## 2. Key Commands

### Explore Designs
```bash
/figma files                    # See your recent files
/figma file ABC123              # Get file structure
/figma components ABC123        # List all components
/figma styles ABC123            # Get color/typography tokens
```

### Generate Code
```bash
/figma code ABC123 1:234 react  # Generate React component
/figma code ABC123 1:234 vue    # Generate Vue component
/figma tokens ABC123            # Export CSS variables
```

### Export Assets
```bash
/figma export ABC123 1:234      # Export as PNG
```

## 3. AI-Powered Workflow

Just describe what you need:

```
"Implement the Button component from figma file ABC123"
"Extract all colors as Tailwind config from the design system"
"Show me the card variants and generate React code"
"What typography styles are in the brand guidelines?"
```

## 4. Getting File/Node IDs

**File Key** - From the URL:
```
https://www.figma.com/file/ABC123xyz/My-Design
                           ^^^^^^^^^^^
```

**Node ID** - Click a layer in Figma, check URL:
```
?node-id=1:234
         ^^^^^
```

## 5. Example Session

```
> /figma files
  Design System v2 (ABC123)
  Mobile App (XYZ789)

> /figma components ABC123
  Button (primary, secondary, ghost)
  Card (default, elevated)
  Input (text, password)

> /figma code ABC123 1:234 react

// Generated from Figma: Button
import React from 'react';
import styles from './Button.module.css';

interface ButtonProps {
  className?: string;
  children?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ className, children }) => {
  return (
    <div className={`${styles.button} ${className || ''}`}>
      {children}
    </div>
  );
};

> /figma tokens ABC123

:root {
  --color-primary-500: /* ... */;
  --color-gray-900: /* ... */;
  --font-heading-h1: /* ... */;
}
```

## 6. Tips

- **Save file keys** in your project README
- Run `/figma styles` before coding to get the design tokens
- Use `/figma search` to find specific text/labels
- Ask the AI to "implement" designs - it uses Figma automatically

## 7. Troubleshooting

| Problem | Solution |
|---------|----------|
| "Figma not connected" | Run `/mcp setup figma <token>` |
| "403 Forbidden" | Token expired, generate new one |
| "Node not found" | Check the node ID from Figma URL |

---

**Full docs:** See `cli/FIGMA-SETUP.md`
