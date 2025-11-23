#!/usr/bin/env python3
"""
Reset database and archive files for AU Archive testing.

This script removes:
- SQLite database file
- Bootstrap config file
- Archive support directories (.thumbnails, .previews, .posters)
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


def get_default_db_path() -> Path:
    """Get the default database path."""
    return get_config_dir() / "data" / "au-archive.db"


def get_bootstrap_config_path() -> Path:
    """Get the config.json path."""
    return get_config_dir() / "config.json"


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


def reset_database(archive_path: str | None = None, force: bool = False):
    """
    Reset the database and optionally archive support files.

    Args:
        archive_path: Optional path to archive directory to clean support files
        force: Skip confirmation prompt
    """
    print("\n=== AU Archive Reset Script ===\n")

    db_path = get_default_db_path()
    config_path = get_bootstrap_config_path()
    config_dir = get_config_dir()

    # Show what will be removed
    print("The following will be removed:")
    print(f"  - Database: {db_path}")
    print(f"  - Config: {config_path}")
    print(f"  - Data directory: {config_dir / 'data'}")
    print(f"  - Backups directory: {config_dir / 'backups'}")

    if archive_path:
        archive = Path(archive_path)
        print(f"  - Thumbnails: {archive / '.thumbnails'}")
        print(f"  - Previews: {archive / '.previews'}")
        print(f"  - Posters: {archive / '.posters'}")

    print()

    # Confirmation
    if not force:
        response = input("Are you sure you want to proceed? [y/N]: ").strip().lower()
        if response not in ("y", "yes"):
            print("Aborted.")
            return

    print("\nRemoving files...")

    # Remove database file
    remove_file(db_path, "Database")

    # Remove config file
    remove_file(config_path, "Config")

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

    # Remove archive support directories if archive path provided
    if archive_path:
        archive = Path(archive_path)
        print("\nRemoving archive support files...")
        remove_dir(archive / ".thumbnails", "Thumbnails directory")
        remove_dir(archive / ".previews", "Previews directory")
        remove_dir(archive / ".posters", "Posters directory")

    print("\n✓ Reset complete!\n")


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Reset AU Archive database and files for testing"
    )
    parser.add_argument(
        "-a", "--archive",
        help="Path to archive directory to clean support files (.thumbnails, .previews, .posters)"
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

    args = parser.parse_args()

    if args.db_only:
        print("\n=== AU Archive Reset Script (DB Only) ===\n")
        db_path = get_default_db_path()

        if not args.force:
            print(f"Will remove: {db_path}")
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

        print("\n✓ Done!\n")
    else:
        reset_database(archive_path=args.archive, force=args.force)


if __name__ == "__main__":
    main()
