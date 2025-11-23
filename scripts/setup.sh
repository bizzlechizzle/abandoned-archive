#!/bin/bash
#
# AU Archive - Full Setup Script
# Installs all dependencies including optional native libraries
#
# Usage: ./scripts/setup.sh [--skip-optional] [--help]
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Flags
SKIP_OPTIONAL=false
VERBOSE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-optional)
      SKIP_OPTIONAL=true
      shift
      ;;
    --verbose|-v)
      VERBOSE=true
      shift
      ;;
    --help|-h)
      echo "AU Archive Setup Script"
      echo ""
      echo "Usage: ./scripts/setup.sh [options]"
      echo ""
      echo "Options:"
      echo "  --skip-optional  Skip optional dependencies (libpostal, darktable)"
      echo "  --verbose, -v    Show detailed output"
      echo "  --help, -h       Show this help message"
      echo ""
      echo "This script will:"
      echo "  1. Check for required tools (Node.js, pnpm)"
      echo "  2. Install Node.js dependencies"
      echo "  3. Build native modules for Electron"
      echo "  4. Install optional dependencies (libpostal, darktable)"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Logging functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

log_section() {
  echo ""
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Detect platform
detect_platform() {
  case "$(uname -s)" in
    Darwin*)  PLATFORM="macos" ;;
    Linux*)   PLATFORM="linux" ;;
    MINGW*|MSYS*|CYGWIN*) PLATFORM="windows" ;;
    *)        PLATFORM="unknown" ;;
  esac
  echo "$PLATFORM"
}

# Check if command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Get version of a command
get_version() {
  "$1" --version 2>/dev/null | head -1 || echo "unknown"
}

# ============================================================================
# PHASE 1: Check Required Tools
# ============================================================================
check_required_tools() {
  log_section "Phase 1: Checking Required Tools"

  local all_ok=true

  # Node.js
  if command_exists node; then
    local node_version=$(node --version)
    if [[ "$node_version" =~ ^v(1[8-9]|2[0-9]|[3-9][0-9]) ]]; then
      log_success "Node.js $node_version"
    else
      log_warn "Node.js $node_version (recommend v18+)"
    fi
  else
    log_error "Node.js not found"
    log_info "Install from: https://nodejs.org/"
    all_ok=false
  fi

  # pnpm
  if command_exists pnpm; then
    log_success "pnpm $(pnpm --version)"
  else
    log_warn "pnpm not found, installing..."
    npm install -g pnpm
    if command_exists pnpm; then
      log_success "pnpm installed"
    else
      log_error "Failed to install pnpm"
      all_ok=false
    fi
  fi

  # Git
  if command_exists git; then
    log_success "git $(git --version | cut -d' ' -f3)"
  else
    log_error "git not found"
    all_ok=false
  fi

  if [ "$all_ok" = false ]; then
    log_error "Missing required tools. Please install them and try again."
    exit 1
  fi
}

# ============================================================================
# PHASE 2: Install Node.js Dependencies
# ============================================================================
install_node_dependencies() {
  log_section "Phase 2: Installing Node.js Dependencies"

  log_info "Running pnpm install..."
  pnpm install

  log_success "Node.js dependencies installed"
}

# ============================================================================
# PHASE 3: Build Native Modules
# ============================================================================
build_native_modules() {
  log_section "Phase 3: Building Native Modules for Electron"

  log_info "Rebuilding native modules (better-sqlite3, sharp)..."
  cd packages/desktop
  pnpm exec electron-rebuild -f -o better-sqlite3,sharp
  cd ../..

  log_success "Native modules built"
}

# ============================================================================
# PHASE 4: Optional Dependencies
# ============================================================================
install_optional_dependencies() {
  if [ "$SKIP_OPTIONAL" = true ]; then
    log_section "Phase 4: Skipping Optional Dependencies (--skip-optional)"
    return
  fi

  log_section "Phase 4: Installing Optional Dependencies"

  local platform=$(detect_platform)

  # ---- libpostal ----
  log_info "Checking libpostal (ML address parsing)..."

  if [ "$platform" = "macos" ]; then
    if command_exists brew; then
      if brew list libpostal &>/dev/null; then
        log_success "libpostal already installed"
      else
        log_info "Installing libpostal via Homebrew..."
        brew install libpostal
        log_success "libpostal installed"
      fi
    else
      log_warn "Homebrew not found. Install libpostal manually:"
      log_info "  brew install libpostal"
    fi
  elif [ "$platform" = "linux" ]; then
    # Check if libpostal is installed
    if ldconfig -p 2>/dev/null | grep -q libpostal || [ -f /usr/local/lib/libpostal.so ]; then
      log_success "libpostal already installed"
    else
      log_warn "libpostal not found. To install (requires ~2GB download):"
      log_info "  git clone https://github.com/openvenues/libpostal"
      log_info "  cd libpostal"
      log_info "  ./bootstrap.sh"
      log_info "  ./configure"
      log_info "  make -j4 && sudo make install"
      log_info "  sudo ldconfig"
      log_info ""
      log_info "Or use the regex fallback (already enabled)"
    fi
  else
    log_warn "libpostal: Manual installation required for $platform"
  fi

  # Rebuild node-postal if libpostal is available
  if [ "$platform" = "macos" ] && brew list libpostal &>/dev/null; then
    log_info "Rebuilding node-postal..."
    pnpm rebuild node-postal 2>/dev/null || log_warn "node-postal rebuild skipped"
  fi

  # ---- darktable ----
  log_info "Checking darktable (RAW photo processing)..."

  if command_exists darktable-cli; then
    log_success "darktable-cli found at $(which darktable-cli)"
  elif [ "$platform" = "macos" ]; then
    if [ -f "/Applications/darktable.app/Contents/MacOS/darktable-cli" ]; then
      log_success "darktable found at /Applications/darktable.app"
    elif command_exists brew; then
      log_info "Installing darktable via Homebrew..."
      brew install --cask darktable
      log_success "darktable installed"
    else
      log_warn "darktable not found. Install from: https://www.darktable.org/install/"
    fi
  elif [ "$platform" = "linux" ]; then
    if command_exists apt; then
      log_info "Installing darktable via apt..."
      sudo apt update && sudo apt install -y darktable
      log_success "darktable installed"
    elif command_exists dnf; then
      log_info "Installing darktable via dnf..."
      sudo dnf install -y darktable
      log_success "darktable installed"
    else
      log_warn "darktable not found. Install from: https://www.darktable.org/install/"
    fi
  else
    log_warn "darktable: Manual installation required for $platform"
  fi

  # ---- ExifTool ----
  log_info "Checking ExifTool (metadata extraction)..."

  if command_exists exiftool; then
    log_success "exiftool $(exiftool -ver)"
  elif [ "$platform" = "macos" ]; then
    if command_exists brew; then
      log_info "Installing exiftool via Homebrew..."
      brew install exiftool
      log_success "exiftool installed"
    fi
  elif [ "$platform" = "linux" ]; then
    if command_exists apt; then
      log_info "Installing exiftool via apt..."
      sudo apt install -y libimage-exiftool-perl
      log_success "exiftool installed"
    fi
  fi

  # ---- FFmpeg ----
  log_info "Checking FFmpeg (video processing)..."

  if command_exists ffmpeg; then
    log_success "ffmpeg found"
  elif [ "$platform" = "macos" ]; then
    if command_exists brew; then
      log_info "Installing ffmpeg via Homebrew..."
      brew install ffmpeg
      log_success "ffmpeg installed"
    fi
  elif [ "$platform" = "linux" ]; then
    if command_exists apt; then
      log_info "Installing ffmpeg via apt..."
      sudo apt install -y ffmpeg
      log_success "ffmpeg installed"
    fi
  fi
}

# ============================================================================
# PHASE 5: Build Application
# ============================================================================
build_application() {
  log_section "Phase 5: Building Application"

  log_info "Building core package..."
  pnpm --filter @au-archive/core build

  log_info "Building desktop package..."
  pnpm --filter @au-archive/desktop build

  log_success "Application built"
}

# ============================================================================
# PHASE 6: Verify Installation
# ============================================================================
verify_installation() {
  log_section "Phase 6: Verification"

  echo ""
  echo "Dependency Status:"
  echo "─────────────────────────────────────────────────"

  # Required
  printf "  %-20s" "Node.js"
  command_exists node && echo -e "${GREEN}✓${NC} $(node --version)" || echo -e "${RED}✗${NC}"

  printf "  %-20s" "pnpm"
  command_exists pnpm && echo -e "${GREEN}✓${NC} v$(pnpm --version)" || echo -e "${RED}✗${NC}"

  # Optional
  printf "  %-20s" "libpostal"
  if [ "$(detect_platform)" = "macos" ] && brew list libpostal &>/dev/null; then
    echo -e "${GREEN}✓${NC} ML address parsing enabled"
  elif ldconfig -p 2>/dev/null | grep -q libpostal; then
    echo -e "${GREEN}✓${NC} ML address parsing enabled"
  else
    echo -e "${YELLOW}○${NC} Using regex fallback"
  fi

  printf "  %-20s" "darktable"
  if command_exists darktable-cli || [ -f "/Applications/darktable.app/Contents/MacOS/darktable-cli" ]; then
    echo -e "${GREEN}✓${NC} RAW processing enabled"
  else
    echo -e "${YELLOW}○${NC} RAW processing disabled"
  fi

  printf "  %-20s" "exiftool"
  command_exists exiftool && echo -e "${GREEN}✓${NC} v$(exiftool -ver)" || echo -e "${YELLOW}○${NC} Not found"

  printf "  %-20s" "ffmpeg"
  command_exists ffmpeg && echo -e "${GREEN}✓${NC} Installed" || echo -e "${YELLOW}○${NC} Not found"

  echo ""
  echo "─────────────────────────────────────────────────"
  echo ""
}

# ============================================================================
# Main
# ============================================================================
main() {
  echo ""
  echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║               AU Archive Setup Script                      ║${NC}"
  echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
  echo ""

  local platform=$(detect_platform)
  log_info "Detected platform: $platform"

  # Change to repo root
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cd "$SCRIPT_DIR/.."
  log_info "Working directory: $(pwd)"

  check_required_tools
  install_node_dependencies
  build_native_modules
  install_optional_dependencies
  build_application
  verify_installation

  log_section "Setup Complete!"
  echo ""
  echo "To start the application:"
  echo "  pnpm dev"
  echo ""
  echo "To build for production:"
  echo "  pnpm build"
  echo ""
}

main "$@"
