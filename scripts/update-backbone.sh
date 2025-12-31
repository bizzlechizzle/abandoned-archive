#!/usr/bin/env bash
# update-backbone.sh — Update backbone submodules (wake-n-blake, shoemaker, repo-depot)
#
# Usage:
#   ./scripts/update-backbone.sh              # Update all to latest main
#   ./scripts/update-backbone.sh --check      # Show current vs remote status
#   ./scripts/update-backbone.sh --pin v1.2.0 # Pin all to specific tag
#   ./scripts/update-backbone.sh wake-n-blake # Update only wake-n-blake
#   ./scripts/update-backbone.sh shoemaker    # Update only shoemaker
#   ./scripts/update-backbone.sh repo-depot   # Update only repo-depot (standards/skills)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# All backbone submodules
SUBMODULES=("packages/wake-n-blake" "packages/shoemaker" "packages/repo-depot")

# Buildable packages (repo-depot has no build step)
BUILDABLE=("packages/wake-n-blake" "packages/shoemaker")

print_status() {
    echo -e "${BLUE}[backbone]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[backbone]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[backbone]${NC} $1"
}

print_error() {
    echo -e "${RED}[backbone]${NC} $1"
}

show_status() {
    print_status "Checking submodule status..."
    echo ""
    for submodule in "${SUBMODULES[@]}"; do
        name=$(basename "$submodule")
        if [ -d "$submodule/.git" ] || [ -f "$submodule/.git" ]; then
            cd "$submodule"
            local_sha=$(git rev-parse HEAD)
            local_short=$(git rev-parse --short HEAD)
            branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "detached")

            # Fetch to get remote status
            git fetch origin --quiet 2>/dev/null || true
            remote_sha=$(git rev-parse origin/main 2>/dev/null || echo "unknown")
            remote_short=$(git rev-parse --short origin/main 2>/dev/null || echo "unknown")

            echo -e "${BLUE}$name${NC}"
            echo "  Local:  $local_short ($branch)"
            echo "  Remote: $remote_short (origin/main)"

            if [ "$local_sha" = "$remote_sha" ]; then
                echo -e "  Status: ${GREEN}Up to date${NC}"
            else
                behind=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo "?")
                echo -e "  Status: ${YELLOW}$behind commits behind${NC}"
            fi
            echo ""
            cd "$ROOT_DIR"
        else
            echo -e "${RED}$name${NC}: Not initialized"
            echo ""
        fi
    done
}

update_submodule() {
    local submodule=$1
    local target=${2:-"origin/main"}
    local name=$(basename "$submodule")

    if [ ! -d "$submodule/.git" ] && [ ! -f "$submodule/.git" ]; then
        print_error "$name not initialized. Run: git submodule update --init"
        return 1
    fi

    print_status "Updating $name to $target..."
    cd "$submodule"

    # Fetch latest
    git fetch origin --quiet

    # Check for local changes
    if ! git diff --quiet HEAD 2>/dev/null; then
        print_warning "$name has uncommitted changes. Stashing..."
        git stash --quiet
    fi

    # Update to target
    if [[ "$target" == "origin/main" ]]; then
        git checkout main --quiet 2>/dev/null || git checkout -b main origin/main --quiet
        git pull origin main --quiet
    else
        # Pin to specific tag/commit
        git checkout "$target" --quiet
    fi

    local new_sha=$(git rev-parse --short HEAD)
    print_success "$name updated to $new_sha"

    cd "$ROOT_DIR"
}

rebuild_packages() {
    print_status "Rebuilding packages..."

    # Build only buildable submodules (repo-depot is config/docs only)
    for pkg in "${BUILDABLE[@]}"; do
        name=$(basename "$pkg")
        if [ -d "$pkg" ]; then
            pnpm --filter "$name" build 2>/dev/null || print_warning "$name has no build script"
        fi
    done

    # Reinstall to relink
    pnpm install

    print_success "Packages rebuilt successfully"
}

sync_standards() {
    # Sync CLAUDE.md and skills from repo-depot to project root
    local depot="packages/repo-depot"

    if [ ! -d "$depot" ]; then
        print_error "repo-depot not found"
        return 1
    fi

    print_status "Syncing standards from repo-depot..."

    # Sync CLAUDE.md (only if different)
    if [ -f "$depot/CLAUDE.md" ]; then
        if ! cmp -s "$depot/CLAUDE.md" "CLAUDE.md" 2>/dev/null; then
            cp "$depot/CLAUDE.md" "CLAUDE.md"
            print_success "CLAUDE.md updated"
        else
            echo "  CLAUDE.md: already in sync"
        fi
    fi

    # Sync skills to .claude/skills/ (user-level skills)
    if [ -d "$depot/skills" ]; then
        mkdir -p ".claude/skills"
        local synced=0
        for skill_dir in "$depot/skills"/*/; do
            if [ -d "$skill_dir" ]; then
                skill_name=$(basename "$skill_dir")
                if [ "$skill_name" != ".gitkeep" ]; then
                    cp -r "$skill_dir" ".claude/skills/"
                    ((synced++))
                fi
            fi
        done
        if [ $synced -gt 0 ]; then
            print_success "Synced $synced skills to .claude/skills/"
        else
            echo "  Skills: already in sync"
        fi
    fi

    # Record depot version
    if [ -f "$depot/VERSION" ]; then
        depot_version=$(cat "$depot/VERSION")
        commit_count=$(cd "$depot" && git rev-list --count HEAD 2>/dev/null || echo "0")
        echo "${depot_version}.${commit_count}" > ".depot-version"
        print_success "Depot version: ${depot_version}.${commit_count}"
    fi
}

# Parse arguments
CHECK_ONLY=false
SYNC_ONLY=false
PIN_VERSION=""
TARGET_SUBMODULE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --check|-c)
            CHECK_ONLY=true
            shift
            ;;
        --pin|-p)
            PIN_VERSION="$2"
            shift 2
            ;;
        wake-n-blake|shoemaker|repo-depot)
            TARGET_SUBMODULE="packages/$1"
            shift
            ;;
        --sync|-s)
            SYNC_ONLY=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [options] [submodule]"
            echo ""
            echo "Options:"
            echo "  --check, -c     Show status without updating"
            echo "  --pin, -p TAG   Pin to specific git tag/commit"
            echo "  --sync, -s      Only sync CLAUDE.md and skills from repo-depot"
            echo "  --help, -h      Show this help"
            echo ""
            echo "Submodules:"
            echo "  wake-n-blake    Update only wake-n-blake (hashing, verification)"
            echo "  shoemaker       Update only shoemaker (thumbnails, video proxies)"
            echo "  repo-depot      Update only repo-depot (CLAUDE.md, skills)"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Execute
if [ "$CHECK_ONLY" = true ]; then
    show_status
    exit 0
fi

if [ "$SYNC_ONLY" = true ]; then
    sync_standards
    exit 0
fi

echo ""
print_status "=== Backbone Update ==="
echo ""

target="${PIN_VERSION:-origin/main}"

if [ -n "$TARGET_SUBMODULE" ]; then
    update_submodule "$TARGET_SUBMODULE" "$target"
else
    for submodule in "${SUBMODULES[@]}"; do
        update_submodule "$submodule" "$target"
    done
fi

echo ""
rebuild_packages

echo ""
sync_standards

echo ""
print_success "=== Backbone update complete ==="
echo ""
echo "Next steps:"
echo "  1. Test the application: pnpm dev"
echo "  2. Commit changes: git add -A && git commit -m 'chore: update backbone submodules'"
