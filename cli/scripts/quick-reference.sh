#!/bin/bash
# Quick Reference Card for Rodeo Shadow Setup

ORANGE='\033[38;5;208m'
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

cat << EOF

${ORANGE}╭────────────────────────────────────────────────────────────────────╮${NC}
${ORANGE}│${NC}                                                                    ${ORANGE}│${NC}
${ORANGE}│${NC}   ${BOLD}RODEO - Shadow Cloud GPU Quick Reference${NC}                         ${ORANGE}│${NC}
${ORANGE}│${NC}                                                                    ${ORANGE}│${NC}
${ORANGE}├────────────────────────────────────────────────────────────────────┤${NC}
${ORANGE}│${NC}                                                                    ${ORANGE}│${NC}
${ORANGE}│${NC}   ${BOLD}${GREEN}STEP 1: Setup Shadow VPS${NC}                                         ${ORANGE}│${NC}
${ORANGE}│${NC}   ${DIM}Run on your Shadow VPS:${NC}                                          ${ORANGE}│${NC}
${ORANGE}│${NC}                                                                    ${ORANGE}│${NC}
${ORANGE}│${NC}   ${BLUE}curl -fsSL https://ollama.com/install.sh | sh${NC}                   ${ORANGE}│${NC}
${ORANGE}│${NC}   ${BLUE}sudo mkdir -p /etc/systemd/system/ollama.service.d${NC}              ${ORANGE}│${NC}
${ORANGE}│${NC}   ${BLUE}echo '[Service]' | sudo tee /etc/systemd/system/ollama.service.d/override.conf${NC}  ${ORANGE}│${NC}
${ORANGE}│${NC}   ${BLUE}echo 'Environment="OLLAMA_HOST=0.0.0.0:11434"' | sudo tee -a /etc/systemd/system/ollama.service.d/override.conf${NC}  ${ORANGE}│${NC}
${ORANGE}│${NC}   ${BLUE}sudo systemctl daemon-reload && sudo systemctl restart ollama${NC}   ${ORANGE}│${NC}
${ORANGE}│${NC}                                                                    ${ORANGE}│${NC}
${ORANGE}├────────────────────────────────────────────────────────────────────┤${NC}
${ORANGE}│${NC}                                                                    ${ORANGE}│${NC}
${ORANGE}│${NC}   ${BOLD}${GREEN}STEP 2: Install Models${NC}                                            ${ORANGE}│${NC}
${ORANGE}│${NC}   ${DIM}Run on your Shadow VPS:${NC}                                          ${ORANGE}│${NC}
${ORANGE}│${NC}                                                                    ${ORANGE}│${NC}
${ORANGE}│${NC}   ${BLUE}ollama pull qwen2.5-coder:7b${NC}    ${DIM}# 8GB VRAM${NC}                      ${ORANGE}│${NC}
${ORANGE}│${NC}   ${BLUE}ollama pull qwen2.5-coder:14b${NC}   ${DIM}# 16GB VRAM${NC}                     ${ORANGE}│${NC}
${ORANGE}│${NC}   ${BLUE}ollama pull qwen2.5:32b${NC}         ${DIM}# 24GB VRAM${NC}                     ${ORANGE}│${NC}
${ORANGE}│${NC}   ${BLUE}ollama pull qwen2.5:72b${NC}         ${DIM}# 48GB+ VRAM${NC}                    ${ORANGE}│${NC}
${ORANGE}│${NC}                                                                    ${ORANGE}│${NC}
${ORANGE}├────────────────────────────────────────────────────────────────────┤${NC}
${ORANGE}│${NC}                                                                    ${ORANGE}│${NC}
${ORANGE}│${NC}   ${BOLD}${GREEN}STEP 3: Open Firewall${NC}                                             ${ORANGE}│${NC}
${ORANGE}│${NC}   ${DIM}Run on your Shadow VPS:${NC}                                          ${ORANGE}│${NC}
${ORANGE}│${NC}                                                                    ${ORANGE}│${NC}
${ORANGE}│${NC}   ${BLUE}sudo ufw allow 11434/tcp${NC}                                        ${ORANGE}│${NC}
${ORANGE}│${NC}                                                                    ${ORANGE}│${NC}
${ORANGE}├────────────────────────────────────────────────────────────────────┤${NC}
${ORANGE}│${NC}                                                                    ${ORANGE}│${NC}
${ORANGE}│${NC}   ${BOLD}${GREEN}STEP 4: Connect from Local${NC}                                        ${ORANGE}│${NC}
${ORANGE}│${NC}   ${DIM}Run on your local machine:${NC}                                       ${ORANGE}│${NC}
${ORANGE}│${NC}                                                                    ${ORANGE}│${NC}
${ORANGE}│${NC}   ${BLUE}# Test connection${NC}                                                ${ORANGE}│${NC}
${ORANGE}│${NC}   ${BLUE}curl http://YOUR_SHADOW_IP:11434/api/tags${NC}                       ${ORANGE}│${NC}
${ORANGE}│${NC}                                                                    ${ORANGE}│${NC}
${ORANGE}│${NC}   ${BLUE}# In Rodeo CLI${NC}                                                  ${ORANGE}│${NC}
${ORANGE}│${NC}   ${BLUE}/shadow YOUR_SHADOW_IP:11434${NC}                                    ${ORANGE}│${NC}
${ORANGE}│${NC}   ${BLUE}/gpu${NC}                                                            ${ORANGE}│${NC}
${ORANGE}│${NC}   ${BLUE}/models${NC}                                                         ${ORANGE}│${NC}
${ORANGE}│${NC}                                                                    ${ORANGE}│${NC}
${ORANGE}├────────────────────────────────────────────────────────────────────┤${NC}
${ORANGE}│${NC}                                                                    ${ORANGE}│${NC}
${ORANGE}│${NC}   ${BOLD}${YELLOW}ONE-LINE SHADOW SETUP${NC}                                             ${ORANGE}│${NC}
${ORANGE}│${NC}   ${DIM}Copy & paste on Shadow VPS:${NC}                                      ${ORANGE}│${NC}
${ORANGE}│${NC}                                                                    ${ORANGE}│${NC}
${ORANGE}│${NC}   ${BLUE}curl -fsSL https://ollama.com/install.sh | sh && \\${NC}             ${ORANGE}│${NC}
${ORANGE}│${NC}   ${BLUE}sudo mkdir -p /etc/systemd/system/ollama.service.d && \\${NC}        ${ORANGE}│${NC}
${ORANGE}│${NC}   ${BLUE}echo -e '[Service]\\nEnvironment="OLLAMA_HOST=0.0.0.0:11434"' | \\${NC}  ${ORANGE}│${NC}
${ORANGE}│${NC}   ${BLUE}sudo tee /etc/systemd/system/ollama.service.d/override.conf && \\${NC}  ${ORANGE}│${NC}
${ORANGE}│${NC}   ${BLUE}sudo systemctl daemon-reload && sudo systemctl restart ollama && \\${NC}  ${ORANGE}│${NC}
${ORANGE}│${NC}   ${BLUE}sudo ufw allow 11434/tcp && ollama pull qwen2.5-coder:7b${NC}        ${ORANGE}│${NC}
${ORANGE}│${NC}                                                                    ${ORANGE}│${NC}
${ORANGE}╰────────────────────────────────────────────────────────────────────╯${NC}

EOF
