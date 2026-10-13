#!/usr/bin/env bash
set -euo pipefail

nvim_lua_dir="${XDG_CONFIG_HOME:-$HOME/.config}/nvim/lua"
plugins_dir="$nvim_lua_dir/plugins"
plugin_file="$plugins_dir/base16.lua"
init_lua="${XDG_CONFIG_HOME:-$HOME/.config}/nvim/init.lua"
lazy_dir="${XDG_DATA_HOME:-$HOME/.local/share}/nvim/lazy/lazy.nvim"

if [ -d "$lazy_dir" ]; then
  if [ ! -f "$plugin_file" ] && ! grep -rl "base16-nvim" "${plugins_dir}" 2>/dev/null | grep -q .; then
    mkdir -p "$plugins_dir"
    cat > "$plugin_file" <<'EOF'
return { 'RRethy/base16-nvim',
  config = function()
    local ok, _ = pcall(require, 'base16-colorscheme')
    if ok then
      vim.cmd('colorscheme kaleido')
    end
  end,
}
EOF
  fi
else
  if [ -f "$init_lua" ] && ! grep -qF "base16-nvim\|kaleido" "$init_lua" 2>/dev/null; then
    cat >> "$init_lua" <<'EOF'

-- Kaleido auto-setup
vim.cmd('colorscheme kaleido')
EOF
  fi
fi
