#!/usr/bin/env python3
"""
Reset database and archive files for AU Archive testing.

This script removes:
- SQLite database file and WAL/SHM files
- Bootstrap config file
- Backup directory
- Application logs
- Maintenance history
- Archive support directories (.thumbnails, .previews, .posters, .cache/video-proxies, _database)

Use --nuclear to also clear research browser profile (logins, cookies, history).
"""

import os
import sys
import shutil
import platform
from pathlib import Path


def get_config_dir() -> Path:
    """Get the AU Archive config directory based on platform."""
    system = platform.system()
    home = Path.home()

    if system == "Windows":
        appdata = os.environ.get("APPDATA", "")
        return Path(appdata) / "@au-archive" / "desktop"
    elif system == "Darwin":  # macOS
        return home / "Library" / "Application Support" / "@au-archive" / "desktop"
    else:  # Linux
        return home / ".config" / "@au-archive" / "desktop"


def get_dev_data_dir() -> Path | None:
    """Get the development data directory if running from project root."""
    # Check if we're in the project directory
    cwd = Path.cwd()
    dev_data = cwd / "packages" / "desktop" / "data"
    if dev_data.exists() or (cwd / "packages" / "desktop").exists():
        return dev_data
    return None


def get_default_db_path() -> Path:
    """Get the default database path."""
    return get_config_dir() / "data" / "au-archive.db"


def get_bootstrap_config_path() -> Path:
    """Get the config.json path."""
    return get_config_dir() / "config.json"


def get_logs_dir() -> Path:
    """Get the logs directory path."""
    return get_config_dir() / "logs"


def get_maintenance_history_path() -> Path:
    """Get the maintenance history file path."""
    return get_config_dir() / "maintenance-history.json"


def get_research_browser_dir() -> Path:
    """Get the research browser profile directory path."""
    return get_config_dir() / "research-browser"


def remove_file(path: Path, name: str) -> bool:
    """Remove a file if it exists."""
    if path.exists():
        try:
            path.unlink()
            print(f"  ✓ Removed {name}: {path}")
            return True
        except Exception as e:
            print(f"  ✗ Failed to remove {name}: {e}")
            return False
    else:
        print(f"  - {name} not found: {path}")
        return False


def remove_dir(path: Path, name: str) -> bool:
    """Remove a directory recursively if it exists."""
    if path.exists():
        try:
            shutil.rmtree(path)
            print(f"  ✓ Removed {name}: {path}")
            return True
        except Exception as e:
            print(f"  ✗ Failed to remove {name}: {e}")
            return False
    else:
        print(f"  - {name} not found: {path}")
        return False


def reset_database(archive_path: str | None = None, force: bool = False, nuclear: bool = False):
    """
    Reset the database and optionally archive support files.

    Args:
        archive_path: Optional path to archive directory to clean support files
        force: Skip confirmation prompt
        nuclear: Also clear research browser profile (logins, cookies, history)
    """
    print("\n=== AU Archive Reset Script ===\n")

    db_path = get_default_db_path()
    config_path = get_bootstrap_config_path()
    config_dir = get_config_dir()
    dev_data_dir = get_dev_data_dir()
    logs_dir = get_logs_dir()
    maintenance_history_path = get_maintenance_history_path()
    research_browser_dir = get_research_browser_dir()

    # Show what will be removed - grouped by category
    print("The following will be removed:\n")

    print("  [Database]")
    print(f"    - Database: {db_path}")
    print(f"    - Data directory: {config_dir / 'data'}")
    print(f"    - Backups directory: {config_dir / 'backups'}")

    print("\n  [Configuration]")
    print(f"    - Config: {config_path}")
    print(f"    - Maintenance history: {maintenance_history_path}")

    print("\n  [Logs]")
    print(f"    - Logs directory: {logs_dir}")

    if dev_data_dir:
        print("\n  [Development]")
        print(f"    - Dev database: {dev_data_dir / 'au-archive.db'}")
        print(f"    - Dev config: {dev_data_dir / 'config.json'}")
        print(f"    - Dev backups: {dev_data_dir / 'backups'}")

    if archive_path:
        archive = Path(archive_path)
        print("\n  [Archive Support Files]")
        print(f"    - Thumbnails: {archive / '.thumbnails'}")
        print(f"    - Previews: {archive / '.previews'}")
        print(f"    - Posters: {archive / '.posters'}")
        print(f"    - Video proxies: {archive / '.cache' / 'video-proxies'}")
        print(f"    - Database snapshots: {archive / '_database'}")

    if nuclear:
        print("\n  [NUCLEAR - Research Browser]")
        print(f"    - Browser profile: {research_browser_dir}")
        print("      (Clears saved logins, cookies, browsing history)")

    print()

    # Confirmation
    if not force:
        if nuclear:
            response = input("⚠️  NUCLEAR mode enabled. Are you SURE? [y/N]: ").strip().lower()
        else:
            response = input("Are you sure you want to proceed? [y/N]: ").strip().lower()
        if response not in ("y", "yes"):
            print("Aborted.")
            return

    print("\n" + "=" * 40)
    print("Removing files...")
    print("=" * 40)

    # --- Database ---
    print("\n[Database]")
    remove_file(db_path, "Database")

    # Remove entire data directory if empty or just has db-related files
    data_dir = config_dir / "data"
    if data_dir.exists():
        # Check for WAL and SHM files (SQLite journal files)
        for suffix in ["-wal", "-shm"]:
            wal_path = db_path.parent / f"{db_path.name}{suffix}"
            remove_file(wal_path, f"Database {suffix} file")

        # Try to remove data dir if empty
        try:
            if not any(data_dir.iterdir()):
                data_dir.rmdir()
                print(f"  ✓ Removed empty data directory: {data_dir}")
        except Exception:
            pass

    # Remove backups directory
    backups_dir = config_dir / "backups"
    remove_dir(backups_dir, "Backups directory")

    # --- Configuration ---
    print("\n[Configuration]")
    remove_file(config_path, "Config")
    remove_file(maintenance_history_path, "Maintenance history")

    # --- Logs ---
    print("\n[Logs]")
    remove_dir(logs_dir, "Logs directory")

    # --- Development ---
    if dev_data_dir:
        print("\n[Development]")
        dev_db_path = dev_data_dir / "au-archive.db"
        remove_file(dev_db_path, "Dev database")
        for suffix in ["-wal", "-shm"]:
            remove_file(dev_data_dir / f"au-archive.db{suffix}", f"Dev database {suffix} file")
        remove_file(dev_data_dir / "config.json", "Dev config")
        remove_dir(dev_data_dir / "backups", "Dev backups directory")

    # --- Archive Support ---
    if archive_path:
        archive = Path(archive_path)
        print("\n[Archive Support Files]")
        remove_dir(archive / ".thumbnails", "Thumbnails directory")
        remove_dir(archive / ".previews", "Previews directory")
        remove_dir(archive / ".posters", "Posters directory")
        remove_dir(archive / ".cache" / "video-proxies", "Video proxies cache")
        remove_dir(archive / "_database", "Database snapshots")

        # Also try to remove empty .cache directory
        cache_dir = archive / ".cache"
        if cache_dir.exists():
            try:
                if not any(cache_dir.iterdir()):
                    cache_dir.rmdir()
                    print(f"  ✓ Removed empty cache directory: {cache_dir}")
            except Exception:
                pass

    # --- Nuclear: Research Browser ---
    if nuclear:
        print("\n[NUCLEAR - Research Browser]")
        remove_dir(research_browser_dir, "Research browser profile")

    print("\n" + "=" * 40)
    print("✓ Reset complete!")
    print("=" * 40 + "\n")


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Reset AU Archive database and files for testing",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 resetdb.py                     # Interactive reset (DB, config, logs)
  python3 resetdb.py -f                  # Force reset without confirmation
  python3 resetdb.py -a /path/to/archive # Also clear archive caches
  python3 resetdb.py -a /archive --nuclear  # Clear EVERYTHING including browser
  python3 resetdb.py --db-only           # Only remove database files
"""
    )
    parser.add_argument(
        "-a", "--archive",
        help="Path to archive directory to clean support files (.thumbnails, .previews, .posters, .cache/video-proxies, _database)"
    )
    parser.add_argument(
        "-f", "--force",
        action="store_true",
        help="Skip confirmation prompt"
    )
    parser.add_argument(
        "--db-only",
        action="store_true",
        help="Only remove database, keep config and archive files"
    )
    parser.add_argument(
        "--nuclear",
        action="store_true",
        help="Also clear research browser profile (logins, cookies, history) - DESTRUCTIVE"
    )

    args = parser.parse_args()

    if args.db_only:
        print("\n=== AU Archive Reset Script (DB Only) ===\n")
        db_path = get_default_db_path()
        dev_data_dir = get_dev_data_dir()

        if not args.force:
            print(f"Will remove: {db_path}")
            if dev_data_dir:
                print(f"Will remove: {dev_data_dir / 'au-archive.db'}")
            response = input("Are you sure? [y/N]: ").strip().lower()
            if response not in ("y", "yes"):
                print("Aborted.")
                return

        print("\nRemoving database...")
        remove_file(db_path, "Database")

        # Also remove WAL/SHM files
        for suffix in ["-wal", "-shm"]:
            wal_path = db_path.parent / f"{db_path.name}{suffix}"
            if wal_path.exists():
                remove_file(wal_path, f"Database {suffix} file")

        # Remove dev database if running from project root
        if dev_data_dir:
            print("\nRemoving dev database...")
            dev_db_path = dev_data_dir / "au-archive.db"
            remove_file(dev_db_path, "Dev database")
            for suffix in ["-wal", "-shm"]:
                remove_file(dev_data_dir / f"au-archive.db{suffix}", f"Dev database {suffix} file")

        print("\n✓ Done!\n")
    else:
        reset_database(archive_path=args.archive, force=args.force, nuclear=args.nuclear)


if __name__ == "__main__":
    main()
