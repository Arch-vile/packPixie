#!/bin/bash
set -e

remove_dirs_by_name() {
    local target="$1"
    while IFS= read -r -d '' path; do
        rm -rf "$path"
    done < <(find . \
        \( -path './.git' -o -path './.pnpm-store' \) -prune -o \
        \( -type d -name "$target" -print0 -prune \)
    )
}

    echo "Cleaning workspace (node_modules, build, .turbo)..."
    remove_dirs_by_name node_modules
    remove_dirs_by_name build
    remove_dirs_by_name .turbo
    rm -rf node_modules .turbo
    echo "Workspace cleaned"